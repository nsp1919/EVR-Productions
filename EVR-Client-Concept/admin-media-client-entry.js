'use strict';

const videoChunkSize = 64 * 1024 * 1024;
const maxVideoBytes = 1024 * 1024 * 1024;
const uploadStateKey = 'evr-r2-video-uploads';
const videoKeyPattern = /^evr-videos\/[0-9a-f-]{36}\.(?:3gp|avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i;

if (!window.evrUploadMedia) {
  window.evrUploadMedia = async function uploadMedia(file, contentType) {
    if (!file || contentType !== 'image/webp' || file.type !== contentType ||
        file.size <= 0 || file.size > 30 * 1024 * 1024) {
      throw new Error('Choose a processed WebP image up to 30 MB.');
    }

    const response = await fetch('/api/r2-image-upload', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType, size: file.size })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `R2 image upload request failed (${response.status}).`);
    if (typeof result.key !== 'string' ||
        !/^evr-images\/[0-9a-f-]{36}\.webp$/i.test(result.key) ||
        typeof result.uploadUrl !== 'string' || !/^https:\/\//i.test(result.uploadUrl) ||
        typeof result.imageUrl !== 'string' || !/^https:\/\//i.test(result.imageUrl)) {
      throw new Error('Cloudflare R2 returned invalid image-upload details.');
    }

    const uploadResponse = await fetch(result.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });
    if (!uploadResponse.ok) {
      throw new Error(`Cloudflare R2 rejected the image upload (${uploadResponse.status}). Check the bucket CORS settings.`);
    }
    return result.imageUrl;
  };
}

async function requestR2Upload(details) {
  const response = await fetch('/api/r2-video-upload', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `R2 upload request failed (${response.status}).`);
  return result;
}

function readUploadStates() {
  let value;
  try {
    value = JSON.parse(localStorage.getItem(uploadStateKey) || '[]');
  } catch {
    throw new Error('Saved R2 upload state is invalid. Clear this browser’s site data and retry.');
  }
  if (!Array.isArray(value) || value.some(item =>
    !item || typeof item !== 'object' || typeof item.fingerprint !== 'string')) {
    throw new Error('Saved R2 upload state is invalid. Clear this browser’s site data and retry.');
  }
  return value;
}

function saveUploadStates(states) {
  localStorage.setItem(uploadStateKey, JSON.stringify(states));
}

function uploadPart(file, start, end, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(start + Math.round((end - start) * event.loaded / event.total));
    };
    request.onerror = () => reject(new Error('Network error while uploading a video part to Cloudflare R2.'));
    request.onabort = () => reject(new Error('The Cloudflare R2 video upload was cancelled.'));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Cloudflare R2 rejected a video part (${request.status}).`));
        return;
      }
      const eTag = request.getResponseHeader('ETag');
      if (!eTag || !/^"?[a-f0-9]{32}"?$/i.test(eTag)) {
        reject(new Error('Cloudflare R2 did not return a valid part ETag. Check the bucket CORS expose-headers setting.'));
        return;
      }
      resolve(eTag);
    };
    request.send(file.slice(start, end));
  });
}

if (!window.evrUploadR2Video) {
  window.evrUploadR2Video = async function uploadR2Video(file, onProgress = () => {}) {
    if (!file || !file.type.startsWith('video/') || file.size <= 0 || file.size > maxVideoBytes) {
      throw new Error('Choose a supported video file up to 1 GB.');
    }

    const fingerprint = `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
    let states = readUploadStates();
    let state = states.find(item => item.fingerprint === fingerprint);
    const totalParts = Math.ceil(file.size / videoChunkSize);
    if (!state) {
      const created = await requestR2Upload({
        action: 'create',
        fileName: file.name,
        contentType: file.type || 'video/mp4'
      });
      if (typeof created.key !== 'string' || !videoKeyPattern.test(created.key) ||
          typeof created.uploadId !== 'string' || !created.uploadId ||
          typeof created.playbackUrl !== 'string' || !/^https:\/\//i.test(created.playbackUrl)) {
        throw new Error('Cloudflare R2 returned invalid multipart upload details.');
      }
      state = {
        fingerprint,
        key: created.key,
        uploadId: created.uploadId,
        playbackUrl: created.playbackUrl,
        parts: []
      };
      states = [...states.filter(item => item.fingerprint !== fingerprint), state];
      saveUploadStates(states);
    }

    if (!videoKeyPattern.test(state.key) || typeof state.uploadId !== 'string' ||
        !state.uploadId || typeof state.playbackUrl !== 'string' ||
        !/^https:\/\//i.test(state.playbackUrl) || !Array.isArray(state.parts) ||
        state.parts.some((part, index) => !part || part.partNumber !== index + 1 ||
          part.partNumber > totalParts || typeof part.eTag !== 'string' ||
          !/^"?[a-f0-9]{32}"?$/i.test(part.eTag))) {
      throw new Error('The saved R2 upload state does not match this file. Clear the saved upload state and retry.');
    }

    let completedBytes = state.parts.reduce((sum, part) =>
      sum + Math.min(videoChunkSize, file.size - (part.partNumber - 1) * videoChunkSize), 0);
    onProgress(completedBytes, file.size);
    for (let partNumber = state.parts.length + 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * videoChunkSize;
      const end = Math.min(file.size, start + videoChunkSize);
      let failure;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const signed = await requestR2Upload({
            action: 'sign-part',
            key: state.key,
            uploadId: state.uploadId,
            partNumber
          });
          if (typeof signed.uploadUrl !== 'string' || !/^https:\/\//i.test(signed.uploadUrl)) {
            throw new Error('Cloudflare R2 returned an invalid signed part URL.');
          }
          const eTag = await uploadPart(file, start, end, signed.uploadUrl, loaded => {
            onProgress(completedBytes + Math.max(0, loaded - start), file.size);
          });
          state.parts.push({ partNumber, eTag });
          states = readUploadStates().map(item => item.fingerprint === fingerprint ? state : item);
          saveUploadStates(states);
          completedBytes += end - start;
          onProgress(completedBytes, file.size);
          failure = null;
          break;
        } catch (error) {
          failure = error;
          if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 750 * (attempt + 1)));
        }
      }
      if (failure) {
        throw new Error(`${failure.message} Your upload is kept temporarily; choose the same file again to resume it.`);
      }
    }

    const completed = await requestR2Upload({
      action: 'complete',
      key: state.key,
      uploadId: state.uploadId,
      parts: state.parts
    });
    if (completed.playbackUrl !== state.playbackUrl) {
      throw new Error('Cloudflare R2 returned an unexpected video playback URL.');
    }
    saveUploadStates(readUploadStates().filter(item => item.fingerprint !== fingerprint));
    return { uid: state.key, publicId: state.key, playbackUrl: state.playbackUrl };
  };
}
