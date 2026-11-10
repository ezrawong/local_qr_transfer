'use strict';

const ECCode = require('qrcode/lib/core/error-correction-code');
const ECLevel = require('qrcode/lib/core/error-correction-level');
const AlignmentPattern = require('qrcode/lib/core/alignment-pattern');
const Utils = require('qrcode/lib/core/utils');

const FORMAT_MASK = 0x5412;
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function readMatrix(input) {
  if (!input || typeof input !== 'object') return null;
  const rows = Array.isArray(input) ? input : Array.isArray(input.rows) ? input.rows : null;
  const size = Array.isArray(input) ? input.length : input.size;
  if (!Number.isInteger(size) || size < 21 || size > 177 || (size - 17) % 4 !== 0) return null;
  if (rows && (rows.length !== size || rows.some(row => !row || row.length !== size))) return null;
  if (!rows && !(input.data && input.data.length >= size * size) && typeof input.get !== 'function') return null;
  const get = (row, col) => {
    const value = rows ? rows[row][col]
      : typeof input.get === 'function' ? input.get(row, col)
        : input.data[row * size + col];
    return Boolean(value);
  };
  return { size, get };
}

function reservedModules(size) {
  const version = (size - 17) / 4;
  const reserved = new Uint8Array(size * size);
  const mark = (row, col) => {
    if (row >= 0 && row < size && col >= 0 && col < size) reserved[row * size + col] = 1;
  };
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) mark(top + r, left + c);
  }
  for (let i = 8; i < size - 8; i++) {
    mark(6, i);
    mark(i, 6);
  }
  for (let i = 0; i < 15; i++) {
    if (i < 6) mark(i, 8);
    else if (i < 8) mark(i + 1, 8);
    else mark(size - 15 + i, 8);

    if (i < 8) mark(8, size - i - 1);
    else if (i < 9) mark(8, 15 - i);
    else mark(8, 14 - i);
  }
  mark(size - 8, 8);
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3 + size - 11;
      mark(row, col);
      mark(col, row);
    }
  }
  for (const [row, col] of AlignmentPattern.getPositions(version)) {
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) mark(row + r, col + c);
  }
  return reserved;
}

function formatLocations(size) {
  const first = [];
  const second = [];
  for (let i = 0; i < 15; i++) {
    if (i < 6) first.push([i, 8]);
    else if (i < 8) first.push([i + 1, 8]);
    else first.push([size - 15 + i, 8]);
    if (i < 8) second.push([8, size - i - 1]);
    else if (i < 9) second.push([8, 15 - i]);
    else second.push([8, 14 - i]);
  }
  return [first, second];
}

function encodedFormat(levelBit, mask) {
  const generator = 0x537;
  let value = ((levelBit << 3) | mask) << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if ((value >>> bit) & 1) value ^= generator << (bit - 10);
  }
  return ((((levelBit << 3) | mask) << 10) | value) ^ FORMAT_MASK;
}

function readFormat(matrix) {
  const locations = formatLocations(matrix.size);
  const values = locations.map(points => {
    let bits = 0;
    for (let i = 0; i < 15; i++) if (matrix.get(points[i][0], points[i][1])) bits |= 1 << i;
    return bits;
  });
  let best = null;
  for (let levelBit = 0; levelBit < 4; levelBit++) {
    for (let mask = 0; mask < 8; mask++) {
      const encoded = encodedFormat(levelBit, mask);
      const errors = Math.min(bitCount(values[0] ^ encoded), bitCount(values[1] ^ encoded));
      if (!best || errors < best.errors) best = { levelBit, mask, errors };
    }
  }
  if (!best || best.errors > 3) return null;
  const levels = [ECLevel.M, ECLevel.L, ECLevel.H, ECLevel.Q];
  return { level: levels[best.levelBit], mask: best.mask };
}

function bitCount(value) {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

function validVersion(matrix, version) {
  if (version < 7) return true;
  let remainder = version << 12;
  for (let bit = 17; bit >= 12; bit--) {
    if ((remainder >>> bit) & 1) remainder ^= 0x1F25 << (bit - 12);
  }
  const encoded = (version << 12) | remainder;
  let first = 0;
  let second = 0;
  for (let bit = 0; bit < 18; bit++) {
    const row = Math.floor(bit / 3);
    const col = matrix.size - 11 + bit % 3;
    if (matrix.get(row, col)) first |= 1 << bit;
    if (matrix.get(col, row)) second |= 1 << bit;
  }
  return Math.min(bitCount(first ^ encoded), bitCount(second ^ encoded)) <= 3;
}

function maskAt(pattern, row, col) {
  const product = row * col;
  switch (pattern) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return product % 2 + product % 3 === 0;
    case 6: return (product % 2 + product % 3) % 2 === 0;
    default: return (product % 3 + (row + col) % 2) % 2 === 0;
  }
}

function extractCodewords(matrix, format) {
  const reserved = reservedModules(matrix.size);
  const bytes = [];
  let value = 0;
  let bitCountInByte = 0;
  let direction = -1;
  let row = matrix.size - 1;
  for (let col = matrix.size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let offset = 0; offset < 2; offset++) {
        const currentCol = col - offset;
        if (reserved[row * matrix.size + currentCol]) continue;
        const bit = matrix.get(row, currentCol) !== maskAt(format.mask, row, currentCol);
        value = (value << 1) | (bit ? 1 : 0);
        if (++bitCountInByte === 8) {
          bytes.push(value);
          value = 0;
          bitCountInByte = 0;
        }
      }
      row += direction;
      if (row < 0 || row >= matrix.size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
  return Uint8Array.from(bytes);
}

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
for (let i = 0, value = 1; i < 255; i++) {
  GF_EXP[i] = value;
  GF_LOG[value] = i;
  value <<= 1;
  if (value & 0x100) value ^= 0x11D;
}
for (let i = 255; i < GF_EXP.length; i++) GF_EXP[i] = GF_EXP[i - 255];

function gfMultiply(a, b) {
  return !a || !b ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfDivide(a, b) {
  if (!a) return 0;
  return GF_EXP[(GF_LOG[a] - GF_LOG[b] + 255) % 255];
}

function gfPower(power) {
  return GF_EXP[(power % 255 + 255) % 255];
}

function correctBlock(block, ecCount) {
  const syndromes = new Uint8Array(ecCount);
  let hasError = false;
  for (let i = 0; i < ecCount; i++) {
    let result = 0;
    const root = gfPower(i);
    for (const byte of block) result = gfMultiply(result, root) ^ byte;
    syndromes[i] = result;
    if (result) hasError = true;
  }
  if (!hasError) return true;

  // Berlekamp-Massey gives the locator polynomial in ascending coefficient order.
  const locator = new Uint8Array(ecCount + 1);
  const previous = new Uint8Array(ecCount + 1);
  locator[0] = previous[0] = 1;
  let degree = 0;
  let shift = 1;
  let priorDiscrepancy = 1;
  for (let n = 0; n < ecCount; n++) {
    let discrepancy = syndromes[n];
    for (let i = 1; i <= degree; i++) discrepancy ^= gfMultiply(locator[i], syndromes[n - i]);
    if (!discrepancy) {
      shift++;
      continue;
    }
    const saved = locator.slice();
    const scale = gfDivide(discrepancy, priorDiscrepancy);
    for (let i = 0; i + shift < locator.length; i++) {
      if (previous[i]) locator[i + shift] ^= gfMultiply(scale, previous[i]);
    }
    if (2 * degree <= n) {
      degree = n + 1 - degree;
      previous.set(saved);
      priorDiscrepancy = discrepancy;
      shift = 1;
    } else {
      shift++;
    }
  }
  if (!degree || degree * 2 > ecCount) return false;

  const positions = [];
  const powers = [];
  for (let pos = 0; pos < block.length; pos++) {
    const power = block.length - 1 - pos;
    const inverse = gfPower(-power);
    let result = 0;
    for (let i = degree; i >= 0; i--) result = gfMultiply(result, inverse) ^ locator[i];
    if (!result) {
      positions.push(pos);
      powers.push(power);
    }
  }
  if (positions.length !== degree) return false;

  // Solve the first syndromes for magnitudes at the located error positions.
  const matrix = Array.from({ length: degree }, (_, row) => {
    const line = positions.map((_, col) => gfPower(row * powers[col]));
    line.push(syndromes[row]);
    return line;
  });
  for (let col = 0; col < degree; col++) {
    let pivot = col;
    while (pivot < degree && !matrix[pivot][col]) pivot++;
    if (pivot === degree) return false;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let j = col; j <= degree; j++) matrix[col][j] = gfDivide(matrix[col][j], divisor);
    for (let row = 0; row < degree; row++) {
      if (row === col || !matrix[row][col]) continue;
      const factor = matrix[row][col];
      for (let j = col; j <= degree; j++) matrix[row][j] ^= gfMultiply(factor, matrix[col][j]);
    }
  }
  for (let i = 0; i < degree; i++) block[positions[i]] ^= matrix[i][degree];
  for (let i = 0; i < ecCount; i++) {
    let result = 0;
    for (const byte of block) result = gfMultiply(result, gfPower(i)) ^ byte;
    if (result) return false;
  }
  return true;
}

function deinterleave(codewords, version, level) {
  const blockCount = ECCode.getBlocksCount(version, level);
  const ecCount = ECCode.getTotalCodewordsCount(version, level) / blockCount;
  if (!Number.isInteger(ecCount)) return null;
  const dataCount = codewords.length - blockCount * ecCount;
  const baseLength = Math.floor(dataCount / blockCount);
  const longBlocks = dataCount % blockCount;
  const blocks = Array.from({ length: blockCount }, (_, i) => new Uint8Array(baseLength + (i >= blockCount - longBlocks ? 1 : 0) + ecCount));
  let index = 0;
  const maxDataLength = baseLength + (longBlocks ? 1 : 0);
  for (let i = 0; i < maxDataLength; i++) {
    for (let b = 0; b < blockCount; b++) {
      const length = blocks[b].length - ecCount;
      if (i < length) {
        if (index >= codewords.length) return null;
        blocks[b][i] = codewords[index++];
      }
    }
  }
  for (let i = 0; i < ecCount; i++) {
    for (let b = 0; b < blockCount; b++) {
      blocks[b][blocks[b].length - ecCount + i] = codewords[index++];
    }
  }
  if (index !== codewords.length || blocks.some(block => !correctBlock(block, ecCount))) return null;
  const output = new Uint8Array(dataCount);
  index = 0;
  for (const block of blocks) {
    output.set(block.subarray(0, block.length - ecCount), index);
    index += block.length - ecCount;
  }
  return output;
}

function parsePayload(data, version) {
  let bitOffset = 0;
  const output = [];
  const readBits = count => {
    if (count < 0 || bitOffset + count > data.length * 8) return null;
    let value = 0;
    for (let i = 0; i < count; i++) {
      value = (value << 1) | ((data[bitOffset >>> 3] >>> (7 - (bitOffset & 7))) & 1);
      bitOffset++;
    }
    return value;
  };
  while (bitOffset + 4 <= data.length * 8) {
    const mode = readBits(4);
    if (mode === 0) break;
    if (mode === 7) {
      const first = readBits(8);
      if (first === null) return null;
      let assignment = first;
      if ((first & 0xC0) === 0x80) {
        const rest = readBits(8);
        if (rest === null) return null;
        assignment = ((first & 0x3F) << 8) | rest;
      } else if ((first & 0xE0) === 0xC0) {
        const rest = readBits(16);
        if (rest === null) return null;
        assignment = ((first & 0x1F) << 16) | rest;
      } else if (first & 0x80) {
        return null;
      }
      // This decoder intentionally interprets byte text as UTF-8 only.
      if (assignment !== 26) return null;
      continue;
    }
    const group = version < 10 ? 0 : version < 27 ? 1 : 2;
    if (mode === 4) {
      const count = readBits([8, 16, 16][group]);
      if (count === null || bitOffset + count * 8 > data.length * 8) return null;
      const bytes = new Uint8Array(count);
      for (let i = 0; i < count; i++) bytes[i] = readBits(8);
      output.push(bytes);
    } else if (mode === 1) {
      let count = readBits([10, 12, 14][group]);
      if (count === null) return null;
      let text = '';
      while (count >= 3) {
        const value = readBits(10);
        if (value === null || value >= 1000) return null;
        text += String(value).padStart(3, '0');
        count -= 3;
      }
      if (count) {
        const value = readBits(count === 2 ? 7 : 4);
        if (value === null || value >= (count === 2 ? 100 : 10)) return null;
        text += count === 2 ? String(value).padStart(2, '0') : String(value);
      }
      output.push(new TextEncoder().encode(text));
    } else if (mode === 2) {
      let count = readBits([9, 11, 13][group]);
      if (count === null) return null;
      let text = '';
      while (count >= 2) {
        const value = readBits(11);
        if (value === null || value >= 45 * 45) return null;
        text += ALPHANUMERIC[Math.floor(value / 45)] + ALPHANUMERIC[value % 45];
        count -= 2;
      }
      if (count) {
        const value = readBits(6);
        if (value === null || value >= 45) return null;
        text += ALPHANUMERIC[value];
      }
      output.push(new TextEncoder().encode(text));
    } else {
      return null;
    }
  }
  const length = output.reduce((sum, bytes) => sum + bytes.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const bytes of output) {
    result.set(bytes, offset);
    offset += bytes.length;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(result);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

/**
 * Decode a QR matrix. Accepts qrcode's BitMatrix, a { size, data } row-major
 * bit buffer, a { size, rows } object, or a size-by-size array of truthy/dark
 * module values.
 */
function decodeMatrix(input) {
  const matrix = readMatrix(input);
  if (!matrix) return null;
  const version = (matrix.size - 17) / 4;
  if (!validVersion(matrix, version)) return null;
  const format = readFormat(matrix);
  if (!format) return null;
  const total = Utils.getSymbolTotalCodewords(version);
  const codewords = extractCodewords(matrix, format);
  if (codewords.length !== total) return null;
  const data = deinterleave(codewords, version, format.level);
  return data ? parsePayload(data, version) : null;
}

function runRatio(counts, tolerance = 0.7) {
  const total = counts.reduce((sum, value) => sum + value, 0);
  const unit = total / 7;
  return unit > 0 && Math.abs(counts[0] - unit) < unit * tolerance &&
    Math.abs(counts[1] - unit) < unit * tolerance &&
    Math.abs(counts[2] - 3 * unit) < 3 * unit * tolerance &&
    Math.abs(counts[3] - unit) < unit * tolerance &&
    Math.abs(counts[4] - unit) < unit * tolerance;
}

function scanLine(image, row, column, step) {
  const { width, height, gray, threshold } = image;
  const limit = step === 1 ? width : height;
  const startAt = step === 1 ? column : row;
  const valueAt = index => step === 1 ? gray[row * width + index] : gray[index * width + column];
  let centerStart = startAt;
  let centerEnd = startAt;
  if (startAt < 0 || startAt >= limit || valueAt(startAt) >= threshold) return null;
  while (centerStart > 0 && valueAt(centerStart - 1) < threshold) centerStart--;
  while (centerEnd + 1 < limit && valueAt(centerEnd + 1) < threshold) centerEnd++;
  const counts = [0, 0, centerEnd - centerStart + 1, 0, 0];
  let index = centerEnd + 1;
  while (index < limit && valueAt(index) >= threshold) { counts[3]++; index++; }
  while (index < limit && valueAt(index) < threshold) { counts[4]++; index++; }
  index = centerStart - 1;
  while (index >= 0 && valueAt(index) >= threshold) { counts[1]++; index--; }
  while (index >= 0 && valueAt(index) < threshold) { counts[0]++; index--; }
  if (!runRatio(counts)) return null;
  const total = counts.reduce((sum, value) => sum + value, 0);
  const center = (centerStart + centerEnd) / 2;
  return { center, module: total / 7 };
}

function findFinders(image) {
  const { width, height, gray, threshold } = image;
  const found = [];
  for (let y = 0; y < height; y++) {
    const runs = [];
    let color = gray[y * width] < threshold;
    let start = 0;
    for (let x = 1; x <= width; x++) {
      const next = x < width ? gray[y * width + x] < threshold : !color;
      if (next === color) continue;
      runs.push({ color, length: x - start, start });
      if (runs.length >= 5) {
        const r = runs.slice(-5);
        if (r.every((run, i) => run.color === (i % 2 === 0)) && runRatio(r.map(run => run.length))) {
          const centerX = r[2].start + (r[2].length - 1) / 2;
          const vertical = scanLine(image, y, Math.round(centerX), 0);
          if (vertical) {
            const centerY = vertical.center;
            const horizontalModule = r.reduce((sum, run) => sum + run.length, 0) / 7;
            const module = (horizontalModule + vertical.module) / 2;
            const horizontal = scanLine(image, Math.round(centerY), Math.round(centerX), 1);
            if (horizontal && Math.abs(centerY - y) <= module * 1.5 &&
              Math.abs(horizontal.module - vertical.module) < module * 0.65) {
              found.push({ x: horizontal.center, y: centerY, module });
            }
          }
        }
      }
      color = next;
      start = x;
    }
  }
  const clusters = [];
  for (const point of found) {
    let cluster = clusters.find(item => Math.hypot(item.x - point.x, item.y - point.y) < Math.max(1.5, point.module * 1.5) &&
      Math.abs(item.module - point.module) < point.module * 0.75);
    if (!cluster) {
      cluster = { x: 0, y: 0, module: 0, count: 0 };
      clusters.push(cluster);
    }
    cluster.count++;
    cluster.x += (point.x - cluster.x) / cluster.count;
    cluster.y += (point.y - cluster.y) / cluster.count;
    cluster.module += (point.module - cluster.module) / cluster.count;
  }
  return clusters.filter(point => point.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);
}

function projectiveMap(source, target) {
  const equations = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = source[i];
    const { x, y } = target[i];
    equations.push([u, v, 1, 0, 0, 0, -x * u, -x * v, x]);
    equations.push([0, 0, 0, u, v, 1, -y * u, -y * v, y]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(equations[row][col]) > Math.abs(equations[pivot][col])) pivot = row;
    }
    if (Math.abs(equations[pivot][col]) < 1e-9) return null;
    [equations[col], equations[pivot]] = [equations[pivot], equations[col]];
    const divisor = equations[col][col];
    for (let j = col; j <= 8; j++) equations[col][j] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = equations[row][col];
      for (let j = col; j <= 8; j++) equations[row][j] -= factor * equations[col][j];
    }
  }
  const a = equations.map(row => row[8]);
  return (u, v) => {
    const denominator = a[6] * u + a[7] * v + 1;
    return {
      x: (a[0] * u + a[1] * v + a[2]) / denominator,
      y: (a[3] * u + a[4] * v + a[5]) / denominator
    };
  };
}

function sampleGrid(image, size, map) {
  const data = new Uint8Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const point = map((col - 3) / (size - 7), (row - 3) / (size - 7));
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
      data[row * size + col] = image.gray[y * image.width + x] < image.threshold ? 1 : 0;
    }
  }
  return { size, data };
}

function findAlignment(image, size, affine, pitch) {
  const t = (size - 10) / (size - 7);
  const expected = affine(t, t);
  const origin = affine(0, 0);
  const right = affine(1, 0);
  const bottom = affine(0, 1);
  const ux = (right.x - origin.x) / (size - 7);
  const uy = (right.y - origin.y) / (size - 7);
  const vx = (bottom.x - origin.x) / (size - 7);
  const vy = (bottom.y - origin.y) / (size - 7);
  const radius = Math.max(5 * pitch, Math.hypot(right.x - origin.x, right.y - origin.y) * 0.12);
  const left = Math.max(0, Math.floor(expected.x - radius));
  const top = Math.max(0, Math.floor(expected.y - radius));
  const rightEdge = Math.min(image.width - 1, Math.ceil(expected.x + radius));
  const bottomEdge = Math.min(image.height - 1, Math.ceil(expected.y + radius));
  const step = Math.max(1, Math.floor(pitch / 2));
  const candidates = [];
  const black = (x, y) => {
    x = Math.round(x);
    y = Math.round(y);
    return x >= 0 && y >= 0 && x < image.width && y < image.height &&
      image.gray[y * image.width + x] < image.threshold;
  };
  for (let y = top; y <= bottomEdge; y += step) {
    for (let x = left; x <= rightEdge; x += step) {
      if (!black(x, y)) continue;
      let errors = 0;
      for (let row = -2; row <= 2 && errors <= 2; row++) {
        for (let col = -2; col <= 2 && errors <= 2; col++) {
          const dark = Math.abs(row) === 2 || Math.abs(col) === 2 || (row === 0 && col === 0);
          if (black(x + col * ux + row * vx, y + col * uy + row * vy) !== dark) errors++;
        }
      }
      if (errors > 2) continue;
      candidates.push({ x, y, score: errors * pitch * 2 + Math.hypot(x - expected.x, y - expected.y) });
    }
  }
  const result = [];
  for (const candidate of candidates.sort((a, b) => a.score - b.score)) {
    if (result.some(point => Math.hypot(point.x - candidate.x, point.y - candidate.y) < pitch * 2)) continue;
    // Refine the one-module center run to remove sub-module template ambiguity.
    let x1 = candidate.x;
    let x2 = candidate.x;
    let y1 = candidate.y;
    let y2 = candidate.y;
    while (x1 > left && black(x1 - 1, candidate.y)) x1--;
    while (x2 < rightEdge && black(x2 + 1, candidate.y)) x2++;
    while (y1 > top && black(candidate.x, y1 - 1)) y1--;
    while (y2 < bottomEdge && black(candidate.x, y2 + 1)) y2++;
    if (x2 - x1 + 1 > pitch * 2 || y2 - y1 + 1 > pitch * 2) continue;
    result.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
    if (result.length === 4) break;
  }
  return result;
}

/**
 * Decode one normally dark-on-light QR symbol from RGBA pixels. Bounded to
 * 8192 pixels per side and 16 megapixels to keep camera fallback work finite.
 */
function decodeImage(imageData) {
  if (!imageData || typeof imageData !== 'object' ||
    !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height) ||
    imageData.width < 1 || imageData.height < 1 || !imageData.data ||
    imageData.data.length !== imageData.width * imageData.height * 4) return null;
  const { width, height, data } = imageData;
  if (!(data instanceof Uint8Array) && !(data instanceof Uint8ClampedArray) && !Array.isArray(data)) return null;
  if (width > 8192 || height > 8192 || width * height > 16777216) return null;
  const gray = new Uint8Array(width * height);
  const byteData = data instanceof Uint8Array || data instanceof Uint8ClampedArray;
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    if (!byteData) {
      for (let channel = 0; channel < 4; channel++) {
        const value = data[p + channel];
        if (!Number.isFinite(value) || value < 0 || value > 255) return null;
      }
    }
    const alpha = data[p + 3] / 255;
    const value = Math.round(((data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000) * alpha + 255 * (1 - alpha));
    gray[i] = value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (max - min < 40) return null;
  const image = { width, height, gray, threshold: (min + max) / 2 };
  const finders = findFinders(image);
  if (finders.length < 3) return null;
  const triples = [];
  for (let a = 0; a < finders.length; a++) for (let b = a + 1; b < finders.length; b++) for (let c = b + 1; c < finders.length; c++) {
    const points = [finders[a], finders[b], finders[c]];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = points[corner];
      const others = points.filter((_, index) => index !== corner);
      const v1 = { x: others[0].x - vertex.x, y: others[0].y - vertex.y };
      const v2 = { x: others[1].x - vertex.x, y: others[1].y - vertex.y };
      const length1 = Math.hypot(v1.x, v1.y);
      const length2 = Math.hypot(v2.x, v2.y);
      const cosine = (v1.x * v2.x + v1.y * v2.y) / (length1 * length2);
      if (Math.abs(cosine) < 0.35 && Math.abs(length1 - length2) / Math.max(length1, length2) < 0.35) {
        triples.push({ vertex, v1, v2, length: (length1 + length2) / 2,
          module: (vertex.module + others[0].module + others[1].module) / 3 });
      }
    }
  }
  for (const triple of triples.sort((a, b) => b.length - a.length).slice(0, 12)) {
    for (let swap = 0; swap < 2; swap++) {
      const vx = swap ? triple.v2 : triple.v1;
      const vy = swap ? triple.v1 : triple.v2;
      const versions = Array.from({ length: 40 }, (_, index) => index + 1)
        .sort((a, b) => Math.abs(triple.length / (a * 4 + 10) - triple.module) -
          Math.abs(triple.length / (b * 4 + 10) - triple.module));
      for (const version of versions) {
        const size = version * 4 + 17;
        const pitch = triple.length / (size - 7);
        if (Math.abs(pitch - triple.module) > Math.max(1.5, triple.module * 0.45)) continue;
        const affine = (u, v) => ({
          x: triple.vertex.x + vx.x * u + vy.x * v,
          y: triple.vertex.y + vx.y * u + vy.y * v
        });
        const matrix = sampleGrid(image, size, affine);
        const text = matrix ? decodeMatrix(matrix) : null;
        if (text !== null) return text;
        if (version === 1) continue;
        const t = (size - 10) / (size - 7);
        for (const alignment of findAlignment(image, size, affine, pitch)) {
          const projective = projectiveMap([[0, 0], [1, 0], [0, 1], [t, t]],
            [affine(0, 0), affine(1, 0), affine(0, 1), alignment]);
          if (!projective) continue;
          const projected = sampleGrid(image, size, projective);
          const result = projected ? decodeMatrix(projected) : null;
          if (result !== null) return result;
        }
      }
    }
  }
  return null;
}

module.exports = { decodeImage, decodeMatrix };
