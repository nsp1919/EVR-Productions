'use strict';

const { readContent } = require('../server/content-store');

const defaultLogos = {
  light: '/assets/evr-productions-logo-light.png',
  dark: '/assets/evr-productions-logo-dark.png'
};

function isValidLogoSource(source) {
  return typeof source === 'string' &&
    (/^https?:\/\/\S+$/i.test(source) || /^data:image\/(?:png|webp);base64,[a-z\d+/]+=*$/i.test(source));
}

function getBrandLogoSet(content) {
  const entries = content?.entries || {};
  const sharedLogo = entries['#brand-logo-v2'];
  const legacyLogo = entries['#brand-logo-v1'];
  let logoSet = defaultLogos;

  if (sharedLogo) {
    if (sharedLogo.type !== 'text') throw new Error('The saved shared logo set is invalid.');
    try {
      logoSet = JSON.parse(sharedLogo.value);
    } catch (error) {
      throw new Error(`The saved shared logo set is invalid: ${error.message}`);
    }
    if (!logoSet || typeof logoSet !== 'object' || Array.isArray(logoSet) ||
        !isValidLogoSource(logoSet.light) || !isValidLogoSource(logoSet.dark)) {
      throw new Error('The saved shared logo set is invalid.');
    }
    return { light: logoSet.light, dark: logoSet.dark };
  }

  if (legacyLogo) {
    if (legacyLogo.type !== 'image' || !isValidLogoSource(legacyLogo.value)) {
      throw new Error('The saved legacy logo is invalid.');
    }
    logoSet = { ...defaultLogos, light: legacyLogo.value };
  }

  return { ...logoSet };
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const content = await readContent();
    return response.status(200).json(getBrandLogoSet(content));
  } catch (error) {
    console.error('Unable to read the shared EVR logo set:', error);
    return response.status(503).json({ error: 'Could not load the shared EVR logo set.' });
  }
};

module.exports.getBrandLogoSet = getBrandLogoSet;
