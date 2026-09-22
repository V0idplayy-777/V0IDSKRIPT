#!/usr/bin/env node
/**
 * V0IDSKRIPT v4.1 CLI runner
 * ============================================================================
 *   node v0id.js program.v0id [options]
 *
 * Options
 *   --gfx=<auto|ansi|png|none>   rendering target for the `gfx` namespace
 *                                (default: ansi on a TTY, otherwise png files)
 *   --gfx-out=<dir>              where PNG frames are written (./v0id_gfx_out)
 *   --gfx-frames=<n>             maximum number of frames to emit (12)
 *   --no-input                   disable keyboard/mouse capture
 *   --hold-time=<ms>             how long a keypress stays "pressed" (250)
 *   --max-steps=<n>              evaluation budget, 0 disables (2000000)
 *   --max-loop-iterations=<n>    per-loop iteration budget, 0 disables (500000)
 *   --max-total-loop-iterations=<n>  aggregate loop budget (5000000)
 *   --max-call-depth=<n>         recursion depth budget (1000)
 *   --timeout=<ms>               wall clock budget, 0 disables
 *   --unlimited                  disable every sandbox limit
 *   --help
 */

import fs from 'fs';
import path from 'path';
import { V0idInterpreter, DEFAULT_LIMITS } from './src/v0id/interpreter.js';
import { TerminalCanvasBackend } from './src/v0id/backends/node-gfx.js';
import { TerminalInputBackend } from './src/v0id/backends/node-input.js';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    file: null,
    gfx: 'auto',
    gfxOut: path.join(process.cwd(), 'v0id_gfx_out'),
    gfxFrames: 12,
    input: true,
    holdTime: 250,
    limits: {}
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--unlimited') {
      options.limits = { maxSteps: 0, maxLoopIterations: 0, maxTotalLoopIterations: 0, maxCallDepth: 0, maxTimeMs: 0 };
    } else if (arg === '--no-input') {
      options.input = false;
    } else if (arg.startsWith('--gfx=')) {
      options.gfx = arg.slice('--gfx='.length);
    } else if (arg.startsWith('--gfx-out=')) {
      options.gfxOut = path.resolve(arg.slice('--gfx-out='.length));
    } else if (arg.startsWith('--gfx-frames=')) {
      options.gfxFrames = Number(arg.slice('--gfx-frames='.length)) || 0;
    } else if (arg.startsWith('--hold-time=')) {
      options.holdTime = Number(arg.slice('--hold-time='.length)) || 250;
    } else if (arg.startsWith('--max-steps=')) {
      options.limits.maxSteps = Number(arg.slice('--max-steps='.length)) || 0;
    } else if (arg.startsWith('--max-loop-iterations=')) {
      options.limits.maxLoopIterations = Number(arg.slice('--max-loop-iterations='.length)) || 0;
    } else if (arg.startsWith('--max-total-loop-iterations=')) {
      options.limits.maxTotalLoopIterations = Number(arg.slice('--max-total-loop-iterations='.length)) || 0;
    } else if (arg.startsWith('--max-call-depth=')) {
      options.limits.maxCallDepth = Number(arg.slice('--max-call-depth='.length)) || 0;
    } else if (arg.startsWith('--timeout=')) {
      options.limits.maxTimeMs = Number(arg.slice('--timeout='.length)) || 0;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option '${arg}'. Run with --help for the list.`);
      process.exit(1);
    } else if (!options.file) {
      options.file = arg;
    }
  }

  return options;
}

function printUsage() {
  console.log(`V0IDSKRIPT v4.1 CLI runner

  node v0id.js <program.v0id> [options]

Options
  --gfx=<auto|ansi|png|none>       rendering target for the \`gfx\` namespace
                                   (default: ansi on a TTY, otherwise png files)
  --gfx-out=<dir>                  where PNG frames are written (./v0id_gfx_out)
  --gfx-frames=<n>                 maximum number of frames to emit (12)
  --no-input                       disable keyboard/mouse capture
  --hold-time=<ms>                 how long a keypress stays "pressed" (250)
  --max-steps=<n>                  evaluation budget, 0 disables (2000000)
  --max-loop-iterations=<n>        per-loop iteration budget, 0 disables (500000)
  --max-total-loop-iterations=<n>  aggregate loop budget, 0 disables (5000000)
  --max-call-depth=<n>             recursion depth budget, 0 disables (1000)
  --timeout=<ms>                   wall clock budget, 0 disables
  --unlimited                      disable every sandbox limit

Examples
  node v0id.js examples/terminal_gfx.v0id --gfx=ansi
  node v0id.js examples/terminal_input.v0id
  echo "Ada" | node v0id.js examples/terminal_input.v0id --gfx=none`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.file) {
    printUsage();
    process.exit(1);
  }

  const filePath = path.resolve(options.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const code = fs.readFileSync(filePath, 'utf-8');

  // --- graphics ------------------------------------------------------------
  const canvas = new TerminalCanvasBackend({
    mode: options.gfx,
    outDir: options.gfxOut,
    maxFrames: options.gfxFrames,
    log: (msg) => console.log(msg)
  });

  // --- input ---------------------------------------------------------------
  let inputBackend = null;
  if (options.input) {
    inputBackend = new TerminalInputBackend({
      holdMs: options.holdTime,
      mouse: true,
      viewport: () => ({ width: canvas.width, height: canvas.height }),
      log: (msg) => console.log(msg),
      onExit: () => process.exit(0)
    });
  }

  const interpreter = new V0idInterpreter({
    onLog: (msg) => {
      const text = msg.text;
      switch (msg.type) {
        case 'error': console.error(`[ERROR] ${text}`); break;
        case 'warn': console.warn(`[WARN] ${text}`); break;
        case 'bench': console.log(`[BENCH] ${text}`); break;
        default:
          if (msg.newline === false) process.stdout.write(text);
          else console.log(text);
      }
    },
    onGfxDraw: (cmd) => canvas.handle(cmd),
    onUIRender: () => {},
    onPromptInput: async (prompt) => {
      if (!inputBackend) return null;
      return inputBackend.readLine(prompt);
    },
    keyStates: inputBackend ? inputBackend.keyStates : {},
    mouseState: inputBackend ? inputBackend.mouseState : {},
    limits: { ...DEFAULT_LIMITS, ...options.limits }
  });

  if (inputBackend) inputBackend.start();

  const cleanup = () => {
    canvas.finish();
    if (inputBackend) inputBackend.stop();
  };

  let cleanedUp = false;
  const cleanupOnce = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    cleanup();
  };

  process.on('SIGINT', () => {
    cleanupOnce();
    process.exit(130);
  });
  process.on('exit', cleanupOnce);

  try {
    const result = await interpreter.run(code);
    let finalVal = result.result;
    if (finalVal && finalVal.__return) finalVal = finalVal.value;

    const files = canvas.finish();
    if (inputBackend) inputBackend.stop();

    console.log(`\n-----------------------------------`);
    console.log(`V0IDSKRIPT Execution Complete!`);
    console.log(`Execution Time: ${result.executionTimeMs.toFixed(3)} ms`);
    console.log(`Total Instructions Executed: ${result.totalSteps}`);
    if (result.loopIterations) console.log(`Loop Iterations: ${result.loopIterations}`);
    if (finalVal !== null && finalVal !== undefined) {
      console.log(`Final Value: ${interpreter.formatValue(finalVal)}`);
    }
    if (files.length) {
      console.log(`Rendered ${files.length} frame(s) to ${options.gfxOut}`);
    }
    // No process.exit(): stdout is a pipe in many shells and exiting early
    // would truncate the buffered output (frames can be large).
    process.exitCode = 0;
  } catch (err) {
    canvas.finish();
    if (inputBackend) inputBackend.stop();
    console.error(`\n[V0IDSKRIPT ERROR] ${err.message}`);
    if (process.env.V0ID_DEBUG === '1' && err.stack) console.error(err.stack);
    process.exitCode = 1;
  }
}

main();
