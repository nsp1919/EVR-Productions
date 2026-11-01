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
  const settingsStatus = document.getElementById('admin-settings-status');
  const settingsPanel = document.getElementById('admin-settings');
  const settingsOpen = document.getElementById('admin-settings-open');
  const loginPanel = document.getElementById('admin-login');
  const loginStatus = document.getElementById('admin-login-status');
  const passwordInput = document.getElementById('admin-password');
  const controls = document.querySelector('.admin-controls');
  const textSelector = 'h1,h2,h3,h4,p,a,span,figcaption,summary,label,button,li,dt,dd,blockquote,cite,b,strong,em';
  const backgroundSelector = 'section,article,a,figure,aside,header,footer,div';
  const allowedMarkup = new Set(['BR', 'EM', 'STRONG', 'B', 'I', 'SPAN', 'SMALL', 'SUB', 'SUP']);
  const assetDatabase = 'evr-site-content-assets';
  const assetStore = 'videos';
  let mode = 'text';
  let selectedElement = null;
  let edits = {};
  const videoUrls = new Map();
  const hlsPlayers = new Map();
  const videoSourceVersions = new WeakMap();
  const pendingVideos = new Map();
  let assetDb;
  let hlsClientPromise;

  function openAssetDb() {
    if (!assetDb) {
      assetDb = new Promise((resolve, reject) => {
        const request = indexedDB.open(assetDatabase, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(assetStore)) request.result.createObjectStore(assetStore, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open legacy browser video storage.'));
        request.onblocked = () => reject(new Error('Legacy browser video storage is blocked by another tab.'));
      });
    }
    return assetDb;
  }

  function getVideo(id) {
    return openAssetDb().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(assetStore, 'readonly');
      const request = transaction.objectStore(assetStore).get(id);
      request.onsuccess = () => resolve(request.result && request.result.blob);
      request.onerror = () => reject(request.error || new Error('Could not read the saved video file.'));
    }));
  }

  function clearVideoAssets() {
    return openAssetDb().then(db => new Promise((resolve, reject) => {
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

  async function validateVideoContainer(file) {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const fourCC = String.fromCharCode(...header.slice(4, 8));
    const isIsoMedia = fourCC === 'ftyp';
    const isEbml = header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
    const isAvi = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...header.slice(8, 12)) === 'AVI ';
    const isMpeg = (header[0] === 0 && header[1] === 0 && header[2] === 1) ||
      (header[0] === 0x47 && header.length >= 12);
    if (!isIsoMedia && !isEbml && !isAvi && !isMpeg) {
      throw new Error('The selected file is not recognizable video content.');
    }
  }

  function setVideoSource(video, source) {
    const previousPlayer = hlsPlayers.get(video);
    if (previousPlayer) {
      previousPlayer.destroy();
      hlsPlayers.delete(video);
    }

    const sourceVersion = Symbol();
    videoSourceVersions.set(video, sourceVersion);
    video.pause();
    video.removeAttribute('src');
    video.replaceChildren();
    let cloudinaryHlsSource = null;
    try {
      const url = new URL(source);
      if (url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
          url.pathname.includes('/video/upload/') && /\.(?:mp4|mov|webm|mkv|avi|mpeg|3gp)$/i.test(url.pathname)) {
        url.pathname = url.pathname.replace('/video/upload/', '/video/upload/sp_auto/')
          .replace(/\.[^/.]+$/i, '.m3u8');
        cloudinaryHlsSource = url.toString();
      }
    } catch {
      cloudinaryHlsSource = null;
    }
    const hlsSource = /^https:\/\/customer-[\w-]+\.cloudflarestream\.com\/[\w-]+\/manifest\/video\.m3u8(?:\?.*)?$/i.test(source)
      ? source
      : cloudinaryHlsSource;
    if (hlsSource) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsSource;
        video.load();
      } else {
        loadHlsClient().then(Hls => {
          if (videoSourceVersions.get(video) !== sourceVersion) return;
          if (!Hls.isSupported()) {
            setStatus('This browser does not support HLS video playback.', true);
            return;
          }
          const player = new Hls({ enableWorker: true });
          player.loadSource(hlsSource);
          player.attachMedia(video);
          hlsPlayers.set(video, player);
        }).catch(error => {
          if (videoSourceVersions.get(video) === sourceVersion) {
            setStatus(`Could not load HLS video playback: ${error.message}`, true);
          }
        });
      }
    } else {
      video.src = source;
      video.load();
    }
  }

  function markUploadedVideo(video) {
    const preview = video.closest('.preview-media');
    if (preview) {
      preview.classList.add('has-project-video');
      preview.querySelector('img')?.removeAttribute('aria-hidden');
      video.hidden = false;
      const disclaimer = preview.querySelector('.media-disclaimer');
      if (disclaimer) disclaimer.textContent = 'EVR VIDEO / PROJECT SAMPLE';
      video.setAttribute('aria-label', 'EVR-produced project video sample');
      const play = preview.querySelector('.preview-play');
      if (play) {
        play.setAttribute('aria-label', 'Play EVR-produced project video');
        play.hidden = true;
      }
    }

    const reel = video.closest('.corp-reel-card');
    if (reel) {
      reel.classList.add('has-project-video');
      const title = reel.querySelector(':scope > span:last-child')?.textContent.trim() || 'NBrands';
      reel.setAttribute('aria-label', `Play EVR-produced ${title.toLowerCase()} video`);
    }

    const testimonial = video.closest('.voice-grid article');
    if (testimonial) video.hidden = false;
  }

  function loadHlsClient() {
    if (window.evrHls) return Promise.resolve(window.evrHls);
    if (!hlsClientPromise) {
      hlsClientPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'hls-client.js';
        script.async = true;
        script.onload = () => window.evrHls
          ? resolve(window.evrHls)
          : reject(new Error('The HLS playback library did not initialize.'));
        script.onerror = () => reject(new Error('The HLS playback library could not be downloaded.'));
        document.head.appendChild(script);
      }).catch(error => {
        hlsClientPromise = null;
        throw error;
      });
    }
    return hlsClientPromise;
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
    settingsStatus.textContent = message;
    settingsStatus.dataset.error = String(error);
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }

  async function uploadMedia(file, type) {
    if (typeof window.evrUploadMedia !== 'function') throw new Error('The secure media uploader did not load. Reload the page and try again.');
    return window.evrUploadMedia(file, type);
  }

  async function uploadR2Video(file, onProgress = () => {}) {
    if (typeof window.evrUploadR2Video !== 'function') {
      throw new Error('The Cloudflare R2 video uploader did not load. Reload the page and try again.');
    }
    return window.evrUploadR2Video(file, onProgress);
  }

  async function saveSharedContent(content) {
    return apiRequest('/api/content', {
      method: 'PUT',
      body: JSON.stringify(content)
    });
  }

  function showEditor(authenticated) {
    loginPanel.hidden = authenticated;
    controls.hidden = !authenticated;
    settingsOpen.hidden = !authenticated;
    if (!authenticated) settingsPanel.hidden = true;
  }

  function setLoginStatus(message, error = false) {
    loginStatus.textContent = message;
    loginStatus.dataset.error = String(error);
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

  function validateEntries(entries) {
    const checked = {};
    for (const [key, entry] of Object.entries(entries)) {
      if (!entry || typeof entry.value !== 'string') throw new Error('An edit entry is incomplete.');
      if (entry.type === 'text') checked[key] = { type: 'text', value: safeMarkup(entry.value) };
      else if (entry.type === 'image' && safeImageSource(entry.value)) checked[key] = { type: 'image', value: entry.value };
      else if (entry.type === 'video' && (/^https?:\/\//i.test(entry.value) || /^[\w-]{1,80}$/.test(entry.value))) checked[key] = { type: 'video', value: entry.value };
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
      else if (edit.type === 'video' && element instanceof HTMLVideoElement && element.dataset.adminVideoAsset !== edit.value) {
        setVideoSource(element, videoUrls.get(edit.value) || edit.value);
        element.dataset.adminVideoAsset = edit.value;
        markUploadedVideo(element);
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
      const label = video.dataset.r2SlotLabel || video.getAttribute('aria-label') ||
        reel?.getAttribute('aria-label') || titleElement?.textContent.trim() || section?.id || `Video ${index + 1}`;
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
    if (isAdmin) checkAuthentication();
    else showEditor(false);
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
      setStatus('Unsaved text edits. Choose Save changes to publish them to the shared website.');
    }
  });

  colorPicker.addEventListener('input', () => {
    if (!selectedElement || mode !== 'background') {
      setStatus('Choose Change background, then click an area in the preview.');
      return;
    }
    selectedElement.style.backgroundColor = colorPicker.value;
    selectedElement.dataset.adminBackgroundEdited = 'true';
    setStatus('Unsaved background edit. Choose Save changes to publish it to the shared website.');
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
      const photoBlob = await (await fetch(photo)).blob();
      selectedElement.src = await uploadMedia(photoBlob, 'image/webp');
      selectedElement.dataset.adminImageEdited = 'true';
      setStatus('Photo uploaded. Choose Save changes to publish it to the shared website.');
    } catch (error) {
      setStatus(`Could not process this photo: ${error.message}`, true);
    } finally {
      photoPicker.value = '';
    }
  });

  videoPicker.addEventListener('change', async () => {
    const file = videoPicker.files && videoPicker.files[0];
    if (!file || !selectedElement || !(selectedElement instanceof HTMLVideoElement)) return;
    if (!file.type.startsWith('video/') || file.size > 30 * 1024 * 1024 * 1024) {
      setStatus('Choose a supported video file smaller than 30 GB.', true);
      videoPicker.value = '';
      return;
    }
    try {
      await validateVideoContainer(file);
      const elementKeyValue = elementKey(selectedElement);
      setStatus(`Preparing secure Cloudflare R2 upload for ${file.name}…`);
      const uploaded = await uploadR2Video(file, (loaded, total) => {
        const percent = total ? Math.floor(loaded / total * 100) : 0;
        const uploadedMb = (loaded / (1024 * 1024)).toFixed(0);
        const totalMb = (total / (1024 * 1024)).toFixed(0);
        setStatus(`Uploading to Cloudflare R2: ${percent}% (${uploadedMb} / ${totalMb} MB). If interrupted, choose the same file again to resume.`);
      });
      selectedElement.dataset.adminVideoEdited = 'true';
      selectedElement.dataset.adminVideoAsset = uploaded.playbackUrl;
      setVideoSource(selectedElement, uploaded.playbackUrl);
      markUploadedVideo(selectedElement);
      pendingVideos.set(elementKeyValue, uploaded);
      setStatus('Video uploaded to Cloudflare R2. Choose Save changes to publish the video.');
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
    });
    document.querySelectorAll('[data-admin-image-edited="true"]').forEach(element => {
      if (element instanceof HTMLImageElement && safeImageSource(element.src)) {
        next[elementKey(element)] = { type: 'image', value: element.src };
      }
    });
    document.querySelectorAll('[data-admin-background-edited="true"]').forEach(element => {
      next[elementKey(element)] = { type: 'background', value: element.style.backgroundColor };
    });
    try {
      for (const [key, video] of pendingVideos) {
        setStatus('Saving video playback details to the shared website…');
        next[key] = { type: 'video', value: video.playbackUrl };
      }
      const saved = await saveSharedContent({ version: 1, entries: next });
      edits = validateEntries(saved.entries);
      pendingVideos.clear();
      document.querySelectorAll('[data-admin-text-edited="true"]').forEach(element => {
        element.innerHTML = safeMarkup(element.innerHTML);
        element.contentEditable = 'false';
        delete element.dataset.adminTextEdited;
      });
      document.querySelectorAll('[data-admin-image-edited="true"]').forEach(element => {
        delete element.dataset.adminImageEdited;
      });
      document.querySelectorAll('[data-admin-background-edited="true"]').forEach(element => {
        delete element.dataset.adminBackgroundEdited;
      });
      document.querySelectorAll('[data-admin-video-edited="true"]').forEach(element => {
        const key = elementKey(element);
        const savedVideo = edits[key];
        if (savedVideo) {
          setVideoSource(element, savedVideo.value);
          element.dataset.adminVideoAsset = savedVideo.value;
          markUploadedVideo(element);
        }
        delete element.dataset.adminVideoEdited;
      });
      clearSelection();
      setStatus('Changes saved to the shared website.');
    } catch (error) {
      setStatus(`Could not save changes: ${error.message}`, true);
    }
  });

  async function exportContentBackup() {
    try {
      const entries = { ...edits };
      for (const [key, edit] of Object.entries(entries)) {
        if (edit.type !== 'video' || /^https:\/\//i.test(edit.value)) continue;
        const blob = /^[\w-]{1,80}$/.test(edit.value)
          ? await getVideo(edit.value)
          : await fetch(edit.value).then(response => {
            if (!response.ok) throw new Error(`Could not download saved video (${response.status}).`);
            return response.blob();
          });
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
  }

  document.getElementById('admin-export').addEventListener('click', exportContentBackup);
  document.getElementById('admin-settings-export').addEventListener('click', exportContentBackup);
  document.getElementById('admin-settings-import').addEventListener('click', () => importPicker.click());
  settingsOpen.addEventListener('click', () => {
    controls.hidden = true;
    settingsPanel.hidden = false;
    settingsOpen.setAttribute('aria-expanded', 'true');
  });
  document.getElementById('admin-settings-close').addEventListener('click', () => {
    settingsPanel.hidden = true;
    controls.hidden = false;
    settingsOpen.setAttribute('aria-expanded', 'false');
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
      for (const [key, entry] of Object.entries(entries)) {
        if (entry?.type === 'image' && /^data:image\//i.test(entry.value)) {
          const blob = await fetch(entry.value).then(response => response.blob());
          entries[key] = { type: 'image', value: await uploadMedia(blob, blob.type) };
        } else if (entry?.type === 'video' && /^data:video\//i.test(entry.value)) {
          throw new Error('Video files are kept in Cloudflare R2, not inside content backups. Upload the video in the editor, then import a backup containing its R2 playback link.');
        } else if (entry?.type === 'video' && /^[\w-]{1,80}$/.test(entry.value)) {
          throw new Error(`Legacy browser video "${entry.value}" must be uploaded again with the Cloudflare R2 video uploader before importing.`);
        }
      }
      const checked = validateEntries(entries);
      await saveSharedContent({ version: 1, entries: checked });
      window.location.reload();
    } catch (error) {
      setStatus(`Could not import this file: ${error.message}`, true);
    } finally {
      importPicker.value = '';
    }
  });

  async function resetSavedEdits() {
    if (!window.confirm('Reset the shared website content to its original version? This cannot be undone.')) return;
    try {
      const urls = Array.from(videoUrls.values());
      await saveSharedContent({ version: 1, entries: {} });
      localStorage.removeItem(storageKey);
      await clearVideoAssets();
      urls.forEach(url => URL.revokeObjectURL(url));
      window.location.reload();
    } catch (error) {
      setStatus(`Could not reset saved edits: ${error.message}`, true);
    }
  }

  document.getElementById('admin-reset').addEventListener('click', resetSavedEdits);
  document.getElementById('admin-settings-reload').addEventListener('click', resetSavedEdits);

  window.adminPreviewPage = pageSelect.value;
  window.route();
  refreshImageOptions();
  refreshVideoOptions();
  setMode('text');
  showEditor(false);
  loadSharedContent();
  if (location.hash === '#/admin') checkAuthentication();

  async function loadSharedContent() {
    try {
      const saved = await apiRequest('/api/content');
      edits = validateEntries(saved.entries);
      applyEdits();
      const migrateButton = document.getElementById('admin-migrate-local');
      migrateButton.hidden = Object.keys(edits).length > 0 || !localStorage.getItem(storageKey);
      setStatus(Object.keys(edits).length
        ? 'Shared website content loaded. Choose a tool to edit it.'
        : 'Shared website content is ready to edit.');
    } catch (error) {
      setStatus(`Could not load shared website content: ${error.message}`, true);
    }
  }

  document.getElementById('admin-migrate-local').addEventListener('click', async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || saved.version !== 1 || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)) {
        throw new Error('No supported browser-saved edits were found.');
      }
      const migrated = { ...saved.entries };
      for (const [key, entry] of Object.entries(migrated)) {
        if (entry?.type === 'image' && /^data:image\//i.test(entry.value)) {
          const blob = await fetch(entry.value).then(response => response.blob());
          migrated[key] = { type: 'image', value: await uploadMedia(blob, blob.type) };
        } else if (entry?.type === 'video' && !/^https:\/\//i.test(entry.value)) {
          throw new Error(`Legacy browser video "${entry.value}" must be uploaded again with the Cloudflare R2 video uploader before migration.`);
        }
      }
      const checked = validateEntries(migrated);
      await saveSharedContent({ version: 1, entries: checked });
      localStorage.removeItem(storageKey);
      await clearVideoAssets();
      window.location.reload();
    } catch (error) {
      setStatus(`Could not migrate browser-saved edits: ${error.message}`, true);
    }
  });

  async function checkAuthentication() {
    showEditor(false);
    try {
      const result = await apiRequest('/api/auth');
      if (!result.configured) {
        setLoginStatus(result.error || 'Server-side admin access is not configured.', true);
        return;
      }
      if (result.authenticated) {
        showEditor(true);
      } else {
        setLoginStatus('Enter your admin password to continue.');
      }
    } catch (error) {
      setLoginStatus(`Could not connect to the server: ${error.message}`, true);
    }
  }

  loginPanel.addEventListener('submit', async event => {
    event.preventDefault();
    setLoginStatus('Signing in…');
    try {
      await apiRequest('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', password: passwordInput.value })
      });
      passwordInput.value = '';
      showEditor(true);
      await loadSharedContent();
    } catch (error) {
      setLoginStatus(error.message, true);
    }
  });

  document.getElementById('admin-logout').addEventListener('click', async () => {
    try {
      await apiRequest('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) });
      showEditor(false);
      setLoginStatus('You have signed out.');
      settingsPanel.hidden = true;
    } catch (error) {
      setStatus(`Could not sign out: ${error.message}`, true);
    }
  });

})();
