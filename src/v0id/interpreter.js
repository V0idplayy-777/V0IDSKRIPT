import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import {
  checkValueType,
  compareSignatures,
  deepClone,
  parseTypeName,
  readOnlyView,
  runtimeTypeName,
  sameIdentity,
  substituteGenerics
} from './types.js';

/**
 * V0IDSKRIPT v4.1 Runtime
 * ============================================================================
 * Changes over v4.0:
 *  - type annotations are enforced at runtime (declarations, assignments,
 *    parameters, return values, record fields, enum payloads, generics)
 *  - parameter modes (in / out / inout / own / ref) have real semantics
 *  - `impl X for Y` is verified against the `contract X` declaration
 *  - `@reduce` is implemented
 *  - `std::io::read_line` really waits for input (evaluation is async)
 *  - sandbox limits are configurable and cover every loop construct
 */

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/** Raised when the host cancels a running program (playground stop button). */
export class V0idAbortError extends Error {
  constructor(message = '[V0IDSKRIPT] Execution aborted.') {
    super(message);
    this.name = 'V0idAbortError';
    this.isAbort = true;
  }
}

export class V0idEnvironment {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
    this.interp = parent ? parent.interp : null;
    this.genericBindings = null;
    this.__fnContext = undefined;
  }

  declare(name, value, isMut = false, type = null, opts = {}) {
    this.vars.set(name, {
      value,
      isMut,
      type: type || null,
      readOnly: !!opts.readOnly,
      mode: opts.mode || null,
      cell: opts.cell || null
    });
    return value;
  }

  /** Walk the scope chain looking for a binding. */
  lookup(name) {
    let scope = this;
    while (scope) {
      if (scope.vars.has(name)) return { binding: scope.vars.get(name), env: scope };
      scope = scope.parent;
    }
    return null;
  }

  has(name) {
    return !!this.lookup(name);
  }

  get(name) {
    const found = this.lookup(name);
    if (!found) {
      throw new Error(`[V0IDSKRIPT Runtime Error] Identifier '${name}' is not defined in current scope.`);
    }
    const binding = found.binding;
    return binding.cell ? binding.cell.get() : binding.value;
  }

  assign(name, value) {
    const found = this.lookup(name);
    if (!found) {
      // Dynamic (undeclared) assignment: create a mutable binding.
      this.vars.set(name, { value, isMut: true, type: null, readOnly: false, cell: null, mode: null });
      return value;
    }

    const binding = found.binding;

    if (binding.readOnly) {
      throw new Error(
        `[V0IDSKRIPT Error] Cannot assign to '${name}': it is bound as an 'in' (read-only) parameter.`
      );
    }
    if (!binding.isMut) {
      throw new Error(
        `[V0IDSKRIPT Error] Cannot assign to '${name}': it was declared with 'val'. Use 'var' for a mutable binding.`
      );
    }
    if (binding.type) {
      const interp = this.interp;
      const generics = interp ? interp.collectGenerics(found.env) : null;
      interp.assertType(value, binding.type, `assignment to '${name}'`, generics);
    }
    if (binding.cell) binding.cell.set(value);
    else binding.value = value;
    return value;
  }
}

// ---------------------------------------------------------------------------
// Sandbox defaults
// ---------------------------------------------------------------------------

export const DEFAULT_LIMITS = {
  maxSteps: 2_000_000,          // evaluated AST nodes for the whole program
  maxLoopIterations: 500_000,   // iterations of a single loop
  maxTotalLoopIterations: 5_000_000, // iterations across every loop in a run
  maxCallDepth: 1000,           // nested V0IDSKRIPT calls
  maxTimeMs: 0                  // wall clock budget, 0 = disabled
};

// ---------------------------------------------------------------------------
// Interpreter
// ---------------------------------------------------------------------------

export class V0idInterpreter {
  constructor({
    onLog,
    onGfxDraw,
    onUIRender,
    onAudioPlay,
    onPromptInput,
    keyStates = {},
    mouseState = {},
    limits = {}
  } = {}) {
    this.onLog = onLog || console.log;
    this.onGfxDraw = onGfxDraw || (() => {});
    this.onUIRender = onUIRender || (() => {});
    this.onAudioPlay = onAudioPlay || (() => {});
    this.onPromptInput = onPromptInput || (() => Promise.resolve(null));
    this.keyStates = keyStates || {};
    this.mouseState = mouseState || {};

    this.globalEnv = new V0idEnvironment();
    this.globalEnv.interp = this;

    // Type registries
    this.recordDefs = new Map();   // name -> { name, fields: [{name, type}] }
    this.enumDefs = new Map();     // name -> { name, variants: Map<variant, {payload: []}> }
    this.contractDefs = new Map(); // name -> { name, methods: [{name, params, returnType}] }
    this.implMethods = new Map();  // targetName -> Map<methodName, fnObj>

    // Runtime state
    this.stepCount = 0;
    this.loopIterations = 0;
    this.callDepth = 0;
    this.startTime = 0;
    this.aborted = false;
    this.abortReason = null;
    this.pendingPrompt = null;

    this.limits = { ...DEFAULT_LIMITS, ...(limits || {}) };

    this.initStandardLibrary();
  }

  // -------------------------------------------------------------------------
  // Sandbox
  // -------------------------------------------------------------------------

  /** Override sandbox limits (0 disables an individual limit). */
  setLimits(limits = {}) {
    Object.assign(this.limits, limits);
    return this.limits;
  }

  /** Abort a running / waiting program (used by the playground stop button). */
  abort(reason = 'Execution aborted.') {
    this.aborted = true;
    this.abortReason = reason;
    if (this.pendingPrompt) {
      const resolve = this.pendingPrompt;
      this.pendingPrompt = null;
      resolve(null);
    }
  }

  checkSandbox() {
    if (this.aborted) throw new V0idAbortError(this.abortReason || 'Execution aborted.');
    const { maxSteps, maxTimeMs } = this.limits;
    if (maxSteps > 0 && this.stepCount > maxSteps) {
      throw new Error(
        `[V0IDSKRIPT Sandbox Limit] Exceeded the evaluation budget of ${maxSteps.toLocaleString()} steps ` +
        `(pass --max-steps N to raise it, or 0 to disable).`
      );
    }
    if (maxTimeMs > 0 && (performance.now() - this.startTime) > maxTimeMs) {
      throw new Error(
        `[V0IDSKRIPT Sandbox Limit] Exceeded the time budget of ${maxTimeMs} ms (pass --timeout MS to raise it).`
      );
    }
  }

  countLoopIteration(count) {
    this.loopIterations++;
    const { maxLoopIterations, maxTotalLoopIterations } = this.limits;
    if (maxLoopIterations > 0 && count > maxLoopIterations) {
      throw new Error(
        `[V0IDSKRIPT Sandbox Limit] A single loop exceeded ${maxLoopIterations.toLocaleString()} iterations ` +
        `(pass --max-loop-iterations N to raise it, or 0 to disable).`
      );
    }
    if (maxTotalLoopIterations > 0 && this.loopIterations > maxTotalLoopIterations) {
      throw new Error(
        `[V0IDSKRIPT Sandbox Limit] Program exceeded ${maxTotalLoopIterations.toLocaleString()} total loop iterations ` +
        `(pass --max-total-loop-iterations N to raise it, or 0 to disable).`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Standard library
  // -------------------------------------------------------------------------

  initStandardLibrary() {
    // 1. Vector & Matrix Math Engine
    const stdMath = {
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      asin: Math.asin,
      acos: Math.acos,
      atan2: Math.atan2,
      sqrt: Math.sqrt,
      abs: Math.abs,
      pow: Math.pow,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      min: Math.min,
      max: Math.max,
      random: Math.random,
      PI: Math.PI,
      TAU: Math.PI * 2,
      lerp: (a, b, t) => a + (b - a) * t,
      clamp: (v, min, max) => Math.max(min, Math.min(max, v)),

      // Vector Math Constructors
      vec2: (x = 0, y = 0) => ({ __isVec2: true, x, y }),
      vec3: (x = 0, y = 0, z = 0) => ({ __isVec3: true, x, y, z }),
      vec4: (x = 0, y = 0, z = 0, w = 1) => ({ __isVec4: true, x, y, z, w }),

      // 3D Matrix Transforms
      mat4_identity: () => [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ],
      mat4_perspective: (fov = 60, aspect = 1.6, near = 0.1, far = 100) => {
        const f = 1.0 / Math.tan((fov * Math.PI / 180) / 2);
        const rangeInv = 1.0 / (near - far);
        return [
          f / aspect, 0, 0, 0,
          0, f, 0, 0,
          0, 0, (near + far) * rangeInv, -1,
          0, 0, near * far * rangeInv * 2, 0
        ];
      }
    };

    // 2. Standard I/O (std::io) — read_line really waits for input now.
    const stdIo = {
      println: (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.onLog({ type: 'stdout', text, newline: true });
        return null;
      },
      print: (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.onLog({ type: 'stdout', text, newline: false });
        return null;
      },
      printf: (fmt, ...args) => {
        // Positional formatting: every specifier consumes the next argument.
        let text = String(fmt);
        let next = 0;
        text = text.replace(/%%|%(\.\d+)?[sdf]/g, (match, precision) => {
          if (match === '%%') return '%';
          const a = args[next++];
          if (a === undefined) return match;
          if (match.endsWith('s')) return this.formatValue(a);
          if (typeof a !== 'number') return String(a);
          if (precision) return a.toFixed(parseInt(precision.slice(1), 10) || 2);
          return String(Math.trunc(a));
        });
        this.onLog({ type: 'stdout', text, newline: true });
        return null;
      },
      warn: (...args) => {
        this.onLog({ type: 'warn', text: args.map(a => this.formatValue(a)).join(' ') });
      },
      error: (...args) => {
        this.onLog({ type: 'error', text: args.map(a => this.formatValue(a)).join(' ') });
      },
      /**
       * Read a whole line. Returns a Promise that resolves once the host
       * supplies a line (terminal stdin or the playground input box).
       */
      read_line: (promptStr = '') => {
        if (promptStr) stdIo.print(promptStr);
        return this.awaitLine(String(promptStr));
      },
      /** Convenience helper: read a line and parse it as a number. */
      read_number: async (promptStr = '') => {
        const line = await stdIo.read_line(promptStr);
        if (line === null || line === undefined) return null;
        const trimmed = String(line).trim();
        if (trimmed === '') return null;
        const num = Number(trimmed);
        return Number.isNaN(num) ? null : num;
      }
    };

    // 3. Collections (HashMap, Queue, Stack)
    const stdCollections = {
      HashMap: () => {
        const map = new Map();
        return {
          __isHashMap: true,
          insert: (k, v) => map.set(k, v),
          get: (k) => map.has(k) ? map.get(k) : null,
          contains_key: (k) => map.has(k),
          remove: (k) => map.delete(k),
          keys: () => Array.from(map.keys()),
          values: () => Array.from(map.values()),
          size: () => map.size
        };
      },
      Queue: () => {
        const arr = [];
        return {
          __isQueue: true,
          enqueue: (item) => arr.push(item),
          dequeue: () => arr.length > 0 ? arr.shift() : null,
          peek: () => arr.length > 0 ? arr[0] : null,
          size: () => arr.length
        };
      }
    };

    // 4. Interactive Keyboard & Mouse Input Engine
    const input = {
      is_key_pressed: (keyName) => {
        const k = normalizeKeyName(keyName);
        if (!k) return false;
        const state = this.keyStates;
        if (state && typeof state.isKeyPressed === 'function') return !!state.isKeyPressed(k);
        return !!(state && state[k]);
      },
      get_mouse: () => {
        const state = this.mouseState;
        if (state && typeof state.getMouse === 'function') return state.getMouse();
        return {
          x: (state && state.x) || 0,
          y: (state && state.y) || 0,
          clicked: !!(state && state.isDown)
        };
      }
    };

    // 5. Hardware Graphics Viewport
    const gfx = {
      init: (w = 800, h = 500) => {
        this.onGfxDraw({ action: 'init', width: w, height: h });
        return { width: w, height: h };
      },
      clear: (color = '#0f172a') => {
        this.onGfxDraw({ action: 'clear', color });
      },
      rect: (x, y, w, h, color = '#3b82f6', fill = true) => {
        this.onGfxDraw({ action: 'rect', x, y, w, h, color, fill });
      },
      circle: (x, y, r, color = '#10b981', fill = true) => {
        this.onGfxDraw({ action: 'circle', x, y, r, color, fill });
      },
      line: (x1, y1, x2, y2, color = '#64748b', width = 1) => {
        this.onGfxDraw({ action: 'line', x1, y1, x2, y2, color, width });
      },
      text: (str, x, y, size = 14, color = '#ffffff') => {
        this.onGfxDraw({ action: 'text', str: String(str), x, y, size, color });
      }
    };

    // 6. Neural Autograd Engine
    const stdAi = {
      Value: (data, label = '') => {
        const node = {
          __isAutograd: true,
          data: parseFloat(data),
          grad: 0.0,
          label,
          _prev: [],
          _op: '',
          backward: function() {
            const topo = [];
            const visited = new Set();
            function buildTopo(v) {
              if (!visited.has(v)) {
                visited.add(v);
                (v._prev || []).forEach(child => buildTopo(child));
                topo.push(v);
              }
            }
            buildTopo(node);
            node.grad = 1.0;
            for (let i = topo.length - 1; i >= 0; i--) {
              const v = topo[i];
              if (v._backward) v._backward();
            }
          }
        };
        return node;
      },
      add: (a, b) => {
        const vA = typeof a === 'object' && a && a.__isAutograd ? a : stdAi.Value(a);
        const vB = typeof b === 'object' && b && b.__isAutograd ? b : stdAi.Value(b);
        const out = stdAi.Value(vA.data + vB.data);
        out._prev = [vA, vB];
        out._op = '+';
        out._backward = () => {
          vA.grad += out.grad;
          vB.grad += out.grad;
        };
        return out;
      },
      mul: (a, b) => {
        const vA = typeof a === 'object' && a && a.__isAutograd ? a : stdAi.Value(a);
        const vB = typeof b === 'object' && b && b.__isAutograd ? b : stdAi.Value(b);
        const out = stdAi.Value(vA.data * vB.data);
        out._prev = [vA, vB];
        out._op = '*';
        out._backward = () => {
          vA.grad += vB.data * out.grad;
          vB.grad += vA.data * out.grad;
        };
        return out;
      },
      relu: (a) => {
        const vA = typeof a === 'object' && a && a.__isAutograd ? a : stdAi.Value(a);
        const out = stdAi.Value(vA.data > 0 ? vA.data : 0);
        out._prev = [vA];
        out._op = 'ReLU';
        out._backward = () => {
          vA.grad += (out.data > 0 ? 1.0 : 0.0) * out.grad;
        };
        return out;
      }
    };

    // 7. Profiler Benchmark
    const stdTime = {
      now: () => performance.now(),
      bench: async (label, fn) => {
        const start = performance.now();
        const raw = await this.applyCallee(fn, [], this.globalEnv);
        const res = raw && raw.__return ? raw.value : raw;
        const elapsed = performance.now() - start;
        this.onLog({
          type: 'bench',
          text: `[PROFILER] '${label}': ${elapsed.toFixed(3)} ms (${(elapsed * 1000).toFixed(1)} µs)`
        });
        return res;
      }
    };

    // Standard Namespaces
    this.globalEnv.declare('std', {
      io: stdIo,
      math: stdMath,
      collections: stdCollections,
      time: stdTime,
      ai: stdAi
    });

    this.globalEnv.declare('sys', stdIo);
    this.globalEnv.declare('math', stdMath);
    this.globalEnv.declare('gfx', gfx);
    this.globalEnv.declare('input', input);
  }

  /** Ask the host for a line of input; returns null if the run is aborted. */
  awaitLine(prompt) {
    return new Promise((resolve) => {
      if (this.aborted) return resolve(null);
      this.pendingPrompt = resolve;
      Promise.resolve()
        .then(() => this.onPromptInput(prompt))
        .then((line) => {
          if (this.pendingPrompt === resolve) this.pendingPrompt = null;
          resolve(line === undefined ? null : line);
        })
        .catch((err) => {
          if (this.pendingPrompt === resolve) this.pendingPrompt = null;
          resolve(null);
          this.onLog({ type: 'error', text: `[V0IDSKRIPT Input Error] ${err && err.message ? err.message : err}` });
        });
    });
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  formatValue(val) {
    if (val === null || val === undefined) return 'nil';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (val.__isVec2) return `Vec2(${val.x.toFixed(2)}, ${val.y.toFixed(2)})`;
    if (val.__isVec3) return `Vec3(${val.x.toFixed(2)}, ${val.y.toFixed(2)}, ${val.z.toFixed(2)})`;
    if (val.__isVec4) return `Vec4(${val.x.toFixed(2)}, ${val.y.toFixed(2)}, ${val.z.toFixed(2)}, ${val.w.toFixed(2)})`;
    if (val.__isTensor) {
      const rows = [];
      for (let r = 0; r < val.rows; r++) {
        const row = [];
        for (let c = 0; c < val.cols; c++) row.push(val.data[r * val.cols + c].toFixed(2));
        rows.push(`[${row.join(', ')}]`);
      }
      return `TensorGrid(${val.rows}x${val.cols})\n${rows.join('\n')}`;
    }
    if (val.__isAutograd) return `Value(data=${val.data.toFixed(4)}, grad=${val.grad.toFixed(4)})`;
    if (val.__isEnumVariant) {
      return val.args.length > 0
        ? `${val.variant}(${val.args.map(a => this.formatValue(a)).join(', ')})`
        : val.variant;
    }
    if (Array.isArray(val)) return `[${val.map(v => this.formatValue(v)).join(', ')}]`;
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch (e) {
        return '[Object]';
      }
    }
    return String(val);
  }

  // -------------------------------------------------------------------------
  // Type checking helpers
  // -------------------------------------------------------------------------

  /** Collect generic bindings visible from `env` (nearest scope wins). */
  collectGenerics(env) {
    let merged = null;
    let scope = env;
    while (scope) {
      if (scope.genericBindings && scope.genericBindings.size) {
        if (!merged) merged = new Map();
        scope.genericBindings.forEach((value, key) => {
          if (!merged.has(key)) merged.set(key, value);
        });
      }
      scope = scope.parent;
    }
    return merged;
  }

  typeContext(env, generics) {
    return {
      records: this.recordDefs,
      enums: this.enumDefs,
      contracts: this.contractDefs,
      impls: this.implMethods,
      generics: generics || (env ? this.collectGenerics(env) : null)
    };
  }

  /** Check `value` against `typeName` and throw a descriptive error on failure. */
  assertType(value, typeName, context, generics) {
    if (!typeName) return value;
    const result = checkValueType(value, typeName, this.typeContext(null, generics), context);
    if (!result.ok) throw new Error(result.message);
    return value;
  }

  /** Non throwing variant used for contract / record bookkeeping. */
  checkType(value, typeName, context, generics) {
    return checkValueType(value, typeName, this.typeContext(null, generics), context);
  }

  // -------------------------------------------------------------------------
  // Entry point
  // -------------------------------------------------------------------------

  async run(code) {
    this.stepCount = 0;
    this.loopIterations = 0;
    this.callDepth = 0;
    this.aborted = false;
    this.startTime = performance.now();

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parseProgram();

    const result = await this.eval(ast, this.globalEnv);
    const endTime = performance.now();

    return {
      result: result && result.__return ? result.value : result,
      executionTimeMs: endTime - this.startTime,
      totalSteps: this.stepCount,
      loopIterations: this.loopIterations
    };
  }

  // -------------------------------------------------------------------------
  // Evaluator (async so blocking input can suspend the program)
  // -------------------------------------------------------------------------

  async eval(node, env) {
    if (!node) return null;
    this.stepCount++;
    this.checkSandbox();

    switch (node.type) {
      case 'Program': {
        let lastVal = null;
        for (const stmt of node.body) {
          lastVal = await this.eval(stmt, env);
        }
        return lastVal;
      }

      case 'DoBlockStatement': {
        const blockEnv = new V0idEnvironment(env);
        let lastVal = null;
        for (const stmt of node.body) {
          lastVal = await this.eval(stmt, blockEnv);
          if (lastVal && (lastVal.__return || lastVal.__break || lastVal.__continue)) return lastVal;
        }
        return lastVal;
      }

      case 'ExpressionStatement':
        return this.eval(node.expression, env);

      case 'VariableDeclaration': {
        const initVal = node.init ? await this.eval(node.init, env) : null;
        if (node.typeAnnotation) {
          this.assertType(initVal, node.typeAnnotation, `'${node.kind} ${node.name}' declaration`, this.collectGenerics(env));
        }
        env.declare(node.name, initVal, node.isMut, node.typeAnnotation);
        return initVal;
      }

      case 'FunctionDeclaration': {
        const fnObj = {
          __isFunction: true,
          name: node.name,
          generics: node.generics || [],
          params: node.params || [],
          returnType: node.returnType || null,
          body: node.body,
          closureEnv: env
        };
        env.declare(node.name, fnObj, false);
        return fnObj;
      }

      case 'RecordDeclaration': {
        const recDef = { __isRecordDef: true, name: node.name, fields: node.fields || [] };
        this.recordDefs.set(node.name, recDef);
        env.declare(node.name, recDef, false);
        return recDef;
      }

      case 'EnumDeclaration': {
        const variants = new Map();
        const enumObj = { __isEnumDef: true, name: node.name, variants: new Map() };
        for (const variant of node.variants) {
          const payload = variant.tupleTypes || [];
          variants.set(variant.name, { payload });
          enumObj.variants.set(variant.name, { payload });
          enumObj[variant.name] = (...args) => this.constructEnum(node.name, variant.name, payload, args);
        }
        this.enumDefs.set(node.name, { name: node.name, variants });
        env.declare(node.name, enumObj, false);
        return enumObj;
      }

      case 'ContractDeclaration': {
        const contractDef = {
          __isContractDef: true,
          name: node.name,
          methods: (node.methods || []).map(m => ({
            name: m.name,
            generics: m.generics || [],
            params: m.params || [],
            returnType: m.returnType || null
          }))
        };
        this.contractDefs.set(node.name, contractDef);
        env.declare(node.name, contractDef, false);
        return contractDef;
      }

      case 'ImplDeclaration':
        return await this.evalImplDeclaration(node, env);

      case 'TensorDeclaration': {
        const arr2d = [];
        for (const row of node.rows) {
          const cells = [];
          for (const cell of row) cells.push(await this.eval(cell, env));
          arr2d.push(cells);
        }
        const rows = arr2d.length;
        const cols = rows > 0 ? arr2d[0].length : 0;
        const data = new Float64Array(rows * cols);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            data[r * cols + c] = arr2d[r][c];
          }
        }
        const tensorObj = { __isTensor: true, rows, cols, data };
        env.declare(node.name, tensorObj, true, 'Tensor');
        return tensorObj;
      }

      case 'IfStatement': {
        const cond = await this.eval(node.condition, env);
        if (this.isTruthy(cond)) {
          return this.eval(node.consequent, env);
        } else if (node.alternate) {
          return this.eval(node.alternate, env);
        }
        return null;
      }

      case 'WhileStatement': {
        let count = 0;
        while (this.isTruthy(await this.eval(node.condition, env))) {
          count++;
          this.countLoopIteration(count);
          const res = await this.eval(node.body, env);
          if (res && res.__return) return res;
          if (res && res.__break) break;
        }
        return null;
      }

      case 'LoopStatement': {
        const iterable = await this.eval(node.iterable, env);
        let count = 0;
        const step = async (value) => {
          count++;
          this.countLoopIteration(count);
          const loopEnv = new V0idEnvironment(env);
          loopEnv.declare(node.variable, value, true);
          const res = await this.eval(node.body, loopEnv);
          if (res && res.__return) return res;
          if (res && res.__break) return { __break: true };
          return null;
        };

        if (Array.isArray(iterable)) {
          for (const item of iterable) {
            const res = await step(item);
            if (res) return res.__return ? res : null;
          }
        } else if (typeof iterable === 'number') {
          for (let i = 0; i < iterable; i++) {
            const res = await step(i);
            if (res) return res.__return ? res : null;
          }
        } else if (iterable && typeof iterable.start === 'number' && typeof iterable.end === 'number') {
          const start = iterable.start;
          const end = iterable.isInclusive ? iterable.end + 1 : iterable.end;
          for (let i = start; i < end; i++) {
            const res = await step(i);
            if (res) return res.__return ? res : null;
          }
        } else if (iterable && iterable.__isTensor) {
          for (let i = 0; i < iterable.rows; i++) {
            const row = [];
            for (let c = 0; c < iterable.cols; c++) row.push(iterable.data[i * iterable.cols + c]);
            const res = await step(row);
            if (res) return res.__return ? res : null;
          }
        }
        return null;
      }

      case 'SelectStatement': {
        const disc = await this.eval(node.discriminant, env);
        for (const arm of node.cases) {
          const matchResult = this.matchPattern(arm.pattern, disc, env);
          if (matchResult.matched) {
            if (arm.guard) {
              const guardEnv = new V0idEnvironment(env);
              Object.keys(matchResult.bindings).forEach(k => guardEnv.declare(k, matchResult.bindings[k], true));
              if (!this.isTruthy(await this.eval(arm.guard, guardEnv))) continue;
            }
            const armEnv = new V0idEnvironment(env);
            Object.keys(matchResult.bindings).forEach(k => armEnv.declare(k, matchResult.bindings[k], true));
            return this.eval(arm.body, armEnv);
          }
        }
        return null;
      }

      case 'ReturnStatement': {
        const val = node.argument ? await this.eval(node.argument, env) : null;
        const ctx = this.enclosingFunctionContext(env);
        if (ctx && ctx.returnType) {
          this.assertType(val, ctx.returnType, `return value of '${ctx.name || 'closure'}'`, ctx.generics);
        }
        return { __return: true, value: val };
      }

      case 'BreakStatement': return { __break: true };
      case 'ContinueStatement': return { __continue: true };

      case 'TernaryExpression': {
        const cond = await this.eval(node.condition, env);
        return this.isTruthy(cond)
          ? this.eval(node.consequent, env)
          : this.eval(node.alternate, env);
      }

      case 'AssignmentExpression': {
        const rightVal = await this.eval(node.right, env);
        if (node.left.type === 'Identifier') {
          env.assign(node.left.name, rightVal);
          return rightVal;
        } else if (node.left.type === 'MemberExpression') {
          const obj = await this.eval(node.left.object, env);
          const prop = node.left.computed ? await this.eval(node.left.property, env) : node.left.property;
          this.setMember(obj, prop, rightVal);
          return rightVal;
        }
        throw new Error("[V0IDSKRIPT Error] Invalid assignment target.");
      }

      case 'BinaryExpression': {
        const left = await this.eval(node.left, env);
        const right = await this.eval(node.right, env);
        switch (node.operator) {
          case '+': {
            if (Array.isArray(left) && Array.isArray(right)) return left.concat(right);
            if (Array.isArray(left)) return left.concat([right]);
            if (Array.isArray(right)) return [left].concat(right);
            return left + right;
          }
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
          case '%': return left % right;
          case '==': return sameIdentity(left, right) || left === right;
          case '!=': return !(sameIdentity(left, right) || left === right);
          case '<': return left < right;
          case '>': return left > right;
          case '<=': return left <= right;
          case '>=': return left >= right;
          case '&&': return this.isTruthy(left) && this.isTruthy(right);
          case '||': return this.isTruthy(left) || this.isTruthy(right);
          default: throw new Error(`[V0IDSKRIPT Error] Unknown binary operator '${node.operator}'`);
        }
      }

      case 'UnaryExpression': {
        const arg = await this.eval(node.argument, env);
        switch (node.operator) {
          case '!': return !this.isTruthy(arg);
          case '-': return -arg;
          default: return arg;
        }
      }

      case 'MatrixMultiplyExpression': {
        const A = await this.eval(node.left, env);
        const B = await this.eval(node.right, env);
        if (!A || !B || !A.__isTensor || !B.__isTensor) throw new Error("[Matrix Error] Operands of '#*' must be Tensors.");
        if (A.cols !== B.rows) throw new Error(`[Matrix Error] Dimension mismatch (${A.rows}x${A.cols}) vs (${B.rows}x${B.cols})`);

        const C_data = new Float64Array(A.rows * B.cols);
        const K = A.cols, M = A.rows, N = B.cols;
        for (let i = 0; i < M; i++) {
          for (let k = 0; k < K; k++) {
            const aik = A.data[i * K + k];
            for (let j = 0; j < N; j++) {
              C_data[i * N + j] += aik * B.data[k * N + j];
            }
          }
        }
        return { __isTensor: true, rows: M, cols: N, data: C_data };
      }

      case 'DotProductExpression': {
        const u = await this.eval(node.left, env);
        const v = await this.eval(node.right, env);
        if (u && v && u.__isVec3 && v.__isVec3) return u.x * v.x + u.y * v.y + u.z * v.z;
        if (u && v && u.__isVec2 && v.__isVec2) return u.x * v.x + u.y * v.y;
        if (Array.isArray(u) && Array.isArray(v)) {
          let sum = 0;
          for (let i = 0; i < Math.min(u.length, v.length); i++) sum += u[i] * v[i];
          return sum;
        }
        throw new Error("[Vector Error] Invalid operands for dot product '<.>'");
      }

      case 'CrossProductExpression': {
        const u = await this.eval(node.left, env);
        const v = await this.eval(node.right, env);
        if (u && v && u.__isVec3 && v.__isVec3) {
          return {
            __isVec3: true,
            x: u.y * v.z - u.z * v.y,
            y: u.z * v.x - u.x * v.z,
            z: u.x * v.y - u.y * v.x
          };
        }
        throw new Error("[Vector Error] Operands for cross product '<x>' must be Vec3.");
      }

      case 'VectorMapExpression': {
        const target = await this.eval(node.target, env);
        const fn = await this.eval(node.callback, env);
        if (Array.isArray(target)) {
          const out = new Array(target.length);
          for (let i = 0; i < target.length; i++) out[i] = await this.applyCallee(fn, [target[i]], env);
          return out;
        }
        return target;
      }

      case 'VectorFilterExpression': {
        const target = await this.eval(node.target, env);
        const fn = await this.eval(node.callback, env);
        if (Array.isArray(target)) {
          const out = [];
          for (const item of target) {
            if (this.isTruthy(await this.applyCallee(fn, [item], env))) out.push(item);
          }
          return out;
        }
        return target;
      }

      case 'VectorReduceExpression': {
        // `values @reduce |acc, x| => acc + x, initial`
        const target = await this.eval(node.target, env);
        const fn = await this.eval(node.callback, env);
        const initial = node.initial ? await this.eval(node.initial, env) : null;
        if (!Array.isArray(target)) {
          throw new Error("[V0IDSKRIPT Error] '@reduce' expects an Array on its left hand side.");
        }
        let acc = initial;
        if (initial === null && target.length > 0) acc = target[0];
        for (let i = (initial === null && target.length > 0) ? 1 : 0; i < target.length; i++) {
          acc = await this.applyCallee(fn, [acc, target[i]], env);
        }
        return acc === undefined ? null : acc;
      }

      case 'PipelineExpression': {
        const leftVal = await this.eval(node.left, env);
        if (node.right.type === 'CallExpression') {
          const callee = await this.eval(node.right.callee, env);
          return this.applyCallee(callee, [], env, node.right.arguments, {
            preValues: [leftVal],
            preNodes: [null]
          });
        }
        const callee = await this.eval(node.right, env);
        return this.applyCallee(callee, [leftVal], env);
      }

      case 'CallExpression': {
        const callee = await this.eval(node.callee, env);
        return this.applyCallee(callee, [], env, node.arguments);
      }

      case 'MemberExpression':
        return this.evalMember(node, env);

      case 'NamespaceExpression': {
        const obj = await this.eval(node.object, env);
        if (!obj) throw new Error("[V0IDSKRIPT Error] Cannot resolve namespace on nil object.");
        const value = obj[node.property];
        return typeof value === 'function' ? value.bind(obj) : value;
      }

      case 'NumericLiteral': return node.value;
      case 'StringLiteral': return node.value;
      case 'BooleanLiteral': return node.value;
      case 'NilLiteral': return null;
      case 'Identifier': return env.get(node.name);

      case 'RangeLiteral':
        return { start: node.start, end: await this.eval(node.end, env), isInclusive: node.isInclusive };

      case 'ObjectLiteral': {
        const obj = {};
        for (const prop of node.properties) {
          obj[prop.key] = await this.eval(prop.value, env);
        }
        return obj;
      }

      case 'ArrayLiteral': {
        const out = new Array(node.elements.length);
        for (let i = 0; i < node.elements.length; i++) out[i] = await this.eval(node.elements[i], env);
        return out;
      }

      case 'StructLiteral':
        return this.evalStructLiteral(node, env);

      case 'ClosureExpression':
        return {
          __isFunction: true,
          name: node.name || null,
          generics: [],
          params: (node.params || []).map(p => ({ name: p, type: null, mode: 'in' })),
          returnType: node.returnType || null,
          body: node.body.type === 'DoBlockStatement'
            ? node.body
            : { type: 'DoBlockStatement', body: [{ type: 'ReturnStatement', argument: node.body }] },
          closureEnv: env
        };

      default:
        throw new Error(`[V0IDSKRIPT Error] Unknown AST Node type '${node.type}'`);
    }
  }

  // -------------------------------------------------------------------------
  // Declarations
  // -------------------------------------------------------------------------

  async evalStructLiteral(node, env) {
    const obj = { __structType: node.structName };
    for (const prop of node.properties) {
      obj[prop.key] = await this.eval(prop.value, env);
    }

    const recordDef = this.recordDefs.get(node.structName);
    if (recordDef) {
      // Structural verification against the record declaration.
      for (const field of recordDef.fields) {
        if (!Object.prototype.hasOwnProperty.call(obj, field.name)) {
          throw new Error(
            `[V0IDSKRIPT Type Error] Record '${node.structName}' requires field '${field.name}'.`
          );
        }
        if (field.type) {
          this.assertType(obj[field.name], field.type, `field '${node.structName}.${field.name}'`);
        }
      }
      for (const key of Object.keys(obj)) {
        if (key === '__structType') continue;
        if (!recordDef.fields.some(f => f.name === key)) {
          throw new Error(
            `[V0IDSKRIPT Type Error] '${key}' is not a field of record '${node.structName}'.`
          );
        }
      }
    }
    return obj;
  }

  constructEnum(enumName, variantName, payloadTypes, args) {
    if (payloadTypes.length !== args.length) {
      throw new Error(
        `[V0IDSKRIPT Type Error] Enum variant '${enumName}::${variantName}' expects ` +
        `${payloadTypes.length} payload value(s) but got ${args.length}.`
      );
    }
    payloadTypes.forEach((type, idx) => {
      if (type) this.assertType(args[idx], type, `payload ${idx} of '${enumName}::${variantName}'`);
    });
    return { __isEnumVariant: true, enumName, variant: variantName, args };
  }

  /** `impl [Contract for] Target :: bind ... end` — now fully verified. */
  async evalImplDeclaration(node, env) {
    const targetName = node.targetName;
    const contractName = node.contractName || null;

    let contract = null;
    if (contractName) {
      contract = this.contractDefs.get(contractName);
      if (!contract) {
        throw new Error(
          `[V0IDSKRIPT Contract Error] Cannot implement unknown contract '${contractName}' for '${targetName}'.`
        );
      }
    }

    let methodMap = this.implMethods.get(targetName);
    if (!methodMap) {
      methodMap = new Map();
      this.implMethods.set(targetName, methodMap);
    }

    const provided = new Map();
    for (const m of node.methods) {
      const fnObj = await this.eval(m, env);
      provided.set(m.name, fnObj);
      methodMap.set(m.name, fnObj);
    }

    if (contract) {
      const missing = [];
      const mismatched = [];
      for (const required of contract.methods) {
        const impl = provided.get(required.name);
        if (!impl) {
          missing.push(required.name);
          continue;
        }
        const reason = compareSignatures(required, impl);
        if (reason) mismatched.push(`'${required.name}' (${reason})`);
      }

      if (missing.length) {
        throw new Error(
          `[V0IDSKRIPT Contract Error] '${targetName}' does not satisfy contract '${contractName}': ` +
          `missing method(s) ${missing.map(m => `'${m}'`).join(', ')}.`
        );
      }
      if (mismatched.length) {
        throw new Error(
          `[V0IDSKRIPT Contract Error] '${targetName}' does not satisfy contract '${contractName}': ` +
          `signature mismatch in ${mismatched.join('; ')}.`
        );
      }
    } else if (!this.recordDefs.has(targetName) && !this.enumDefs.has(targetName)) {
      this.onLog({
        type: 'warn',
        text: `[V0IDSKRIPT] impl block targets '${targetName}', which is not a declared record or enum.`
      });
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Members, records and methods
  // -------------------------------------------------------------------------

  async evalMember(node, env) {
    const obj = await this.eval(node.object, env);
    if (obj === null || obj === undefined) throw new Error("[V0IDSKRIPT Error] Cannot read property of nil.");
    const prop = node.computed ? await this.eval(node.property, env) : node.property;

    // Impl methods bound to a record instance.
    if (obj && obj.__structType) {
      const typeMethods = this.implMethods.get(obj.__structType);
      if (typeMethods && typeMethods.has(prop)) {
        return {
          __isFunction: true,
          __isMethodCall: true,
          name: `${obj.__structType}::${prop}`,
          self: obj,
          selfNode: node.object,
          fn: typeMethods.get(prop),
          env
        };
      }
    }

    if (Array.isArray(obj)) {
      if (prop === 'length') return obj.length;
      if (prop === 'map') return (fn) => this.mapArray(obj, fn, env);
      if (prop === 'filter') return (fn) => this.filterArray(obj, fn, env);
      if (prop === 'reduce') return (fn, init) => this.reduceArray(obj, fn, init, env);
      if (prop === 'includes') return (item) => obj.some(v => (sameIdentity(v, item) || v === item));
      if (prop === 'push') return (...items) => obj.push(...items);
      if (prop === 'pop') return () => obj.pop();
      if (prop === 'join') return (sep = ',') => obj.map(v => this.formatValue(v)).join(sep);
      if (prop === 'sum') return () => obj.reduce((a, b) => a + b, 0);
      if (prop === 'reverse') return () => obj.reverse();
      if (prop === 'sort') return () => obj.sort((a, b) => a - b);
    }

    if (typeof obj === 'string') {
      if (prop === 'length') return obj.length;
      if (prop === 'to_upper') return () => obj.toUpperCase();
      if (prop === 'to_lower') return () => obj.toLowerCase();
      if (prop === 'split') return (sep = '') => obj.split(sep);
      if (prop === 'includes') return (sub) => obj.includes(sub);
    }

    const value = obj[prop];
    if (typeof value === 'function') {
      if (obj.__isEnumDef) return value; // enum constructors must not be rebound
      return value.bind(obj);
    }
    return value;
  }

  /** Typed member write used by assignments and by `ref`/`inout` cells. */
  setMember(obj, prop, value) {
    if (obj === null || obj === undefined) {
      throw new Error("[V0IDSKRIPT Error] Cannot write property of nil.");
    }
    if (obj && obj.__structType) {
      const recordDef = this.recordDefs.get(obj.__structType);
      if (recordDef) {
        const field = recordDef.fields.find(f => f.name === prop);
        if (!field) {
          throw new Error(
            `[V0IDSKRIPT Type Error] '${prop}' is not a field of record '${obj.__structType}'.`
          );
        }
        if (field.type) this.assertType(value, field.type, `field '${obj.__structType}.${prop}'`);
      }
    }
    obj[prop] = value;
    return value;
  }

  async mapArray(arr, fn, env) {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = await this.applyCallee(fn, [arr[i]], env);
    return out;
  }

  async filterArray(arr, fn, env) {
    const out = [];
    for (const item of arr) {
      if (this.isTruthy(await this.applyCallee(fn, [item], env))) out.push(item);
    }
    return out;
  }

  async reduceArray(arr, fn, init, env) {
    let acc = init;
    let start = 0;
    if (acc === undefined || acc === null) {
      if (arr.length === 0) return null;
      acc = arr[0];
      start = 1;
    }
    for (let i = start; i < arr.length; i++) {
      acc = await this.applyCallee(fn, [acc, arr[i]], env);
    }
    return acc === undefined ? null : acc;
  }

  // -------------------------------------------------------------------------
  // Calls & parameter modes
  // -------------------------------------------------------------------------

  /**
   * @param {*} callee              function value (native, V0id function or method)
   * @param {Array} argValues       already evaluated arguments
   * @param {V0idEnvironment} env   environment used to evaluate remaining args / lvalues
   * @param {Array|null} argNodes   AST nodes for the arguments (enables out/inout/ref)
   * @param {object} opts           { preValues, preNodes } values already bound to the
   *                                leading parameters (pipeline head, method receiver)
   */
  async applyCallee(callee, argValues = [], env = this.globalEnv, argNodes = null, opts = {}) {
    const preValues = opts.preValues || [];
    const preNodes = opts.preNodes || [];

    if (typeof callee === 'function') {
      const evaluated = (argNodes && argNodes.length) ? await this.evalAll(argNodes, env) : (argValues || []);
      const values = [...preValues, ...evaluated];
      const result = callee(...values);
      return (result && typeof result.then === 'function') ? await result : result;
    }

    if (callee && callee.__isMethodCall) {
      // The receiver is bound to parameter 0; the call's own nodes follow it.
      return this.applyCallee(callee.fn, [], callee.env, argNodes, {
        preValues: [callee.self],
        preNodes: [callee.selfNode]
      });
    }

    if (callee && callee.__isFunction) {
      let values;
      let nodes = null;
      if (argNodes && argNodes.length) {
        // Arguments are evaluated lazily by callFunction: `out` parameters are
        // write-only slots, so their argument expression is never evaluated.
        values = [...preValues];
        nodes = [...preNodes, ...argNodes];
      } else {
        values = [...preValues, ...(argValues || [])];
        if (preNodes.length) nodes = preNodes;
      }
      return this.callFunction(callee, values, nodes, env);
    }

    throw new Error("[V0IDSKRIPT Error] Attempted to invoke a non-callable value.");
  }

  /** Evaluate a list of argument nodes left to right. */
  async evalAll(nodes, env) {
    const out = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) out[i] = await this.eval(nodes[i], env);
    return out;
  }

  /** Nearest enclosing function context (used for return type checks). */
  enclosingFunctionContext(env) {
    let scope = env;
    while (scope) {
      if (scope.__fnContext !== undefined) return scope.__fnContext;
      scope = scope.parent;
    }
    return null;
  }

  async callFunction(fnObj, argValues, argNodes, callerEnv) {
    const params = fnObj.params || [];
    const argCount = Math.max(argValues.length, argNodes ? argNodes.length : 0);

    if (argCount !== params.length) {
      throw new Error(
        `[V0IDSKRIPT Error] '${fnObj.name || 'closure'}' expects ${params.length} argument(s) but got ${argCount}.`
      );
    }

    // --- evaluate incoming arguments (`out` slots have no incoming value) ---
    const incoming = [];
    for (let i = 0; i < params.length; i++) {
      const mode = params[i].mode || 'in';
      const node = argNodes ? argNodes[i] : null;
      if (mode === 'out') {
        incoming.push(undefined);
        continue;
      }
      incoming.push(i < argValues.length ? argValues[i] : (node ? await this.eval(node, callerEnv) : null));
    }

    // --- generic inference -------------------------------------------------
    let generics = null;
    if (fnObj.generics && fnObj.generics.length) {
      generics = new Map();
      for (const g of fnObj.generics) generics.set(g, null);
      for (let i = 0; i < params.length; i++) {
        const declared = params[i].type;
        if (!declared) continue;
        const parsed = parseTypeName(declared);
        if (!parsed) continue;
        const value = incoming[i];
        const bind = (name, inferred) => {
          if (generics.has(name) && generics.get(name) === null && inferred && inferred !== 'nil') {
            generics.set(name, inferred);
          }
        };
        if (generics.has(parsed.base) && generics.get(parsed.base) === null) {
          bind(parsed.base, runtimeTypeName(value));
        }
        if (parsed.base === 'Array' && parsed.args && parsed.args[0]) {
          const inner = parsed.args[0];
          if (generics.has(inner.base) && generics.get(inner.base) === null && Array.isArray(value) && value.length) {
            bind(inner.base, runtimeTypeName(value[0]));
          }
        }
      }
    }

    const fnEnv = new V0idEnvironment(fnObj.closureEnv);
    fnEnv.genericBindings = generics;
    fnEnv.__fnContext = {
      name: fnObj.name || 'closure',
      returnType: fnObj.returnType ? substituteGenerics(fnObj.returnType, generics) : null,
      generics
    };

    // --- bind parameters according to their mode ---------------------------
    const writeBacks = [];
    for (let i = 0; i < params.length; i++) {
      const param = params[i];
      const mode = param.mode || 'in';
      const declaredType = param.type ? substituteGenerics(param.type, generics) : null;
      const node = argNodes ? argNodes[i] : null;
      const context = `parameter '${param.name}' of '${fnObj.name || 'closure'}'`;

      // `out` parameters start empty; every other mode uses the incoming value.
      const valueFor = async () => (mode === 'out') ? null : incoming[i];

      switch (mode) {
        case 'in': {
          let value = await valueFor();
          if (declaredType) this.assertType(value, declaredType, context, generics);
          value = readOnlyView(value);
          fnEnv.declare(param.name, value, false, declaredType, { readOnly: true, mode });
          break;
        }
        case 'own': {
          let value = await valueFor();
          if (declaredType) this.assertType(value, declaredType, context, generics);
          value = deepClone(value);
          fnEnv.declare(param.name, value, true, declaredType, { mode });
          break;
        }
        case 'out': {
          const cell = await this.resolveLValueCell(node, callerEnv, param.name, { create: true });
          fnEnv.declare(param.name, null, true, declaredType, { mode });
          writeBacks.push({ cell, binding: fnEnv.vars.get(param.name), type: declaredType, name: param.name });
          break;
        }
        case 'inout': {
          const cell = await this.resolveLValueCell(node, callerEnv, param.name, { create: false });
          const incoming = cell.get();
          if (declaredType) this.assertType(incoming, declaredType, context, generics);
          const value = deepClone(incoming);
          fnEnv.declare(param.name, value, true, declaredType, { mode });
          writeBacks.push({ cell, binding: fnEnv.vars.get(param.name), type: declaredType, name: param.name });
          break;
        }
        case 'ref': {
          const cell = await this.resolveLValueCell(node, callerEnv, param.name, { create: false });
          const incoming = cell.get();
          if (declaredType) this.assertType(incoming, declaredType, context, generics);
          fnEnv.declare(param.name, incoming, true, declaredType, { cell, mode });
          break;
        }
        default:
          throw new Error(`[V0IDSKRIPT Error] Unknown parameter mode '${mode}'.`);
      }
    }

    // --- execute -----------------------------------------------------------
    const { maxCallDepth } = this.limits;
    if (maxCallDepth > 0 && this.callDepth >= maxCallDepth) {
      throw new Error(
        `[V0IDSKRIPT Sandbox Limit] Call depth exceeded ${maxCallDepth} frames (infinite recursion?).`
      );
    }

    this.callDepth++;
    let result;
    try {
      result = await this.eval(fnObj.body, fnEnv);
    } finally {
      this.callDepth--;
    }

    // `out` / `inout` parameters are copied back into the caller's storage.
    for (const wb of writeBacks) {
      const value = wb.binding.value;
      if (wb.type) this.assertType(value, wb.type, `output parameter '${wb.name}'`);
      wb.cell.set(value);
    }

    let value = result && result.__return ? result.value : result;

    if (fnEnv.__fnContext.returnType) {
      this.assertType(value, fnEnv.__fnContext.returnType, `return value of '${fnObj.name || 'closure'}'`, generics);
    }

    return value;
  }

  /**
   * Build a read/write cell for an lvalue argument (`out`, `inout`, `ref`).
   * Only identifiers and member expressions are valid storage locations.
   */
  async resolveLValueCell(node, env, paramName, { create = false } = {}) {
    if (!node) {
      throw new Error(
        `[V0IDSKRIPT Error] Parameter '${paramName}' uses a mode that requires a variable argument ` +
        `(pass a variable or a member expression, not an expression).`
      );
    }

    if (node.type === 'Identifier') {
      let found = env.lookup(node.name);
      if (!found) {
        if (!create) {
          throw new Error(
            `[V0IDSKRIPT Error] Cannot pass undefined variable '${node.name}' to an ` +
            `'${paramName}' parameter declared as out/inout/ref.`
          );
        }
        env.declare(node.name, null, true, null);
        found = env.lookup(node.name);
      }
      const binding = found.binding;
      if (binding.readOnly) {
        throw new Error(
          `[V0IDSKRIPT Error] Cannot pass read-only binding '${node.name}' to parameter '${paramName}' (out/inout/ref).`
        );
      }
      if (!binding.isMut) {
        throw new Error(
          `[V0IDSKRIPT Error] Cannot pass immutable binding '${node.name}' to parameter '${paramName}' (out/inout/ref). ` +
          `Declare it with 'var'.`
        );
      }
      return {
        kind: 'identifier',
        name: node.name,
        get: () => (binding.cell ? binding.cell.get() : binding.value),
        set: (value) => {
          if (binding.type) this.assertType(value, binding.type, `assignment to '${node.name}'`);
          if (binding.cell) binding.cell.set(value);
          else binding.value = value;
        }
      };
    }

    if (node.type === 'MemberExpression') {
      const self = this;
      const target = await this.eval(node.object, env);
      const prop = node.computed ? await this.eval(node.property, env) : node.property;
      if (target === null || target === undefined) {
        throw new Error(
          `[V0IDSKRIPT Error] Cannot pass a member of nil to parameter '${paramName}' (out/inout/ref).`
        );
      }
      return {
        kind: 'member',
        get: () => target[prop],
        set: (value) => self.setMember(target, prop, value)
      };
    }

    throw new Error(
      `[V0IDSKRIPT Error] Parameter '${paramName}' declared as out/inout/ref requires a variable or ` +
      `member expression argument.`
    );
  }

  // -------------------------------------------------------------------------
  // Pattern matching
  // -------------------------------------------------------------------------

  matchPattern(pattern, disc, env) {
    void env;
    if (!pattern || pattern.type === 'WildcardPattern') return { matched: true, bindings: {} };
    if (pattern.type === 'LiteralPattern') return { matched: pattern.value === disc, bindings: {} };
    if (pattern.type === 'BindingPattern') return { matched: true, bindings: { [pattern.name]: disc } };
    if (pattern.type === 'EnumPattern') {
      const isVariant = disc && disc.__isEnumVariant &&
        disc.variant === pattern.variant &&
        (!pattern.enumName || disc.enumName === pattern.enumName);
      if (isVariant) {
        const bindings = {};
        pattern.args.forEach((argName, idx) => {
          bindings[argName] = disc.args[idx];
        });
        return { matched: true, bindings };
      }
      return { matched: false, bindings: {} };
    }
    return { matched: false, bindings: {} };
  }

  isTruthy(val) {
    if (val === null || val === undefined || val === false || val === 0) return false;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEY_ALIASES = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  return: 'enter',
  del: 'delete'
};

function normalizeKeyName(keyName) {
  if (keyName === null || keyName === undefined) return null;
  let key = String(keyName).toLowerCase();
  if (key.startsWith('arrow')) key = key.slice(5);
  if (key.startsWith('key')) key = key.slice(3);
  return KEY_ALIASES[key] || key;
}
