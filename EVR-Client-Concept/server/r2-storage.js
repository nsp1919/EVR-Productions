'use strict';

const { S3Client } = require('@aws-sdk/client-s3');

function getR2Configuration() {
  const required = [
    'CLOUDFLARE_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL'
  ];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    return { error: `Configure ${missing.join(', ')} to enable Cloudflare R2 storage.` };
  }
  if (!/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID)) {
    return { error: 'CLOUDFLARE_ACCOUNT_ID must be a 32-character Cloudflare account ID.' };
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(process.env.R2_BUCKET_NAME)) {
    return { error: 'R2_BUCKET_NAME is invalid.' };
  }

  let publicBaseUrl;
  try {
    publicBaseUrl = new URL(process.env.R2_PUBLIC_BASE_URL);
  } catch {
    return { error: 'R2_PUBLIC_BASE_URL must be an HTTPS URL for the public R2 media domain.' };
  }
  if (publicBaseUrl.protocol !== 'https:' || publicBaseUrl.username || publicBaseUrl.password ||
      publicBaseUrl.search || publicBaseUrl.hash) {
    return { error: 'R2_PUBLIC_BASE_URL must be an HTTPS URL without credentials, query, or fragment.' };
  }

  return {
    bucket: process.env.R2_BUCKET_NAME,
    publicBaseUrl: publicBaseUrl.toString().replace(/\/+$/, ''),
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    })
  };
}

function publicObjectUrl(baseUrl, key) {
  return `${baseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

module.exports = { getR2Configuration, publicObjectUrl };
