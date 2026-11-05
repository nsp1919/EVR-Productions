'use strict';
(() => {
  const storageKey = 'evr-site-content';
  const editor = document.getElementById('admin-editor');
  const pageSelect = document.getElementById('admin-preview-page');
  const workControls = document.getElementById('admin-work-controls');
  const workForm = document.getElementById('admin-work-controls');
  const workDialog = document.getElementById('admin-work-dialog');
  const positionDialog = document.getElementById('admin-position-dialog');
  const positionPreview = document.getElementById('admin-position-preview');
  const colorPicker = document.getElementById('admin-background-color');
  const photoPicker = document.getElementById('admin-photo-file');
  const logoPicker = document.getElementById('admin-logo-file');
  const logoReplaceButton = document.getElementById('admin-logo-replace');
  const logoDefaultButton = document.getElementById('admin-logo-default');
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
  const managedBrandGalleryKey = '#brand-work-gallery-items-v1';
  const hiddenBrandWorkCardsKey = '#brand-work-gallery-hidden-cards-v1';
  const brandWorkCategoriesKey = '#brand-work-gallery-categories-v1';
  const sharedBrandLogoKey = '#brand-logo-v2';
  const legacyBrandLogoKey = '#brand-logo-v1';
  const videoTestimonialsKey = '#video-testimonials-v1';
  const defaultBrandLogos = {
    light: '/assets/evr-productions-logo-light.png',
    dark: '/assets/evr-productions-logo-dark.png'
  };
  const phoneGalleryPositionPrefix = '#phone-gallery-image-position-v1:';
  const mediaRevertKey = '#media-revert-state-v1';
  const defaultWorkCategories = [
    { slug: 'wedding', label: 'Wedding day' },
    { slug: 'prewedding', label: 'Pre-wedding' },
    { slug: 'celebration', label: 'Celebrations' },
    { slug: 'birthday', label: 'Birthdays' },
    { slug: 'maternity', label: 'Maternity' },
    { slug: 'half-saree', label: 'Half Saree' },
    { slug: 'engagement', label: 'Engagement parties' },
    { slug: 'other-functions', label: 'Other events' }
  ];
  const defaultBrandWorkCategories = [
    { slug: 'event', label: 'Events' },
    { slug: 'healthcare', label: 'Healthcare' }
  ];
  let mode = 'text';
  let selectedElement = null;
  let edits = {};
  let managedWorkItems = [];
  let hiddenWorkCardIds = new Set();
  let customWorkCategories = [];
  let managedBrandWorkItems = [];
  let hiddenBrandWorkCardIds = new Set();
  let customBrandWorkCategories = [];
  let videoTestimonials = { version: 1, enabled: false, items: [] };
  let videoTestimonialsChanged = false;
  let activeWorkContext = 'work';
  let activePositionImage = null;
  let mediaRevertState = {};
  let managedGalleryChanged = false;
  const managedGalleryChanges = new Set();
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
    delete video.dataset.coverFallbackApplied;
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
      if (disclaimer) disclaimer.textContent = 'EVR VIDEO / PROJECT WORK';
      video.setAttribute('aria-label', 'EVR-produced project video');
      const play = preview.querySelector('.preview-play');
      if (play) {
        play.setAttribute('aria-label', 'Play EVR-produced project video');
        play.hidden = !preview.closest('#work');
      }
    }

    const reel = video.closest('.corp-reel-card');
    if (reel) {
      reel.classList.add('has-project-video');
      const title = reel.querySelector(':scope > span:last-child')?.textContent.trim() || 'EVR Brand Studio';
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
    renderManagedWorkItems('brand-work');
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

  function videoCoverKey(video) {
    return `${elementKey(video)}::cover`;
  }

  function applyVideoCover(video, source) {
    video.poster = source;
    const cover = video.closest('.preview-media')?.querySelector(':scope > img');
    if (cover && source) {
      cover.src = source;
      cover.hidden = false;
    }
  }

  function phoneGalleryPositionKey(image) {
    return `${phoneGalleryPositionPrefix}${elementKey(image)}`;
  }

  function parsePhoneGalleryPosition(value) {
    let position;
    try {
      position = JSON.parse(value);
    } catch (error) {
      throw new Error(`The saved phone-gallery image position is invalid: ${error.message}`);
    }
    if (!position || typeof position !== 'object' || Array.isArray(position) ||
        !Number.isInteger(position.x) || position.x < 0 || position.x > 100 ||
        !Number.isInteger(position.y) || position.y < 0 || position.y > 100) {
      throw new Error('The saved phone-gallery image position must use whole-number percentages from 0 to 100.');
    }
    return { x: position.x, y: position.y };
  }

  function currentPhoneGalleryPosition(image) {
    const edited = image.dataset.adminObjectPosition;
    if (edited) {
      const [x, y] = edited.split(',').map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) return { x, y };
    }
    const percentages = getComputedStyle(image).objectPosition.match(/\d+(?:\.\d+)?%/g) || [];
    return {
      x: percentages[0] ? Math.round(parseFloat(percentages[0])) : 50,
      y: percentages[1] ? Math.round(parseFloat(percentages[1])) : 50
    };
  }

  function setPhoneGalleryPosition(image, position) {
    image.style.objectPosition = `${position.x}% ${position.y}%`;
    image.dataset.adminObjectPosition = `${position.x},${position.y}`;
    image.dataset.adminPositionEdited = 'true';
    if (activePositionImage === image) positionPreview.style.objectPosition = image.style.objectPosition;
  }

  function movePhoneGalleryImage(image, direction) {
    const position = currentPhoneGalleryPosition(image);
    const step = 10;
    if (direction === 'left') position.x = Math.min(100, position.x + step);
    else if (direction === 'right') position.x = Math.max(0, position.x - step);
    else if (direction === 'up') position.y = Math.min(100, position.y + step);
    else if (direction === 'down') position.y = Math.max(0, position.y - step);
    setPhoneGalleryPosition(image, position);
    setStatus('Photo position adjusted. Choose Save changes to publish it to the shared website.');
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

  async function validateTransparentPng(file) {
    if (file.type !== 'image/png' || file.size > 30 * 1024 * 1024) {
      throw new Error('Choose a transparent PNG file up to 30 MB.');
    }
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngSignature.every((byte, index) => signature[index] === byte)) {
      throw new Error('The selected file is not a valid PNG.');
    }
    const decoded = await decodeImageFile(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The browser could not inspect the logo transparency.');
      context.drawImage(decoded.source, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] < 255) return;
      }
      throw new Error('The PNG must contain transparent pixels.');
    } finally {
      decoded.close();
    }
  }

  function parseBrandLogoSet(value) {
    let logoSet;
    try {
      logoSet = JSON.parse(value);
    } catch (error) {
      throw new Error(`The shared logo set is invalid: ${error.message}`);
    }
    if (!logoSet || typeof logoSet !== 'object' || Array.isArray(logoSet) ||
        !safeImageSource(logoSet.light) || !safeImageSource(logoSet.dark)) {
      throw new Error('The shared logo set must contain valid light- and dark-background images.');
    }
    return { light: logoSet.light, dark: logoSet.dark };
  }

  async function uploadSharedBrandLogo(file) {
    const decoded = await decodeImageFile(file);
    let variants;
    try {
      const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = width;
      sourceCanvas.height = height;
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
      if (!sourceContext) throw new Error('The browser could not prepare the logo image.');
      sourceContext.drawImage(decoded.source, 0, 0, width, height);
      const sourcePixels = sourceContext.getImageData(0, 0, width, height);
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;
      for (let index = 3; index < sourcePixels.data.length; index += 4) {
        const alpha = sourcePixels.data[index];
        sourcePixels.data[index] = alpha < 65 ? 0 : Math.min(255, Math.round((alpha - 65) * 255 / 175));
        if (sourcePixels.data[index] > 8) {
          const pixel = index / 4;
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      if (right < left || bottom < top) throw new Error('The transparent PNG contains no visible logo artwork.');
      const padX = Math.round((right - left + 1) * 0.025);
      const padY = Math.round((bottom - top + 1) * 0.035);
      const crop = {
        left: Math.max(0, left - padX),
        top: Math.max(0, top - padY),
        right: Math.min(width, right + padX + 1),
        bottom: Math.min(height, bottom + padY + 1)
      };
      const cropWidth = crop.right - crop.left;
      const cropHeight = crop.bottom - crop.top;
      const makeCanvas = (darkBackground) => {
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('The browser could not prepare both logo variants.');
        const pixels = context.createImageData(width, height);
        pixels.data.set(sourcePixels.data);
        if (darkBackground) {
          for (let index = 0; index < pixels.data.length; index += 4) {
            if (pixels.data[index + 3] === 0) continue;
            const red = pixels.data[index];
            const green = pixels.data[index + 1];
            const blue = pixels.data[index + 2];
            const isGold = red >= 105 && green >= 55 &&
              red > green * 1.13 && green > blue * 1.18;
            if (!isGold) {
              pixels.data[index] = 255;
              pixels.data[index + 1] = 250;
              pixels.data[index + 2] = 239;
            }
          }
        }
        context.putImageData(pixels, -crop.left, -crop.top);
        return canvas;
      };
      variants = {
        light: makeCanvas(false),
        dark: makeCanvas(true)
      };
    } finally {
      decoded.close();
    }
    const toWebp = canvas => new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode a logo variant.'));
      }, 'image/webp', 0.92);
    });
    const [lightBlob, darkBlob] = await Promise.all([
      toWebp(variants.light),
      toWebp(variants.dark)
    ]);
    const [light, dark] = await Promise.all([
      uploadMedia(lightBlob, 'image/webp'),
      uploadMedia(darkBlob, 'image/webp')
    ]);
    return { light, dark };
  }

  function encodeManagedGallery(items) {
    const bytes = new TextEncoder().encode(JSON.stringify(items));
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function defaultCategoriesFor(context) {
    return context === 'brand-work' ? defaultBrandWorkCategories : defaultWorkCategories;
  }

  function customCategoriesFor(context) {
    return context === 'brand-work' ? customBrandWorkCategories : customWorkCategories;
  }

  function setCustomCategoriesFor(context, categories) {
    if (context === 'brand-work') customBrandWorkCategories = categories;
    else customWorkCategories = categories;
  }

  function workItemsFor(context) {
    return context === 'brand-work' ? managedBrandWorkItems : managedWorkItems;
  }

  function setWorkItemsFor(context, items) {
    if (context === 'brand-work') managedBrandWorkItems = items;
    else managedWorkItems = items;
  }

  function markManagedGalleryChanged(context = activeWorkContext) {
    managedGalleryChanged = true;
    managedGalleryChanges.add(context);
    managedGalleryChanges.add(context);
  }

  function hiddenCardIdsFor(context) {
    return context === 'brand-work' ? hiddenBrandWorkCardIds : hiddenWorkCardIds;
  }

  function setHiddenCardIdsFor(context, ids) {
    if (context === 'brand-work') hiddenBrandWorkCardIds = ids;
    else hiddenWorkCardIds = ids;
  }

  function readCustomWorkCategories(value, context = 'work') {
    const defaults = defaultCategoriesFor(context);
    let categories;
    try {
      categories = JSON.parse(value);
    } catch (error) {
      throw new Error(`The saved Work categories are invalid: ${error.message}`);
    }
    if (!Array.isArray(categories) || categories.length > 50) {
      throw new Error('The saved Work categories list is invalid.');
    }
    const usedSlugs = new Set(defaults.map(category => category.slug));
    const usedLabels = new Set(defaults.map(category => category.label.toLowerCase()));
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

  function availableWorkCategories(context = 'work') {
    return [...defaultCategoriesFor(context), ...customCategoriesFor(context)];
  }

  function refreshWorkCategoryControls(context = activeWorkContext) {
    const categorySelect = document.getElementById('admin-work-category');
    const filterBar = document.querySelector(`#${context} .filters`);
    const categories = availableWorkCategories(context);
    if (categorySelect) {
      const selectedCategory = categorySelect.value;
      categorySelect.replaceChildren(...categories.map(category => {
        const option = document.createElement('option');
        option.value = category.slug;
        option.textContent = category.label;
        return option;
      }));
      if (categories.some(category => category.slug === selectedCategory)) {
        categorySelect.value = selectedCategory;
      }
    }
    if (filterBar) {
      const activeFilter = filterBar.querySelector('[data-filter].active')?.dataset.filter || 'all';
      filterBar.querySelectorAll('[data-filter]:not([data-filter="all"])').forEach(button => button.remove());
      categories.forEach(category => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filter = category.slug;
        button.setAttribute('aria-pressed', String(activeFilter === category.slug));
        button.classList.toggle('active', activeFilter === category.slug);
        button.textContent = category.label;
        filterBar.append(button);
      });
      if (!categories.some(category => category.slug === activeFilter) && activeFilter !== 'all') {
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
        : media?.type === 'video-cover'
          ? media.value === '' || safeImageSource(media.value)
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

  function decodeVideoTestimonials(value) {
    let data;
    try {
      data = JSON.parse(value);
    } catch (error) {
      throw new Error(`The saved video testimonials are invalid: ${error.message}`);
    }
    if (!data || data.version !== 1 || typeof data.enabled !== 'boolean' ||
        !Array.isArray(data.items) || data.items.length > 10) {
      throw new Error('The saved video testimonials have an unsupported format.');
    }
    const ids = new Set();
    const items = data.items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(item.id) || ids.has(item.id) ||
          typeof item.clientName !== 'string' || !item.clientName.trim() || item.clientName.length > 100 ||
          typeof item.caption !== 'string' || item.caption.length > 240 ||
          !isSecureMediaUrl(item.videoUrl)) {
        throw new Error('A saved video testimonial is incomplete or invalid.');
      }
      ids.add(item.id);
      return {
        id: item.id,
        clientName: item.clientName.trim(),
        caption: item.caption.trim(),
        videoUrl: item.videoUrl
      };
    });
    return { version: 1, enabled: data.enabled, items };
  }

  function renderVideoTestimonials() {
    const section = document.getElementById('video-testimonials');
    const grid = document.getElementById('video-testimonial-grid');
    if (!section || !grid) return;
    grid.replaceChildren();
    for (const item of videoTestimonials.items) {
      const card = document.createElement('article');
      card.className = 'video-testimonial-card';
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'none';
      video.src = item.videoUrl;
      video.setAttribute('aria-label', `Client testimonial video: ${item.clientName}`);
      const client = document.createElement('h3');
      client.textContent = item.clientName;
      card.append(video, client);
      if (item.caption) {
        const caption = document.createElement('p');
        caption.textContent = item.caption;
        card.append(caption);
      }
      grid.append(card);
    }
    section.hidden = !videoTestimonials.enabled || videoTestimonials.items.length === 0;
  }

  function renderAdminVideoTestimonials() {
    const enabled = document.getElementById('admin-testimonials-enabled');
    const list = document.getElementById('admin-testimonial-list');
    if (!enabled || !list) return;
    enabled.checked = videoTestimonials.enabled;
    list.replaceChildren();
    if (!videoTestimonials.items.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-testimonial-empty';
      empty.textContent = 'No video testimonials yet. Add one whenever you are ready.';
      list.append(empty);
      return;
    }

    for (const item of videoTestimonials.items) {
      const row = document.createElement('div');
      row.className = 'admin-testimonial-item';
      const details = document.createElement('div');
      const client = document.createElement('strong');
      client.textContent = item.clientName;
      details.append(client);
      if (item.caption) {
        const caption = document.createElement('small');
        caption.textContent = item.caption;
        details.append(caption);
      }
      const replace = document.createElement('button');
      replace.type = 'button';
      replace.className = 'admin-tool';
      replace.textContent = 'Replace video';
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'video/*';
      picker.hidden = true;
      replace.addEventListener('click', () => picker.click());
      picker.addEventListener('change', async () => {
        const file = picker.files && picker.files[0];
        if (!file) return;
        if (!file.type.startsWith('video/') || file.size > 1024 * 1024 * 1024) {
          setStatus('Choose a supported video file up to 1 GB.', true);
          picker.value = '';
          return;
        }
        try {
          await validateVideoContainer(file);
          setStatus(`Preparing secure Cloudflare R2 upload for ${file.name}…`);
          const uploaded = await uploadR2Video(file, (loaded, total) => {
            const percent = total ? Math.floor(loaded / total * 100) : 0;
            setStatus(`Uploading testimonial to Cloudflare R2: ${percent}% (${(loaded / (1024 * 1024)).toFixed(0)} / ${(total / (1024 * 1024)).toFixed(0)} MB).`);
          });
          if (!isSecureMediaUrl(uploaded.playbackUrl)) {
            throw new Error('The video uploader did not return a secure playback URL.');
          }
          const currentItem = videoTestimonials.items.find(candidate => candidate.id === item.id);
          if (!currentItem) throw new Error('This testimonial was removed before its replacement finished uploading.');
          currentItem.videoUrl = uploaded.playbackUrl;
          videoTestimonialsChanged = true;
          renderVideoTestimonials();
          renderAdminVideoTestimonials();
          setStatus('Testimonial video replaced. Choose Save changes to publish it.');
        } catch (error) {
          setStatus(`Could not replace the testimonial video: ${error.message}`, true);
        } finally {
          picker.value = '';
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'admin-tool';
      remove.textContent = 'Delete video';
      remove.addEventListener('click', () => {
        if (!window.confirm(`Remove the testimonial video for ${item.clientName} from the website?`)) return;
        videoTestimonials.items = videoTestimonials.items.filter(candidate => candidate.id !== item.id);
        videoTestimonialsChanged = true;
        renderVideoTestimonials();
        renderAdminVideoTestimonials();
        setStatus('Testimonial video removed. Choose Save changes to publish the update.');
      });
      row.append(details, replace, remove, picker);
      list.append(row);
    }
  }

  document.getElementById('admin-testimonials-enabled').addEventListener('change', event => {
    videoTestimonials.enabled = event.currentTarget.checked;
    videoTestimonialsChanged = true;
    renderVideoTestimonials();
    setStatus(videoTestimonials.enabled
      ? 'Video testimonial section enabled. Choose Save changes to publish it.'
      : 'Video testimonial section hidden. Choose Save changes to publish it.');
  });

  document.getElementById('admin-testimonial-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const clientInput = document.getElementById('admin-testimonial-client');
    const captionInput = document.getElementById('admin-testimonial-caption');
    const videoInput = document.getElementById('admin-testimonial-video');
    const file = videoInput.files && videoInput.files[0];
    if (!file || !clientInput.value.trim()) return;
    if (videoTestimonials.items.length >= 10) {
      setStatus('You can add up to 10 video testimonials.', true);
      return;
    }
    if (!file.type.startsWith('video/') || file.size > 1024 * 1024 * 1024) {
      setStatus('Choose a supported video file up to 1 GB.', true);
      videoInput.value = '';
      return;
    }
    try {
      await validateVideoContainer(file);
      setStatus(`Preparing secure Cloudflare R2 upload for ${file.name}…`);
      const uploaded = await uploadR2Video(file, (loaded, total) => {
        const percent = total ? Math.floor(loaded / total * 100) : 0;
        setStatus(`Uploading testimonial to Cloudflare R2: ${percent}% (${(loaded / (1024 * 1024)).toFixed(0)} / ${(total / (1024 * 1024)).toFixed(0)} MB).`);
      });
      if (!isSecureMediaUrl(uploaded.playbackUrl)) {
        throw new Error('The video uploader did not return a secure playback URL.');
      }
      videoTestimonials.items.push({
        id: crypto.randomUUID(),
        clientName: clientInput.value.trim(),
        caption: captionInput.value.trim(),
        videoUrl: uploaded.playbackUrl
      });
      videoTestimonialsChanged = true;
      form.reset();
      renderVideoTestimonials();
      renderAdminVideoTestimonials();
      setStatus('Testimonial video uploaded. Choose Save changes to publish it.');
    } catch (error) {
      setStatus(`Could not add the testimonial video: ${error.message}`, true);
    } finally {
      videoInput.value = '';
    }
  });

  function categoryLabel(category, context = 'work') {
    const definition = availableWorkCategories(context).find(item => item.slug === category);
    return (definition?.label || category).toUpperCase();
  }

  function workCardId(article, context = 'work') {
    const media = article.querySelector('.preview-media[data-r2-slot], .preview-media[data-portfolio-slot]');
    const slot = media?.dataset.r2Slot || media?.dataset.portfolioSlot;
    return slot ? (context === 'brand-work' ? `portfolio:brand-work:${slot}` : `portfolio:${slot}`) : '';
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

  function removeHiddenWorkCards(context) {
    document.querySelectorAll(`#${context} .story-library > article:not(.admin-managed-work-item)`).forEach(article => {
      const id = workCardId(article, context);
      if (id && hiddenCardIdsFor(context).has(id)) article.hidden = true;
    });
  }

  function createAddWorkCard(context) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'admin-add-work-card';
    card.innerHTML = '<span class="admin-add-work-symbol" aria-hidden="true">+</span><span>Add a story</span><small>PHOTO · VIDEO · CATEGORY</small>';
    card.addEventListener('click', () => {
      activeWorkContext = context;
      refreshWorkCategoryControls(context);
      const allStories = document.querySelector(`#${context} [data-filter="all"]`);
      if (allStories && !allStories.classList.contains('active')) allStories.click();
      workForm.reset();
      syncWorkMediaChoice();
      document.getElementById('admin-work-dialog-title').textContent =
        context === 'brand-work' ? 'Add an EVR Brand Studio story.' : 'Add a story.';
      document.querySelector('#admin-work-dialog .eyebrow').textContent =
        context === 'brand-work' ? 'EVR BRAND STUDIO / NEW STORY' : 'SELECTED WORK / NEW STORY';
      document.querySelector('#admin-work-title').placeholder =
        context === 'brand-work' ? 'Give this EVR Brand Studio story a title' : 'Give this story a title';
      document.querySelector('#admin-work-description').placeholder =
        context === 'brand-work' ? 'Describe this brand project or piece of work' : 'What makes this celebration special?';
      document.getElementById('admin-work-dialog-status').textContent = '';
      workDialog.showModal();
      workForm.querySelector('input[name="admin-work-media-type"]').focus({ preventScroll: true });
    });
    return card;
  }

  function createManagedWorkActions(item, context = 'work') {
    const actions = document.createElement('div');
    actions.className = 'admin-card-actions';
    actions.setAttribute('aria-label', `Manage ${item.title}`);

    const coverLabel = item.videoUrl
      ? item.imageUrl ? 'Replace cover' : 'Add cover'
      : item.imageUrl ? 'Replace photo' : 'Add photo';
    const replaceImage = createMediaIconButton(
      coverLabel,
      'image',
      () => imagePicker.click(),
      `Replace ${item.videoUrl ? 'video cover' : 'photo'} · JPG/PNG/WebP/GIF · max 30 MB · 1600px recommended · optimized to WebP`
    );
    const imagePicker = document.createElement('input');
    imagePicker.type = 'file';
    imagePicker.accept = 'image/*';
    imagePicker.hidden = true;
    imagePicker.addEventListener('change', async () => {
      const file = imagePicker.files && imagePicker.files[0];
      if (!file) return;
      try {
        setStatus(`Preparing a new ${item.videoUrl ? 'cover' : 'photo'} for ${item.title}…`);
        const imageUrl = await uploadPhotoFile(file);
        const currentItem = workItemsFor(context).find(candidate => candidate.id === item.id);
        if (!currentItem) throw new Error('This story was removed before its cover upload finished.');
        if (currentItem.imageUrl) currentItem.imageRevertUrl = currentItem.imageUrl;
        currentItem.imageUrl = imageUrl;
        markManagedGalleryChanged(context);
        renderManagedWorkItems(context);
        setStatus(`${item.videoUrl ? 'Video cover' : 'Photo'} replaced. Choose Save changes to publish it to the shared website.`);
      } catch (error) {
        setStatus(`Could not replace the story media: ${error.message}`, true);
      } finally {
        imagePicker.value = '';
      }
    });

    if (item.imageRevertUrl) {
      actions.append(createMediaIconButton(item.videoUrl ? 'Revert cover' : 'Revert photo', 'undo', () => {
        const currentItem = workItemsFor(context).find(candidate => candidate.id === item.id);
        if (!currentItem?.imageRevertUrl) return;
        currentItem.imageUrl = currentItem.imageRevertUrl;
        delete currentItem.imageRevertUrl;
        markManagedGalleryChanged(context);
        renderManagedWorkItems(context);
        renderMediaControls();
        setStatus(`Previous ${item.videoUrl ? 'cover' : 'photo'} restored. Choose Save changes to publish the update.`);
      }, `Restore the previous ${item.videoUrl ? 'cover' : 'photo'}`));
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
        const currentItem = workItemsFor(context).find(candidate => candidate.id === item.id);
        if (!currentItem) throw new Error('This story was removed before its video upload finished.');
        if (currentItem.videoUrl) currentItem.videoRevertUrl = currentItem.videoUrl;
        currentItem.videoUrl = uploaded.playbackUrl;
        markManagedGalleryChanged(context);
        renderManagedWorkItems(context);
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
        const currentItem = workItemsFor(context).find(candidate => candidate.id === item.id);
        if (!currentItem?.videoRevertUrl) return;
        currentItem.videoUrl = currentItem.videoRevertUrl;
        delete currentItem.videoRevertUrl;
        markManagedGalleryChanged(context);
        renderManagedWorkItems(context);
        renderMediaControls();
        setStatus('Previous video restored. Choose Save changes to publish the update.');
      }, 'Restore the previous video'));
    }

    if (item.videoUrl && item.imageUrl) {
      const removeVideo = createMediaIconButton('Remove video', 'delete', () => {
        const currentItem = workItemsFor(context).find(candidate => candidate.id === item.id);
        if (!currentItem) return;
        currentItem.videoUrl = '';
        markManagedGalleryChanged(context);
        renderManagedWorkItems(context);
        renderMediaControls();
        setStatus('Video removed from this story. Choose Save changes to publish the update.');
      }, 'Remove this video from the story');
      actions.append(removeVideo);
    }

    const deleteStory = createMediaIconButton('Delete story', 'delete', () => {
      if (!window.confirm(`Remove "${item.title}" from the Work page?`)) return;
      setWorkItemsFor(context, workItemsFor(context).filter(candidate => candidate.id !== item.id));
      markManagedGalleryChanged(context);
      renderManagedWorkItems(context);
      renderMediaControls();
      setStatus(`Story removed from ${context === 'brand-work' ? 'EVR Brand Studio work' : 'Work'}. Choose Save changes to publish the update.`);
    }, 'Remove this story from the Work page', 'admin-card-delete');
    actions.append(deleteStory);
    return actions;
  }

  function createManagedWorkCard(item, context = 'work') {
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
    video.muted = true;
    video.dataset.viewportAutoplay = 'true';
    if (item.imageUrl) video.poster = item.imageUrl;
    video.setAttribute('aria-label', `Watch ${item.title}`);
    if (item.videoUrl) {
      video.src = item.videoUrl;
      video.dataset.adminVideoAsset = item.videoUrl;
    }
    media.append(video);

    const label = document.createElement('small');
    label.textContent = categoryLabel(item.category, context);
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.description;
    article.append(createManagedWorkActions(item, context), media, label, title, description);
    return article;
  }

  function renderManagedWorkItems(context = 'work') {
    const gallery = document.querySelector(`#${context} .story-library`);
    if (!gallery) return;
    const activeFilter = document.querySelector(`#${context} [data-filter].active`)?.dataset.filter || 'all';
    gallery.querySelector('.admin-add-work-card')?.remove();
    gallery.querySelectorAll('.admin-managed-work-item').forEach(item => item.remove());
    removeHiddenWorkCards(context);
    workItemsFor(context).forEach(item => {
      const card = createManagedWorkCard(item, context);
      card.hidden = activeFilter !== 'all' && item.category !== activeFilter;
      gallery.append(card);
    });
    if (location.hash === '#/admin' && window.adminAuthenticated === true && pageSelect.value === context) {
      gallery.append(createAddWorkCard(context));
    }
  }

  function syncWorkControls() {
    activeWorkContext = pageSelect.value === 'brand-work' ? 'brand-work' : 'work';
    refreshWorkCategoryControls(activeWorkContext);
    if (!['work', 'brand-work'].includes(pageSelect.value) && workDialog.open) workDialog.close();
  }

  function syncWorkMediaChoice() {
    const selectedType = workForm.querySelector('input[name="admin-work-media-type"]:checked')?.value;
    const imageUpload = document.getElementById('admin-work-image-upload');
    const videoUpload = document.getElementById('admin-work-video-upload');
    const coverUpload = document.getElementById('admin-work-cover-upload');
    const imageInput = document.getElementById('admin-work-image');
    const videoInput = document.getElementById('admin-work-video');
    const coverInput = document.getElementById('admin-work-cover');
    imageUpload.hidden = selectedType !== 'image';
    videoUpload.hidden = selectedType !== 'video';
    coverUpload.hidden = selectedType !== 'video';
    imageInput.required = selectedType === 'image';
    videoInput.required = selectedType === 'video';
    if (selectedType !== 'image') imageInput.value = '';
    if (selectedType !== 'video') videoInput.value = '';
    if (selectedType !== 'video') coverInput.value = '';
  }

  function validateEntries(entries) {
    const checked = {};
    mediaRevertState = {};
    const siteCreditKeys = new Set(Array.from(
      document.querySelectorAll('.site-credit, .site-credit *'),
      elementKey
    ));
    const categoryEntry = entries[workCategoriesKey];
    const brandCategoryEntry = entries[brandWorkCategoriesKey];
    for (const [label, entry] of [['Work', categoryEntry], ['EVR Brand Studio work', brandCategoryEntry]]) {
      if (entry && (entry.type !== 'text' || typeof entry.value !== 'string')) {
        throw new Error(`The saved ${label} categories have an unsupported format.`);
      }
    }
    const validatedCategories = categoryEntry ? readCustomWorkCategories(categoryEntry.value) : [];
    const validatedBrandCategories = brandCategoryEntry
      ? readCustomWorkCategories(brandCategoryEntry.value, 'brand-work')
      : [];
    const categorySlugs = new Set([
      ...defaultWorkCategories.map(category => category.slug),
      ...validatedCategories.map(category => category.slug)
    ]);
    const brandCategorySlugs = new Set([
      ...defaultBrandWorkCategories.map(category => category.slug),
      ...validatedBrandCategories.map(category => category.slug)
    ]);
    const phoneGalleryPositionKeys = new Set(Array.from(
      document.querySelectorAll('#home [data-phone-screen="4"] .phone-gallery img'),
      phoneGalleryPositionKey
    ));
    for (const [key, entry] of Object.entries(entries)) {
      if (siteCreditKeys.has(key)) continue;
      if (!entry || typeof entry.value !== 'string') throw new Error('An edit entry is incomplete.');
      if (key.startsWith(phoneGalleryPositionPrefix)) {
        if (!phoneGalleryPositionKeys.has(key) || entry.type !== 'text') {
          throw new Error('A saved phone-gallery image position has an unsupported format.');
        }
        checked[key] = { type: 'text', value: JSON.stringify(parsePhoneGalleryPosition(entry.value)) };
      }
      else if (key === managedGalleryKey) {
        if (entry.type !== 'text') throw new Error('The saved Work gallery has an unsupported format.');
        checked[key] = { type: 'text', value: encodeManagedGallery(decodeManagedGallery(entry.value, categorySlugs)) };
      }
      else if (key === managedBrandGalleryKey) {
        if (entry.type !== 'text') throw new Error('The saved EVR Brand Studio work gallery has an unsupported format.');
        checked[key] = { type: 'text', value: encodeManagedGallery(decodeManagedGallery(entry.value, brandCategorySlugs)) };
      }
      else if (key === hiddenWorkCardsKey) {
        if (entry.type !== 'text') throw new Error('The hidden Work cards have an unsupported format.');
        checked[key] = { type: 'text', value: JSON.stringify(Array.from(readHiddenWorkCardIds(entry.value))) };
      }
      else if (key === hiddenBrandWorkCardsKey) {
        if (entry.type !== 'text') throw new Error('The hidden EVR Brand Studio work cards have an unsupported format.');
        checked[key] = { type: 'text', value: JSON.stringify(Array.from(readHiddenWorkCardIds(entry.value))) };
      }
      else if (key === workCategoriesKey) {
        checked[key] = { type: 'text', value: JSON.stringify(validatedCategories) };
      }
      else if (key === brandWorkCategoriesKey) {
        checked[key] = { type: 'text', value: JSON.stringify(validatedBrandCategories) };
      }
      else if (key === mediaRevertKey) {
        if (entry.type !== 'text') throw new Error('The saved media revert state has an unsupported format.');
        mediaRevertState = readMediaRevertState(entry.value);
        checked[key] = { type: 'text', value: JSON.stringify(mediaRevertState) };
      }
      else if (key === sharedBrandLogoKey) {
        if (entry.type !== 'text') {
          throw new Error('The shared logo set has an unsupported format.');
        }
        checked[key] = { type: 'text', value: JSON.stringify(parseBrandLogoSet(entry.value)) };
      }
      else if (key === videoTestimonialsKey) {
        if (entry.type !== 'text') throw new Error('The saved video testimonials have an unsupported format.');
        videoTestimonials = decodeVideoTestimonials(entry.value);
        checked[key] = { type: 'text', value: JSON.stringify(videoTestimonials) };
      }
      else if (entry.type === 'text') checked[key] = { type: 'text', value: safeMarkup(entry.value) };
      else if (entry.type === 'image' && safeImageSource(entry.value)) checked[key] = { type: 'image', value: entry.value };
      else if (entry.type === 'video-cover' && safeImageSource(entry.value)) checked[key] = { type: 'video-cover', value: entry.value };
      else if (entry.type === 'video' && (/^https?:\/\//i.test(entry.value) || /^[\w-]{1,80}$/.test(entry.value))) checked[key] = { type: 'video', value: entry.value };
      else if (entry.type === 'background' && CSS.supports('color', entry.value)) checked[key] = { type: 'background', value: entry.value };
      else throw new Error('An edit entry contains an unsupported value.');
    }
    customWorkCategories = validatedCategories;
    customBrandWorkCategories = validatedBrandCategories;
    refreshWorkCategoryControls('work');
    refreshWorkCategoryControls('brand-work');
    return checked;
  }

  function applyEdits() {
    renderManagedWorkItems();
    renderManagedWorkItems('brand-work');
    if (!videoTestimonialsChanged) {
      videoTestimonials = edits[videoTestimonialsKey]
        ? decodeVideoTestimonials(edits[videoTestimonialsKey].value)
        : { version: 1, enabled: false, items: [] };
    }
    renderVideoTestimonials();
    renderAdminVideoTestimonials();
    const legacyLogo = edits[legacyBrandLogoKey]?.value;
    const logoSet = edits[sharedBrandLogoKey]
      ? parseBrandLogoSet(edits[sharedBrandLogoKey].value)
      : legacyLogo
        ? { ...defaultBrandLogos, light: legacyLogo }
        : defaultBrandLogos;
    window.applyEvrBrandLogo(logoSet);
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
    document.querySelectorAll('video').forEach(video => {
      const cover = edits[videoCoverKey(video)];
      if (cover?.type === 'video-cover') applyVideoCover(video, cover.value);
    });
    const legacyWeddingMenuLabels = new Map([
      ['Weddings & Events', 'Wedding Services'],
      ['Our work', 'Wedding Stories']
    ]);
    document.querySelectorAll('#main-nav [data-nav-experience="home"] a').forEach(link => {
      const currentLabel = link.textContent.trim();
      const replacement = legacyWeddingMenuLabels.get(currentLabel);
      if (!replacement) return;
      link.textContent = replacement;
      const edit = edits[elementKey(link)];
      if (edit?.type === 'text') edit.value = replacement;
    });
    document.querySelectorAll('#home [data-phone-screen="4"] .phone-gallery img').forEach(image => {
      const position = edits[phoneGalleryPositionKey(image)];
      if (position) {
        const { x, y } = parsePhoneGalleryPosition(position.value);
        image.style.objectPosition = `${x}% ${y}%`;
      }
    });
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
    if (element.matches('.phone-gallery img')) return element;
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
      undo: '<path d="M3 7v6h6M4 13a8 8 0 1 0 2-5.3L3 10"/>',
      position: '<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4M8 8h8v8H8z"/>',
      left: '<path d="M19 12H5m7 7-7-7 7-7"/>',
      right: '<path d="M5 12h14m-7-7 7 7-7 7"/>',
      up: '<path d="M12 19V5m-7 7 7-7 7 7"/>',
      down: '<path d="M12 5v14m-7-7 7 7 7-7"/>'
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
      if (element.closest('#admin-editor') || element.matches('[data-brand-logo]') ||
          element.parentElement?.closest('[hidden]')) return;
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
        if (image.matches('.phone-gallery img')) {
          panel.dataset.galleryImageControls = 'true';
          panel.setAttribute('aria-label', 'Replace or reposition this wedding photo');
          panel.append(createMediaIconButton(
            'Reposition photo',
            'position',
            () => {
              activePositionImage = image;
              positionPreview.src = image.currentSrc || image.src;
              positionPreview.style.objectPosition = image.style.objectPosition || getComputedStyle(image).objectPosition;
              positionDialog.showModal();
            },
            'Adjust this photo’s framing'
          ));
        }
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
        if (video) {
          panel.append(createMediaIconButton(
            'Replace cover',
            'image',
            () => selectVideoCover(video),
            `Replace video cover · ${recommendedImageSize(root)} · JPG/PNG/WebP/GIF · max 30 MB · optimized to WebP`
          ));
          if (mediaRevertState[videoCoverKey(video)]) {
            panel.append(createMediaIconButton(
              'Revert cover',
              'undo',
              () => revokeMediaReplacement(video, 'video-cover'),
              'Restore the previous video cover'
            ));
          }
        }
        if (video && mediaRevertState[elementKey(video)]) {
          panel.append(createMediaIconButton(
            'Revert video',
            'undo',
            () => revokeMediaReplacement(video),
            'Restore the previous video'
          ));
        }
      }

      if (preview.id === 'work' || preview.id === 'brand-work') {
        const context = preview.id;
        const card = root.closest(`#${context} .story-library > article:not(.admin-managed-work-item)`);
        const id = card && workCardId(card, context);
        if (card && id) {
          panel.append(createMediaIconButton('Delete story', 'delete', () => {
            const label = context === 'brand-work' ? 'EVR Brand Studio work' : 'Work';
            if (!window.confirm(`Remove this story from the ${label} page?`)) return;
            hiddenCardIdsFor(context).add(id);
            card.hidden = true;
            markManagedGalleryChanged(activeWorkContext);
            renderMediaControls();
            setStatus(`Story removed from ${label}. Choose Save changes to publish the update.`);
          }, `Remove this story from the ${context === 'brand-work' ? 'EVR Brand Studio work' : 'Work'} page`, 'admin-card-delete'));
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
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('#process-story [data-process-step]')) {
      requestAnimationFrame(renderMediaControls);
    }
  });
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

  function selectVideoCover(video) {
    selectElement(video);
    photoPicker.click();
  }

  function revokeMediaReplacement(element, type = element instanceof HTMLVideoElement ? 'video' : 'image') {
    const key = type === 'video-cover' ? videoCoverKey(element) : elementKey(element);
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
    } else if (previous.type === 'video-cover' && element instanceof HTMLVideoElement) {
      applyVideoCover(element, previous.value);
      delete element.dataset.adminVideoCoverEdited;
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
  positionDialog.querySelectorAll('[data-position-direction]').forEach(button => {
    button.addEventListener('click', () => {
      if (activePositionImage) movePhoneGalleryImage(activePositionImage, button.dataset.positionDirection);
    });
  });
  document.getElementById('admin-position-center').addEventListener('click', () => {
    if (!activePositionImage) return;
    setPhoneGalleryPosition(activePositionImage, { x: 50, y: 50 });
    setStatus('Photo centered. Choose Save changes to publish the update.');
  });
  document.getElementById('admin-position-close').addEventListener('click', () => positionDialog.close());
  document.getElementById('admin-position-done').addEventListener('click', () => positionDialog.close());
  positionDialog.addEventListener('close', () => {
    activePositionImage = null;
    positionPreview.removeAttribute('src');
    positionPreview.style.removeProperty('object-position');
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
    renderManagedWorkItems('brand-work');
    renderMediaControls();
  });

  document.addEventListener('click', event => {
    if (location.hash !== '#/admin' || editor.contains(event.target)) return;
    if (event.target instanceof Element &&
        (event.target.closest('.hero-video-toggle') ||
         event.target.closest('#process-story [data-process-step]') ||
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
    const categories = availableWorkCategories(activeWorkContext);
    if (categories.some(category =>
      category.slug === slug || category.label.toLowerCase() === label.toLowerCase()
    )) {
      status.textContent = 'That category already exists.';
      input.focus();
      return;
    }
    if (customCategoriesFor(activeWorkContext).length >= 50) {
      status.textContent = 'You can add up to 50 custom categories.';
      return;
    }
    setCustomCategoriesFor(activeWorkContext, [...customCategoriesFor(activeWorkContext), { slug, label }]);
    refreshWorkCategoryControls(activeWorkContext);
    document.getElementById('admin-work-category').value = slug;
    markManagedGalleryChanged(activeWorkContext);
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
    const context = activeWorkContext;
    const items = workItemsFor(context);
    if (items.length >= 100) {
      dialogStatus.textContent = 'This gallery supports up to 100 admin-added stories.';
      setStatus('This gallery supports up to 100 admin-added stories.', true);
      return;
    }
    const title = document.getElementById('admin-work-title').value.trim();
    const category = document.getElementById('admin-work-category').value;
    const description = document.getElementById('admin-work-description').value.trim();
    const mediaType = workForm.querySelector('input[name="admin-work-media-type"]:checked')?.value;
    const imageFile = mediaType === 'image' ? document.getElementById('admin-work-image').files[0] : null;
    const videoFile = mediaType === 'video' ? document.getElementById('admin-work-video').files[0] : null;
    const coverFile = mediaType === 'video' ? document.getElementById('admin-work-cover').files[0] : null;
    if (!title || !description || (!imageFile && !videoFile)) return;
    if (!availableWorkCategories(context).some(item => item.slug === category)) {
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
        if (coverFile) {
          dialogStatus.textContent = 'Preparing the optional video cover…';
          imageUrl = await uploadPhotoFile(coverFile);
        }
      }

      const id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setWorkItemsFor(context, [...workItemsFor(context), { id, title, category, description, imageUrl, videoUrl }]);
      markManagedGalleryChanged(context);
      renderManagedWorkItems(context);
      renderMediaControls();
      const categoryFilter = Array.from(document.querySelectorAll(`#${context} [data-filter]`))
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
    if (!file || !selectedElement ||
        (!(selectedElement instanceof HTMLImageElement) && !(selectedElement instanceof HTMLVideoElement))) return;
    try {
      const isVideoCover = selectedElement instanceof HTMLVideoElement;
      const key = isVideoCover ? videoCoverKey(selectedElement) : elementKey(selectedElement);
      const previousSource = isVideoCover
        ? selectedElement.poster || selectedElement.closest('.preview-media')?.querySelector(':scope > img')?.src || ''
        : mediaSource(selectedElement, 'image');
      const uploadedSource = await uploadPhotoFile(file);
      if (previousSource && !safeImageSource(previousSource)) {
        throw new Error(`The previous ${isVideoCover ? 'video cover' : 'photo'} could not be restored safely.`);
      }
      mediaRevertState[key] = { type: isVideoCover ? 'video-cover' : 'image', value: previousSource };
      if (isVideoCover) {
        applyVideoCover(selectedElement, uploadedSource);
        selectedElement.dataset.adminVideoCoverEdited = 'true';
      } else {
        selectedElement.src = uploadedSource;
        selectedElement.dataset.adminImageEdited = 'true';
      }
      renderMediaControls();
      setStatus(`${isVideoCover ? 'Video cover' : 'Photo'} uploaded. Choose Save changes to publish it to the shared website.`);
    } catch (error) {
      setStatus(`Could not process this photo: ${error.message}`, true);
    } finally {
      photoPicker.value = '';
    }
  });

  logoReplaceButton.addEventListener('click', () => logoPicker.click());

  logoDefaultButton.addEventListener('click', () => {
    delete edits[sharedBrandLogoKey];
    delete edits[legacyBrandLogoKey];
    window.applyEvrBrandLogo(defaultBrandLogos);
    setStatus('Default logo set selected. Choose Save changes to publish it.');
  });

  logoPicker.addEventListener('change', async () => {
    const file = logoPicker.files && logoPicker.files[0];
    if (!file) return;
    try {
      await validateTransparentPng(file);
      setStatus('Creating and uploading the transparent logo set…');
      const logoSet = await uploadSharedBrandLogo(file);
      edits[sharedBrandLogoKey] = { type: 'text', value: JSON.stringify(logoSet) };
      delete edits[legacyBrandLogoKey];
      window.applyEvrBrandLogo(logoSet);
      setStatus('Shared logo set uploaded. Choose Save changes to publish both versions everywhere.');
    } catch (error) {
      setStatus(`Could not replace the shared logo: ${error.message}`, true);
    } finally {
      logoPicker.value = '';
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
    document.querySelectorAll('[data-admin-video-cover-edited="true"]').forEach(video => {
      if (video instanceof HTMLVideoElement && safeImageSource(video.poster)) {
        next[videoCoverKey(video)] = { type: 'video-cover', value: video.poster };
      }
    });
    document.querySelectorAll('#home [data-phone-screen="4"] .phone-gallery img[data-admin-position-edited="true"]').forEach(image => {
      const position = currentPhoneGalleryPosition(image);
      const key = phoneGalleryPositionKey(image);
      if (position.x === 50 && position.y === 50) delete next[key];
      else next[key] = { type: 'text', value: JSON.stringify(position) };
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
      if (videoTestimonialsChanged) {
        next[videoTestimonialsKey] = { type: 'text', value: JSON.stringify(videoTestimonials) };
      }
      for (const context of managedGalleryChanges) {
        if (context === 'brand-work') {
          next[managedBrandGalleryKey] = { type: 'text', value: encodeManagedGallery(managedBrandWorkItems) };
          next[hiddenBrandWorkCardsKey] = { type: 'text', value: JSON.stringify(Array.from(hiddenBrandWorkCardIds)) };
          next[brandWorkCategoriesKey] = { type: 'text', value: JSON.stringify(customBrandWorkCategories) };
        } else {
          next[managedGalleryKey] = { type: 'text', value: encodeManagedGallery(managedWorkItems) };
          next[hiddenWorkCardsKey] = { type: 'text', value: JSON.stringify(Array.from(hiddenWorkCardIds)) };
          next[workCategoriesKey] = { type: 'text', value: JSON.stringify(customWorkCategories) };
        }
      }
      const saved = await saveSharedContent({ version: 1, entries: next });
      edits = validateEntries(saved.entries);
      managedWorkItems = edits[managedGalleryKey]
        ? decodeManagedGallery(edits[managedGalleryKey].value)
        : [];
      managedBrandWorkItems = edits[managedBrandGalleryKey]
        ? decodeManagedGallery(edits[managedBrandGalleryKey].value, new Set([
          ...defaultBrandWorkCategories.map(category => category.slug),
          ...customBrandWorkCategories.map(category => category.slug)
        ]))
        : [];
      hiddenWorkCardIds = edits[hiddenWorkCardsKey]
        ? readHiddenWorkCardIds(edits[hiddenWorkCardsKey].value)
        : new Set();
      hiddenBrandWorkCardIds = edits[hiddenBrandWorkCardsKey]
        ? readHiddenWorkCardIds(edits[hiddenBrandWorkCardsKey].value)
        : new Set();
      managedGalleryChanged = false;
      managedGalleryChanges.clear();
      videoTestimonialsChanged = false;
      pendingVideos.clear();
      document.querySelectorAll('[data-admin-text-edited="true"]').forEach(element => {
        element.innerHTML = safeMarkup(element.innerHTML);
        element.contentEditable = 'false';
        delete element.dataset.adminTextEdited;
      });
      document.querySelectorAll('[data-admin-image-edited="true"]').forEach(element => {
        delete element.dataset.adminImageEdited;
      });
      document.querySelectorAll('[data-admin-position-edited="true"]').forEach(element => {
        delete element.dataset.adminPositionEdited;
        delete element.dataset.adminObjectPosition;
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
      document.querySelectorAll('[data-admin-video-cover-edited="true"]').forEach(element => {
        delete element.dataset.adminVideoCoverEdited;
      });
      clearSelection();
      renderVideoTestimonials();
      renderAdminVideoTestimonials();
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
        if (['image', 'video-cover'].includes(entry?.type) && /^data:image\//i.test(entry.value)) {
          const blob = await fetch(entry.value).then(response => response.blob());
          entries[key] = { type: entry.type, value: await uploadMedia(blob, blob.type) };
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
      managedBrandWorkItems = edits[managedBrandGalleryKey]
        ? decodeManagedGallery(edits[managedBrandGalleryKey].value, new Set([
          ...defaultBrandWorkCategories.map(category => category.slug),
          ...customBrandWorkCategories.map(category => category.slug)
        ]))
        : [];
      hiddenWorkCardIds = edits[hiddenWorkCardsKey]
        ? readHiddenWorkCardIds(edits[hiddenWorkCardsKey].value)
        : new Set();
      hiddenBrandWorkCardIds = edits[hiddenBrandWorkCardsKey]
        ? readHiddenWorkCardIds(edits[hiddenBrandWorkCardsKey].value)
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
        if (['image', 'video-cover'].includes(entry?.type) && /^data:image\//i.test(entry.value)) {
          const blob = await fetch(entry.value).then(response => response.blob());
          migrated[key] = { type: entry.type, value: await uploadMedia(blob, blob.type) };
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
        setLoginStatus('Enter your authorized admin email address to receive a sign-in code.');
      }
    } catch (error) {
      setLoginStatus(`Could not connect to the server: ${error.message}`, true);
    }
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
