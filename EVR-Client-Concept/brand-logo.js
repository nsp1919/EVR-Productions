(() => {
  const defaultLogo = '/assets/evr-productions-logo.png';

  function isSafeLogoSource(source) {
    if (typeof source !== 'string' || !source.trim()) return false;
    if (/^data:image\/(?:png|webp);base64,/i.test(source)) return true;
    try {
      const url = new URL(source, document.baseURI);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function applyEvrBrandLogo(source) {
    const logoSource = source || defaultLogo;
    if (!isSafeLogoSource(logoSource)) throw new TypeError('Invalid shared logo image source');
    document.querySelectorAll('[data-brand-logo]').forEach((image) => {
      image.src = logoSource;
    });
  }

  window.applyEvrBrandLogo = applyEvrBrandLogo;

  if (document.body?.dataset.loadSharedLogo === 'true') {
    fetch('/api/content', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Shared logo request failed (${response.status})`);
        return response.json();
      })
      .then((content) => {
        const entry = content?.entries?.['#brand-logo-v1'];
        applyEvrBrandLogo(entry?.value || defaultLogo);
      })
      .catch((error) => console.error('Unable to load the shared EVR logo:', error));
  }
})();
