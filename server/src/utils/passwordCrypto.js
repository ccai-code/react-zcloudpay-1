const crypto = require('crypto');
const config = require('../config/wxpay');

function getPasswordEncryptionKey() {
  const raw = (process.env.PASSWORD_ENCRYPTION_KEY || config.apiV3Key || '').toString();
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptPassword(plain) {
  const iv = crypto.randomBytes(12);
  const key = getPasswordEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decryptPassword(value) {
  if (!value) return null;
  const s = String(value);
  if (!s.startsWith('v1:')) return null;
  const parts = s.split(':');
  if (parts.length !== 4) return null;
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  const key = getPasswordEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf-8');
}

module.exports = {
  encryptPassword,
  decryptPassword
};
