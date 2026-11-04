(() => {
  const defaultLogos = {
    light: '/assets/evr-productions-logo-light.png',
    dark: '/assets/evr-productions-logo-dark.png'
  };

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

  function applyEvrBrandLogo(sources) {
    const logoSet = sources || defaultLogos;
    if (!logoSet || !isSafeLogoSource(logoSet.light) || !isSafeLogoSource(logoSet.dark)) {
      throw new TypeError('Invalid shared logo image set');
    }
    document.querySelectorAll('[data-brand-logo]').forEach((image) => {
      const variant = image.dataset.brandLogo;
      image.src = logoSet[variant];
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
        const entries = content?.entries || {};
        const sharedLogoSet = entries['#brand-logo-v2'];
        const previousLogo = entries['#brand-logo-v1'];
        const logoSet = sharedLogoSet
          ? JSON.parse(sharedLogoSet.value)
          : previousLogo?.value
            ? { ...defaultLogos, light: previousLogo.value }
            : defaultLogos;
        applyEvrBrandLogo(logoSet);
      })
      .catch((error) => console.error('Unable to load the shared EVR logo:', error));
  }
})();
