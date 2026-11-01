'use strict';

async function mockAdminApi(page, initialContent = { version: 1, entries: {} }, authenticated = true, options = {}) {
  const state = { content: structuredClone(initialContent), authenticated };

  if (options.mockUploader !== false) {
    await page.addInitScript(() => {
      let uploadCount = 0;
      window.evrUploadMedia = async (_file, type) => {
        uploadCount += 1;
        return `https://blob.test/media-${uploadCount}.webp`;
      };
      window.evrUploadR2Video = async (_file, onProgress) => {
        onProgress(1024, 1024);
        return {
          uid: 'evr-videos/test-video',
          publicId: 'evr-videos/test-video',
          playbackUrl: 'https://media.example.com/evr-videos/test-video.mp4'
        };
      };
    });
  }
  await page.route('**/api/auth', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      return route.fulfill({ json: { configured: true, authenticated: state.authenticated } });
    }
    const body = request.postDataJSON();
    state.authenticated = body.action === 'login';
    return route.fulfill({ json: { authenticated: state.authenticated } });
  });
  await page.route('**/api/content', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: state.content });
    if (!state.authenticated) return route.fulfill({ status: 401, json: { error: 'Sign in to save website content.' } });
    state.content = request.postDataJSON();
    return route.fulfill({ json: state.content });
  });

  return {
    getContent: () => structuredClone(state.content),
    setContent: content => { state.content = structuredClone(content); }
  };
}

module.exports = { mockAdminApi };
