'use strict';

const MAX_FILE_SIZE = 64 * 1024 * 1024;
const MAX_PACKET_LENGTH = 8192;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function toBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
    result += BASE64[n >>> 18] + BASE64[(n >>> 12) & 63];
    if (i + 1 < bytes.length) result += BASE64[(n >>> 6) & 63];
    if (i + 2 < bytes.length) result += BASE64[n & 63];
  }
  return result;
}

function fromBase64(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new Error('Invalid base64 data.');
  }
  const bytes = new Uint8Array(Math.floor(text.length * 6 / 8));
  let value = 0;
  let bits = 0;
  let offset = 0;
  for (const char of text) {
    value = (value << 6) | BASE64.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (value >>> bits) & 255;
    }
  }
  if (bits && (value & ((1 << bits) - 1))) throw new Error('Non-canonical base64 data.');
  return bytes;
}

function crc32(text) {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) crc = CRC_TABLE[(crc ^ text.charCodeAt(i)) & 255] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function validateManifest(meta) {
  if (!meta || typeof meta !== 'object' ||
      typeof meta.id !== 'string' || !/^[a-f0-9]{24}$/.test(meta.id) ||
      typeof meta.name !== 'string' || !meta.name.length || encoder.encode(meta.name).length > 768 ||
      typeof meta.type !== 'string' || meta.type.length > 128 ||
      !Number.isSafeInteger(meta.size) || meta.size < 0 || meta.size > MAX_FILE_SIZE ||
      !Number.isInteger(meta.chunkSize) || meta.chunkSize < 64 || meta.chunkSize > 1024 ||
      typeof meta.hash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.hash)) {
    throw new Error('Invalid transfer metadata.');
  }
  return Math.max(1, Math.ceil(meta.size / meta.chunkSize));
}

function encodeManifest(meta) {
  validateManifest(meta);
  return toBase64(encoder.encode(JSON.stringify(meta)));
}

function encodePacket(manifest, index, data) {
  const body = `QRT1.${manifest}.${index.toString(36)}.${toBase64(data)}`;
  return `${body}.${crc32(body)}`;
}

function parsePacket(text) {
  if (typeof text !== 'string' || !text.startsWith('QRT1.')) return null;
  if (text.length > MAX_PACKET_LENGTH) throw new Error('QR packet is too large.');
  const parts = text.split('.');
  if (parts.length !== 5 || !/^[a-f0-9]{8}$/.test(parts[4]) ||
      crc32(parts.slice(0, 4).join('.')) !== parts[4]) throw new Error('QR packet checksum mismatch.');
  let meta;
  try {
    meta = JSON.parse(decoder.decode(fromBase64(parts[1])));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) throw new Error('Invalid transfer metadata encoding.');
    throw error;
  }
  const total = validateManifest(meta);
  if (!/^(0|[1-9a-z][0-9a-z]*)$/.test(parts[2])) throw new Error('Invalid chunk index.');
  const index = parseInt(parts[2], 36);
  if (!Number.isSafeInteger(index) || index < 0 || index >= total) throw new Error('Chunk index out of range.');
  const data = fromBase64(parts[3]);
  const expected = index === total - 1 ? meta.size - index * meta.chunkSize : meta.chunkSize;
  if (data.length !== expected) throw new Error('Unexpected chunk length.');
  return { meta, total, index, data, manifest: parts[1] };
}

class Receiver {
  constructor() {
    this.reset();
  }

  reset() {
    this.meta = null;
    this.manifest = null;
    this.chunks = null;
    this.received = 0;
    this.bytes = 0;
    this.total = 0;
  }

  accept(packet) {
    if (!this.meta) {
      this.meta = packet.meta;
      this.manifest = packet.manifest;
      this.total = packet.total;
      this.chunks = new Array(packet.total);
    }
    if (this.manifest !== packet.manifest) return { foreign: true, added: false, complete: false };
    const added = !this.chunks[packet.index];
    if (added) {
      this.chunks[packet.index] = packet.data;
      this.received++;
      this.bytes += packet.data.length;
    }
    return { foreign: false, added, complete: this.received === this.total };
  }

  assemble() {
    if (!this.meta || this.received !== this.total) throw new Error('The transfer is incomplete.');
    const result = new Uint8Array(this.meta.size);
    for (let i = 0; i < this.total; i++) result.set(this.chunks[i], i * this.meta.chunkSize);
    return result;
  }

  missingRanges(limit = 30) {
    const ranges = [];
    for (let i = 0; i < this.total; i++) {
      if (this.chunks[i]) continue;
      const start = i;
      while (i + 1 < this.total && !this.chunks[i + 1]) i++;
      ranges.push(start === i ? `${start + 1}` : `${start + 1}-${i + 1}`);
      if (ranges.length === limit) return `${ranges.join(', ')}${i < this.total - 1 ? ', ...' : ''}`;
    }
    return ranges.join(', ');
  }
}

// SHA-256 fallback for browsers that do not expose SubtleCrypto on local files.
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const rotate = (x, n) => (x >>> n) | (x << (32 - n));

function sha256Local(bytes) {
  const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const words = new Uint32Array(64);
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const tail = new Uint8Array(128);
  const remaining = bytes.length % 64;
  tail.set(bytes.subarray(bytes.length - remaining));
  tail[remaining] = 128;
  const tailLength = remaining < 56 ? 64 : 128;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tailLength - 8, Math.floor(bytes.length / 0x20000000));
  tailView.setUint32(tailLength - 4, (bytes.length * 8) >>> 0);
  for (let offset = 0; offset < length; offset += 64) {
    const block = offset + 64 <= bytes.length
      ? new DataView(bytes.buffer, bytes.byteOffset + offset, 64)
      : new DataView(tail.buffer, offset - (bytes.length - remaining), 64);
    for (let i = 0; i < 16; i++) words[i] = block.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
        words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) +
        ((e & f) ^ (~e & g)) + SHA_K[i] + words[i]) >>> 0;
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((value, i) => { state[i] = (state[i] + value) >>> 0; });
  }
  return Array.from(state, value => value.toString(16).padStart(8, '0')).join('');
}

async function sha256(bytes) {
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  }
  return sha256Local(bytes);
}

module.exports = {
  MAX_FILE_SIZE, toBase64, fromBase64, crc32, encodeManifest, encodePacket,
  parsePacket, Receiver, sha256, sha256Local
};
