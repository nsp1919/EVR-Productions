'use strict';

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Configuration } = require('./r2-storage');

const proposalPrefix = 'evr-quotes';
const proposalLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const allowedSections = new Set(['home', 'weddings', 'work', 'process', 'about', 'request']);

function cleanText(value, maxLength, fallback = '') {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error('The quotation contains invalid text.');
  }
  return value.trim() || fallback;
}

function cleanTextList(value, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error('The quotation contains an invalid list.');
  }
  return value.map(item => cleanText(item, maxLength)).filter(Boolean);
}

function validateQuote(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.version !== 1 || value.reviewed !== true ||
      !Array.isArray(value.events) || value.events.length > 20 ||
      !Array.isArray(value.deliverables) || value.deliverables.length > 40 ||
      !Array.isArray(value.websiteSections)) {
    throw new Error('The quotation is incomplete or invalid.');
  }

  if (!Number.isFinite(value.total) || value.total < 0 || value.total > 1000000000) {
    throw new Error('The quotation total is invalid.');
  }
  const date = cleanText(value.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('The quotation date is invalid.');

  const events = value.events.map(event => {
    if (!event || typeof event !== 'object' || Array.isArray(event) ||
        !Array.isArray(event.days) || event.days.length > 5) {
      throw new Error('A quotation event is invalid.');
    }
    return {
      name: cleanText(event.name, 100),
      date: cleanText(event.sortDate || '', 10),
      session: cleanText(event.session || '', 100),
      requirements: cleanTextList(event.reqs || [], 40, 120),
      days: event.days.map(day => {
        if (!day || typeof day !== 'object' || Array.isArray(day) ||
            !Number.isInteger(day.day) || day.day < 1 || day.day > 5) {
          throw new Error('A quotation event day is invalid.');
        }
        return {
          number: day.day,
          date: cleanText(day.date || '', 10),
          session: cleanText(day.session || '', 100),
          requirements: cleanTextList(day.reqs || [], 40, 120)
        };
      })
    };
  });
  const deliverables = value.deliverables.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('A quotation deliverable is invalid.');
    }
    return cleanText(item.name, 160);
  }).filter(Boolean);
  const websiteSections = [...new Set(value.websiteSections
    .filter(section => typeof section === 'string' && allowedSections.has(section)))];
  if (!events.length && !deliverables.length) throw new Error('Select at least one event or deliverable.');

  return {
    version: 1,
    reference: cleanText(value.reference || '', 80),
    client: cleanText(value.client, 100),
    groom: cleanText(value.groom || '', 100),
    bride: cleanText(value.bride || '', 100),
    date,
    events,
    deliverables,
    total: Math.round((value.total + Number.EPSILON) * 100) / 100,
    totalOverridden: value.totalOverridden === true,
    terms: cleanText(value.terms, 4000),
    reviewed: true,
    websiteSections,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + proposalLifetimeMs).toISOString()
  };
}

function validQuoteId(id) {
  return typeof id === 'string' && /^[a-f0-9]{48}$/.test(id);
}

function quoteKey(id) {
  if (!validQuoteId(id)) throw new Error('The quotation link is invalid.');
  return `${proposalPrefix}/${id}.json`;
}

function responseKey(id) {
  if (!validQuoteId(id)) throw new Error('The quotation link is invalid.');
  return `${proposalPrefix}/${id}-response.json`;
}

async function readObject(key) {
  const config = getR2Configuration();
  if (config.error) throw new Error(config.error);
  try {
    const result = await config.client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    return JSON.parse(await result.Body.transformToString());
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function writeObject(key, value) {
  const config = getR2Configuration();
  if (config.error) throw new Error(config.error);
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, 'utf8') > 128_000) throw new Error('The quotation is too large to save.');
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store'
  }));
}

async function createQuote(id, quote) {
  await writeObject(quoteKey(id), validateQuote(quote));
}

async function getQuote(id) {
  const quote = await readObject(quoteKey(id));
  if (!quote || typeof quote.expiresAt !== 'string' || Date.parse(quote.expiresAt) <= Date.now()) return null;
  const response = await readObject(responseKey(id));
  return {
    quote,
    accepted: response?.action === 'accepted',
    responded: Boolean(response?.action),
    response: response ? {
      action: response.action,
      acceptedBy: response.acceptedBy,
      acceptedAt: response.acceptedAt,
      message: response.message
    } : null
  };
}

async function acceptQuote(id, name) {
  const saved = await getQuote(id);
  if (!saved) return { status: 'not-found' };
  if (saved.responded) return { status: 'already-responded' };
  const acceptedAt = new Date().toISOString();
  await writeObject(responseKey(id), {
    version: 1,
    action: 'accepted',
    quoteReference: saved.quote.reference,
    client: saved.quote.client,
    acceptedBy: cleanText(name, 100),
    acceptedAt,
    quoteCreatedAt: saved.quote.createdAt
  });
  return {
    status: 'accepted',
    acceptedAt,
    acceptedBy: cleanText(name, 100),
    quote: saved.quote
  };
}

async function requestQuoteChanges(id, name, message) {
  const saved = await getQuote(id);
  if (!saved) return { status: 'not-found' };
  if (saved.responded) return { status: 'already-responded' };
  const acceptedBy = cleanText(name, 100);
  const cleanMessage = cleanText(message, 2000);
  const requestedAt = new Date().toISOString();
  await writeObject(responseKey(id), {
    version: 1,
    action: 'changes-requested',
    quoteReference: saved.quote.reference,
    client: saved.quote.client,
    acceptedBy,
    message: cleanMessage,
    acceptedAt: requestedAt,
    quoteCreatedAt: saved.quote.createdAt
  });
  return {
    status: 'changes-requested',
    acceptedAt: requestedAt,
    acceptedBy,
    message: cleanMessage,
    quote: saved.quote
  };
}

module.exports = {
  acceptQuote,
  createQuote,
  getQuote,
  requestQuoteChanges,
  validQuoteId,
  validateQuote
};
