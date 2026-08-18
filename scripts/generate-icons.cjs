"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function capsuleDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const centerX = Math.max(left + radius, Math.min(right - radius, x));
  const centerY = Math.max(top + radius, Math.min(bottom - radius, y));
  return Math.hypot(x - centerX, y - centerY) <= radius;
}

function render(size) {
  const scale = size / 128;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / scale;
      const py = (y + 0.5) / scale;
      let color = [0, 0, 0, 0];
      if (insideRoundedRect(px, py, 4, 4, 124, 124, 28)) {
        const t = Math.max(0, Math.min(1, (px + py - 30) / 190));
        color = [Math.round(139 + (75 - 139) * t), Math.round(115 + (42 - 115) * t), Math.round(255 + (203 - 255) * t), 255];
      }
      const lines = [[36, 39, 92, 39], [36, 64, 78, 64], [36, 89, 66, 89]];
      if (lines.some(([x1, y1, x2, y2]) => capsuleDistance(px, py, x1, y1, x2, y2) <= 6)) color = [255, 255, 255, 255];
      const dotDistance = Math.hypot(px - 96, py - 89);
      if (dotDistance <= 14.5) color = [23, 60, 44, 255];
      if (dotDistance <= 9.5) color = [85, 230, 155, 255];
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    scanlines[row] = 0;
    pixels.copy(scanlines, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fs.mkdirSync(outputDir, { recursive: true });
for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(outputDir, `icon${size}.png`), render(size));
console.log("Generated Queue Pilot icons: 16, 32, 48, 128");
