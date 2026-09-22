import { V0idInterpreter } from '../src/v0id/interpreter.js';

/**
 * Run a V0IDSKRIPT snippet and capture everything it produces.
 *
 * @param {string} code
 * @param {object} options
 *   - lines: array consumed one element at a time by std::io::read_line
 *   - limits: sandbox overrides
 *   - gfx: array that receives every gfx command
 * @returns {Promise<{ logs, gfx, result, error, steps }>}
 */
export async function runV0id(code, { lines = [], gfx = [], limits, keyStates = {}, mouseState = {} } = {}) {
  const logs = [];
  const pending = [...lines];

  const interpreter = new V0idInterpreter({
    onLog: (msg) => logs.push(msg),
    onGfxDraw: (cmd) => gfx.push(cmd),
    onUIRender: () => {},
    onPromptInput: async () => (pending.length ? pending.shift() : null),
    keyStates,
    mouseState,
    limits
  });

  const state = { logs, gfx, result: undefined, error: null, steps: 0 };

  try {
    const res = await interpreter.run(code);
    state.result = res.result;
    state.steps = res.totalSteps;
    state.loopIterations = res.loopIterations;
  } catch (err) {
    state.error = err;
  }

  state.text = () => logs.map(l => l.text).join('\n');
  state.stdout = () => logs.filter(l => l.type === 'stdout').map(l => l.text).join('\n');
  state.interpreter = interpreter;
  return state;
}

/** Assert that the snippet throws, and return the error. */
export async function expectRuntimeError(code, options = {}) {
  const state = await runV0id(code, options);
  if (!state.error) {
    throw new Error(`Expected a runtime error but the program succeeded.\nOutput:\n${state.text()}`);
  }
  return state.error;
}

/** Assert that the snippet runs cleanly, and return the captured state. */
export async function expectOk(code, options = {}) {
  const state = await runV0id(code, options);
  if (state.error) {
    throw new Error(`Expected success but got: ${state.error.message}`);
  }
  return state;
}
