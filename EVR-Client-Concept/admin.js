'use strict';
(() => {
  const storageKey = 'evr-site-content';
  const editor = document.getElementById('admin-editor');
  const pageSelect = document.getElementById('admin-preview-page');
  const workControls = document.getElementById('admin-work-controls');
  const workForm = document.getElementById('admin-work-controls');
  const workDialog = document.getElementById('admin-work-dialog');
  const colorPicker = document.getElementById('admin-background-color');
  const photoPicker = document.getElementById('admin-photo-file');
  const videoPicker = document.getElementById('admin-video-file');
  const importPicker = document.getElementById('admin-import-file');
  const status = document.getElementById('admin-status');
  const settingsStatus = document.getElementById('admin-settings-status');
  const settingsPanel = document.getElementById('admin-settings');
  const settingsOpen = document.getElementById('admin-settings-open');
  const loginPanel = document.getElementById('admin-login');
  const loginScreen = document.getElementById('admin-login-screen');
  const loginStatus = document.getElementById('admin-login-status');
  const adminEmailInput = document.getElementById('admin-email');
  const adminCodeInput = document.getElementById('admin-code');
  const adminCodeEntry = document.getElementById('admin-code-entry');
  const controls = document.querySelector('.admin-controls');
  const textSelector = 'h1,h2,h3,h4,p,a,span,figcaption,summary,label,button,li,dt,dd,blockquote,cite,b,strong,em';
  const backgroundSelector = 'section,article,a,figure,aside,header,footer,div';
  const allowedMarkup = new Set(['BR', 'EM', 'STRONG', 'B', 'I', 'SPAN', 'SMALL', 'SUB', 'SUP']);
  const assetDatabase = 'evr-site-content-assets';
  const assetStore = 'videos';
  const managedGalleryKey = '#work-gallery-items-v1';
  const hiddenWorkCardsKey = '#work-gallery-hidden-cards-v1';
  const workCategoriesKey = '#work-gallery-categories-v1';
  const mediaRevertKey = '#media-revert-state-v1';
  const defaultWorkCategories = [
    { slug: 'wedding', label: 'Wedding day' },
    { slug: 'prewedding', label: 'Pre-wedding' },
    { slug: 'celebration', label: 'Celebrations' },
    { slug: 'birthday', label: 'Birthdays' },
    { slug: 'maternity', label: 'Maternity' },
    { slug: 'half-saree', label: 'Half Saree' },
    { slug: 'engagement', label: 'Engagement parties' },
    { slug: 'other-functions', label: 'Other functions' }
  ];
  let mode = 'text';
  let selectedElement = null;
  let edits = {};
  let managedWorkItems = [];
  let hiddenWorkCardIds = new Set();
  let customWorkCategories = [];
  let mediaRevertState = {};
  let managedGalleryChanged = false;
  const videoUrls = new Map();
  const hlsPlayers = new Map();
  const videoSourceVersions = new WeakMap();
  const pendingVideos = new Map();
  const watchedMediaImages = new WeakSet();
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
      if (preview.closest('#work')) {
        video.controls = true;
        video.loop = true;
      }
      const disclaimer = preview.querySelector('.media-disclaimer');
      if (disclaimer) disclaimer.textContent = 'EVR VIDEO / PROJECT SAMPLE';
      video.setAttribute('aria-label', 'EVR-produced project video sample');
      const play = preview.querySelector('.preview-play');
      if (play) {
        play.setAttribute('aria-label', 'Play EVR-produced project video');
        play.hidden = !preview.closest('#work');
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
    window.adminAuthenticated = authenticated;
    loginScreen.hidden = authenticated;
    loginPanel.hidden = authenticated;
    controls.hidden = !authenticated;
    settingsOpen.hidden = !authenticated;
    document.body.classList.toggle('admin-locked', location.hash === '#/admin' && !authenticated);
    if (!authenticated) settingsPanel.hidden = true;
    if (typeof window.route === 'function') window.route();
    renderManagedWorkItems();
    if (authenticated) {
      renderMediaControls();
    }
    document.documentElement.classList.remove('admin-route-pending');
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

  async function uploadPhotoFile(file) {
    if (!file.type.startsWith('image/') || file.size > 30 * 1024 * 1024) {
      throw new Error('Choose an image file up to 30 MB.');
    }
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
    return uploadMedia(photoBlob, 'image/webp');
  }

  function encodeManagedGallery(items) {
    const bytes = new TextEncoder().encode(JSON.stringify(items));
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function readCustomWorkCategories(value) {
    let categories;
    try {
      categories = JSON.parse(value);
    } catch (error) {
      throw new Error(`The saved Work categories are invalid: ${error.message}`);
    }
    if (!Array.isArray(categories) || categories.length > 50) {
      throw new Error('The saved Work categories list is invalid.');
    }
    const usedSlugs = new Set(defaultWorkCategories.map(category => category.slug));
    const usedLabels = new Set(defaultWorkCategories.map(category => category.label.toLowerCase()));
    return categories.map(category => {
      if (!category || typeof category.slug !== 'string' ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.slug) || category.slug.length > 48 ||
          typeof category.label !== 'string' || category.label.trim().length < 2 ||
          category.label.trim().length > 32 ||
          usedSlugs.has(category.slug) || usedLabels.has(category.label.trim().toLowerCase())) {
        throw new Error('A saved Work category is incomplete, duplicated, or invalid.');
      }
      usedSlugs.add(category.slug);
      usedLabels.add(category.label.trim().toLowerCase());
      return { slug: category.slug, label: category.label.trim() };
    });
  }

  function availableWorkCategories() {
    return [...defaultWorkCategories, ...customWorkCategories];
  }

  function refreshWorkCategoryControls() {
    const categorySelect = document.getElementById('admin-work-category');
    const filterBar = document.querySelector('#work .filters');
    if (categorySelect) {
      const selectedCategory = categorySelect.value;
      categorySelect.replaceChildren(...availableWorkCategories().map(category => {
        const option = document.createElement('option');
        option.value = category.slug;
        option.textContent = category.label;
        return option;
      }));
      if (availableWorkCategories().some(category => category.slug === selectedCategory)) {
        categorySelect.value = selectedCategory;
      }
    }
    if (filterBar) {
      const activeFilter = filterBar.querySelector('[data-filter].active')?.dataset.filter || 'all';
      filterBar.querySelectorAll('[data-filter]:not([data-filter="all"])').forEach(button => button.remove());
      availableWorkCategories().forEach(category => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filter = category.slug;
        button.setAttribute('aria-pressed', String(activeFilter === category.slug));
        button.classList.toggle('active', activeFilter === category.slug);
        button.textContent = category.label;
        filterBar.append(button);
      });
      if (!availableWorkCategories().some(category => category.slug === activeFilter) && activeFilter !== 'all') {
        const allStories = filterBar.querySelector('[data-filter="all"]');
        if (allStories) allStories.click();
      }
    }
  }

  function decodeManagedGallery(value, categorySlugs = new Set(availableWorkCategories().map(category => category.slug))) {
    let items;
    try {
      const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
      items = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      throw new Error(`The saved Work gallery is invalid: ${error.message}`);
    }
    if (!Array.isArray(items) || items.length > 100) {
      throw new Error('The saved Work gallery must contain no more than 100 stories.');
    }
    const ids = new Set();
    return items.map(item => {
      if (!item || typeof item !== 'object' ||
          typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) ||
          typeof item.title !== 'string' || !item.title.trim() || item.title.length > 80 ||
          typeof item.category !== 'string' || !categorySlugs.has(item.category) ||
          typeof item.description !== 'string' || !item.description.trim() || item.description.length > 240 ||
          typeof item.imageUrl !== 'string' ||
          (item.imageUrl !== '' && !safeImageSource(item.imageUrl))) {
        throw new Error('A saved Work story is incomplete or invalid.');
      }
      if (typeof item.videoUrl !== 'string' ||
          (item.videoUrl !== '' && !isSecureMediaUrl(item.videoUrl)) ||
      (item.imageRevertUrl !== undefined && !safeImageSource(item.imageRevertUrl)) ||
      (item.videoRevertUrl !== undefined && !isSecureMediaUrl(item.videoRevertUrl)) ||
      (!item.imageUrl && !item.videoUrl)) {
        throw new Error('A saved Work story must have a valid image, a secure video, or both.');
      }
      ids.add(item.id);
      return {
        id: item.id,
        title: item.title.trim(),
        category: item.category,
        description: item.description.trim(),
        imageUrl: item.imageUrl,
        videoUrl: item.videoUrl || '',
        ...(item.imageRevertUrl ? { imageRevertUrl: item.imageRevertUrl } : {}),
        ...(item.videoRevertUrl ? { videoRevertUrl: item.videoRevertUrl } : {})
      };
    });
  }

  function mediaSource(element, type) {
    if (type === 'image' && element instanceof HTMLImageElement) {
      return element.currentSrc || element.src;
    }
    if (type === 'video' && element instanceof HTMLVideoElement) {
      return edits[elementKey(element)]?.type === 'video'
        ? edits[elementKey(element)].value
        : element.currentSrc || element.getAttribute('src') || element.querySelector('source')?.src ||
          element.closest('.preview-media')?.dataset.r2VideoUrl || element.src;
    }
    return '';
  }

  function readMediaRevertState(value) {
    let state;
    try {
      state = JSON.parse(value);
    } catch (error) {
      throw new Error(`The saved media revert state is invalid: ${error.message}`);
    }
    if (!state || typeof state !== 'object' || Array.isArray(state) || Object.keys(state).length > 500) {
      throw new Error('The saved media revert state is invalid.');
    }
    const checked = {};
    for (const [key, media] of Object.entries(state)) {
      const validValue = media?.type === 'image'
        ? safeImageSource(media.value)
        : media?.type === 'video' && (/^https?:\/\//i.test(media.value) || /^[\w-]{1,80}$/.test(media.value));
      if (!key || key.length > 500 || !validValue) {
        throw new Error('The saved media revert state contains an invalid source.');
      }
      checked[key] = { type: media.type, value: media.value };
    }
    return checked;
  }

  function isSecureMediaUrl(source) {
    try {
      return new URL(source).protocol === 'https:';
    } catch {
      return false;
    }
  }

  function categoryLabel(category) {
    const definition = availableWorkCategories().find(item => item.slug === category);
    return (definition?.label || category).toUpperCase();
  }

  function workCardId(article) {
    const media = article.querySelector('.preview-media[data-r2-slot], .preview-media[data-portfolio-slot]');
    const slot = media?.dataset.r2Slot || media?.dataset.portfolioSlot;
    return slot ? `portfolio:${slot}` : '';
  }

  function readHiddenWorkCardIds(value) {
    let ids;
    try {
      ids = JSON.parse(value);
    } catch (error) {
      throw new Error(`The saved hidden Work cards are invalid: ${error.message}`);
    }
    if (!Array.isArray(ids) || ids.length > 100 ||
        ids.some(id => typeof id !== 'string' || !/^portfolio:.{1,240}$/.test(id))) {
      throw new Error('The saved hidden Work cards list is invalid.');
    }
    return new Set(ids);
  }

  function removeHiddenWorkCards() {
    document.querySelectorAll('#work .story-library > article:not(.admin-managed-work-item)').forEach(article => {
      const id = workCardId(article);
      if (id && hiddenWorkCardIds.has(id)) article.hidden = true;
    });
  }

  function createAddWorkCard() {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'admin-add-work-card';
    card.innerHTML = '<span class="admin-add-work-symbol" aria-hidden="true">+</span><span>Add a story</span><small>PHOTO · VIDEO · CATEGORY</small>';
    card.addEventListener('click', () => {
      const allStories = document.querySelector('#work [data-filter="all"]');
      if (allStories && !allStories.classList.contains('active')) allStories.click();
      workForm.reset();
      syncWorkMediaChoice();
      document.getElementById('admin-work-dialog-status').textContent = '';
      workDialog.showModal();
      workForm.querySelector('input[name="admin-work-media-type"]').focus({ preventScroll: true });
    });
    return card;
  }

  function createManagedWorkActions(item) {
    const actions = document.createElement('div');
    actions.className = 'admin-card-actions';
    actions.setAttribute('aria-label', `Manage ${item.title}`);

    const replaceImage = createMediaIconButton(
      item.imageUrl ? 'Replace photo' : 'Add photo',
      'image',
      () => imagePicker.click(),
      `Replace photo · JPG/PNG/WebP/GIF · max 30 MB · 1600px recommended · optimized to WebP`
    );
    const imagePicker = document.createElement('input');
    imagePicker.type = 'file';
    imagePicker.accept = 'image/*';
    imagePicker.hidden = true;
    imagePicker.addEventListener('change', async () => {
      const file = imagePicker.files && imagePicker.files[0];
      if (!file) return;
      try {
        setStatus(`Preparing a new cover for ${item.title}…`);
        const imageUrl = await uploadPhotoFile(file);
        const currentItem = managedWorkItems.find(candidate => candidate.id === item.id);
        if (!currentItem) throw new Error('This story was removed before its cover upload finished.');
        if (currentItem.imageUrl) currentItem.imageRevertUrl = currentItem.imageUrl;
        currentItem.imageUrl = imageUrl;
        managedGalleryChanged = true;
        renderManagedWorkItems();
        setStatus('Cover replaced. Choose Save changes to publish it to the shared website.');
      } catch (error) {
        setStatus(`Could not replace the story cover: ${error.message}`, true);
      } finally {
        imagePicker.value = '';
      }
    });

    if (item.imageRevertUrl) {
      actions.append(createMediaIconButton('Revert photo', 'undo', () => {
        const currentItem = managedWorkItems.find(candidate => candidate.id === item.id);
        if (!currentItem?.imageRevertUrl) return;
        currentItem.imageUrl = currentItem.imageRevertUrl;
        delete currentItem.imageRevertUrl;
        managedGalleryChanged = true;
        renderManagedWorkItems();
        renderMediaControls();
        setStatus('Previous photo restored. Choose Save changes to publish the update.');
      }, 'Restore the previous photo'));
    }

    const replaceVideo = createMediaIconButton(
      item.videoUrl ? 'Replace video' : 'Add video',
      'video',
      () => videoPickerInput.click(),
      'Replace or add video · MP4 (H.264) recommended · MOV/WebM/MKV/AVI · 1080p recommended · max 1 GB'
    );
    const videoPickerInput = document.createElement('input');
    videoPickerInput.type = 'file';
    videoPickerInput.accept = 'video/*';
    videoPickerInput.hidden = true;
    videoPickerInput.addEventListener('change', async () => {
      const file = videoPickerInput.files && videoPickerInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/') || file.size > 1024 * 1024 * 1024) {
        setStatus('Choose a supported video file up to 1 GB.', true);
        videoPickerInput.value = '';
        return;
      }
      try {
        await validateVideoContainer(file);
        setStatus(`Preparing secure Cloudflare R2 upload for ${file.name}…`);
        const uploaded = await uploadR2Video(file, (loaded, total) => {
          const percent = total ? Math.floor(loaded / total * 100) : 0;
          const uploadedMb = (loaded / (1024 * 1024)).toFixed(0);
          const totalMb = (total / (1024 * 1024)).toFixed(0);
          setStatus(`Uploading story video to Cloudflare R2: ${percent}% (${uploadedMb} / ${totalMb} MB).`);
        });
        if (!isSecureMediaUrl(uploaded.playbackUrl)) {
          throw new Error('The video uploader did not return a secure playback URL.');
        }
        const currentItem = managedWorkItems.find(candidate => candidate.id === item.id);
        if (!currentItem) throw new Error('This story was removed before its video upload finished.');
        if (currentItem.videoUrl) currentItem.videoRevertUrl = currentItem.videoUrl;
        currentItem.videoUrl = uploaded.playbackUrl;
        managedGalleryChanged = true;
        renderManagedWorkItems();
        renderMediaControls();
        setStatus('Video attached. Choose Save changes to publish it to the shared website.');
      } catch (error) {
        setStatus(`Could not attach a video to this story: ${error.message}`, true);
      } finally {
        videoPickerInput.value = '';
      }
    });

    actions.append(replaceImage, imagePicker, replaceVideo, videoPickerInput);

    if (item.videoRevertUrl) {
      actions.append(createMediaIconButton('Revert video', 'undo', () => {
        const currentItem = managedWorkItems.find(candidate => candidate.id === item.id);
        if (!currentItem?.videoRevertUrl) return;
        currentItem.videoUrl = currentItem.videoRevertUrl;
        delete currentItem.videoRevertUrl;
        managedGalleryChanged = true;
        renderManagedWorkItems();
        renderMediaControls();
        setStatus('Previous video restored. Choose Save changes to publish the update.');
      }, 'Restore the previous video'));
    }

    if (item.videoUrl && item.imageUrl) {
      const removeVideo = createMediaIconButton('Remove video', 'delete', () => {
        const currentItem = managedWorkItems.find(candidate => candidate.id === item.id);
        if (!currentItem) return;
        currentItem.videoUrl = '';
        managedGalleryChanged = true;
        renderManagedWorkItems();
        renderMediaControls();
        setStatus('Video removed from this story. Choose Save changes to publish the update.');
      }, 'Remove this video from the story');
      actions.append(removeVideo);
    }

    const deleteStory = createMediaIconButton('Delete story', 'delete', () => {
      if (!window.confirm(`Remove "${item.title}" from the Work page?`)) return;
      managedWorkItems = managedWorkItems.filter(candidate => candidate.id !== item.id);
      managedGalleryChanged = true;
      renderManagedWorkItems();
      renderMediaControls();
      setStatus('Story removed. Choose Save changes to publish the update.');
    }, 'Remove this story from the Work page', 'admin-card-delete');
    actions.append(deleteStory);
    return actions;
  }

  function createManagedWorkCard(item) {
    const article = document.createElement('article');
    article.className = 'admin-managed-work-item';
    article.dataset.category = item.category;
    article.dataset.adminManagedWorkItem = item.id;

    const media = document.createElement('div');
    media.className = 'story-cover preview-media';
    const image = document.createElement('img');
    image.hidden = !item.imageUrl;
    if (item.imageUrl) image.src = item.imageUrl;
    image.alt = `${item.title} celebration`;
    media.append(image);
    const video = document.createElement('video');
    video.hidden = !item.videoUrl;
    video.controls = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    if (item.imageUrl) video.poster = item.imageUrl;
    video.setAttribute('aria-label', `Watch ${item.title}`);
    if (item.videoUrl) {
      video.src = item.videoUrl;
      video.dataset.adminVideoAsset = item.videoUrl;
    }
    media.append(video);

    const label = document.createElement('small');
    label.textContent = categoryLabel(item.category);
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.description;
    article.append(createManagedWorkActions(item), media, label, title, description);
    return article;
  }

  function renderManagedWorkItems() {
    const gallery = document.querySelector('#work .story-library');
    if (!gallery) return;
    const activeFilter = document.querySelector('#work [data-filter].active')?.dataset.filter || 'all';
    gallery.querySelector('.admin-add-work-card')?.remove();
    gallery.querySelectorAll('.admin-managed-work-item').forEach(item => item.remove());
    removeHiddenWorkCards();
    managedWorkItems.forEach(item => {
      const card = createManagedWorkCard(item);
      card.hidden = activeFilter !== 'all' && item.category !== activeFilter;
      gallery.append(card);
    });
    if (location.hash === '#/admin' && window.adminAuthenticated === true && pageSelect.value === 'work') {
      gallery.append(createAddWorkCard());
    }
  }

  function syncWorkControls() {
    if (pageSelect.value !== 'work' && workDialog.open) workDialog.close();
  }

  function syncWorkMediaChoice() {
    const selectedType = workForm.querySelector('input[name="admin-work-media-type"]:checked')?.value;
    const imageUpload = document.getElementById('admin-work-image-upload');
    const videoUpload = document.getElementById('admin-work-video-upload');
    const imageInput = document.getElementById('admin-work-image');
    const videoInput = document.getElementById('admin-work-video');
    imageUpload.hidden = selectedType !== 'image';
    videoUpload.hidden = selectedType !== 'video';
    imageInput.required = selectedType === 'image';
    videoInput.required = selectedType === 'video';
    if (selectedType !== 'image') imageInput.value = '';
    if (selectedType !== 'video') videoInput.value = '';
  }

  function validateEntries(entries) {
    const checked = {};
    mediaRevertState = {};
    const siteCreditKeys = new Set(Array.from(
      document.querySelectorAll('.site-credit, .site-credit *'),
      elementKey
    ));
    const categoryEntry = entries[workCategoriesKey];
    if (categoryEntry && (categoryEntry.type !== 'text' || typeof categoryEntry.value !== 'string')) {
      throw new Error('The saved Work categories have an unsupported format.');
    }
    const validatedCategories = categoryEntry
      ? readCustomWorkCategories(categoryEntry.value)
      : [];
    const categorySlugs = new Set([
      ...defaultWorkCategories.map(category => category.slug),
      ...validatedCategories.map(category => category.slug)
    ]);
    for (const [key, entry] of Object.entries(entries)) {
      if (siteCreditKeys.has(key)) continue;
      if (!entry || typeof entry.value !== 'string') throw new Error('An edit entry is incomplete.');
      if (key === managedGalleryKey) {
        if (entry.type !== 'text') throw new Error('The saved Work gallery has an unsupported format.');
        checked[key] = { type: 'text', value: encodeManagedGallery(decodeManagedGallery(entry.value, categorySlugs)) };
      }
      else if (key === hiddenWorkCardsKey) {
        if (entry.type !== 'text') throw new Error('The hidden Work cards have an unsupported format.');
        checked[key] = { type: 'text', value: JSON.stringify(Array.from(readHiddenWorkCardIds(entry.value))) };
      }
      else if (key === workCategoriesKey) {
        checked[key] = { type: 'text', value: JSON.stringify(validatedCategories) };
      }
      else if (key === mediaRevertKey) {
        if (entry.type !== 'text') throw new Error('The saved media revert state has an unsupported format.');
        mediaRevertState = readMediaRevertState(entry.value);
        checked[key] = { type: 'text', value: JSON.stringify(mediaRevertState) };
      }
      else if (entry.type === 'text') checked[key] = { type: 'text', value: safeMarkup(entry.value) };
      else if (entry.type === 'image' && safeImageSource(entry.value)) checked[key] = { type: 'image', value: entry.value };
      else if (entry.type === 'video' && (/^https?:\/\//i.test(entry.value) || /^[\w-]{1,80}$/.test(entry.value))) checked[key] = { type: 'video', value: entry.value };
      else if (entry.type === 'background' && CSS.supports('color', entry.value)) checked[key] = { type: 'background', value: entry.value };
      else throw new Error('An edit entry contains an unsupported value.');
    }
    customWorkCategories = validatedCategories;
    refreshWorkCategoryControls();
    return checked;
  }

  function applyEdits() {
    renderManagedWorkItems();
    for (const element of document.querySelectorAll('body *')) {
      if (editor.contains(element) || element.closest('.site-credit')) continue;
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
    document.querySelectorAll('[data-admin-mode]').forEach(button => {
      const active = button.dataset.adminMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const descriptions = {
      text: 'Text editing is ready. Click a heading, paragraph, or other text in the preview.',
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

  function mediaContainer(element) {
    return element.closest('.preview-media,.story-cover,.scene-card,.corp-hero-media,.corp-reel-card,.corp-work-card,.wide-story-art,figure') ||
      element.parentElement;
  }

  function recommendedImageSize(container) {
    const bounds = container.getBoundingClientRect();
    const ratio = bounds.width > 0 && bounds.height > 0 ? bounds.width / bounds.height : 1;
    const longestSide = 1600;
    const width = ratio >= 1 ? longestSide : Math.round(longestSide * ratio);
    const height = ratio >= 1 ? Math.round(longestSide / ratio) : longestSide;
    const ratioLabel = ratio > 1.12 ? 'landscape' : ratio < 0.88 ? 'portrait' : 'square';
    return `${width} × ${height}px (${ratioLabel})`;
  }

  function createMediaIconButton(label, iconName, onClick, title = label, className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `admin-icon-button ${className}`.trim();
    button.setAttribute('aria-label', label);
    button.title = title;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const icons = {
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
      video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
      delete: '<path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
      undo: '<path d="M3 7v6h6M4 13a8 8 0 1 0 2-5.3L3 10"/>'
    };
    svg.innerHTML = icons[iconName];
    button.append(svg);
    button.addEventListener('click', onClick);
    return button;
  }

  function watchMediaImage(image) {
    if (watchedMediaImages.has(image)) return;
    watchedMediaImages.add(image);
    const refresh = () => renderMediaControls();
    image.addEventListener('load', refresh, { once: true });
    image.addEventListener('error', refresh, { once: true });
  }

  function hasVisibleMediaContainer(root, boundary) {
    if (!boundary || boundary.hidden) return false;
    const boundaryStyle = getComputedStyle(boundary);
    if (boundaryStyle.display === 'none' || boundaryStyle.visibility === 'hidden' ||
        Number(boundaryStyle.opacity) <= 0.01) return false;
    let opacity = 1;
    for (let element = root; element && element !== boundary; element = element.parentElement) {
      if (element.hidden) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      opacity *= Number(style.opacity);
      if (opacity <= 0.01) return false;
    }
    const bounds = root.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  }

  function positionMediaControls() {
    document.querySelectorAll('.admin-media-actions[data-media-root]').forEach(panel => {
      const root = panel._mediaRoot;
      const preview = root?.closest('.route');
      if (!root || !preview || !hasVisibleMediaContainer(root, preview)) {
        panel.hidden = true;
        return;
      }
      const bounds = root.getBoundingClientRect();
      const visible = bounds.width > 0 && bounds.height > 0 &&
        bounds.bottom > 0 && bounds.top < window.innerHeight &&
        bounds.right > 0 && bounds.left < window.innerWidth;
      panel.hidden = !visible;
      if (!visible) return;
      const panelBounds = panel.getBoundingClientRect();
      panel.style.top = `${Math.max(8, Math.min(bounds.top + 8, window.innerHeight - panelBounds.height - 8))}px`;
      panel.style.left = `${Math.max(8, Math.min(bounds.left + 8, window.innerWidth - panelBounds.width - 8))}px`;
    });
  }

  function renderMediaControls() {
    editor.querySelectorAll('.admin-media-actions').forEach(panel => panel.remove());
    if (location.hash !== '#/admin' || window.adminAuthenticated !== true) return;
    const preview = document.getElementById(window.adminPreviewPage || 'home');
    if (!preview) return;
    const groups = new Map();
    const addToGroup = (element, type) => {
      if (element.closest('#admin-editor') || element.parentElement?.closest('[hidden]')) return;
      const root = mediaContainer(element);
      if (!root || root.closest('.admin-managed-work-item') ||
          !hasVisibleMediaContainer(root, preview)) return;
      if (type === 'images') {
        const image = element;
        if (!(image instanceof HTMLImageElement)) return;
        if (!image.complete) {
          watchMediaImage(image);
          return;
        }
        if (image.naturalWidth === 0 || image.naturalHeight === 0) return;
      }
      if (type === 'videos' && element.hidden &&
          !element.getAttribute('aria-label')?.startsWith('Client testimonial video:')) return;
      if (!groups.has(root)) groups.set(root, { images: [], videos: [] });
      groups.get(root)[type].push(element);
    };
    preview.querySelectorAll('img').forEach(image => addToGroup(image, 'images'));
    preview.querySelectorAll('video').forEach(video => addToGroup(video, 'videos'));

    for (const [root, media] of groups) {
      if (!media.images.length && !media.videos.length) continue;
      const hasVideoMedia = media.videos.length > 0 ||
        root.matches('[data-r2-video-url]') ||
        Boolean(root.querySelector('[data-r2-video-url]'));
      const panel = document.createElement('div');
      panel.className = 'admin-media-actions';
      panel.dataset.mediaRoot = 'true';
      panel._mediaRoot = root;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', 'Replace or manage this media');

      if (media.images.length && !hasVideoMedia) {
        const image = media.images[0];
        panel.append(createMediaIconButton(
          'Replace photo',
          'image',
          () => selectPhoto(image),
          `Replace photo · ${recommendedImageSize(root)} · JPG/PNG/WebP/GIF · max 30 MB · optimized to WebP`
        ));
        if (mediaRevertState[elementKey(image)]) {
          panel.append(createMediaIconButton(
            'Revert photo',
            'undo',
            () => revokeMediaReplacement(image),
            'Restore the previous photo'
          ));
        }
      }
      if (hasVideoMedia) {
        const video = media.videos[0] || root.querySelector('video');
        panel.append(createMediaIconButton(
          'Replace video',
          'video',
          () => {
            if (!video) {
              setStatus('This video preview is still loading. Try again in a moment.', true);
              return;
            }
            selectVideo(video);
          },
          'Replace video · MP4 (H.264) recommended · MOV/WebM/MKV/AVI · match card shape · max 1 GB'
        ));
        if (video && mediaRevertState[elementKey(video)]) {
          panel.append(createMediaIconButton(
            'Revert video',
            'undo',
            () => revokeMediaReplacement(video),
            'Restore the previous video'
          ));
        }
      }

      if (preview.id === 'work') {
        const card = root.closest('#work .story-library > article:not(.admin-managed-work-item)');
        const id = card && workCardId(card);
        if (card && id) {
          panel.append(createMediaIconButton('Delete story', 'delete', () => {
            if (!window.confirm('Remove this story from the Work page?')) return;
            hiddenWorkCardIds.add(id);
            card.hidden = true;
            managedGalleryChanged = true;
            renderMediaControls();
            setStatus('Story removed. Choose Save changes to publish the update.');
          }, 'Remove this story from the Work page', 'admin-card-delete'));
        }
      }
      editor.append(panel);
    }
    positionMediaControls();
  }

  let mediaControlRefreshPending = false;
  function scheduleMediaControlRefresh() {
    positionMediaControls();
    if (mediaControlRefreshPending) return;
    mediaControlRefreshPending = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mediaControlRefreshPending = false;
        if (location.hash !== '#/admin' || window.adminAuthenticated !== true) return;
        const preview = document.getElementById(window.adminPreviewPage || 'home');
        if (!preview) return;
        const existingRoots = new Set(Array.from(editor.querySelectorAll('.admin-media-actions'))
          .map(panel => panel._mediaRoot));
        const missingVisibleMedia = Array.from(preview.querySelectorAll('img,video')).some(element => {
          const hiddenTestimonialSlot = element instanceof HTMLVideoElement &&
            element.hidden && element.getAttribute('aria-label')?.startsWith('Client testimonial video:');
          if (element.closest('#admin-editor') ||
              element.parentElement?.closest('[hidden]') ||
              (element instanceof HTMLVideoElement && element.hidden && !hiddenTestimonialSlot)) return false;
          if (element instanceof HTMLImageElement &&
              (!element.complete || element.naturalWidth === 0 || element.naturalHeight === 0)) return false;
          const root = mediaContainer(element);
          return root && !root.closest('.admin-managed-work-item') &&
            hasVisibleMediaContainer(root, preview) && !existingRoots.has(root);
        });
        if (missingVisibleMedia) renderMediaControls();
      });
    });
  }

  window.addEventListener('scroll', scheduleMediaControlRefresh, true);
  window.addEventListener('resize', scheduleMediaControlRefresh);
  document.addEventListener('transitionend', event => {
    if (event.propertyName === 'opacity' &&
        event.target instanceof Element &&
        event.target.closest('.route')) {
      scheduleMediaControlRefresh();
    }
  }, true);

  function selectPhoto(image) {
    selectElement(image);
    image.dataset.adminImageEdited = 'true';
    photoPicker.click();
  }

  function selectVideo(video) {
    selectElement(video);
    video.dataset.adminVideoEdited = 'true';
    videoPicker.click();
  }

  function revokeMediaReplacement(element) {
    const key = elementKey(element);
    const previous = mediaRevertState[key];
    if (!previous) return;
    edits[key] = previous;
    delete mediaRevertState[key];
    pendingVideos.delete(key);
    delete element.dataset.adminImageEdited;
    delete element.dataset.adminVideoEdited;
    if (previous.type === 'image' && element instanceof HTMLImageElement) {
      element.src = previous.value;
    } else if (previous.type === 'video' && element instanceof HTMLVideoElement) {
      element.dataset.adminVideoAsset = previous.value;
      setVideoSource(element, videoUrls.get(previous.value) || previous.value);
      markUploadedVideo(element);
    }
    renderMediaControls();
    setStatus('Previous media restored. Choose Save changes to publish the update.');
  }

  function hexColor(color) {
    const channels = color.match(/\d+/g);
    if (!channels || channels.length < 3) return '#243338';
    return `#${channels.slice(0, 3).map(channel => Number(channel).toString(16).padStart(2, '0')).join('')}`;
  }

  document.querySelectorAll('[data-admin-mode]').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.adminMode));
  });
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => requestAnimationFrame(positionMediaControls));
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
    syncWorkControls();
    renderManagedWorkItems();
    renderMediaControls();
  });

  document.addEventListener('click', event => {
    if (location.hash !== '#/admin' || editor.contains(event.target)) return;
    if (event.target instanceof Element &&
        (event.target.closest('.hero-video-toggle') ||
         event.target.closest('.admin-card-actions,.admin-add-work-card,[data-filter]'))) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.site-credit')) {
      setStatus('Website credits are fixed and cannot be edited.');
      return;
    }

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

  document.getElementById('admin-work-dialog-close').addEventListener('click', () => workDialog.close());
  document.querySelector('.admin-work-cancel').addEventListener('click', () => workDialog.close());
  workForm.querySelectorAll('input[name="admin-work-media-type"]').forEach(input => {
    input.addEventListener('change', syncWorkMediaChoice);
  });
  document.getElementById('admin-work-add-category').addEventListener('click', () => {
    const input = document.getElementById('admin-work-new-category');
    const label = input.value.trim().replace(/\s+/g, ' ');
    const status = document.getElementById('admin-work-dialog-status');
    const slug = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (label.length < 2 || label.length > 32 || !slug) {
      status.textContent = 'Enter a category name between 2 and 32 characters.';
      input.focus();
      return;
    }
    if (availableWorkCategories().some(category =>
      category.slug === slug || category.label.toLowerCase() === label.toLowerCase()
    )) {
      status.textContent = 'That category already exists.';
      input.focus();
      return;
    }
    if (customWorkCategories.length >= 50) {
      status.textContent = 'You can add up to 50 custom categories.';
      return;
    }
    customWorkCategories.push({ slug, label });
    refreshWorkCategoryControls();
    document.getElementById('admin-work-category').value = slug;
    managedGalleryChanged = true;
    input.value = '';
    status.textContent = `${label} added. Save changes after adding the story to publish this category.`;
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

  workForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!workForm.reportValidity()) return;
    const dialogStatus = document.getElementById('admin-work-dialog-status');
    if (managedWorkItems.length >= 100) {
      dialogStatus.textContent = 'The Work gallery supports up to 100 admin-added stories.';
      setStatus('The Work gallery supports up to 100 admin-added stories.', true);
      return;
    }
    const title = document.getElementById('admin-work-title').value.trim();
    const category = document.getElementById('admin-work-category').value;
    const description = document.getElementById('admin-work-description').value.trim();
    const mediaType = workForm.querySelector('input[name="admin-work-media-type"]:checked')?.value;
    const imageFile = mediaType === 'image' ? document.getElementById('admin-work-image').files[0] : null;
    const videoFile = mediaType === 'video' ? document.getElementById('admin-work-video').files[0] : null;
    if (!title || !description || (!imageFile && !videoFile)) return;
    if (!availableWorkCategories().some(item => item.slug === category)) {
      dialogStatus.textContent = 'Choose a valid story category.';
      setStatus('Choose a valid story category.', true);
      return;
    }
    if (videoFile && (!videoFile.type.startsWith('video/') || videoFile.size > 1024 * 1024 * 1024)) {
      dialogStatus.textContent = 'Choose a supported video file up to 1 GB.';
      setStatus('Choose a supported video file up to 1 GB.', true);
      return;
    }

    try {
      let imageUrl = '';
      let videoUrl = '';
      if (imageFile) {
        setStatus('Preparing the story image…');
        dialogStatus.textContent = 'Preparing the image…';
        imageUrl = await uploadPhotoFile(imageFile);
      } else if (videoFile) {
        await validateVideoContainer(videoFile);
        setStatus(`Preparing secure Cloudflare R2 upload for ${videoFile.name}…`);
        dialogStatus.textContent = `Preparing video upload for ${videoFile.name}…`;
        const uploaded = await uploadR2Video(videoFile, (loaded, total) => {
          const percent = total ? Math.floor(loaded / total * 100) : 0;
          const uploadedMb = (loaded / (1024 * 1024)).toFixed(0);
          const totalMb = (total / (1024 * 1024)).toFixed(0);
          const message = `Uploading story video: ${percent}% (${uploadedMb} / ${totalMb} MB).`;
          setStatus(message);
          dialogStatus.textContent = message;
        });
        if (!isSecureMediaUrl(uploaded.playbackUrl)) {
          throw new Error('The video uploader did not return a secure playback URL.');
        }
        videoUrl = uploaded.playbackUrl;
      }

      const id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      managedWorkItems.push({ id, title, category, description, imageUrl, videoUrl });
      managedGalleryChanged = true;
      renderManagedWorkItems();
      renderMediaControls();
      const categoryFilter = Array.from(document.querySelectorAll('#work [data-filter]'))
        .find(button => button.dataset.filter === category);
      if (categoryFilter) categoryFilter.click();
      workDialog.close();
      workForm.reset();
      syncWorkMediaChoice();
      dialogStatus.textContent = '';
      setStatus('Story uploaded. Choose Save changes to publish it to the shared website.');
    } catch (error) {
      dialogStatus.textContent = `Could not add this story: ${error.message}`;
      setStatus(`Could not add this story: ${error.message}`, true);
    }
  });

  photoPicker.addEventListener('change', async () => {
    const file = photoPicker.files && photoPicker.files[0];
    if (!file || !selectedElement || !(selectedElement instanceof HTMLImageElement)) return;
    try {
      const key = elementKey(selectedElement);
      const previousSource = mediaSource(selectedElement, 'image');
      const uploadedSource = await uploadPhotoFile(file);
      if (!safeImageSource(previousSource)) throw new Error('The previous photo could not be restored safely.');
      mediaRevertState[key] = { type: 'image', value: previousSource };
      selectedElement.src = uploadedSource;
      selectedElement.dataset.adminImageEdited = 'true';
      renderMediaControls();
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
    if (!file.type.startsWith('video/') || file.size > 1024 * 1024 * 1024) {
      setStatus('Choose a supported video file up to 1 GB.', true);
      videoPicker.value = '';
      return;
    }
    try {
      await validateVideoContainer(file);
      const elementKeyValue = elementKey(selectedElement);
      const previousSource = mediaSource(selectedElement, 'video');
      setStatus(`Preparing secure Cloudflare R2 upload for ${file.name}…`);
      const uploaded = await uploadR2Video(file, (loaded, total) => {
        const percent = total ? Math.floor(loaded / total * 100) : 0;
        const uploadedMb = (loaded / (1024 * 1024)).toFixed(0);
        const totalMb = (total / (1024 * 1024)).toFixed(0);
        setStatus(`Uploading to Cloudflare R2: ${percent}% (${uploadedMb} / ${totalMb} MB). If interrupted, choose the same file again to resume.`);
      });
      if (!/^https?:\/\//i.test(previousSource) && !/^[\w-]{1,80}$/.test(previousSource)) {
        throw new Error('The previous video could not be restored safely.');
      }
      mediaRevertState[elementKeyValue] = { type: 'video', value: previousSource };
      selectedElement.dataset.adminVideoEdited = 'true';
      selectedElement.dataset.adminVideoAsset = uploaded.playbackUrl;
      setVideoSource(selectedElement, uploaded.playbackUrl);
      markUploadedVideo(selectedElement);
      pendingVideos.set(elementKeyValue, uploaded);
      renderMediaControls();
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
      if (Object.keys(mediaRevertState).length) {
        next[mediaRevertKey] = { type: 'text', value: JSON.stringify(mediaRevertState) };
      } else {
        delete next[mediaRevertKey];
      }
      if (managedGalleryChanged) {
        next[managedGalleryKey] = { type: 'text', value: encodeManagedGallery(managedWorkItems) };
        next[hiddenWorkCardsKey] = { type: 'text', value: JSON.stringify(Array.from(hiddenWorkCardIds)) };
        next[workCategoriesKey] = { type: 'text', value: JSON.stringify(customWorkCategories) };
      }
      const saved = await saveSharedContent({ version: 1, entries: next });
      edits = validateEntries(saved.entries);
      managedWorkItems = edits[managedGalleryKey]
        ? decodeManagedGallery(edits[managedGalleryKey].value)
        : [];
      hiddenWorkCardIds = edits[hiddenWorkCardsKey]
        ? readHiddenWorkCardIds(edits[hiddenWorkCardsKey].value)
        : new Set();
      managedGalleryChanged = false;
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
  refreshWorkCategoryControls();
  syncWorkControls();
  renderMediaControls();
  setMode('text');
  // TODO: Re-enable authentication before production deployment
  // showEditor(false);
  loadSharedContent();
  if (location.hash === '#/admin') checkAuthentication();
  else showEditor(false);

  async function loadSharedContent() {
    try {
      const saved = await apiRequest('/api/content');
      edits = validateEntries(saved.entries);
      managedWorkItems = edits[managedGalleryKey]
        ? decodeManagedGallery(edits[managedGalleryKey].value)
        : [];
      hiddenWorkCardIds = edits[hiddenWorkCardsKey]
        ? readHiddenWorkCardIds(edits[hiddenWorkCardsKey].value)
        : new Set();
      applyEdits();
      renderMediaControls();
      const migrateButton = document.getElementById('admin-migrate-local');
      migrateButton.hidden = Object.keys(edits).length > 0 || !localStorage.getItem(storageKey);
      setStatus(Object.keys(edits).length
        ? 'Shared website content loaded. Choose a tool to edit it.'
        : 'Shared website content is ready to edit.');
    } catch (error) {
      console.error('Unable to load current shared website content; showing the published version.', error);
      setStatus(`Could not load shared website content: ${error.message}`, true);
    } finally {
      document.documentElement.classList.remove('shared-content-pending');
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
    // TODO: Re-enable authentication before production deployment
    showEditor(true);
    await loadSharedContent();
    return;

    /* --- Original authentication logic (disabled for development) ---
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
        setLoginStatus('Enter your authorized admin email address to receive a sign-in code.');
      }
    } catch (error) {
      setLoginStatus(`Could not connect to the server: ${error.message}`, true);
    }
    --- */
  }

  async function requestAdminCode() {
    if (!adminEmailInput.reportValidity()) return;
    setLoginStatus('Requesting a sign-in code…');
    try {
      const result = await apiRequest('/api/auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'request-code', email: adminEmailInput.value.trim() })
      });
      adminCodeEntry.hidden = false;
      adminCodeInput.focus();
      setLoginStatus(result.message);
    } catch (error) {
      setLoginStatus(error.message, true);
    }
  }

  document.getElementById('admin-request-code').addEventListener('click', requestAdminCode);
  document.getElementById('admin-resend-code').addEventListener('click', requestAdminCode);

  loginPanel.addEventListener('submit', async event => {
    event.preventDefault();
    if (adminCodeEntry.hidden) {
      await requestAdminCode();
      return;
    }
    if (!loginPanel.reportValidity()) return;
    setLoginStatus('Verifying your sign-in code…');
    try {
      await apiRequest('/api/auth', {
        method: 'POST',
        body: JSON.stringify({
          action: 'verify-code',
          email: adminEmailInput.value.trim(),
          code: adminCodeInput.value.trim()
        })
      });
      adminCodeInput.value = '';
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
      adminEmailInput.value = '';
      adminCodeInput.value = '';
      adminCodeEntry.hidden = true;
      setLoginStatus('You have signed out.');
      settingsPanel.hidden = true;
    } catch (error) {
      setStatus(`Could not sign out: ${error.message}`, true);
    }
  });

})();
