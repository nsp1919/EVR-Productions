'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Configuration } = require('./r2-storage');

const scrypt = promisify(crypto.scrypt);
const storageKey = 'evr/invitation-editor-passcode-v1.json';

function getStorage() {
  const config = getR2Configuration();
  if (config.error) throw new Error(config.error);
  return config;
}

async function readInvitationPasscode() {
  const config = getStorage();
  try {
    const response = await config.client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: storageKey
    }));
    const saved = JSON.parse(await response.Body.transformToString());
    if (!saved || saved.version !== 1 || !/^[a-f\d]{32}$/i.test(saved.salt) ||
        !/^[a-f\d]{128}$/i.test(saved.hash)) {
      throw new Error('The saved invitation editor passcode is invalid.');
    }
    return saved;
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function setInvitationPasscode(passcode) {
  if (typeof passcode !== 'string' || !/^\d{4}$/.test(passcode)) {
    throw new Error('Invitation editor passcodes must be exactly four digits.');
  }
  const config = getStorage();
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(passcode, salt, 64);
  await config.client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: storageKey,
    Body: JSON.stringify({ version: 1, salt: salt.toString('hex'), hash: hash.toString('hex') }),
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-store'
  }));
}

async function verifyInvitationPasscode(passcode, storedPasscode) {
  if (typeof passcode !== 'string' || !/^\d{4}$/.test(passcode)) return false;
  const saved = storedPasscode || await readInvitationPasscode();
  if (!saved) return false;
  const actual = await scrypt(passcode, Buffer.from(saved.salt, 'hex'), 64);
  const expected = Buffer.from(saved.hash, 'hex');
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = { readInvitationPasscode, setInvitationPasscode, verifyInvitationPasscode };
