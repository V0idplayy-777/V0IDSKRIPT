import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectOk, expectRuntimeError, runV0id } from './helpers.js';
import { DEFAULT_LIMITS, V0idInterpreter } from '../src/v0id/interpreter.js';

// ---------------------------------------------------------------------------
// defaults
// ---------------------------------------------------------------------------

test('the sandbox ships with documented defaults', () => {
  assert.equal(DEFAULT_LIMITS.maxSteps, 2_000_000);
  assert.equal(DEFAULT_LIMITS.maxLoopIterations, 500_000);
  assert.equal(DEFAULT_LIMITS.maxCallDepth, 1000);

  const interpreter = new V0idInterpreter({ onLog: () => {} });
  assert.equal(interpreter.limits.maxSteps, DEFAULT_LIMITS.maxSteps);
});

test('limits are configurable per interpreter and can be disabled', async () => {
  // Lowered step budget stops the program.
  const err = await expectRuntimeError(`
    var i = 0
    while (i < 1_000_000) :: pass
      i = i + 1
    end
  `, { limits: { maxSteps: 2_000 } });
  assert.match(err.message, /Exceeded the evaluation budget of 2,000 steps/);
  assert.match(err.message, /--max-steps N/);

  // 0 disables the limit entirely.
  const ok = await expectOk(`
    var i = 0
    while (i < 20_000) :: pass
      i = i + 1
    end
    std::io::println("finished:", i)
  `, { limits: { maxSteps: 0 } });
  assert.match(ok.stdout(), /finished: 20000/);
});

// ---------------------------------------------------------------------------
// every loop construct is covered
// ---------------------------------------------------------------------------

test('while loops are capped', async () => {
  const err = await expectRuntimeError(`
    while (true) :: pass
    end
  `, { limits: { maxLoopIterations: 250 } });
  assert.match(err.message, /A single loop exceeded 250 iterations/);
});

test('loop (for) iteration is capped too', async () => {
  const err = await expectRuntimeError(`
    loop i in 0..10_000_000 :: pass
      val x = i
    end
  `, { limits: { maxLoopIterations: 300 } });
  assert.match(err.message, /A single loop exceeded 300 iterations/);
});

test('loop over an array is capped', async () => {
  const err = await expectRuntimeError(`
    val xs = []
    loop i in 0..10_000 :: pass
      xs.push(i)
    end
    loop item in xs :: pass
      val y = item
    end
  `, { limits: { maxLoopIterations: 10_000, maxTotalLoopIterations: 12_000 } });
  assert.match(err.message, /total loop iterations/);
});

test('nested loops are caught by the aggregate budget', async () => {
  const err = await expectRuntimeError(`
    loop i in 0..1_000 :: pass
      loop j in 0..1_000 :: pass
        val x = i + j
      end
    end
  `, { limits: { maxLoopIterations: 1_000_000, maxTotalLoopIterations: 5_000 } });
  assert.match(err.message, /exceeded 5,000 total loop iterations/);
});

// ---------------------------------------------------------------------------
// recursion, wall clock and abort
// ---------------------------------------------------------------------------

test('runaway recursion hits the call depth guard instead of crashing', async () => {
  const err = await expectRuntimeError(`
    fn f(in n: i32) -> i32 :: do return f(n + 1) end
    f(0)
  `, { limits: { maxCallDepth: 200 } });
  assert.match(err.message, /Call depth exceeded 200 frames/);
});

test('the wall clock budget stops slow programs', async () => {
  const err = await expectRuntimeError(`
    var i = 0
    while (true) :: pass
      i = i + 1
    end
  `, { limits: { maxLoopIterations: 0, maxTimeMs: 50 } });
  assert.match(err.message, /Exceeded the time budget of 50 ms/);
});

test('a running program can be aborted from the host', async () => {
  const logs = [];
  const interpreter = new V0idInterpreter({
    onLog: (msg) => logs.push(msg),
    onGfxDraw: () => {},
    onPromptInput: async () => new Promise((resolve) => setTimeout(() => resolve('typed'), 5)),
    limits: { maxLoopIterations: 0 }
  });

  const promise = interpreter.run(`
    var i = 0
    while (i < 50) :: pass
      i = i + 1
      val line = std::io::read_line("go? ")
      std::io::println("got", line)
    end
    std::io::println("should not reach here")
  `);

  // Let the program reach the first read_line, then abort it.
  await new Promise(resolve => setTimeout(resolve, 30));
  interpreter.abort('stopped by the test');

  await assert.rejects(promise, /stopped by the test/);
  assert.ok(!logs.some(l => l.text.includes('should not reach here')));
});

test('aborting resolves a pending prompt instead of hanging', async () => {
  const logs = [];
  const interpreter = new V0idInterpreter({
    onLog: (msg) => logs.push(msg),
    onGfxDraw: () => {},
    onPromptInput: () => new Promise(() => {}) // never settles on its own
  });

  const promise = interpreter.run(`
    val line = std::io::read_line("name? ")
    std::io::println("line:", line)
  `);

  await new Promise(resolve => setTimeout(resolve, 20));
  interpreter.abort();

  // The pending prompt is released and the program stops at the next step
  // instead of continuing with a bogus value (or hanging forever).
  await assert.rejects(promise, /Execution aborted/);
  assert.ok(!logs.some(l => l.text.startsWith('line:')));
});

// ---------------------------------------------------------------------------
// programs that legitimately need a lot of steps still finish
// ---------------------------------------------------------------------------

test('a heavy but finite program completes inside the default budget', async () => {
  const state = await runV0id(`
    var total = 0
    loop i in 0..2_000 :: pass
      total = total + i
    end
    std::io::println("total:", total)
  `);
  assert.equal(state.error, null);
  assert.match(state.stdout(), /total: 1999000/);
});
