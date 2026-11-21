// Regenerates the PWA PNG icons from the same design as public/icon.svg.
// Node built-ins only (fs, zlib, path, url). No external dependencies.

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const DESIGN = 512;          // design-space size (icon.svg viewBox)
const RADIUS = 96;           // rounded-square corner radius
const BG = [124, 58, 237];   // #7c3aed
const FG = [255, 255, 255];  // #ffffff
const HALF_STROKE = 29;      // stroke width 58 / 2
const SUPERSAMPLE = 4;       // 4x4 samples per pixel

// The "x" glyph drawn as two thick diagonal strokes: [x1, y1, x2, y2]
const GLYPH_SEGMENTS = [
  [168, 190, 344, 350],
  [344, 190, 168, 350],
];

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

// ---- geometry -------------------------------------------------------------

function insideRoundedRect(x, y) {
  const r = RADIUS;
  const cx = Math.min(Math.max(x, r), DESIGN - r);
  const cy = Math.min(Math.max(y, r), DESIGN - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * vx - px;
  const qy = ay + t * vy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

function inGlyph(x, y) {
  return GLYPH_SEGMENTS.some(
    ([ax, ay, bx, by]) => distToSegment(x, y, ax, ay, bx, by) <= HALF_STROKE
  );
}

// ---- rendering ------------------------------------------------------------

// Returns raw RGBA scanlines, each prefixed by filter byte 0.
function renderIcon(size) {
  const scale = DESIGN / size;
  const stride = 1 + size * 4;
  const out = Buffer.alloc(stride * size);
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y++) {
    out[y * stride] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let inside = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = (x + (sx + 0.5) / SUPERSAMPLE) * scale;
          const py = (y + (sy + 0.5) / SUPERSAMPLE) * scale;
          if (!insideRoundedRect(px, py)) continue;
          inside++;
          const cov = inGlyph(px, py) ? 1 : 0;
          r += BG[0] * (1 - cov) + FG[0] * cov;
          g += BG[1] * (1 - cov) + FG[1] * cov;
          b += BG[2] * (1 - cov) + FG[2] * cov;
        }
      }

      const o = y * stride + 1 + x * 4;
      if (inside > 0) {
        out[o] = Math.round(r / inside);
        out[o + 1] = Math.round(g / inside);
        out[o + 2] = Math.round(b / inside);
        out[o + 3] = Math.round((255 * inside) / samples);
      }
      // else: left as 0,0,0,0 (fully transparent)
    }
  }
  return out;
}

// ---- PNG encoding ---------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, filteredRows) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(filteredRows);

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- main -----------------------------------------------------------------

const targets = [
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
];

for (const { size, file } of targets) {
  const outPath = path.join(publicDir, file);
  const png = encodePng(size, size, renderIcon(size));
  writeFileSync(outPath, png);
  console.log(`${outPath} ${png.length} bytes`);
}
