'use strict';
(() => {
  const storageKey = 'evr-site-content';
  const editor = document.getElementById('admin-editor');
  const pageSelect = document.getElementById('admin-preview-page');
  const imageSelect = document.getElementById('admin-image-target');
  const imageControls = document.getElementById('admin-image-controls');
  const videoSelect = document.getElementById('admin-video-target');
  const videoControls = document.getElementById('admin-video-controls');
  const colorPicker = document.getElementById('admin-background-color');
  const photoPicker = document.getElementById('admin-photo-file');
  const videoPicker = document.getElementById('admin-video-file');
  const importPicker = document.getElementById('admin-import-file');
  const status = document.getElementById('admin-status');
  const textSelector = 'h1,h2,h3,h4,p,a,span,figcaption,summary,label,button,li,dt,dd,b,strong,em';
  const backgroundSelector = 'section,article,a,figure,aside,header,footer,div';
  const allowedMarkup = new Set(['BR', 'EM', 'STRONG', 'B', 'I', 'SPAN', 'SMALL', 'SUB', 'SUP']);
  const assetDatabase = 'evr-site-content-assets';
  const assetStore = 'videos';
  let mode = 'text';
  let selectedElement = null;
  let edits = {};
  const videoUrls = new Map();
  const pendingVideos = new Map();
  let loadError = null;
  const assetDb = new Promise((resolve, reject) => {
    const request = indexedDB.open(assetDatabase, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(assetStore)) request.result.createObjectStore(assetStore, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local video storage.'));
    request.onblocked = () => reject(new Error('Local video storage is blocked by another browser tab.'));
  });

  function storeVideo(id, blob) {
    return assetDb.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(assetStore, 'readwrite');
      transaction.objectStore(assetStore).put({ id, blob });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save the video file.'));
      transaction.onabort = () => reject(transaction.error || new Error('Saving the video file was cancelled.'));
    }));
  }

  function getVideo(id) {
    return assetDb.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(assetStore, 'readonly');
      const request = transaction.objectStore(assetStore).get(id);
      request.onsuccess = () => resolve(request.result && request.result.blob);
      request.onerror = () => reject(request.error || new Error('Could not read the saved video file.'));
    }));
  }

  function deleteVideo(id) {
    return assetDb.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(assetStore, 'readwrite');
      transaction.objectStore(assetStore).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove the imported video.'));
      transaction.onabort = () => reject(transaction.error || new Error('Removing the imported video was cancelled.'));
    }));
  }

  function clearVideoAssets() {
    return assetDb.then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(assetStore, 'readwrite');
      transaction.objectStore(assetStore).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clear saved video files.'));
      transaction.onabort = () => reject(transaction.error || new Error('Clearing saved video files was cancelled.'));
    }));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read the video for export.'));
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToBlob(value) {
    const match = /^data:(video\/[^;,]+);base64,([a-z0-9+/]*={0,2})$/is.exec(typeof value === 'string' ? value : '');
    if (!match) throw new Error('The exported video data is invalid.');
    const mimeType = match[1].toLowerCase();
    const encoded = match[2].replace(/\s/g, '');
    let binary;
    try {
      binary = atob(encoded);
    } catch {
      throw new Error('The exported video data is not valid Base64.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 0x8000) {
      const chunk = binary.slice(offset, offset + 0x8000);
      for (let index = 0; index < chunk.length; index++) bytes[offset + index] = chunk.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  function validatePlayableVideo(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(url);
      };
      const pass = () => {
        if (settled) return;
        cleanup();
        resolve();
      };
      const fail = () => {
        if (settled) return;
        cleanup();
        reject(new Error('The selected file is not playable video content.'));
      };
      video.onloadedmetadata = pass;
      video.onerror = fail;
      const timeout = window.setTimeout(fail, 15000);
      video.addEventListener('loadedmetadata', () => window.clearTimeout(timeout), { once: true });
      video.addEventListener('error', () => window.clearTimeout(timeout), { once: true });
      video.src = url;
      video.load();
    });
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  window.applyAdminEdits = applyEdits;

  function elementKey(element) {
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      if (current.id) {
        path.unshift(`#${current.id}`);
        break;
      }
      const parent = current.parentElement;
      if (!parent) break;
      const sameTag = Array.from(parent.children).filter(child => child.tagName === current.tagName);
      path.unshift(`${current.tagName.toLowerCase()}:${sameTag.indexOf(current)}`);
      current = parent;
    }
    return path.join('/');
  }

  function safeMarkup(markup) {
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const output = document.createDocumentFragment();
    function copyChildren(source, destination) {
      for (const child of source.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          destination.append(document.createTextNode(child.textContent));
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (allowedMarkup.has(child.tagName)) {
            const clean = document.createElement(child.tagName.toLowerCase());
            copyChildren(child, clean);
            destination.append(clean);
          } else {
            copyChildren(child, destination);
            if ((child.tagName === 'DIV' || child.tagName === 'P') && child.nextSibling) {
              destination.append(document.createElement('br'));
            }
          }
        }
      }
    }
    copyChildren(parsed.body, output);
    const container = document.createElement('div');
    container.append(output);
    return container.innerHTML;
  }

  function safeImageSource(source) {
    if (typeof source !== 'string' || !source.trim()) return false;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(source)) return true;
    try {
      const url = new URL(source, document.baseURI);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function decodeImageFile(file) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      const url = URL.createObjectURL(file);
      const image = new Image();
      try {
        image.src = url;
        await image.decode();
        return {
          source: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          close: () => URL.revokeObjectURL(url)
        };
      } catch (error) {
        URL.revokeObjectURL(url);
        throw new Error(`The browser could not decode this image: ${error.message}`);
      }
    }
  }

  function loadEdits() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)) {
        throw new Error('Saved content has an unsupported format.');
      }
      return validateEntries(saved.entries);
    } catch (error) {
      loadError = error.message;
      return {};
    }
  }

  function validateEntries(entries) {
    const checked = {};
    for (const [key, entry] of Object.entries(entries)) {
      if (!entry || typeof entry.value !== 'string') throw new Error('An edit entry is incomplete.');
      if (entry.type === 'text') checked[key] = { type: 'text', value: safeMarkup(entry.value) };
      else if (entry.type === 'image' && safeImageSource(entry.value)) checked[key] = { type: 'image', value: entry.value };
      else if (entry.type === 'video' && /^[\w-]{1,80}$/.test(entry.value)) checked[key] = { type: 'video', value: entry.value };
      else if (entry.type === 'background' && CSS.supports('color', entry.value)) checked[key] = { type: 'background', value: entry.value };
      else throw new Error('An edit entry contains an unsupported value.');
    }
    return checked;
  }

  function applyEdits() {
    for (const element of document.querySelectorAll('body *')) {
      if (editor.contains(element)) continue;
      if (element.dataset.adminTextEdited || element.dataset.adminImageEdited || element.dataset.adminBackgroundEdited) continue;
      const edit = edits[elementKey(element)];
      if (!edit) continue;
      if (edit.type === 'text') element.innerHTML = edit.value;
      else if (edit.type === 'image' && element instanceof HTMLImageElement) element.src = edit.value;
      else if (edit.type === 'video' && element instanceof HTMLVideoElement && videoUrls.has(edit.value) && element.dataset.adminVideoAsset !== edit.value) {
        element.pause();
        element.src = videoUrls.get(edit.value);
        element.dataset.adminVideoAsset = edit.value;
        element.load();
      }
      else if (edit.type === 'background') element.style.backgroundColor = edit.value;
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    document.body.classList.toggle('admin-active', location.hash === '#/admin');
    imageControls.hidden = mode !== 'image';
    videoControls.hidden = mode !== 'video';
    document.querySelectorAll('[data-admin-mode]').forEach(button => {
      const active = button.dataset.adminMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const descriptions = {
      text: 'Text editing is ready. Click a heading, paragraph, or other text in the preview.',
      image: 'Photo replacement is ready. Click a photo in the preview, then choose an image file.',
      video: 'Video replacement is ready. Select a video on the page, choose a video file, then save.',
      background: 'Background editing is ready. Click an area in the preview, then choose a color.'
    };
    setStatus(descriptions[mode]);
  }

  function clearSelection() {
    if (selectedElement) selectedElement.classList.remove('admin-selected');
    selectedElement = null;
  }

  function selectElement(element) {
    clearSelection();
    selectedElement = element;
    selectedElement.classList.add('admin-selected');
  }

  function refreshImageOptions() {
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    imageSelect.replaceChildren();
    if (!preview) return;
    Array.from(preview.querySelectorAll('img')).forEach((image, index) => {
      const option = document.createElement('option');
      const caption = image.closest('figure')?.querySelector('figcaption')?.textContent.trim();
      const filename = image.currentSrc.split('/').pop().split('?')[0];
      option.value = String(index);
      option.textContent = `${index + 1}. ${image.alt || caption || filename || 'Image'}`;
      imageSelect.append(option);
    });
  }

  function refreshVideoOptions() {
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    videoSelect.replaceChildren();
    if (!preview) return;
    videoTargets().forEach((video, index) => {
      const option = document.createElement('option');
      const reel = video.closest('[data-corp-reel]');
      const section = video.closest('section');
      const sectionTitle = section && (section.getAttribute('aria-label') || section.getAttribute('aria-labelledby'));
      const titleElement = sectionTitle && document.getElementById(sectionTitle);
      const label = video.getAttribute('aria-label') || reel?.getAttribute('aria-label') || titleElement?.textContent.trim() || section?.id || `Video ${index + 1}`;
      option.value = String(index);
      option.textContent = `${index + 1}. ${label}`;
      videoSelect.append(option);
    });
  }

  function videoTargets() {
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    if (!preview) return [];
    const videos = Array.from(preview.querySelectorAll('video'));
    if (preview.id === 'corporate') {
      const reelDialogVideo = document.querySelector('#corp-reel-dialog video');
      if (reelDialogVideo) videos.push(reelDialogVideo);
    }
    return videos;
  }

  function selectPhoto(image) {
    selectElement(image);
    image.dataset.adminImageEdited = 'true';
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    const images = Array.from(preview.querySelectorAll('img'));
    imageSelect.value = String(images.indexOf(image));
    photoPicker.click();
  }

  function selectedVideo() {
    return videoTargets()[Number(videoSelect.value)];
  }

  function selectVideo(video) {
    selectElement(video);
    video.dataset.adminVideoEdited = 'true';
    videoSelect.value = String(videoTargets().indexOf(video));
    videoPicker.click();
  }

  function hexColor(color) {
    const channels = color.match(/\d+/g);
    if (!channels || channels.length < 3) return '#243338';
    return `#${channels.slice(0, 3).map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`;
  }

  document.querySelectorAll('[data-admin-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.adminMode));
  });

  window.addEventListener('hashchange', () => {
    const isAdmin = location.hash === '#/admin';
    document.body.classList.toggle('admin-active', isAdmin);
    if (!isAdmin) {
      clearSelection();
      document.querySelectorAll('[data-admin-text-edited="true"]').forEach(element => {
        element.contentEditable = 'false';
      });
    }
  });

  pageSelect.addEventListener('change', () => {
    window.adminPreviewPage = pageSelect.value;
    clearSelection();
    window.route();
    refreshImageOptions();
    refreshVideoOptions();
  });

  imageSelect.addEventListener('change', () => {
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    const image = preview && preview.querySelectorAll('img')[Number(imageSelect.value)];
    if (image) selectElement(image);
  });
  document.getElementById('admin-choose-photo').addEventListener('click', () => {
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    const image = preview && preview.querySelectorAll('img')[Number(imageSelect.value)];
    if (!image) {
      setStatus('There are no photos on this page to replace.', true);
      return;
    }
    selectPhoto(image);
  });
  videoSelect.addEventListener('change', () => {
    const video = selectedVideo();
    if (video) selectElement(video);
  });
  document.getElementById('admin-choose-video').addEventListener('click', () => {
    const video = selectedVideo();
    if (!video) {
      setStatus('There are no videos on this page to replace.', true);
      return;
    }
    selectVideo(video);
  });

  document.addEventListener('click', event => {
    if (location.hash !== '#/admin' || editor.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest('.hero-video-toggle')) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (mode === 'text') {
      const textElement = target.closest(textSelector);
      if (!textElement || !textElement.textContent.trim()) {
        setStatus('Click a heading, paragraph, link, or other text to edit it.');
        return;
      }
      selectElement(textElement);
      textElement.contentEditable = 'true';
      textElement.dataset.adminTextEdited = 'true';
      textElement.focus();
      setStatus('Edit the selected text in place, then choose Save changes.');
    } else if (mode === 'image') {
      const image = target.closest('img') || target.closest('figure')?.querySelector('img');
      if (!image) {
        setStatus('Click directly on a photo in the preview.');
        return;
      }
      refreshImageOptions();
      selectPhoto(image);
    } else if (mode === 'video') {
      const video = target.closest('video');
      if (!video) {
        setStatus('Choose a video from the list above to replace it.');
        return;
      }
      refreshVideoOptions();
      selectVideo(video);
    } else {
      const area = target.closest(backgroundSelector);
      if (!area || editor.contains(area)) {
        setStatus('Click a section, card, or other area in the preview.');
        return;
      }
      selectElement(area);
      colorPicker.value = hexColor(getComputedStyle(area).backgroundColor);
      setStatus('Choose a background color. Select Save changes when you are done.');
    }
  }, true);

  document.addEventListener('input', event => {
    if (event.target instanceof HTMLElement && event.target.dataset.adminTextEdited) {
      setStatus('Unsaved text edits. Choose Save changes to keep them in this browser.');
    }
  });

  colorPicker.addEventListener('input', () => {
    if (!selectedElement || mode !== 'background') {
      setStatus('Choose Change background, then click an area in the preview.');
      return;
    }
    selectedElement.style.backgroundColor = colorPicker.value;
    selectedElement.dataset.adminBackgroundEdited = 'true';
    setStatus('Unsaved background edit. Choose Save changes to keep it in this browser.');
  });

  photoPicker.addEventListener('change', async () => {
    const file = photoPicker.files && photoPicker.files[0];
    if (!file || !selectedElement || !(selectedElement instanceof HTMLImageElement)) return;
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setStatus('Choose an image file smaller than 10 MB.', true);
      photoPicker.value = '';
      return;
    }
    try {
      const decoded = await decodeImageFile(file);
      let photo;
      try {
        const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The browser could not prepare the image canvas.');
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        photo = canvas.toDataURL('image/webp', 0.84);
      } finally {
        decoded.close();
      }
      if (!safeImageSource(photo)) throw new Error('The browser could not process this image.');
      selectedElement.src = photo;
      selectedElement.dataset.adminImageEdited = 'true';
      setStatus('Unsaved photo edit. Choose Save changes to keep it in this browser.');
    } catch (error) {
      setStatus(`Could not process this photo: ${error.message}`, true);
    } finally {
      photoPicker.value = '';
    }
  });

  videoPicker.addEventListener('change', async () => {
    const file = videoPicker.files && videoPicker.files[0];
    if (!file || !selectedElement || !(selectedElement instanceof HTMLVideoElement)) return;
    if (!file.type.startsWith('video/') || file.size > 250 * 1024 * 1024) {
      setStatus('Choose a video file smaller than 250 MB.', true);
      videoPicker.value = '';
      return;
    }
    try {
      await validatePlayableVideo(file);
      const assetId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      const elementKeyValue = elementKey(selectedElement);
      const previousAsset = selectedElement.dataset.adminVideoAsset;
      selectedElement.pause();
      selectedElement.removeAttribute('src');
      selectedElement.replaceChildren();
      selectedElement.src = previewUrl;
      selectedElement.dataset.adminVideoEdited = 'true';
      selectedElement.dataset.adminVideoAsset = assetId;
      selectedElement.load();
      videoUrls.set(assetId, previewUrl);
      pendingVideos.set(elementKeyValue, { id: assetId, blob: file });
      if (previousAsset && !Object.values(edits).some(edit => edit.type === 'video' && edit.value === previousAsset)) {
        const oldUrl = videoUrls.get(previousAsset);
        if (oldUrl && oldUrl !== previewUrl) URL.revokeObjectURL(oldUrl);
        videoUrls.delete(previousAsset);
      }
      setStatus('Video ready to preview. Choose Save changes to keep it in this browser.');
    } catch (error) {
      setStatus(`Could not prepare this video: ${error.message}`, true);
    } finally {
      videoPicker.value = '';
    }
  });

  document.getElementById('admin-save').addEventListener('click', async () => {
    const next = { ...edits };
    document.querySelectorAll('[data-admin-text-edited="true"]').forEach(element => {
      next[elementKey(element)] = { type: 'text', value: safeMarkup(element.innerHTML) };
      element.innerHTML = next[elementKey(element)].value;
      element.contentEditable = 'false';
      delete element.dataset.adminTextEdited;
    });
    document.querySelectorAll('[data-admin-image-edited="true"]').forEach(element => {
      if (element instanceof HTMLImageElement && safeImageSource(element.src)) {
        next[elementKey(element)] = { type: 'image', value: element.src };
      }
      delete element.dataset.adminImageEdited;
    });
    document.querySelectorAll('[data-admin-background-edited="true"]').forEach(element => {
      next[elementKey(element)] = { type: 'background', value: element.style.backgroundColor };
      delete element.dataset.adminBackgroundEdited;
    });
    try {
      for (const video of pendingVideos.values()) await validatePlayableVideo(video.blob);
      for (const [key, video] of pendingVideos) {
        await storeVideo(video.id, video.blob);
        next[key] = { type: 'video', value: video.id };
      }
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, entries: next }));
      edits = next;
      pendingVideos.clear();
      document.querySelectorAll('[data-admin-video-edited="true"]').forEach(element => {
        delete element.dataset.adminVideoEdited;
      });
      clearSelection();
      setStatus('Changes saved in this browser. Export a copy to move them to another browser.');
    } catch (error) {
      setStatus(`Could not save changes: ${error.message}. Export or remove some large photos and try again.`, true);
    }
  });

  document.getElementById('admin-export').addEventListener('click', async () => {
    try {
      const entries = { ...edits };
      for (const [key, edit] of Object.entries(entries)) {
        if (edit.type !== 'video') continue;
        const blob = await getVideo(edit.value);
        if (!blob) throw new Error(`Saved video asset "${edit.value}" is missing.`);
        entries[key] = { type: 'video', value: await blobToDataUrl(blob) };
      }
      const file = new Blob([JSON.stringify({ version: 1, entries }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'evr-site-content.json';
      link.click();
      URL.revokeObjectURL(url);
      setStatus('Content edits exported as evr-site-content.json.');
    } catch (error) {
      setStatus(`Could not export content: ${error.message}`, true);
    }
  });

  document.getElementById('admin-import').addEventListener('click', () => importPicker.click());
  importPicker.addEventListener('change', async () => {
    const file = importPicker.files && importPicker.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported || imported.version !== 1 || !imported.entries || typeof imported.entries !== 'object' || Array.isArray(imported.entries)) {
        throw new Error('This is not a supported EVR content export.');
      }
      const entries = { ...imported.entries };
      const stagedVideos = [];
      for (const [key, entry] of Object.entries(entries)) {
        if (entry?.type !== 'video' || !/^data:video\//i.test(entry.value)) continue;
        const blob = await dataUrlToBlob(entry.value);
        if (blob.size > 250 * 1024 * 1024) throw new Error('An exported video is larger than 250 MB.');
        await validatePlayableVideo(blob);
        const id = crypto.randomUUID();
        stagedVideos.push({ id, blob, key });
        entries[key] = { type: 'video', value: id };
      }
      const checked = validateEntries(entries);
      const storedIds = [];
      try {
        for (const video of stagedVideos) {
          await storeVideo(video.id, video.blob);
          storedIds.push(video.id);
          checked[video.key] = { type: 'video', value: video.id };
        }
        localStorage.setItem(storageKey, JSON.stringify({ version: 1, entries: checked }));
      } catch (error) {
        await Promise.allSettled(storedIds.map(deleteVideo));
        throw error;
      }
      window.location.reload();
    } catch (error) {
      setStatus(`Could not import this file: ${error.message}`, true);
    } finally {
      importPicker.value = '';
    }
  });

  document.getElementById('admin-reset').addEventListener('click', async () => {
    if (!window.confirm('Reset all saved website edits in this browser? This cannot be undone.')) return;
    try {
      localStorage.removeItem(storageKey);
      const urls = Array.from(videoUrls.values());
      await clearVideoAssets();
      urls.forEach(url => URL.revokeObjectURL(url));
      window.location.reload();
    } catch (error) {
      setStatus(`Could not reset saved edits: ${error.message}`, true);
    }
  });

  edits = loadEdits();
  window.adminPreviewPage = pageSelect.value;
  window.route();
  refreshImageOptions();
  refreshVideoOptions();
  setMode('text');
  if (loadError) setStatus(`Could not load saved edits: ${loadError}`, true);
  else if (Object.keys(edits).length) setStatus('Saved edits loaded. Choose a tool to keep editing or reset all content.');
  if (Object.values(edits).some(edit => edit.type === 'video')) {
    assetDb.then(async db => {
      for (const edit of Object.values(edits)) {
        if (edit.type !== 'video' || videoUrls.has(edit.value)) continue;
        const blob = await getVideo(edit.value);
        if (!blob) throw new Error(`Saved video asset "${edit.value}" is missing.`);
        videoUrls.set(edit.value, URL.createObjectURL(blob));
      }
      applyEdits();
    }).catch(error => setStatus(`Could not load saved videos: ${error.message}`, true));
  } else {
    applyEdits();
  }
})();
