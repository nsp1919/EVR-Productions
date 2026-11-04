'use strict';

(() => {
  const publicBaseUrl = 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev';
  const folder = 'EVR Videos';
  const posters = 'assets/video-posters/r2/';
  const videos = [
    { file: 'video_2026-10-31_07-41-30.mp4', poster: 'wedding-ceremony-reel.jpg', category: 'wedding', label: 'PORTRAIT / WEDDING HIGHLIGHT', title: 'The wedding day, in motion', description: 'A vertical highlight that brings the ceremony and celebration close.', project: 'wedding', homeGroup: 'portrait' },
    { file: 'video_2026-10-31_07-41-12.mp4', poster: 'wedding-traditions-02.jpg', category: 'wedding', label: 'PORTRAIT / WEDDING RITUALS', title: 'The rituals around the vows', description: 'A portrait-format look at the small traditions woven through the day.', project: 'wedding', homeGroup: 'portrait' },
    { file: 'wed reel.mp4', poster: 'wedding-rituals-vertical.jpg', category: 'wedding', label: 'PORTRAIT / WEDDING REEL', title: 'Every ritual, in motion', description: 'A vertical wedding reel made for the moments that move quickly.', project: 'wedding', homeGroup: 'portrait' },
    { file: 'video_2026-10-31_07-40-11.mp4', poster: 'wedding-traditions-01.jpg', category: 'wedding', label: 'PORTRAIT / FAMILY TRADITIONS', title: 'Traditions shared together', description: 'A portrait montage of family, ceremony and the people gathered close.', project: 'wedding', homeGroup: 'portrait' },
    { file: 'anna (2).mp4', poster: 'pre-wedding-anna-featured.jpg', category: 'prewedding', label: 'WEDDING HIGHLIGHT / GOLDEN HOUR', title: 'The quiet before forever', description: 'A couple story framed by the last light of the day.', project: 'prewedding', homeGroup: 'wedding' },
    { file: 'anna.mp4', poster: 'pre-wedding-anna-alt.jpg', category: 'wedding', label: 'WEDDING HIGHLIGHT / COUPLE STORY', title: 'A moment in the golden hour', description: 'A second sunset-led story, full of movement and quiet connection.', project: 'wedding', homeGroup: 'wedding' },
    { file: 'couple 01.mp4', poster: 'wedding-couple-portrait.jpg', category: 'wedding', label: 'WEDDING HIGHLIGHT / PORTRAITS', title: 'Made for this moment', description: 'An elegant portrait sequence with dramatic light and wedding details.', project: 'wedding', homeGroup: 'wedding' },
    { file: 'video_2026-10-31_07-40-33.mp4', poster: 'bridal-portrait-lyrical.jpg', category: 'wedding', label: 'WEDDING HIGHLIGHT / BRIDAL STORY', title: 'Before the celebrations', description: 'A portrait-led bridal film, framed around the details and anticipation.', project: 'wedding', homeGroup: 'wedding' },
    { file: 'Sri Shashi & Ravi Teja Lrical Video.mp4', poster: 'wedding-sri-shashi-ravi-teja.jpg', category: 'wedding', label: 'LYRICAL WEDDING FILM / SRI SHASHI & RAVI TEJA', title: 'A celebration, remembered', description: 'A lyrical wedding film made around the couple and the people beside them.', project: 'wedding', homeGroup: 'lyrical' },
    { file: 'V&M Lyrical Video.mp4', poster: 'wedding-vm-lyrical.jpg', category: 'wedding', label: 'LYRICAL WEDDING FILM / V&M', title: 'A story set to music', description: 'A lyrical edit shaped by portraits, celebration and expressive titles.', project: 'wedding', homeGroup: 'lyrical' },
    { file: 'video_2026-10-31_07-41-57.mp4', poster: 'video_2026-10-31_07-41-57-cropped.jpg', category: 'celebration', label: 'HALF-SAREE CELEBRATION / OUTDOORS', title: 'A day in full bloom', description: 'A bright outdoor celebration with room for family and joyful portraits.', project: 'celebration', homeGroup: 'half-saree' },
    { file: 'video_2026-10-31_07-42-05.mp4', poster: 'video_2026-10-31_07-42-05-cropped.jpg', category: 'celebration', label: 'HALF-SAREE CELEBRATION / TRADITION', title: 'A tradition brought to life', description: 'A colourful story shaped by traditional dress, family and celebration.', project: 'celebration', homeGroup: 'half-saree' },
    { file: 'video_2026-10-31_07-42-11.mp4', poster: 'video_2026-10-31_07-42-11-cropped.jpg', category: 'celebration', label: 'HALF-SAREE CELEBRATION / SISTERS', title: 'Sisters in celebration', description: 'A family celebration shared side by side, with every detail remembered.', project: 'celebration', homeGroup: 'half-saree' },
    { file: 'video_2026-10-31_07-42-16.mp4', poster: 'video_2026-10-31_07-42-16-cropped.jpg', category: 'celebration', label: 'HALF-SAREE CELEBRATION / PORTRAIT', title: 'Her celebration, her moment', description: 'A portrait-led celebration film with colour, movement and family close by.', project: 'celebration', homeGroup: 'half-saree' },
    { file: 'video_2026-10-31_07-40-04.mp4', poster: 'family-anniversary.jpg', category: 'celebration', label: 'FAMILY / MILESTONE STORY', title: 'Growing up, together', description: 'A family film centred on shared portraits and a little one’s milestones.', project: 'celebration', homeGroup: 'family' }
  ];
  const corporateVideos = [
    { slot: 'corporate-hero', file: 'video_2026-10-31_07-41-51.mp4', poster: 'brand-expo-highlights.jpg', label: 'EVR BRAND STUDIO / BRAND EXHIBITION HIGHLIGHTS', title: 'Brand exhibition highlights', description: 'A portrait event film featuring the exhibition space, people and production details.' },
    { slot: 'corporate-studio-background', publicUrl: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/89721c74-832d-4fef-804a-4be8761574f7.mp4', poster: 'nbrands-empty-studio.jpg', label: 'EVR BRAND STUDIO / EMPTY STUDIO BACKGROUND' },
    { slot: 'corporate-event-space', publicUrl: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/866aac4c-064f-4d22-9c71-7901cceecea9.mp4', poster: 'nbrands-event-space.jpg', label: '01 / EVENT SPACE', title: 'A room ready to celebrate', description: 'A vertical venue reveal that lets the lighting, set-up and guest experience introduce the occasion.' },
    { slot: 'corporate-event-detail', publicUrl: 'https://pub-aefcf27121ff450faf8570e9de489735.r2.dev/evr-videos/e306b0ab-f251-4a36-8e86-ca939ced8e20.mp4', poster: 'nbrands-event-details.jpg', label: '02 / CELEBRATION FILM', title: 'A celebration, built around the details', description: 'Follow the lighting, decorations and birthday moments in a short highlight shaped for the vertical screen.' },
    { slot: 'corporate-healthcare-explainer', file: 'Reel 4.mp4', poster: 'nbrands-healthcare-explainer.jpg', label: '03 / HEALTHCARE EXPLAINER', title: 'A healthcare story, made human', description: 'An animated opening leads into a doctor’s explanation, bringing character-led visuals and an on-screen expert together.' },
    { slot: 'corporate-product-story', file: 'reel_6.mp4', poster: 'nbrands-product-story-still.jpg', label: '04 / DOCTOR-LED PRODUCT STORY', title: 'Show the product in trusted hands', description: 'A doctor-led presentation that brings the product and its everyday use into focus.' }
  ];
  const portfolioFiles = new Set([
    'anna (2).mp4',
    'Sri Shashi & Ravi Teja Lrical Video.mp4',
    'video_2026-10-31_07-42-11.mp4',
    'video_2026-10-31_07-40-04.mp4'
  ]);
  const portfolioVideos = videos.filter(video => portfolioFiles.has(video.file));

  const croppedHalfSareeFiles = new Set([
    'video_2026-10-31_07-41-57.mp4',
    'video_2026-10-31_07-42-05.mp4',
    'video_2026-10-31_07-42-11.mp4',
    'video_2026-10-31_07-42-16.mp4'
  ]);

  function videoUrl(file) {
    const objectPath = croppedHalfSareeFiles.has(file) ? `${folder}/Half Saree Cropped` : folder;
    return `${publicBaseUrl}/${objectPath.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(file)}`;
  }

  function posterUrl(file) {
    return `${posters}${encodeURIComponent(file)}`;
  }

  function configureSlot(container, video, projectType) {
    const url = video.publicUrl || videoUrl(video.file);
    container.dataset.r2VideoUrl = url;
    container.dataset.r2VideoTitle = video.title || video.label;
    container.dataset.r2SlotLabel = video.label;
    const image = container.querySelector('img');
    if (image) {
      image.src = posterUrl(video.poster);
      image.alt = container.matches('.corp-reel-card') ? '' : `${video.title || video.label} video poster`;
    }
    const play = container.querySelector('.preview-play');
    if (play) {
      play.disabled = false;
      play.setAttribute('aria-label', `Play ${video.title || video.label}`);
    }
    if (container.matches('.corp-reel-card')) {
      const cardVideo = container.querySelector('video');
      if (cardVideo) cardVideo.setAttribute('aria-label', `EVR-produced ${video.title || video.label} video`);
      container.classList.add('has-project-video');
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', `EVR-produced ${video.title || video.label} video preview`);
    } else {
      const player = container.querySelector('video');
      if (player) player.setAttribute('aria-label', `Play ${video.title || video.label}`);
      container.dataset.demoMedia = projectType;
    }
  }

  const workGallery = document.querySelector('#work .story-library');
  if (workGallery) {
    workGallery.replaceChildren(...portfolioVideos.map((video, index) => {
      const article = document.createElement('article');
      article.dataset.category = video.category;
      const media = document.createElement('div');
      media.className = 'story-cover preview-media';
      media.dataset.demoMedia = 'wedding';
      media.dataset.r2Slot = video.file;
      media.dataset.portfolioSlot = String(index + 1);
      configureSlot(media, video, 'wedding');
      media.dataset.r2SlotLabel = `Portfolio ${String(index + 1).padStart(2, '0')}: ${video.title}`;
      const poster = media.querySelector('img');
      if (!poster) {
        const image = document.createElement('img');
        image.src = posterUrl(video.poster);
        image.alt = `${video.title} video poster`;
        media.prepend(image);
      }
      if (!media.querySelector('.preview-play')) {
        const play = document.createElement('button');
        play.className = 'preview-play';
        play.type = 'button';
        play.innerHTML = '<span aria-hidden="true">▶</span>Watch video';
        play.setAttribute('aria-label', `Play ${video.title}`);
        media.append(play);
      }
      article.append(media);

      const label = document.createElement('small');
      label.textContent = video.label;
      const title = document.createElement('h3');
      title.textContent = video.title;
      const description = document.createElement('p');
      description.textContent = video.description;
      const projectLink = document.createElement('button');
      projectLink.className = 'button outline';
      projectLink.type = 'button';
      projectLink.dataset.project = video.project;
      projectLink.textContent = video.project === 'prewedding'
        ? 'Plan a pre-wedding story ↗'
        : video.project === 'celebration'
          ? 'Plan a family celebration ↗'
          : 'Plan a wedding story ↗';
      article.append(label, title, description, projectLink);
      return article;
    }));
  }

  document.querySelectorAll('#home [data-r2-slot]').forEach(container => {
    const video = videos.find(item => item.file === container.dataset.r2Slot);
    if (video) configureSlot(container, video, 'wedding');
  });

  const corporateSlots = document.querySelectorAll('#corporate [data-r2-slot], #services [data-r2-slot], #approach [data-r2-slot], #brand-work [data-r2-slot]');
  corporateSlots.forEach((container, index) => {
    const video = corporateVideos.find(item => item.slot === container.dataset.r2Slot);
    if (video) configureSlot(container, video, 'studio');
  });
  const corporateBackgroundVideos = document.querySelectorAll('#corporate [data-r2-background-slot]');
  corporateBackgroundVideos.forEach(container => {
    const video = corporateVideos.find(item => item.slot === container.dataset.r2BackgroundSlot);
    if (!video) return;
    container.poster = posterUrl(video.poster);
    container.dataset.r2BackgroundUrl = video.publicUrl || videoUrl(video.file);
  });

  let backgroundObserver;
  window.syncCorporateBackgroundVideos = activeRoute => {
    backgroundObserver?.disconnect();
    if (activeRoute !== 'corporate') {
      corporateBackgroundVideos.forEach(video => video.pause());
      return;
    }

    const loadBackground = video => {
      if (video.closest('.route')?.hidden || video.getAttribute('src')) return;
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      video.autoplay = !reducedMotion;
      video.src = video.dataset.r2BackgroundUrl;
      video.load();
      if (!reducedMotion && !document.hidden) {
        video.play().catch(() => { video.dataset.playback = 'unavailable'; });
      }
    };

    if (!('IntersectionObserver' in window)) {
      corporateBackgroundVideos.forEach(loadBackground);
      return;
    }
    backgroundObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        loadBackground(entry.target);
        backgroundObserver.unobserve(entry.target);
      });
    }, { rootMargin: '200px 0px' });
    corporateBackgroundVideos.forEach(video => backgroundObserver.observe(video));
  };
  window.syncCorporateBackgroundVideos(location.hash.replace(/^#\/?/, '') || 'home');
})();
