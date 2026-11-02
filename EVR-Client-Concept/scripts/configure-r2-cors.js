'use strict';

const path = require('node:path');
const { PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');
const { getR2Configuration } = require('../server/r2-storage');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load .env.local:', error.message);
    }
  }
}

async function main() {
  const config = getR2Configuration();
  if (config.error) {
    console.error('Configuration error:', config.error);
    process.exit(1);
  }

  const corsRules = [
    {
      AllowedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'https://*.vercel.app'
      ],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600
    }
  ];

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    corsRules[0].AllowedOrigins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  console.log(`Setting CORS policy on bucket "${config.bucket}"...`);
  try {
    await config.client.send(new PutBucketCorsCommand({
      Bucket: config.bucket,
      CORSConfiguration: {
        CORSRules: corsRules
      }
    }));
    console.log('✅ Successfully applied CORS policy to Cloudflare R2 bucket!');

    const current = await config.client.send(new GetBucketCorsCommand({
      Bucket: config.bucket
    }));
    console.log('Current CORS Rules:', JSON.stringify(current.CORSRules, null, 2));
  } catch (error) {
    console.error('Failed to set CORS via API:', error.message);
    console.log('\nIf the API token does not have Admin / Bucket configuration permissions, you can set it directly in the Cloudflare Dashboard:');
    console.log('1. Go to Cloudflare Dashboard -> R2 -> select your bucket.');
    console.log('2. Go to "Settings" tab -> "CORS Policy" -> "Add CORS Policy".');
    console.log('3. Paste the following JSON:');
    console.log(JSON.stringify(corsRules, null, 2));
  }
}

main();

