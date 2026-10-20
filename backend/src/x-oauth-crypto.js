const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('crypto');

const ENVELOPE_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function createPkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createOAuthState() {
  return randomBytes(32).toString('base64url');
}

function hashOAuthState(state) {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function loadEncryptionKeyring(env = process.env) {
  const activeKeyId = String(env.X_TOKEN_ACTIVE_KEY_ID || '').trim();
  const serializedKeys = env.X_TOKEN_ENCRYPTION_KEYS_JSON;
  if (!activeKeyId || !serializedKeys) {
    throw new Error('X token encryption is not configured.');
  }

  let parsedKeys;
  try {
    parsedKeys = JSON.parse(serializedKeys);
  } catch {
    throw new Error('X token encryption is not configured.');
  }
  if (!parsedKeys || Array.isArray(parsedKeys) || typeof parsedKeys !== 'object') {
    throw new Error('X token encryption is not configured.');
  }

  const keys = new Map();
  for (const [keyId, encodedKey] of Object.entries(parsedKeys)) {
    if (!keyId || typeof encodedKey !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedKey)) {
      throw new Error('X token encryption is not configured.');
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new Error('X token encryption is not configured.');
    }
    keys.set(keyId, key);
  }
  if (!keys.has(activeKeyId)) throw new Error('X token encryption is not configured.');
  return { activeKeyId, keys };
}

function encryptSecret(value, key, keyId, purpose) {
  if (typeof value !== 'string' || !value || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('X credential encryption failed.');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${ENVELOPE_VERSION}:${keyId}:${purpose}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([
    Buffer.from([ENVELOPE_VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

function decryptSecret(envelope, key, keyId, purpose) {
  if (!Buffer.isBuffer(envelope) || envelope.length <= 1 + IV_LENGTH + TAG_LENGTH
      || envelope[0] !== ENVELOPE_VERSION || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('X credential decryption failed.');
  }
  const iv = envelope.subarray(1, 1 + IV_LENGTH);
  const tag = envelope.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = envelope.subarray(1 + IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(`${ENVELOPE_VERSION}:${keyId}:${purpose}`, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('X credential decryption failed.');
  }
}

function encodeBytea(envelope) {
  return `\\x${Buffer.from(envelope).toString('hex')}`;
}

function decodeBytea(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value !== 'string' || !/^\\x(?:[0-9a-f]{2})+$/i.test(value)) {
    throw new Error('X credential decryption failed.');
  }
  return Buffer.from(value.slice(2), 'hex');
}

module.exports = {
  createOAuthState,
  createPkcePair,
  decodeBytea,
  decryptSecret,
  encodeBytea,
  encryptSecret,
  hashOAuthState,
  loadEncryptionKeyring,
};
