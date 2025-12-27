const crypto = require('crypto');
const config = require('./wxpayConfig');

function generateSignature(method, urlPath, timestamp, nonce, body) {
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer.sign(config.privateKey, 'base64');
  return signature;
}

function generateAuthorization(method, urlPath, body = '') {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString('hex');
  const signature = generateSignature(method, urlPath, timestamp, nonce, body);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.mchSerialNo}"`;
}

function decryptNotification(ciphertext, associatedData, nonce, key) {
  const keyBuffer = Buffer.from(key, 'utf-8');
  const nonceBuffer = Buffer.from(nonce, 'utf-8');
  const dataBuffer = Buffer.from(ciphertext, 'base64');
  const authTag = dataBuffer.slice(dataBuffer.length - 16);
  const cipher = dataBuffer.slice(0, dataBuffer.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonceBuffer);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData || '', 'utf-8'));
  let decrypted = decipher.update(cipher);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf-8');
}

module.exports = {
  generateAuthorization,
  decryptNotification
};

