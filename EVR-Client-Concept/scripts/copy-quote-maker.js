'use strict';

const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', '..', 'Quote', 'EVR Productions Quote Maker.html');
const destination = path.resolve(__dirname, '..', 'quote-maker.html');

if (!fs.existsSync(source)) {
  throw new Error(`The standalone quotation source file is missing: ${source}`);
}

function replaceExactlyOnce(content, target, replacement, description) {
  const firstMatch = content.indexOf(target);
  if (firstMatch === -1 || content.indexOf(target, firstMatch + target.length) !== -1) {
    throw new Error(`Expected exactly one ${description} in the standalone quotation source.`);
  }
  return content.slice(0, firstMatch) + replacement + content.slice(firstMatch + target.length);
}

function replaceBlock(content, startMarker, endMarker, replacement, description) {
  const start = content.indexOf(startMarker);
  if (start === -1 || content.indexOf(startMarker, start + startMarker.length) !== -1) {
    throw new Error(`Expected exactly one start marker for ${description} in the standalone quotation source.`);
  }
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end === -1) {
    throw new Error(`Could not find the end marker for ${description} in the standalone quotation source.`);
  }
  return content.slice(0, start) + replacement + content.slice(end);
}

let html = fs.readFileSync(source, 'utf8');
html = replaceExactlyOnce(
  html,
  '<title>EVR Productions | Admin Wedding Quote Builder</title>',
  '<title>EVR Productions | Admin Wedding Quote Builder</title>\n<meta name="robots" content="noindex,nofollow">',
  'quote-maker title'
);
html = replaceExactlyOnce(
  html,
  String.raw`if (location.pathname.replace(/\/+$/, '') === '/quote-maker') {
  document.documentElement.classList.add('hosted-quote-maker', 'quote-auth-locked');
}`,
  String.raw`if (['/quote', '/quote-maker', '/quote-maker.html'].includes(location.pathname.replace(/\/+$/, ''))) {
  document.documentElement.classList.add('hosted-quote-maker', 'quote-auth-locked');
}`,
  'hosted quote authentication gate'
);
html = replaceBlock(
  html,
  '<section class="quote-auth-gate" aria-labelledby="quote-auth-title">',
  '</section>',
  `<section class="quote-auth-gate" aria-labelledby="quote-auth-title">
  <h1 id="quote-auth-title">EVR Quote Maker</h1>
  <p>Enter the quote access passcode to create client quotations and proposal links.</p>
  <form id="quote-auth-form">
    <label for="quote-auth-passcode">Passcode<input id="quote-auth-passcode" type="password" minlength="4" maxlength="128" autocomplete="current-password" required></label>
    <button id="quote-auth-submit" type="submit">Unlock quote maker</button>
  </form>
  <p id="quote-auth-status" role="status" aria-live="polite">Checking quote access…</p>
</section>`,
  'quote passcode form'
);
html = replaceBlock(
  html,
  "if (document.documentElement.classList.contains('hosted-quote-maker')) {",
  '\n</script>',
  `if (document.documentElement.classList.contains('hosted-quote-maker')) {
  document.body.setAttribute('data-quote-service', 'enabled');
  (async () => {
    const form = document.getElementById('quote-auth-form');
    const passcode = document.getElementById('quote-auth-passcode');
    const status = document.getElementById('quote-auth-status');
    const submit = document.getElementById('quote-auth-submit');
    async function request(options = {}) {
      const response = await fetch('/api/quote-maker/access', {
        ...options,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || \`Quote access failed (\${response.status}).\`);
      return result;
    }
    function unlock() {
      document.documentElement.classList.remove('quote-auth-locked');
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      status.textContent = 'Checking passcode…';
      try {
        await request({
          method: 'POST',
          body: JSON.stringify({ action: 'verify', passcode: passcode.value })
        });
        passcode.value = '';
        unlock();
        status.textContent = 'Access granted. Your quote form is ready.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    try {
      const result = await request();
      if (result.authenticated) unlock();
      else status.textContent = result.configured
        ? 'Enter the quote access passcode to continue.'
        : result.error || 'Quote access is not configured.';
    } catch (error) {
      status.textContent = \`Could not check quote access: \${error.message}\`;
    }
  })();
}`,
  'quote passcode authentication script'
);
html = replaceExactlyOnce(
  html,
  "website's /quote-maker address",
  "website's /quote address",
  'offline quote-maker instructions'
);
html = replaceExactlyOnce(
  html,
  'at /quote-maker and sign in to generate shareable links.',
  'at /quote and enter the quote access passcode to generate shareable links.',
  'hosted quote-maker instructions'
);

fs.writeFileSync(destination, html);
