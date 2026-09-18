import { Lexer } from './lexer.js';
import { Parser } from './parser.js';

export class V0idEnvironment {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }

  declare(name, value, isMut = false) {
    this.vars.set(name, { value, isMut });
    return value;
  }

  assign(name, value) {
    if (this.vars.has(name)) {
      const binding = this.vars.get(name);
      binding.value = value;
      return value;
    }
    if (this.parent) {
      return this.parent.assign(name, value);
    }
    this.vars.set(name, { value, isMut: true });
    return value;
  }

  get(name) {
    if (this.vars.has(name)) {
      return this.vars.get(name).value;
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`[V0IDSKRIPT Runtime Error] Identifier '${name}' is not defined in current scope.`);
  }
}

export class V0idInterpreter {
  constructor({ onLog, onGfxDraw, onUIRender, onAudioPlay, onPromptInput, keyStates = {}, mouseState = {} }) {
    this.onLog = onLog || console.log;
    this.onGfxDraw = onGfxDraw || (() => {});
    this.onUIRender = onUIRender || (() => {});
    this.onAudioPlay = onAudioPlay || (() => {});
    this.onPromptInput = onPromptInput || (() => Promise.resolve(''));
    this.keyStates = keyStates;
    this.mouseState = mouseState;

    this.globalEnv = new V0idEnvironment();
    this.implMethods = new Map(); // TargetName -> Map<methodName, func>
    this.stepCount = 0;
    this.maxSteps = 2000000;

    this.initStandardLibrary();
  }

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

    // 2. Standard I/O (std::io)
    const stdIo = {
      println: (...args) => {
        const text = args.map(a => this.formatValue(a)).join(' ');
        this.onLog({ type: 'stdout', text });
        return null;
      },
      print: (...args) => stdIo.println(...args),
      printf: (fmt, ...args) => {
        let text = String(fmt);
        args.forEach(a => { text = text.replace('%s', this.formatValue(a)).replace('%d', a).replace('%.2f', typeof a === 'number' ? a.toFixed(2) : a); });
        this.onLog({ type: 'stdout', text });
        return null;
      },
      warn: (...args) => {
        this.onLog({ type: 'warn', text: args.map(a => this.formatValue(a)).join(' ') });
      },
      error: (...args) => {
        this.onLog({ type: 'error', text: args.map(a => this.formatValue(a)).join(' ') });
      },
      read_line: (promptStr = '') => {
        if (promptStr) stdIo.println(promptStr);
        return this.onPromptInput(promptStr);
      }
    };

    // 3. Collections (HashMap, Queue, Stack)
    const stdCollections = {
      HashMap: () => {
        const map = new Map();
        return {
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
        const k = String(keyName).toLowerCase();
        return !!this.keyStates[k];
      },
      get_mouse: () => ({
        x: this.mouseState.x || 0,
        y: this.mouseState.y || 0,
        clicked: !!this.mouseState.isDown
      })
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
        const vA = typeof a === 'object' && a.__isAutograd ? a : stdAi.Value(a);
        const vB = typeof b === 'object' && b.__isAutograd ? b : stdAi.Value(b);
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
        const vA = typeof a === 'object' && a.__isAutograd ? a : stdAi.Value(a);
        const vB = typeof b === 'object' && b.__isAutograd ? b : stdAi.Value(b);
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
        const vA = typeof a === 'object' && a.__isAutograd ? a : stdAi.Value(a);
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
      bench: (label, fn) => {
        const start = performance.now();
        const raw = this.applyCallee(fn, [], this.globalEnv);
        const res = raw && raw.__return ? raw.value : raw;
        const elapsed = performance.now() - start;
        this.onLog({ type: 'bench', text: `[PROFILER] '${label}': ${elapsed.toFixed(3)} ms (${(elapsed * 1000).toFixed(1)} µs)` });
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

  formatValue(val) {
    if (val === null || val === undefined) return 'nil';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (val.__isVec2) return `Vec2(${val.x.toFixed(2)}, ${val.y.toFixed(2)})`;
    if (val.__isVec3) return `Vec3(${val.x.toFixed(2)}, ${val.y.toFixed(2)}, ${val.z.toFixed(2)})`;
    if (val.__isTensor) return `TensorGrid(${val.rows}x${val.cols})`;
    if (val.__isAutograd) return `Value(data=${val.data.toFixed(4)}, grad=${val.grad.toFixed(4)})`;
    if (val.__isEnumVariant) return val.args.length > 0 ? `${val.variant}(${val.args.map(a => this.formatValue(a)).join(', ')})` : val.variant;
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch (e) {
        return '[Object]';
      }
    }
    return String(val);
  }

  run(code) {
    this.stepCount = 0;
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parseProgram();

    const startTime = performance.now();
    const result = this.eval(ast, this.globalEnv);
    const endTime = performance.now();

    return {
      result: result && result.__return ? result.value : result,
      executionTimeMs: endTime - startTime,
      totalSteps: this.stepCount
    };
  }

  eval(node, env) {
    if (!node) return null;
    this.stepCount++;
    if (this.stepCount > this.maxSteps) {
      throw new Error(`[V0IDSKRIPT Security Limit] Exceeded step threshold (${this.maxSteps} steps).`);
    }

    switch (node.type) {
      case 'Program': {
        let lastVal = null;
        for (const stmt of node.body) {
          lastVal = this.eval(stmt, env);
        }
        return lastVal;
      }

      case 'DoBlockStatement': {
        const blockEnv = new V0idEnvironment(env);
        let lastVal = null;
        for (const stmt of node.body) {
          lastVal = this.eval(stmt, blockEnv);
          if (lastVal && lastVal.__return) return lastVal;
          if (lastVal && (lastVal.__break || lastVal.__continue)) return lastVal;
        }
        return lastVal;
      }

      case 'ExpressionStatement': {
        return this.eval(node.expression, env);
      }

      case 'VariableDeclaration': {
        const initVal = node.init ? this.eval(node.init, env) : null;
        env.declare(node.name, initVal, node.isMut);
        return initVal;
      }

      case 'FunctionDeclaration': {
        const fnObj = {
          __isFunction: true,
          name: node.name,
          params: node.params,
          body: node.body,
          closureEnv: env
        };
        env.declare(node.name, fnObj, false);
        return fnObj;
      }

      case 'RecordDeclaration': {
        const recDef = { __isRecordDef: true, name: node.name, fields: node.fields };
        env.declare(node.name, recDef, false);
        return recDef;
      }

      case 'EnumDeclaration': {
        const enumObj = {};
        for (const variant of node.variants) {
          enumObj[variant.name] = (...args) => ({
            __isEnumVariant: true,
            enumName: node.name,
            variant: variant.name,
            args
          });
        }
        env.declare(node.name, enumObj, false);
        return enumObj;
      }

      case 'ContractDeclaration': {
        const contractDef = { __isContractDef: true, name: node.name, methods: node.methods };
        env.declare(node.name, contractDef, false);
        return contractDef;
      }

      case 'ImplDeclaration': {
        let methodMap = this.implMethods.get(node.targetName);
        if (!methodMap) {
          methodMap = new Map();
          this.implMethods.set(node.targetName, methodMap);
        }
        for (const m of node.methods) {
          const fnObj = this.eval(m, env);
          methodMap.set(m.name, fnObj);
        }
        return null;
      }

      case 'TensorDeclaration': {
        const arr2d = node.rows.map(r => r.map(cell => this.eval(cell, env)));
        const rows = arr2d.length;
        const cols = arr2d[0].length;
        const data = new Float64Array(rows * cols);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            data[r * cols + c] = arr2d[r][c];
          }
        }
        const tensorObj = { __isTensor: true, rows, cols, data };
        env.declare(node.name, tensorObj, true);
        return tensorObj;
      }

      case 'IfStatement': {
        const cond = this.eval(node.condition, env);
        if (this.isTruthy(cond)) {
          return this.eval(node.consequent, env);
        } else if (node.alternate) {
          return this.eval(node.alternate, env);
        }
        return null;
      }

      case 'WhileStatement': {
        let count = 0;
        while (this.isTruthy(this.eval(node.condition, env))) {
          count++;
          if (count > 500000) throw new Error("[V0IDSKRIPT Limit] While loop execution safety limit reached.");
          const res = this.eval(node.body, env);
          if (res && res.__return) return res;
          if (res && res.__break) break;
        }
        return null;
      }

      case 'LoopStatement': {
        const iterable = this.eval(node.iterable, env);
        if (Array.isArray(iterable)) {
          for (const item of iterable) {
            const loopEnv = new V0idEnvironment(env);
            loopEnv.declare(node.variable, item, true);
            const res = this.eval(node.body, loopEnv);
            if (res && res.__return) return res;
            if (res && res.__break) break;
          }
        } else if (typeof iterable === 'number') {
          for (let i = 0; i < iterable; i++) {
            const loopEnv = new V0idEnvironment(env);
            loopEnv.declare(node.variable, i, true);
            const res = this.eval(node.body, loopEnv);
            if (res && res.__return) return res;
            if (res && res.__break) break;
          }
        } else if (iterable && typeof iterable.start === 'number' && typeof iterable.end === 'number') {
          const start = iterable.start;
          const end = iterable.isInclusive ? iterable.end + 1 : iterable.end;
          for (let i = start; i < end; i++) {
            const loopEnv = new V0idEnvironment(env);
            loopEnv.declare(node.variable, i, true);
            const res = this.eval(node.body, loopEnv);
            if (res && res.__return) return res;
            if (res && res.__break) break;
          }
        }
        return null;
      }

      case 'SelectStatement': {
        const disc = this.eval(node.discriminant, env);
        for (const arm of node.cases) {
          const matchResult = this.matchPattern(arm.pattern, disc, env);
          if (matchResult.matched) {
            if (arm.guard) {
              const guardEnv = new V0idEnvironment(env);
              Object.keys(matchResult.bindings).forEach(k => guardEnv.declare(k, matchResult.bindings[k], true));
              if (!this.isTruthy(this.eval(arm.guard, guardEnv))) continue;
            }
            const armEnv = new V0idEnvironment(env);
            Object.keys(matchResult.bindings).forEach(k => armEnv.declare(k, matchResult.bindings[k], true));
            return this.eval(arm.body, armEnv);
          }
        }
        return null;
      }

      case 'ReturnStatement': {
        const val = node.argument ? this.eval(node.argument, env) : null;
        return { __return: true, value: val };
      }

      case 'BreakStatement': return { __break: true };
      case 'ContinueStatement': return { __continue: true };

      case 'TernaryExpression': {
        const cond = this.eval(node.condition, env);
        return this.isTruthy(cond) ? this.eval(node.consequent, env) : this.eval(node.alternate, env);
      }

      case 'AssignmentExpression': {
        const rightVal = this.eval(node.right, env);
        if (node.left.type === 'Identifier') {
          env.assign(node.left.name, rightVal);
          return rightVal;
        } else if (node.left.type === 'MemberExpression') {
          const obj = this.eval(node.left.object, env);
          const prop = node.left.computed ? this.eval(node.left.property, env) : node.left.property;
          obj[prop] = rightVal;
          return rightVal;
        }
        throw new Error("[V0IDSKRIPT Error] Invalid assignment target.");
      }

      case 'BinaryExpression': {
        const left = this.eval(node.left, env);
        const right = this.eval(node.right, env);
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
          case '==': return left === right;
          case '!=': return left !== right;
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
        const arg = this.eval(node.argument, env);
        switch (node.operator) {
          case '!': return !this.isTruthy(arg);
          case '-': return -arg;
          default: return arg;
        }
      }

      case 'MatrixMultiplyExpression': { // #* Tensor GEMM Matrix Multiplication
        const A = this.eval(node.left, env);
        const B = this.eval(node.right, env);
        if (!A.__isTensor || !B.__isTensor) throw new Error("[Matrix Error] Operands of '#*' must be Tensors.");
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

      case 'DotProductExpression': { // <.> Vector Dot Product
        const u = this.eval(node.left, env);
        const v = this.eval(node.right, env);
        if (u.__isVec3 && v.__isVec3) return u.x * v.x + u.y * v.y + u.z * v.z;
        if (u.__isVec2 && v.__isVec2) return u.x * v.x + u.y * v.y;
        if (Array.isArray(u) && Array.isArray(v)) {
          let sum = 0;
          for (let i = 0; i < Math.min(u.length, v.length); i++) sum += u[i] * v[i];
          return sum;
        }
        throw new Error("[Vector Error] Invalid operands for dot product '<.>'");
      }

      case 'CrossProductExpression': { // <x> Vector Cross Product
        const u = this.eval(node.left, env);
        const v = this.eval(node.right, env);
        if (u.__isVec3 && v.__isVec3) {
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
        const target = this.eval(node.target, env);
        const fn = this.eval(node.callback, env);
        if (Array.isArray(target)) {
          return target.map(item => this.applyCallee(fn, [item], env));
        }
        return target;
      }

      case 'VectorFilterExpression': {
        const target = this.eval(node.target, env);
        const fn = this.eval(node.callback, env);
        if (Array.isArray(target)) {
          return target.filter(item => this.isTruthy(this.applyCallee(fn, [item], env)));
        }
        return target;
      }

      case 'PipelineExpression': {
        const leftVal = this.eval(node.left, env);
        if (node.right.type === 'CallExpression') {
          const args = [leftVal, ...node.right.arguments.map(a => this.eval(a, env))];
          const callee = this.eval(node.right.callee, env);
          return this.applyCallee(callee, args, env);
        } else {
          const callee = this.eval(node.right, env);
          return this.applyCallee(callee, [leftVal], env);
        }
      }

      case 'CallExpression': {
        const callee = this.eval(node.callee, env);
        const args = node.arguments.map(a => this.eval(a, env));
        return this.applyCallee(callee, args, env);
      }

      case 'MemberExpression': {
        const obj = this.eval(node.object, env);
        if (obj === null || obj === undefined) throw new Error("[V0IDSKRIPT Error] Cannot read property of nil.");
        const prop = node.computed ? this.eval(node.property, env) : node.property;

        // Check if impl method on struct object
        if (obj && obj.__structType) {
          const typeMethods = this.implMethods.get(obj.__structType);
          if (typeMethods && typeMethods.has(prop)) {
            const methodFn = typeMethods.get(prop);
            return (...args) => this.applyCallee(methodFn, [obj, ...args], env);
          }
        }

        if (Array.isArray(obj)) {
          if (prop === 'length') return obj.length;
          if (prop === 'map') return (fn) => obj.map(item => this.applyCallee(fn, [item], env));
          if (prop === 'filter') return (fn) => obj.filter(item => this.isTruthy(this.applyCallee(fn, [item], env)));
          if (prop === 'reduce') return (fn, init) => obj.reduce((acc, item) => this.applyCallee(fn, [acc, item], env), init);
          if (prop === 'includes') return (item) => obj.includes(item);
          if (prop === 'push') return (...items) => obj.push(...items);
          if (prop === 'pop') return () => obj.pop();
        }

        if (typeof obj[prop] === 'function') {
          return obj[prop].bind(obj);
        }
        return obj[prop];
      }

      case 'NamespaceExpression': {
        const obj = this.eval(node.object, env);
        if (!obj) throw new Error("[V0IDSKRIPT Error] Cannot resolve namespace on nil object.");
        return obj[node.property];
      }

      case 'NumericLiteral': return node.value;
      case 'StringLiteral': return node.value;
      case 'BooleanLiteral': return node.value;
      case 'NilLiteral': return null;
      case 'Identifier': return env.get(node.name);

      case 'RangeLiteral': {
        return { start: node.start, end: this.eval(node.end, env), isInclusive: node.isInclusive };
      }

      case 'ObjectLiteral': {
        const obj = {};
        for (const prop of node.properties) {
          obj[prop.key] = this.eval(prop.value, env);
        }
        return obj;
      }

      case 'ArrayLiteral': {
        return node.elements.map(e => this.eval(e, env));
      }

      case 'StructLiteral': {
        const obj = { __structType: node.structName };
        for (const prop of node.properties) {
          obj[prop.key] = this.eval(prop.value, env);
        }
        return obj;
      }

      case 'ClosureExpression': {
        return {
          __isFunction: true,
          params: node.params.map(p => ({ name: p })),
          body: node.body.type === 'DoBlockStatement' ? node.body : { type: 'DoBlockStatement', body: [{ type: 'ReturnStatement', argument: node.body }] },
          closureEnv: env
        };
      }

      default:
        throw new Error(`[V0IDSKRIPT Error] Unknown AST Node type '${node.type}'`);
    }
  }

  matchPattern(pattern, disc, env) {
    if (!pattern || pattern.type === 'WildcardPattern') return { matched: true, bindings: {} };
    if (pattern.type === 'LiteralPattern') return { matched: pattern.value === disc, bindings: {} };
    if (pattern.type === 'BindingPattern') return { matched: true, bindings: { [pattern.name]: disc } };
    if (pattern.type === 'EnumPattern') {
      if (disc && disc.__isEnumVariant && disc.variant === pattern.variant) {
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

  applyCallee(callee, args, currentEnv) {
    if (typeof callee === 'function') {
      return callee(...args);
    }
    if (callee && callee.__isFunction) {
      const fnEnv = new V0idEnvironment(callee.closureEnv);
      callee.params.forEach((param, idx) => {
        fnEnv.declare(param.name, args[idx] !== undefined ? args[idx] : null, true);
      });
      const res = this.eval(callee.body, fnEnv);
      if (res && res.__return) return res.value;
      return res;
    }
    throw new Error("[V0IDSKRIPT Error] Attempted to invoke a non-callable value.");
  }

  isTruthy(val) {
    if (val === null || val === undefined || val === false || val === 0) return false;
    return true;
  }
}
