'use strict';

const crypto = require('node:crypto');
const { getR2Configuration } = require('../../server/r2-storage');
const {
  isQuoteAuthenticated,
  quoteAccessConfigurationError,
  rejectCrossOrigin,
  setPrivateHeaders
} = require('../../server/auth');
const {
  acceptQuote,
  createQuote,
  getQuote,
  requestQuoteChanges,
  validQuoteId
} = require('../../server/quote-proposals');

function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  try {
    return JSON.parse(request.body || '{}');
  } catch {
    return null;
  }
}

function requestOrigin(request) {
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  const protocol = (request.headers['x-forwarded-proto'] || (host && /^(?:localhost|127\.0\.0\.1)(?::|$)/.test(host) ? 'http' : 'https'))
    .split(',')[0].trim();
  if (!host || !['http', 'https'].includes(protocol) || /[\s/\\]/.test(host)) {
    throw new Error('The website address is invalid.');
  }
  return `${protocol}://${host}`;
}

async function notifyResponse(request, id, result) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.EVR_ADMIN_EMAIL) {
    return false;
  }
  const base = requestOrigin(request);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      to: [process.env.EVR_ADMIN_EMAIL],
      subject: `${result.status === 'accepted' ? 'Quotation accepted' : 'Quotation change requested'}: ${result.quote.client}`,
      text: [
        `Quote ${result.quote.reference || id} received a response from ${result.quote.client}.`,
        `Response: ${result.status}.`,
        `Name: ${result.acceptedBy}.`,
        `Total: INR ${result.quote.total.toLocaleString('en-IN')}.`,
        `Received at: ${result.acceptedAt}.`,
        ...(result.message ? [`Requested changes: ${result.message}`] : []),
        `Open proposal: ${base}/proposals/${id}`
      ].join('\n')
    })
  });
  if (!response.ok) throw new Error(`Resend rejected the response notice (${response.status}).`);
  return true;
}
module.exports = async function handler(request, response) {
  setPrivateHeaders(response);
  if (rejectCrossOrigin(request, response)) return;

  if (request.method === 'GET') {
    const id = request.query?.id || new URL(request.url, 'https://evr.invalid').searchParams.get('id');
    if (!validQuoteId(id)) return response.status(404).json({ error: 'This quotation link is unavailable or has expired.' });
    try {
      const saved = await getQuote(id);
      if (!saved) return response.status(404).json({ error: 'This quotation link is unavailable or has expired.' });
      return response.status(200).json(saved);
    } catch (error) {
      console.error('Unable to load an EVR client quotation:', error);
      return response.status(503).json({ error: 'The quotation could not be loaded. Please try again later.' });
    }
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const body = parseBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'The quotation request is invalid.' });
  }

  if (body.action === 'accept' || body.action === 'request-changes') {
    if (!validQuoteId(body.id) || typeof body.name !== 'string' ||
        !body.name.trim() || body.name.length > 100 ||
        (body.action === 'accept' && body.accepted !== true) ||
        (body.action === 'request-changes' &&
          (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000))) {
      return response.status(400).json({
        error: body.action === 'accept'
          ? 'Enter your name and confirm acceptance of the quotation terms.'
          : 'Enter your name and describe the changes you would like.'
      });
    }
    try {
      const result = body.action === 'accept'
        ? await acceptQuote(body.id, body.name)
        : await requestQuoteChanges(body.id, body.name, body.message);
      if (result.status === 'not-found') return response.status(404).json({ error: 'This quotation link is unavailable or has expired.' });
      if (result.status === 'already-responded') return response.status(409).json({ error: 'A response has already been recorded for this quotation.' });
      let notificationSent = false;
      try {
        notificationSent = await notifyResponse(request, body.id, result);
      } catch (error) {
        console.error('The EVR quotation response was saved, but its email notification failed:', error);
      }
      return response.status(200).json({
        accepted: result.status === 'accepted',
        requestedChanges: result.status === 'changes-requested',
        notificationSent
      });
    } catch (error) {
      console.error('Unable to record an EVR quotation acceptance:', error);
      return response.status(503).json({ error: 'Your response could not be recorded. Please contact EVR directly.' });
    }
  }

  if (body.action !== 'create') return response.status(400).json({ error: 'Choose a valid quotation action.' });
  if (!isQuoteAuthenticated(request)) return response.status(401).json({ error: 'Enter the quote access passcode to create a shareable quotation.' });
  const setupError = quoteAccessConfigurationError() || getR2Configuration().error;
  if (setupError) return response.status(503).json({ error: setupError });

  const quote = body.quote;
  if (!quote || typeof quote !== 'object' || Array.isArray(quote) || Buffer.byteLength(JSON.stringify(quote), 'utf8') > 96_000) {
    return response.status(400).json({ error: 'The quotation is missing or too large.' });
  }
  const id = crypto.randomBytes(24).toString('hex');
  try {
    await createQuote(id, quote);
    const base = requestOrigin(request);
    return response.status(201).json({
      id,
      url: `${base}/quotes/${id}`,
      proposalUrl: `${base}/proposals/${id}`
    });
  } catch (error) {
    if (error.message.includes('invalid') || error.message.includes('incomplete') ||
        error.message.includes('Select at least') || error.message.includes('too large')) {
      return response.status(400).json({ error: error.message });
    }
    console.error('Unable to save an EVR shareable quotation:', error);
    return response.status(503).json({ error: 'The quotation could not be saved. Check storage configuration and try again.' });
  }
};

module.exports.requestOrigin = requestOrigin;
