import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { PassThrough } from 'node:stream';
import { expectOk, runV0id } from './helpers.js';
import { TerminalCanvasBackend, encodePng } from '../src/v0id/backends/node-gfx.js';
import { TerminalInputBackend } from '../src/v0id/backends/node-input.js';

// ---------------------------------------------------------------------------
// std::io::read_line
// ---------------------------------------------------------------------------

test('read_line suspends the program until a line is supplied', async () => {
  const state = await expectOk(`
    std::io::print("Name? ")
    val name = std::io::read_line()
    std::io::println("Hello, " + name)
    std::io::println("done")
  `, { lines: ['Ada'] });

  assert.deepEqual(state.logs.map(l => l.text), ['Name? ', 'Hello, Ada', 'done']);
});

test('read_line can be called more than once', async () => {
  const state = await expectOk(`
    val a = std::io::read_line("first? ")
    val b = std::io::read_line("second? ")
    std::io::println(a, b)
  `, { lines: ['one', 'two'] });
  assert.match(state.stdout(), /one two/);
});

test('read_number parses numeric input', async () => {
  const state = await expectOk(`
    val n = std::io::read_number("age? ")
    std::io::println("next year:", n + 1)
  `, { lines: ['41'] });
  assert.match(state.stdout(), /next year: 42/);
});

test('read_line returns nil when input is closed', async () => {
  const state = await expectOk(`
    val line = std::io::read_line()
    std::io::println("got:", line)
  `, { lines: [] });
  assert.match(state.stdout(), /got: nil/);
});

test('read_line resumes evaluation of the rest of the program', async () => {
  // The read happens inside a loop nested in a function: the whole call chain
  // has to suspend and resume, not just the top level.
  const state = await expectOk(`
    fn ask(in label: str) -> str :: do
      val answer = std::io::read_line(label)
      return answer
    end
    var collected = []
    loop i in 0..3 :: pass
      collected.push(ask("input " + i + ": "))
    end
    std::io::println(collected)
  `, { lines: ['a', 'b', 'c'] });
  assert.match(state.stdout(), /\[a, b, c\]/);
});

// ---------------------------------------------------------------------------
// gfx backend (Node)
// ---------------------------------------------------------------------------

function makeCanvas(overrides = {}) {
  const stdoutChunks = [];
  const stdout = new PassThrough();
  stdout.isTTY = true;
  stdout.columns = 40;
  stdout.rows = 10;
  stdout.on('data', chunk => stdoutChunks.push(chunk.toString()));

  const canvas = new TerminalCanvasBackend({
    mode: 'ansi',
    log: () => {},
    stdout,
    ...overrides
  });
  return { canvas, stdout, stdoutChunks };
}

test('gfx commands render a real frame into the terminal', () => {
  const { canvas, stdoutChunks } = makeCanvas();
  canvas.handle({ action: 'init', width: 80, height: 40 });
  canvas.handle({ action: 'clear', color: '#0f172a' });
  canvas.handle({ action: 'rect', x: 0, y: 0, w: 40, h: 20, color: '#ff0000', fill: true });
  canvas.handle({ action: 'circle', x: 60, y: 20, r: 5, color: '#00ff00', fill: true });
  canvas.handle({ action: 'line', x1: 0, y1: 39, x2: 79, y2: 0, color: '#0000ff', width: 1 });
  canvas.handle({ action: 'text', str: 'HI', x: 1, y: 1, size: 7, color: '#ffffff' });
  canvas.finish();

  const output = stdoutChunks.join('');
  assert.match(output, /\x1b\[38;2;\d+;\d+;\d+m/); // truecolor foreground
  assert.match(output, /▀/);                        // upper half block pixels
  assert.match(output, /\x1b\[H/);                  // cursor home per frame
  assert.match(output, /\x1b\[\?25l/);              // cursor hidden while drawing
});

test('gfx PNG mode writes decodable PNG files', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-gfx-'));
  const { canvas } = makeCanvas({ mode: 'png', outDir, maxFrames: 3, stdout: null });
  canvas.handle({ action: 'init', width: 64, height: 32 });
  canvas.handle({ action: 'clear', color: '#0f172a' });
  canvas.handle({ action: 'rect', x: 10, y: 5, w: 20, h: 10, color: '#3b82f6', fill: true });
  const files = canvas.finish();

  assert.equal(files.length, 1);
  const bytes = fs.readFileSync(files[0]);
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Decode and verify the pixels that were drawn.
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < bytes.length) {
    const len = bytes.readUInt32BE(pos);
    const type = bytes.toString('ascii', pos + 4, pos + 8);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  assert.equal(width, 64);
  assert.equal(height, 32);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 3 + 1;
  const px = (x, y) => {
    const o = y * stride + 1 + x * 3;
    return [raw[o], raw[o + 1], raw[o + 2]];
  };
  assert.deepEqual(px(20, 10), [59, 130, 246]); // inside the rect
  assert.deepEqual(px(1, 1), [15, 23, 42]);     // background
});

test('encodePng produces a valid image stream', () => {
  const width = 4;
  const height = 2;
  const rgb = new Uint8ClampedArray(width * height * 3).fill(255);
  const png = encodePng(width, height, rgb);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.ok(png.length > 40);
});

test('gfx mode "none" draws nothing', () => {
  const { canvas, stdoutChunks } = makeCanvas({ mode: 'none' });
  canvas.handle({ action: 'init', width: 10, height: 10 });
  canvas.handle({ action: 'clear', color: '#000000' });
  canvas.finish();
  assert.equal(stdoutChunks.join(''), '');
});

test('gfx commands reach the host through the interpreter', async () => {
  const gfx = [];
  await expectOk(`
    gfx::init(100, 50)
    gfx::clear("#123456")
    gfx::rect(1, 2, 3, 4, "#ff0000", true)
    gfx::text("hi", 0, 0, 8, "#ffffff")
  `, { gfx });

  assert.equal(gfx.length, 4);
  assert.equal(gfx[0].action, 'init');
  assert.equal(gfx[2].action, 'rect');
  assert.equal(gfx[3].str, 'hi');
});

// ---------------------------------------------------------------------------
// input backend (Node)
// ---------------------------------------------------------------------------

function makeInputBackend({ tty = true } = {}) {
  const stdin = new PassThrough();
  stdin.isTTY = tty;
  stdin.setRawMode = () => stdin;
  const written = [];
  const stdout = { isTTY: tty, columns: 80, rows: 24, write: (chunk) => written.push(String(chunk)) };
  const backend = new TerminalInputBackend({ stdin, stdout, holdMs: 10_000, log: () => {} });
  return { backend, stdin, written };
}

test('keypresses update the state read by input::is_key_pressed', async () => {
  const { backend, stdin } = makeInputBackend();
  backend.start();

  const state = await runV0id(`std::io::println(input::is_key_pressed("a"))`, { keyStates: backend.keyStates });
  assert.match(state.stdout(), /false/);

  stdin.write('a');
  const after = await runV0id(`std::io::println(input::is_key_pressed("A"))`, { keyStates: backend.keyStates });
  assert.match(after.stdout(), /true/);

  backend.stop();
});

test('arrow keys and space are recognised', async () => {
  const { backend, stdin } = makeInputBackend();
  backend.start();
  stdin.write('\x1b[A'); // up arrow
  stdin.write(' ');

  const state = await runV0id(`
    std::io::println(input::is_key_pressed("up"), input::is_key_pressed("space"))
  `, { keyStates: backend.keyStates });
  assert.match(state.stdout(), /true true/);
  backend.stop();
});

test('SGR mouse events update input::get_mouse', () => {
  const { backend, stdin } = makeInputBackend();
  backend.start();
  stdin.write('\x1b[<0;40;10M'); // left press at column 40, row 10

  const mouse = backend.mouseState.getMouse();
  assert.equal(mouse.clicked, true);
  assert.ok(mouse.x > 0 && mouse.y > 0);

  stdin.write('\x1b[<0;40;10m'); // release
  assert.equal(backend.mouseState.getMouse().clicked, false);
  backend.stop();
});

test('the backend reads whole lines from a TTY', async () => {
  const { backend, stdin, written } = makeInputBackend();
  backend.start();

  const pending = backend.readLine();
  stdin.write('Ada');
  stdin.write('\r');

  assert.equal(await pending, 'Ada');
  assert.ok(written.join('').includes('Ada'));
  backend.stop();
});

test('the backend reads piped input without a TTY', async () => {
  const { backend, stdin } = makeInputBackend({ tty: false });
  backend.start();

  const pending = backend.readLine();
  stdin.write('hello\nworld\n');

  assert.equal(await pending, 'hello');
  assert.equal(await backend.readLine(), 'world');
  backend.stop();
});

test('input::is_key_pressed returns false when no backend is attached', async () => {
  const state = await expectOk(`
    std::io::println(input::is_key_pressed("a"))
    std::io::println(input::get_mouse().clicked)
  `);
  assert.match(state.stdout(), /false\nfalse/);
});
