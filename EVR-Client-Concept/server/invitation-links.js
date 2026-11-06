'use strict';

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const publicIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*-([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i;

function createInvitationId(coupleNames, uuid) {
  if (typeof coupleNames !== 'string' || !uuidPattern.test(uuid)) {
    throw new TypeError('Wedding names and a valid invitation ID are required.');
  }

  const slug = coupleNames.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-$/g, '') || 'wedding';

  return `${slug}-invitation-${uuid.toLowerCase()}`;
}

function getInvitationStorageId(id) {
  if (typeof id !== 'string') return null;
  if (uuidPattern.test(id)) return id.toLowerCase();
  return publicIdPattern.exec(id)?.[1].toLowerCase() || null;
}

module.exports = { createInvitationId, getInvitationStorageId };
