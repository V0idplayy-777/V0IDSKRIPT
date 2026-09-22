import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'v0id.js');

function runCli(args, { input = '', cwd } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input,
    encoding: 'utf-8',
    cwd: cwd || fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-cli-'))
  });
}

function writeProgram(name, code, dir) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, code);
  return file;
}

test('the CLI runs a program and reports statistics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-cli-'));
  writeProgram('hello.v0id', `
    val x: i32 = 40
    std::io::println("value:", x + 2)
  `, dir);

  const result = runCli(['hello.v0id', '--no-input', '--gfx=none'], { cwd: dir });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /value: 42/);
  assert.match(result.stdout, /V0IDSKRIPT Execution Complete!/);
  assert.match(result.stdout, /Total Instructions Executed: \d+/);
});

test('the CLI surfaces runtime errors with a non zero exit code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-cli-'));
  writeProgram('bad.v0id', `val x: i32 = "nope"`, dir);

  const result = runCli(['bad.v0id', '--no-input', '--gfx=none'], { cwd: dir });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /V0IDSKRIPT ERROR.*Type Error/);
});

test('the CLI reads read_line input from stdin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-cli-'));
  writeProgram('ask.v0id', `
    val name = std::io::read_line("name? ")
    std::io::println("hello " + name)
  `, dir);

  const result = runCli(['ask.v0id', '--gfx=none'], { input: 'Ada\n', cwd: dir });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /name\? Ada/);
  assert.match(result.stdout, /hello Ada/);
});

test('the CLI honours --max-steps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-cli-'));
  writeProgram('spin.v0id', `
    var i = 0
    while (true) :: pass
      i = i + 1
    end
  `, dir);

  const result = runCli(['spin.v0id', '--no-input', '--gfx=none', '--max-steps=5000'], { cwd: dir });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Sandbox Limit.*evaluation budget of 5,000 steps/);
});

test('the CLI renders gfx frames to PNG files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v0id-cli-'));
  writeProgram('draw.v0id', `
    gfx::init(64, 32)
    gfx::clear("#0f172a")
    gfx::rect(0, 0, 32, 16, "#3b82f6", true)
  `, dir);

  const result = runCli(['draw.v0id', '--no-input', '--gfx=png', '--gfx-out=./frames'], { cwd: dir });
  assert.equal(result.status, 0, result.stderr);
  const frames = fs.readdirSync(path.join(dir, 'frames'));
  assert.equal(frames.length, 1);
  assert.match(frames[0], /^v0id_frame_\d+\.png$/);
});

test('the CLI prints usage without arguments', () => {
  const result = runCli([]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /node v0id.js <program.v0id> \[options\]/);
  assert.match(result.stdout, /--max-steps/);
  assert.match(result.stdout, /--gfx=/);
});
