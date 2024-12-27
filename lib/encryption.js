const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const secretKey = process.env.ENCRYPTION_SECRET_KEY;
const iv = crypto.randomBytes(16);

// Mã hóa ID gốc thành public ID
function encryptId(driveId) {
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  let encrypted = cipher.update(driveId, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

// Giải mã public ID thành ID gốc
function decryptId(publicId) {
  try {
    const [ivHex, encryptedId] = publicId.split(':');
    const decipher = crypto.createDecipheriv(
      algorithm, 
      secretKey, 
      Buffer.from(ivHex, 'hex')
    );
    let decrypted = decipher.update(encryptedId, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Error decrypting ID:', error);
    return null;
  }
}

module.exports = {
  encryptId,
  decryptId
};