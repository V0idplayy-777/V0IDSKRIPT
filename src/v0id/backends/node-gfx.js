/**
 * V0IDSKRIPT — Node graphics backend
 * ============================================================================
 * Under the Node CLI the `gfx` namespace used to be a no-op because there is
 * no canvas. This backend gives it a real target:
 *
 *   mode 'ansi'  -> renders frames into the terminal using 24-bit colour
 *                   upper-half-block characters (2 vertical pixels per cell)
 *   mode 'png'   -> writes real PNG files to disk (one per rendered frame)
 *   mode 'auto'  -> 'ansi' when stdout is a TTY, otherwise 'png'
 *   mode 'none'  -> disabled
 *
 * The interpreter only ever emits draw commands, so the browser playground and
 * the CLI share the exact same `gfx` surface.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const DEFAULT_BACKGROUND = [15, 23, 42]; // #0f172a

// ---------------------------------------------------------------------------
// 5x7 bitmap font (uppercase; lowercase input is folded)
// ---------------------------------------------------------------------------

const GLYPHS = {
  'A': '01110 10001 10001 11111 10001 10001 10001',
  'B': '11110 10001 10001 11110 10001 10001 11110',
  'C': '01110 10001 10000 10000 10000 10001 01110',
  'D': '11110 10001 10001 10001 10001 10001 11110',
  'E': '11111 10000 10000 11110 10000 10000 11111',
  'F': '11111 10000 10000 11110 10000 10000 10000',
  'G': '01110 10001 10000 10111 10001 10001 01110',
  'H': '10001 10001 10001 11111 10001 10001 10001',
  'I': '11111 00100 00100 00100 00100 00100 11111',
  'J': '00111 00010 00010 00010 00010 10010 01100',
  'K': '10001 10010 10100 11000 10100 10010 10001',
  'L': '10000 10000 10000 10000 10000 10000 11111',
  'M': '10001 11011 10101 10101 10001 10001 10001',
  'N': '10001 11001 10101 10011 10001 10001 10001',
  'O': '01110 10001 10001 10001 10001 10001 01110',
  'P': '11110 10001 10001 11110 10000 10000 10000',
  'Q': '01110 10001 10001 10001 10101 10011 01111',
  'R': '11110 10001 10001 11110 10100 10010 10001',
  'S': '01111 10000 10000 01110 00001 00001 11110',
  'T': '11111 00100 00100 00100 00100 00100 00100',
  'U': '10001 10001 10001 10001 10001 10001 01110',
  'V': '10001 10001 10001 10001 10001 01010 00100',
  'W': '10001 10001 10001 10101 10101 11011 10001',
  'X': '10001 10001 01010 00100 01010 10001 10001',
  'Y': '10001 10001 01010 00100 00100 00100 00100',
  'Z': '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  ';': '00000 01100 01100 00000 01100 00100 01000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00110 00100 00000 00100',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '_': '00000 00000 00000 00000 00000 00000 11111',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '=': '00000 00000 11111 00000 11111 00000 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  '\\': '10000 01000 01000 00100 00010 00010 00001',
  '*': '00000 10101 01110 11111 01110 10101 00000',
  '#': '01010 01010 11111 01010 11111 01010 01010',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '[': '01110 01000 01000 01000 01000 01000 01110',
  ']': '01110 00010 00010 00010 00010 00010 01110',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '|': '00100 00100 00100 00100 00100 00100 00100',
  "'": '00100 00100 00000 00000 00000 00000 00000',
  '"': '01010 01010 00000 00000 00000 00000 00000',
  '@': '01110 10001 10111 10101 10111 10000 01110',
  '$': '00100 01111 10100 01110 00101 11110 00100',
  '&': '01100 10010 10100 01000 10101 10010 01101'
};

const FONT_CACHE = new Map();

function glyphFor(ch) {
  const upper = String(ch).toUpperCase();
  if (FONT_CACHE.has(upper)) return FONT_CACHE.get(upper);
  const spec = GLYPHS[upper] || GLYPHS['?'];
  const rows = spec.split(' ').map(row => row.split('').map(bit => bit === '1'));
  FONT_CACHE.set(upper, rows);
  return rows;
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

const NAMED_COLORS = {
  black: [0, 0, 0], white: [255, 255, 255], red: [239, 68, 68], green: [16, 185, 129],
  blue: [59, 130, 246], yellow: [245, 158, 11], cyan: [34, 211, 238], magenta: [217, 70, 239],
  gray: [100, 116, 139], grey: [100, 116, 139], orange: [249, 115, 22], purple: [168, 85, 247]
};

export function parseColor(color) {
  if (Array.isArray(color)) return color;
  if (typeof color !== 'string') return DEFAULT_BACKGROUND;
  const value = color.trim().toLowerCase();
  if (NAMED_COLORS[value]) return NAMED_COLORS[value];
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  return DEFAULT_BACKGROUND;
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export class TerminalCanvasBackend {
  constructor({
    mode = 'auto',
    outDir = path.join(process.cwd(), 'v0id_gfx_out'),
    maxFrames = 12,
    log = () => {},
    stdout = process.stdout,
    columns = null,
    rows = null
  } = {}) {
    this.requestedMode = mode;
    this.outDir = outDir;
    this.maxFrames = maxFrames;
    this.log = log;
    this.stdout = stdout;
    this.columns = columns;
    this.rows = rows;

    this.width = 800;
    this.height = 500;
    this.buffer = null;
    this.dirty = false;
    this.frameIndex = 0;
    this.writtenFiles = [];
    this.ansiStarted = false;
  }

  get mode() {
    if (this.requestedMode !== 'auto') return this.requestedMode;
    return this.stdout && this.stdout.isTTY ? 'ansi' : 'png';
  }

  /** Called for every `gfx::*` command emitted by the interpreter. */
  handle(cmd) {
    switch (cmd.action) {
      case 'init':
        this.init(cmd.width || 800, cmd.height || 500);
        break;
      case 'clear':
        this.clear(cmd.color);
        break;
      case 'rect':
        this.drawRect(cmd.x, cmd.y, cmd.w, cmd.h, cmd.color, cmd.fill !== false);
        break;
      case 'circle':
        this.drawCircle(cmd.x, cmd.y, cmd.r, cmd.color, cmd.fill !== false);
        break;
      case 'line':
        this.drawLine(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.color, cmd.width || 1);
        break;
      case 'text':
        this.drawText(cmd.str, cmd.x, cmd.y, cmd.size || 14, cmd.color);
        break;
      default:
        break;
    }
  }

  init(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.buffer = new Uint8ClampedArray(this.width * this.height * 3);
    this.fill(DEFAULT_BACKGROUND);
    this.dirty = false;
    this.frameIndex = 0;
    this.log(
      `[gfx] viewport ${this.width}x${this.height} (${this.mode === 'ansi' ? 'terminal ANSI renderer' : this.mode === 'png' ? `PNG frames -> ${this.outDir}` : 'disabled'})`
    );
  }

  clear(color) {
    if (this.buffer && this.dirty) this.flushFrame();
    this.ensureBuffer();
    this.fill(parseColor(color));
    this.dirty = true;
  }

  ensureBuffer() {
    if (!this.buffer) {
      this.buffer = new Uint8ClampedArray(this.width * this.height * 3);
      this.fill(DEFAULT_BACKGROUND);
    }
  }

  fill([r, g, b]) {
    const buf = this.buffer;
    for (let i = 0; i < buf.length; i += 3) {
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }

  setPixel(x, y, [r, g, b]) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const idx = (y * this.width + x) * 3;
    this.buffer[idx] = r;
    this.buffer[idx + 1] = g;
    this.buffer[idx + 2] = b;
    this.dirty = true;
  }

  drawRect(x, y, w, h, color, fill) {
    this.ensureBuffer();
    const rgb = parseColor(color);
    const x0 = Math.round(Math.min(x, x + w));
    const x1 = Math.round(Math.max(x, x + w));
    const y0 = Math.round(Math.min(y, y + h));
    const y1 = Math.round(Math.max(y, y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (!fill && (py !== y0 && py !== y1 - 1 && px !== x0 && px !== x1 - 1)) continue;
        this.setPixel(px, py, rgb);
      }
    }
  }

  drawCircle(cx, cy, radius, color, fill) {
    this.ensureBuffer();
    const rgb = parseColor(color);
    const r = Math.abs(Math.round(radius));
    if (fill) {
      for (let y = -r; y <= r; y++) {
        const span = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
        for (let x = -span; x <= span; x++) this.setPixel(cx + x, cy + y, rgb);
      }
    } else {
      // midpoint circle
      let x = r;
      let y = 0;
      let err = 1 - r;
      while (x >= y) {
        const pts = [[x, y], [y, x], [-x, y], [-y, x], [-x, -y], [-y, -x], [x, -y], [y, -x]];
        for (const [dx, dy] of pts) this.setPixel(cx + dx, cy + dy, rgb);
        y++;
        if (err < 0) err += 2 * y + 1;
        else { x--; err += 2 * (y - x + 1); }
      }
    }
  }

  drawLine(x1, y1, x2, y2, color, width = 1) {
    this.ensureBuffer();
    const rgb = parseColor(color);
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = Math.round(x1);
    let y = Math.round(y1);
    const ex = Math.round(x2);
    const ey = Math.round(y2);
    const thickness = Math.max(1, Math.round(width));
    const offset = Math.floor(thickness / 2);

    for (let guard = 0; guard < 1e7; guard++) {
      for (let oy = -offset; oy <= offset; oy++) {
        for (let ox = -offset; ox <= offset; ox++) this.setPixel(x + ox, y + oy, rgb);
      }
      if (x === ex && y === ey) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  drawText(str, x, y, size = 14, color = '#ffffff') {
    this.ensureBuffer();
    const rgb = parseColor(color);
    const scale = Math.max(1, Math.round((size || 14) / 8));
    let cursorX = Math.round(x);
    for (const ch of String(str)) {
      if (ch === '\n') {
        cursorX = Math.round(x);
        y += 7 * scale + scale;
        continue;
      }
      const glyph = glyphFor(ch);
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (!glyph[row][col]) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              this.setPixel(cursorX + col * scale + sx, Math.round(y) + row * scale + sy, rgb);
            }
          }
        }
      }
      cursorX += (5 * scale) + scale;
    }
  }

  /** Emit the current framebuffer through the active output mode. */
  flushFrame() {
    if (!this.buffer || !this.dirty) return;
    if (this.frameIndex >= this.maxFrames) return;
    this.frameIndex++;

    if (this.mode === 'ansi') this.renderAnsi();
    else if (this.mode === 'png') this.writePng();

    this.dirty = false;
  }

  /** Flush whatever is pending at the end of the program. */
  finish() {
    this.flushFrame();
    if (this.mode === 'ansi' && this.ansiStarted && this.stdout) {
      this.stdout.write('\x1b[0m\n');
    }
    return this.writtenFiles;
  }

  // --- ANSI ---------------------------------------------------------------

  renderAnsi() {
    if (!this.stdout) return;
    const cols = Math.max(8, Math.min(this.columns || this.stdout.columns || 100, 200));
    const rows = Math.max(4, Math.min(this.rows || (this.stdout.rows ? this.stdout.rows - 1 : 30), 80));

    const cellW = this.width / cols;
    const cellH = this.height / (rows * 2);

    let out = '';
    if (!this.ansiStarted) {
      this.ansiStarted = true;
      out += '\x1b[?25l'; // hide cursor
    }
    out += '\x1b[H'; // cursor home

    let lastFg = null;
    let lastBg = null;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const top = this.sample(col * cellW, (row * 2) * cellH, cellW, cellH);
        const bottom = this.sample(col * cellW, (row * 2 + 1) * cellH, cellW, cellH);
        const fg = `38;2;${top[0]};${top[1]};${top[2]}`;
        const bg = `48;2;${bottom[0]};${bottom[1]};${bottom[2]}`;
        if (fg !== lastFg) { out += `\x1b[${fg}m`; lastFg = fg; }
        if (bg !== lastBg) { out += `\x1b[${bg}m`; lastBg = bg; }
        out += '▀';
      }
      out += '\x1b[0m\n';
      lastFg = null;
      lastBg = null;
    }
    this.stdout.write(out);
  }

  sample(startX, startY, w, h) {
    const x0 = Math.max(0, Math.floor(startX));
    const y0 = Math.max(0, Math.floor(startY));
    const x1 = Math.min(this.width, Math.max(x0 + 1, Math.ceil(startX + w)));
    const y1 = Math.min(this.height, Math.max(y0 + 1, Math.ceil(startY + h)));
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = y0; y < y1; y++) {
      const rowOffset = y * this.width * 3;
      for (let x = x0; x < x1; x++) {
        const idx = rowOffset + x * 3;
        r += this.buffer[idx];
        g += this.buffer[idx + 1];
        b += this.buffer[idx + 2];
        count++;
      }
    }
    if (!count) return DEFAULT_BACKGROUND;
    return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
  }

  // --- PNG ----------------------------------------------------------------

  writePng() {
    try {
      if (!fs.existsSync(this.outDir)) fs.mkdirSync(this.outDir, { recursive: true });
      const file = path.join(this.outDir, `v0id_frame_${String(this.frameIndex).padStart(4, '0')}.png`);
      fs.writeFileSync(file, encodePng(this.width, this.height, this.buffer));
      this.writtenFiles.push(file);
      this.log(`[gfx] frame ${this.frameIndex} written to ${file}`);
    } catch (err) {
      this.log(`[gfx] could not write PNG frame: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (truecolour, 8 bit, no filtering)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      raw[pos++] = rgb[idx];
      raw[pos++] = rgb[idx + 1];
      raw[pos++] = rgb[idx + 2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export default TerminalCanvasBackend;
