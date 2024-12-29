import { Transform } from 'stream';
import crypto from 'crypto';

export class VideoEncryptionTransform extends Transform {
  constructor(key, iv) {
    super();
    this.cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    this.position = 0;
    this.chunkSize = 16384; // 16KB chunks
  }

  _transform(chunk, encoding, callback) {
    try {
      // Mã hóa từng chunk nhỏ
      const encrypted = this.cipher.update(chunk);
      this.push(encrypted);
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      const final = this.cipher.final();
      this.push(final);
      callback();
    } catch (error) {
      callback(error);
    }
  }
} 