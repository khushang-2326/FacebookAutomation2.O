const crypto = require('crypto');
const config = require('../config/config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Returns a 32-byte Buffer key derived from the configuration key.
 */
function getKeyBuffer() {
  const keyString = config.encryptionKey || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  return crypto.createHash('sha256').update(String(keyString)).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} text - Plaintext to encrypt
 * @returns {string} - Combined string in format "iv:authTag:ciphertext" (hex encoded)
 */
function encrypt(text) {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKeyBuffer();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted string produced by encrypt().
 * @param {string} encryptedText - Formatted "iv:authTag:ciphertext"
 * @returns {string} - Decrypted plaintext string
 */
function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // If not in encrypted format (e.g. legacy or mock plain), return as is or throw
    return encryptedText;
  }
  
  const [ivHex, authTagHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getKeyBuffer();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
  ALGORITHM
};
