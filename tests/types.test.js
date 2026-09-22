import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectOk, expectRuntimeError } from './helpers.js';
import { checkValueType, parseTypeName, deepClone, readOnlyView } from '../src/v0id/types.js';

// ---------------------------------------------------------------------------
// declarations & assignments
// ---------------------------------------------------------------------------

test('typed declarations accept matching values', async () => {
  const state = await expectOk(`
    val a: i32 = 5
    val b: f64 = 5
    val c: str = "hi"
    val d: bool = true
    val e: Array<i32> = [1, 2, 3]
    std::io::println(a, b, c, d, e)
  `);
  assert.match(state.stdout(), /5 5 hi true \[1, 2, 3\]/);
});

test('typed declarations reject mismatched values', async () => {
  const err = await expectRuntimeError(`val a: i32 = "hello"`);
  assert.match(err.message, /Type Error.*'i32' but got 'str'/);
});

test('assignments to typed bindings are checked', async () => {
  const err = await expectRuntimeError(`
    var a: i32 = 1
    a = "nope"
  `);
  assert.match(err.message, /assignment to 'a' expects 'i32' but got 'str'/);
});

test('integers widen into floats but floats do not narrow into integers', async () => {
  await expectOk(`val a: f64 = 4`);
  const err = await expectRuntimeError(`val a: i32 = 1.5`);
  assert.match(err.message, /is not an integer/);
});

test('integer ranges are enforced', async () => {
  await expectOk(`val b: i8 = 127`);
  const err = await expectRuntimeError(`val b: i8 = 200`);
  assert.match(err.message, /outside the range of i8/);
  const unsigned = await expectRuntimeError(`val b: u8 = -1`);
  assert.match(unsigned.message, /outside the range of u8/);
});

test('nullable types accept nil', async () => {
  const state = await expectOk(`
    val a: str? = nil
    val b: str? = "ok"
    std::io::println(a, b)
  `);
  assert.match(state.stdout(), /nil ok/);

  const err = await expectRuntimeError(`val a: str = nil`);
  assert.match(err.message, /nil is not assignable/);
});

test('val bindings are immutable (var bindings are not)', async () => {
  const err = await expectRuntimeError(`
    val x = 1
    x = 2
  `);
  assert.match(err.message, /declared with 'val'/);

  const ok = await expectOk(`
    var x = 1
    x = 2
    std::io::println(x)
  `);
  assert.match(ok.stdout(), /2/);
});

// ---------------------------------------------------------------------------
// parameters, returns & generics
// ---------------------------------------------------------------------------

test('parameter types are checked on every call', async () => {
  const err = await expectRuntimeError(`
    fn greet(in name: str) :: do std::io::println("hi " + name) end
    greet(42)
  `);
  assert.match(err.message, /parameter 'name' of 'greet' expects 'str' but got 'i32'/);
});

test('return types are checked', async () => {
  await expectOk(`
    fn f() -> i32 :: do return 42 end
    std::io::println(f())
  `);
  const err = await expectRuntimeError(`
    fn f() -> i32 :: do return "no" end
    f()
  `);
  assert.match(err.message, /return value of 'f' expects 'i32' but got 'str'/);
});

test('a declared return type rejects an implicit nil return', async () => {
  const err = await expectRuntimeError(`
    fn f() -> i32 :: do
      std::io::println("no return statement")
    end
    f()
  `);
  assert.match(err.message, /return value of 'f'.*'i32' but got 'nil'/);
});

test('a generic parameter binds once per call and is then enforced', async () => {
  const state = await expectOk(`
    fn pair[T](in a: T, in b: T) -> Array :: do return [a, b] end
    std::io::println(pair(1, 2))
    std::io::println(pair("x", "y"))
  `);
  assert.match(state.stdout(), /\[1, 2\]/);
  assert.match(state.stdout(), /\[x, y\]/);

  // T is bound to i32 by the first argument, so the second one must match.
  const err = await expectRuntimeError(`
    fn pair[T](in a: T, in b: T) -> Array :: do return [a, b] end
    pair(1, "two")
  `);
  assert.match(err.message, /parameter 'b' of 'pair' expects 'i32' but got 'str'/);
});

test('generic parameters are inferred from the call site', async () => {
  const state = await expectOk(`
    fn first[T](in xs: Array<T>) -> T :: do return xs[0] end
    std::io::println(first([1, 2, 3]))
    std::io::println(first(["a", "b"]))
  `);
  assert.match(state.stdout(), /1\na/);
});

test('argument count is enforced', async () => {
  const err = await expectRuntimeError(`
    fn f(in a: i32, in b: i32) :: do return a + b end
    f(1)
  `);
  assert.match(err.message, /expects 2 argument\(s\) but got 1/);
});

// ---------------------------------------------------------------------------
// records, enums & contracts
// ---------------------------------------------------------------------------

test('record fields are type checked', async () => {
  await expectOk(`
    type P :: record { x: i32, y: i32 }
    val p = P@{ x: 1, y: 2 }
    std::io::println(p.x + p.y)
  `);

  const fieldErr = await expectRuntimeError(`
    type P :: record { x: i32, y: i32 }
    val p = P@{ x: 1, y: "two" }
  `);
  assert.match(fieldErr.message, /field 'P\.y' expects 'i32' but got 'str'/);

  const missing = await expectRuntimeError(`
    type P :: record { x: i32, y: i32 }
    val p = P@{ x: 1 }
  `);
  assert.match(missing.message, /requires field 'y'/);

  const extra = await expectRuntimeError(`
    type P :: record { x: i32, y: i32 }
    val p = P@{ x: 1, y: 2, z: 3 }
  `);
  assert.match(extra.message, /'z' is not a field of record 'P'/);
});

test('record field assignments are checked', async () => {
  const err = await expectRuntimeError(`
    type P :: record { x: i32 }
    var p = P@{ x: 1 }
    p.x = "nope"
  `);
  assert.match(err.message, /field 'P\.x' expects 'i32'/);
});

test('enum payload arity and types are checked', async () => {
  await expectOk(`
    type E :: enum { A(i32), B(str), C }
    std::io::println(E::A(1), E::B("x"), E::C())
  `);

  const arity = await expectRuntimeError(`
    type E :: enum { A(i32) }
    val v = E::A(1, 2)
  `);
  assert.match(arity.message, /expects 1 payload value\(s\) but got 2/);

  const payload = await expectRuntimeError(`
    type E :: enum { A(i32) }
    val v = E::A("nope")
  `);
  assert.match(payload.message, /payload 0 of 'E::A' expects 'i32' but got 'str'/);
});

test('contracts can be used as parameter types', async () => {
  await expectOk(`
    contract Greeter :: spec
      fn greet(in self) -> str;
    end
    type Person :: record { name: str }
    impl Greeter for Person :: bind
      fn greet(in self) -> str :: do return "hi " + self.name end
    end
    fn say(in g: Greeter) -> str :: do return g.greet() end
    val p = Person@{ name: "ada" }
    std::io::println(say(p))
  `);

  const err = await expectRuntimeError(`
    contract Greeter :: spec
      fn greet(in self) -> str;
    end
    type Robot :: record { id: i32 }
    fn say(in g: Greeter) -> str :: do return g.greet() end
    val r = Robot@{ id: 1 }
    say(r)
  `);
  assert.match(err.message, /does not implement every method of contract 'Greeter'/);
});

test('unknown type names are reported', async () => {
  const err = await expectRuntimeError(`val x: Foo = 1`);
  assert.match(err.message, /Unknown type 'Foo'/);
});

// ---------------------------------------------------------------------------
// type system unit level checks
// ---------------------------------------------------------------------------

test('parseTypeName understands parameterised and nullable types', () => {
  const parsed = parseTypeName('Array<Array<f64>>?');
  assert.equal(parsed.base, 'Array');
  assert.equal(parsed.nullable, true);
  assert.equal(parsed.args[0].base, 'Array');
  assert.equal(parsed.args[0].args[0].base, 'f64');
});

test('checkValueType covers engine built-ins', () => {
  const ctx = {};
  assert.equal(checkValueType({ __isVec3: true, x: 0, y: 0, z: 0 }, 'Vec3', ctx, 'v').ok, true);
  assert.equal(checkValueType({ __isVec3: true }, 'Vec2', ctx, 'v').ok, false);
  assert.equal(checkValueType([1, 2, 3], 'Mat4', ctx, 'v').ok, true);
  assert.equal(checkValueType(() => {}, 'fn', ctx, 'v').ok, true);
  assert.equal(checkValueType({ __isTensor: true, rows: 1, cols: 1 }, 'Tensor', ctx, 'v').ok, true);
});

test('deepClone copies nested data without sharing references', () => {
  const original = { a: [1, 2, { b: 3 }], tag: 'x' };
  const copy = deepClone(original);
  assert.deepEqual(copy, original);
  copy.a[2].b = 99;
  assert.equal(original.a[2].b, 3);
});

test('readOnlyView rejects writes through nested objects', () => {
  const target = { list: [1, 2], nested: { flag: true } };
  const view = readOnlyView(target);

  assert.equal(view.list[0], 1);
  assert.throws(() => { view.nested.flag = false; }, /read-only borrow/);
  assert.throws(() => { view.list.push(3); }, /read-only borrow/);
  assert.equal(target.nested.flag, true);
});
