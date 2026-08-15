// Authentication helpers - password hashing (scrypt, built into node:crypto)
// and signed, in-memory session cookies. No external dependency needed.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  if (candidate.length !== hashBuffer.length) return false;
  return timingSafeEqual(candidate, hashBuffer);
}

// --- Sessions -----------------------------------------------------------
// Sessions are kept server-side in memory (Map). The cookie only carries a
// random, HMAC-signed session id, so a restart simply logs everyone out -
// acceptable for an on-premise front-desk app and avoids any dependency on
// an external session store.
const sessions = new Map(); // sid -> { userId, companyId, expiresAt }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSecret() {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
}

function sign(value) {
  return createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function createSession(userId, companyId) {
  const sid = randomBytes(24).toString('hex');
  sessions.set(sid, { userId, companyId, expiresAt: Date.now() + SESSION_TTL_MS });
  return `${sid}.${sign(sid)}`;
}

export function readSession(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) return null;
  const [sid, sig] = cookieValue.split('.');
  if (sign(sid) !== sig) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return session;
}

export function destroySession(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) return;
  const [sid] = cookieValue.split('.');
  sessions.delete(sid);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}
