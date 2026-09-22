/**
 * V0IDSKRIPT v4.0 — Type System
 * ============================================================================
 * Runtime type representation, parsing and enforcement.
 *
 * Type annotations used to be parsed-and-ignored documentation. They are now
 * checked: variable declarations, assignments to typed bindings, function
 * parameters, return values, record fields, enum variant payloads and generic
 * parameters are all verified against the values that actually flow through
 * them at runtime.
 *
 * Type names are plain strings so the parser can keep handing them around:
 *
 *   "i32"           primitive
 *   "Array"         container without element type
 *   "Array<f64>"    parameterised container
 *   "str?"          nullable (nil is accepted as well)
 *   "Sphere"        user defined record / enum / contract
 *   "T"             generic parameter (resolved through the call site)
 */

// ---------------------------------------------------------------------------
// Primitive tables
// ---------------------------------------------------------------------------

/** Signed / unsigned integer types with their representable range. */
export const INT_TYPES = {
  i8: { min: -128, max: 127, signed: true },
  i16: { min: -32768, max: 32767, signed: true },
  i32: { min: -2147483648, max: 2147483647, signed: true },
  i64: { min: -9007199254740991, max: 9007199254740991, signed: true },
  u8: { min: 0, max: 255, signed: false },
  u16: { min: 0, max: 65535, signed: false },
  u32: { min: 0, max: 4294967295, signed: false },
  u64: { min: 0, max: 9007199254740991, signed: false }
};

/** Floating point types. Integers widen into these, floats never narrow to ints. */
export const FLOAT_TYPES = { f32: true, f64: true };

/** Convenience aliases accepted in annotations. */
export const TYPE_ALIASES = {
  int: 'i32',
  integer: 'i32',
  long: 'i64',
  short: 'i16',
  byte: 'i8',
  uint: 'u32',
  number: 'f64',
  num: 'f64',
  float: 'f64',
  double: 'f64',
  real: 'f64',
  string: 'str',
  boolean: 'bool',
  char: 'str',
  character: 'str',
  none: 'nil',
  void: 'nil',
  unit: 'nil',
  null: 'nil',
  Nil: 'nil',
  function: 'fn',
  func: 'fn',
  callable: 'fn',
  Callable: 'fn',
  Fn: 'fn',
  object: 'Object',
  Object: 'Object',
  dict: 'Object',
  map: 'HashMap',
  list: 'Array',
  vec: 'Vec3',
  mat4: 'Mat4',
  tensor: 'Tensor'
};

/** Numeric widening: a value of type X may be stored in a slot of type Y. */
const NUMERIC_WIDENING = {
  i8: ['i8', 'i16', 'i32', 'i64', 'f32', 'f64'],
  i16: ['i16', 'i32', 'i64', 'f32', 'f64'],
  i32: ['i32', 'i64', 'f32', 'f64'],
  i64: ['i64', 'f32', 'f64'],
  u8: ['u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64', 'f32', 'f64'],
  u16: ['u16', 'i32', 'u32', 'i64', 'u64', 'f32', 'f64'],
  u32: ['u32', 'i64', 'u64', 'f32', 'f64'],
  u64: ['u64', 'f32', 'f64'],
  f32: ['f32', 'f64'],
  f64: ['f64']
};

/** Runtime type names produced by the interpreter for raw JS values. */
export const RUNTIME_NUMERIC_INT = 'i32';
export const RUNTIME_NUMERIC_FLOAT = 'f64';

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a type annotation string into a structural descriptor.
 * `Array<Array<f64>>?` -> { raw, base: 'Array', args: [ { base: 'Array', args:[{base:'f64'}] } ], nullable: true }
 */
export function parseTypeName(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  let body = text;
  let nullable = false;
  while (body.endsWith('?')) {
    nullable = true;
    body = body.slice(0, -1).trim();
  }

  const lt = body.indexOf('<');
  let base = body;
  let args = [];

  if (lt !== -1 && body.endsWith('>')) {
    base = body.slice(0, lt).trim();
    const inner = body.slice(lt + 1, body.length - 1);
    args = splitTopLevel(inner).map(part => parseTypeName(part)).filter(Boolean);
  }

  return { raw: text, base: normalizeTypeName(base), args, nullable };
}

/** Split `a, b<c, d>` on top level commas only. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

/** Apply the alias table to a bare type name. */
export function normalizeTypeName(name) {
  const trimmed = String(name).trim();
  return TYPE_ALIASES[trimmed] || trimmed;
}

/** Re-serialise a parsed type (used in error messages and substitutions). */
export function typeToString(type) {
  if (!type) return 'any';
  const args = type.args && type.args.length ? `<${type.args.map(typeToString).join(', ')}>` : '';
  return `${type.base}${args}${type.nullable ? '?' : ''}`;
}

/** Replace generic parameter names with the types inferred at the call site. */
export function substituteGenerics(typeName, generics) {
  if (!typeName || !generics || generics.size === 0) return typeName;
  const parsed = parseTypeName(typeName);
  if (!parsed) return typeName;

  let changed = false;
  const args = (parsed.args || []).map(arg => {
    const sub = substituteGenerics(typeToString(arg), generics);
    if (sub !== typeToString(arg)) changed = true;
    return parseTypeName(sub);
  });

  let base = parsed.base;
  // An unbound generic behaves like `any`, so it is left untouched.
  if (generics.has(base) && generics.get(base)) {
    base = generics.get(base);
    changed = true;
  }

  if (!changed) return typeName;
  return `${base}${args.length ? `<${args.map(typeToString).join(', ')}>` : ''}${parsed.nullable ? '?' : ''}`;
}

// ---------------------------------------------------------------------------
// Runtime classification
// ---------------------------------------------------------------------------

/** Best-effort runtime type name for any interpreter value. */
export function runtimeTypeName(value) {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'f64';
    return Number.isInteger(value) ? RUNTIME_NUMERIC_INT : RUNTIME_NUMERIC_FLOAT;
  }
  if (typeof value === 'string') return 'str';
  if (typeof value === 'function') return 'fn';
  if (Array.isArray(value)) return 'Array';
  if (value.__isVec2) return 'Vec2';
  if (value.__isVec3) return 'Vec3';
  if (value.__isVec4) return 'Vec4';
  if (value.__isTensor) return 'Tensor';
  if (value.__isAutograd) return 'Value';
  if (value.__isEnumVariant) return value.enumName || 'enum';
  if (value.__isFunction) return 'fn';
  if (value.__structType) return value.__structType;
  if (typeof value === 'object') {
    if (typeof value.insert === 'function' && typeof value.contains_key === 'function') return 'HashMap';
    if (typeof value.enqueue === 'function' && typeof value.dequeue === 'function') return 'Queue';
    return 'Object';
  }
  return 'any';
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

const MAX_SAMPLED_ELEMENTS = 64;
const EXHAUSTIVE_ELEMENT_LIMIT = 128;

/**
 * Check a runtime value against a declared type.
 *
 * @param {*} value     the runtime value
 * @param {string} typeName declared annotation (may be null -> always ok)
 * @param {object} ctx  { records, enums, contracts, impls, generics }
 * @param {string} context human readable description used in the error
 * @returns {{ ok: boolean, message: string|null, expected: string, actual: string }}
 */
export function checkValueType(value, typeName, ctx = {}, context = 'value') {
  const declared = parseTypeName(typeName);
  const actual = runtimeTypeName(value);

  if (!declared) return { ok: true, message: null, expected: 'any', actual };
  if (declared.base === 'any') return { ok: true, message: null, expected: 'any', actual };

  if (declared.nullable && (value === null || value === undefined)) {
    return { ok: true, message: null, expected: typeToString(declared), actual };
  }

  // Generic parameters: unresolved generics behave like `any`, resolved ones
  // are substituted by the caller before we get here.
  const generics = ctx.generics instanceof Map ? ctx.generics : null;
  if (generics && generics.has(declared.base)) {
    const bound = generics.get(declared.base);
    if (!bound) return { ok: true, message: null, expected: 'any', actual };
    return checkValueType(value, bound + (declared.nullable ? '?' : ''), ctx, context);
  }

  if (value === null || value === undefined) {
    if (declared.base === 'nil') return { ok: true, message: null, expected: 'nil', actual };
    return fail(context, typeToString(declared), actual, 'nil is not assignable');
  }

  if (declared.base === 'nil') return fail(context, 'nil', actual);

  // --- numeric -------------------------------------------------------------
  if (FLOAT_TYPES[declared.base]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(context, typeToString(declared), actual);
    return pass(typeToString(declared), actual);
  }

  if (INT_TYPES[declared.base]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(context, typeToString(declared), actual);
    if (!Number.isInteger(value)) {
      return fail(context, typeToString(declared), actual,
        `${value} is not an integer (declare the slot as f32/f64 to store fractional numbers)`);
    }
    const range = INT_TYPES[declared.base];
    if (value < range.min || value > range.max) {
      return fail(context, typeToString(declared), actual, `${value} is outside the range of ${declared.base}`);
    }
    return pass(typeToString(declared), actual);
  }

  // --- simple primitives ---------------------------------------------------
  if (declared.base === 'bool') return typeof value === 'boolean' ? pass('bool', actual) : fail(context, 'bool', actual);
  if (declared.base === 'str') return typeof value === 'string' ? pass('str', actual) : fail(context, 'str', actual);
  if (declared.base === 'fn') {
    return (typeof value === 'function' || (value && value.__isFunction)) ? pass('fn', actual) : fail(context, 'fn', actual);
  }

  // --- containers ----------------------------------------------------------
  if (declared.base === 'Array') {
    if (!Array.isArray(value)) return fail(context, 'Array', actual);
    const elementType = declared.args && declared.args[0] ? typeToString(declared.args[0]) : null;
    if (elementType) {
      const sample = sampleIndices(value.length);
      for (const idx of sample) {
        const res = checkValueType(value[idx], elementType, ctx, `element ${idx} of ${context}`);
        if (!res.ok) return res;
      }
    }
    return pass('Array', actual);
  }

  if (declared.base === 'Mat4') {
    if (!Array.isArray(value)) return fail(context, 'Mat4', actual);
    return pass('Mat4', actual);
  }

  // --- engine built-ins ----------------------------------------------------
  if (declared.base === 'Vec2') return value.__isVec2 ? pass('Vec2', actual) : fail(context, 'Vec2', actual);
  if (declared.base === 'Vec3') return value.__isVec3 ? pass('Vec3', actual) : fail(context, 'Vec3', actual);
  if (declared.base === 'Vec4') return value.__isVec4 ? pass('Vec4', actual) : fail(context, 'Vec4', actual);
  if (declared.base === 'Tensor') return value.__isTensor ? pass('Tensor', actual) : fail(context, 'Tensor', actual);
  if (declared.base === 'Value') return value.__isAutograd ? pass('Value', actual) : fail(context, 'Value', actual);
  if (declared.base === 'Object' || declared.base === 'HashMap' || declared.base === 'Queue') {
    return typeof value === 'object' ? pass(declared.base, actual) : fail(context, declared.base, actual);
  }

  // --- user defined types --------------------------------------------------
  const records = ctx.records;
  const enums = ctx.enums;
  const contracts = ctx.contracts;

  if (records && records.has(declared.base)) return checkRecord(value, declared, records.get(declared.base), ctx, context);
  if (enums && enums.has(declared.base)) return checkEnum(value, declared, enums.get(declared.base), ctx, context);
  if (contracts && contracts.has(declared.base)) return checkContract(value, declared.base, ctx, context);

  // Unknown type name: reported as an error so typos surface immediately.
  return {
    ok: false,
    expected: typeToString(declared),
    actual,
    message: `[V0IDSKRIPT Type Error] Unknown type '${declared.base}' in ${context} (no record, enum or contract with that name is declared).`
  };
}

function checkRecord(value, declared, recordDef, ctx, context) {
  if (!value || typeof value !== 'object' || value.__structType !== declared.base) {
    return fail(context, declared.base, runtimeTypeName(value));
  }
  for (const field of recordDef.fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field.name)) {
      return {
        ok: false,
        expected: declared.base,
        actual: runtimeTypeName(value),
        message: `[V0IDSKRIPT Type Error] Record '${declared.base}' is missing field '${field.name}' in ${context}.`
      };
    }
    if (field.type) {
      const res = checkValueType(value[field.name], field.type, ctx, `field '${declared.base}.${field.name}'`);
      if (!res.ok) return res;
    }
  }
  return pass(declared.base, runtimeTypeName(value));
}

function checkEnum(value, declared, enumDef, ctx, context) {
  if (!value || !value.__isEnumVariant || value.enumName !== declared.base) {
    return fail(context, declared.base, runtimeTypeName(value));
  }
  const variant = enumDef.variants.get(value.variant);
  if (!variant) {
    return {
      ok: false,
      expected: declared.base,
      actual: runtimeTypeName(value),
      message: `[V0IDSKRIPT Type Error] '${value.variant}' is not a declared variant of enum '${declared.base}' in ${context}.`
    };
  }
  for (let i = 0; i < variant.payload.length; i++) {
    const payloadType = variant.payload[i];
    if (!payloadType) continue;
    const res = checkValueType(value.args[i], payloadType, ctx, `payload ${i} of '${declared.base}::${value.variant}'`);
    if (!res.ok) return res;
  }
  return pass(declared.base, runtimeTypeName(value));
}

function checkContract(value, contractName, ctx, context) {
  const contract = ctx.contracts.get(contractName);
  const structType = value && value.__structType;
  if (!structType) {
    return fail(context, contractName, runtimeTypeName(value),
      `only records that 'impl ${contractName}' satisfy this contract`);
  }
  const impls = ctx.impls;
  const registered = impls && impls.get(structType);
  const satisfies = contract.methods.every(m => registered && registered.has(m.name));
  if (!satisfies) {
    return fail(context, contractName, runtimeTypeName(value),
      `record '${structType}' does not implement every method of contract '${contractName}'`);
  }
  return pass(contractName, runtimeTypeName(value));
}

function sampleIndices(length) {
  if (length <= EXHAUSTIVE_ELEMENT_LIMIT) {
    return Array.from({ length }, (_, i) => i);
  }
  const stride = length / MAX_SAMPLED_ELEMENTS;
  const out = [];
  for (let i = 0; i < MAX_SAMPLED_ELEMENTS; i++) out.push(Math.floor(i * stride));
  return out;
}

function pass(expected, actual) {
  return { ok: true, message: null, expected, actual };
}

function fail(context, expected, actual, extra) {
  const detail = extra ? ` — ${extra}` : '';
  return {
    ok: false,
    expected,
    actual,
    message: `[V0IDSKRIPT Type Error] ${context} expects '${expected}' but got '${actual}'${detail}.`
  };
}

/**
 * Is a value of runtime type `from` storable in a slot declared as `to`?
 * Used for numeric widening (i32 -> f64) and `any` slots.
 */
export function isAssignable(from, to) {
  if (!to) return true;
  const target = parseTypeName(to);
  if (!target || target.base === 'any') return true;
  if (target.nullable && from === 'nil') return true;
  if (from === target.base) return true;
  if (NUMERIC_WIDENING[from] && NUMERIC_WIDENING[from].includes(target.base)) return true;
  return false;
}

/**
 * Compare two declared signatures (contract requirement vs impl binding).
 * Returns null when compatible, otherwise a human readable reason.
 */
export function compareSignatures(required, provided) {
  if (required.params.length !== provided.params.length) {
    return `expected ${required.params.length} parameter(s), found ${provided.params.length}`;
  }
  for (let i = 0; i < required.params.length; i++) {
    const a = required.params[i];
    const b = provided.params[i];
    if ((a.mode || 'in') !== (b.mode || 'in')) {
      return `parameter ${i + 1} ('${a.name || b.name}') must use mode '${a.mode || 'in'}' but uses '${b.mode || 'in'}'`;
    }
    const ta = a.type ? typeToString(parseTypeName(a.type)) : null;
    const tb = b.type ? typeToString(parseTypeName(b.type)) : null;
    if (ta && tb && ta !== tb) {
      return `parameter ${i + 1} ('${a.name || b.name}') has type '${tb}' but the contract declares '${ta}'`;
    }
  }
  const ra = required.returnType ? typeToString(parseTypeName(required.returnType)) : null;
  const rb = provided.returnType ? typeToString(parseTypeName(provided.returnType)) : null;
  if (ra && rb && ra !== rb) {
    return `return type is '${rb}' but the contract declares '${ra}'`;
  }
  if (ra && !rb) return `missing return type '${ra}' declared by the contract`;
  return null;
}

// ---------------------------------------------------------------------------
// Value helpers used by the parameter modes
// ---------------------------------------------------------------------------

/** True for values that participate in copy / pass-by-reference semantics. */
export function isHeapValue(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Deep copy used by `own` and `inout` parameters. Functions, enum constructors
 * and host objects are shared, plain data is cloned, cycles are preserved.
 */
export function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value === 'function') return value;
  // Copies must be writable, so `in` views are unwrapped before cloning.
  if (isReadOnlyView(value)) value = unwrapValue(value);
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(deepClone(item, seen));
    return copy;
  }

  if (ArrayBuffer.isView(value)) {
    const copy = new value.constructor(value.length);
    copy.set(value);
    seen.set(value, copy);
    return copy;
  }

  if (value.__isFunction || value.__isMethodCall) return value;

  const copy = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    copy[key] = deepClone(value[key], seen);
  }
  // Preserve the record tag so struct types survive a copy.
  if (value.__structType) copy.__structType = value.__structType;
  return copy;
}

const READ_ONLY_VIEW = Symbol('v0id.readOnlyView');

/**
 * Wrap a value passed as an `in` parameter so the callee cannot write through
 * it. Reads (including nested reads) are forwarded; every mutation attempt
 * raises a runtime error.
 */
export function readOnlyView(value) {
  if (!isHeapValue(value)) return value;
  if (typeof value === 'function') return value;
  if (value[READ_ONLY_VIEW]) return value;
  if (value.__isFunction) return value;

  const handler = {
    get(target, prop, receiver) {
      if (prop === READ_ONLY_VIEW) return true;
      if (prop === '__isReadOnlyView') return true;
      if (prop === '__target') return target;
      const raw = Reflect.get(target, prop, receiver);
      // Bind host methods to the proxy (not the target) so mutating helpers
      // such as Array#push go through the `set` trap and are rejected.
      if (typeof raw === 'function') return raw.bind(receiver);
      if (isHeapValue(raw)) return readOnlyView(raw);
      return raw;
    },
    set(target, prop) {
      throw new Error(
        `[V0IDSKRIPT Error] Cannot write to '${String(prop)}' through an 'in' parameter (read-only borrow).`
      );
    },
    defineProperty(target, prop) {
      throw new Error(
        `[V0IDSKRIPT Error] Cannot define '${String(prop)}' on an 'in' parameter (read-only borrow).`
      );
    },
    deleteProperty(target, prop) {
      throw new Error(
        `[V0IDSKRIPT Error] Cannot delete '${String(prop)}' from an 'in' parameter (read-only borrow).`
      );
    },
    setPrototypeOf() {
      throw new Error("[V0IDSKRIPT Error] Cannot modify the prototype of an 'in' parameter.");
    }
  };

  return new Proxy(value, handler);
}

/** Unwrap a read-only view (used for identity comparisons). */
export function unwrapValue(value) {
  let current = value;
  let guard = 0;
  while (current && typeof current === 'object' && current.__isReadOnlyView === true && guard++ < 32) {
    current = Reflect.get(current, '__target');
    if (current === undefined) break;
  }
  return current === undefined ? value : current;
}

/** Is this value an `in` parameter view? */
export function isReadOnlyView(value) {
  return !!value && typeof value === 'object' && value.__isReadOnlyView === true;
}

/** Strip read-only views from both sides of a comparison. */
export function sameIdentity(a, b) {
  return unwrapValue(a) === unwrapValue(b);
}

/** Modes that require the caller to hand over a storage location. */
export const LVALUE_MODES = new Set(['out', 'inout', 'ref']);
