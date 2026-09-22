import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/v0id/examples.js';
import { runV0id } from './helpers.js';

/** Every bundled example must run to completion without a runtime error. */
for (const example of EXAMPLES) {
  test(`example '${example.id}' runs`, async () => {
    // A couple of canned lines for the examples that ask for input.
    const state = await runV0id(example.code, { lines: ['V0ID-OPERATOR'] });
    assert.equal(state.error, null, state.error ? state.error.message : '');
    assert.ok(state.steps > 0);
  });
}

test('every example declares its metadata', () => {
  const ids = new Set();
  for (const example of EXAMPLES) {
    assert.ok(example.id, 'missing id');
    assert.ok(!ids.has(example.id), `duplicate id ${example.id}`);
    ids.add(example.id);
    assert.ok(example.title.length > 0, `${example.id} has no title`);
    assert.ok(example.category.length > 0, `${example.id} has no category`);
    assert.ok(example.code.includes('std::io'), `${example.id} should print something`);
  }
});

test('the interactive example really waits for input', async () => {
  const interactive = EXAMPLES.find(e => e.id === '10_reduce_interactive_io');
  assert.ok(interactive, 'expected an interactive example');

  const state = await runV0id(interactive.code, { lines: ['Ada'] });
  assert.equal(state.error, null);
  assert.match(state.stdout(), /Operator name\?/);
  assert.match(state.stdout(), /Welcome, Ada/);
});
