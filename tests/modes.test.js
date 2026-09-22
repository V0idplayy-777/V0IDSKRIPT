import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectOk, expectRuntimeError } from './helpers.js';

// ---------------------------------------------------------------------------
// in — read-only borrow
// ---------------------------------------------------------------------------

test('in: the parameter name cannot be rebound', async () => {
  const err = await expectRuntimeError(`
    fn f(in x: i32) :: do
      x = 10
    end
    f(1)
  `);
  assert.match(err.message, /read-only/);
});

test('in: the callee cannot mutate through the parameter', async () => {
  const err = await expectRuntimeError(`
    fn push_it(in xs: Array) :: do
      xs.push(4)
    end
    val a = [1, 2, 3]
    push_it(a)
  `);
  assert.match(err.message, /read-only borrow/);
});

test('in: reads (including nested reads) still work', async () => {
  const state = await expectOk(`
    fn total(in xs: Array) -> i32 :: do
      var sum = 0
      loop i in 0..xs.length :: pass
        sum = sum + xs[i]
      end
      return sum
    end
    std::io::println(total([1, 2, 3]))
  `);
  assert.match(state.stdout(), /6/);
});

test('in: records can be read through the borrow', async () => {
  const state = await expectOk(`
    type P :: record { x: i32, y: i32 }
    fn sum(in p) -> i32 :: do return p.x + p.y end
    val point = P@{ x: 4, y: 5 }
    std::io::println(sum(point))
  `);
  assert.match(state.stdout(), /9/);
});

// ---------------------------------------------------------------------------
// out — write-only slot, copied back on return
// ---------------------------------------------------------------------------

test('out: the value is written back into the caller variable', async () => {
  const state = await expectOk(`
    fn fill(out x: i32) :: do
      x = 42
    end
    var v = 0
    fill(v)
    std::io::println(v)
  `);
  assert.match(state.stdout(), /42/);
});

test('out: the parameter starts as nil', async () => {
  const state = await expectOk(`
    fn peek(out x: i32) :: do
      std::io::println("starts as:", x)
      x = 7
    end
    var v = 99
    peek(v)
  `);
  assert.match(state.stdout(), /starts as: nil/);
});

test('out: an undeclared variable is created on demand', async () => {
  const state = await expectOk(`
    fn make(out x: i32) :: do x = 5 end
    make(fresh)
    std::io::println(fresh)
  `);
  assert.match(state.stdout(), /5/);
});

test('out: the argument must be a storage location', async () => {
  const err = await expectRuntimeError(`
    fn fill(out x: i32) :: do x = 1 end
    fill(1 + 2)
  `);
  assert.match(err.message, /requires a variable or member expression/);
});

test('out: the assigned value is type checked', async () => {
  const err = await expectRuntimeError(`
    fn bad(out x: i32) :: do x = "nope" end
    var v = 1
    bad(v)
  `);
  // Caught on assignment, before the value could be copied back.
  assert.match(err.message, /assignment to 'x' expects 'i32' but got 'str'/);
});

// ---------------------------------------------------------------------------
// inout — copy in, copy out
// ---------------------------------------------------------------------------

test('inout: mutations are copied back to the caller', async () => {
  const state = await expectOk(`
    fn double(inout x: i32) :: do
      x = x * 2
    end
    var n = 21
    double(n)
    std::io::println(n)
  `);
  assert.match(state.stdout(), /42/);
});

test('inout: the caller value is unchanged until the call returns', async () => {
  const state = await expectOk(`
    fn slow(inout x: i32) :: do
      std::io::println("inside before:", x)
      x = 100
      std::io::println("inside after:", x)
    end
    var n = 1
    slow(n)
    std::io::println("after return:", n)
  `);
  const lines = state.stdout().split('\n');
  assert.equal(lines[0], 'inside before: 1');
  assert.equal(lines[1], 'inside after: 100');
  assert.equal(lines[2], 'after return: 100');
});

test('inout: requires a mutable binding', async () => {
  const err = await expectRuntimeError(`
    fn bump(inout x: i32) :: do x = x + 1 end
    val n = 1
    bump(n)
  `);
  assert.match(err.message, /immutable binding 'n'/);
});

test('inout: works with member expressions', async () => {
  const state = await expectOk(`
    type Counter :: record { hits: i32 }
    fn bump(inout c) :: do
      c.hits = c.hits + 1
    end
    var counter = Counter@{ hits: 0 }
    bump(counter)
    bump(counter)
    std::io::println(counter.hits)
  `);
  assert.match(state.stdout(), /2/);
});

// ---------------------------------------------------------------------------
// ref — alias of the caller's storage
// ---------------------------------------------------------------------------

test('ref: writes are visible immediately', async () => {
  const state = await expectOk(`
    fn bump(ref x: i32) :: do
      x = x + 1
      std::io::println("inside:", x)
    end
    var n = 1
    bump(n)
    std::io::println("after:", n)
  `);
  const lines = state.stdout().split('\n');
  assert.equal(lines[0], 'inside: 2');
  assert.equal(lines[1], 'after: 2');
});

test('ref: record fields can be updated in place', async () => {
  const state = await expectOk(`
    fn heal(ref hp: f64, in amount: f64) :: do
      hp = hp + amount
    end
    type Unit :: record { hp: f64 }
    var u = Unit@{ hp: 10.0 }
    heal(u.hp, 5.0)
    std::io::println(u.hp)
  `);
  assert.match(state.stdout(), /15/);
});

test('ref: requires a variable argument', async () => {
  const err = await expectRuntimeError(`
    fn bump(ref x: i32) :: do x = x + 1 end
    bump(5 * 2)
  `);
  assert.match(err.message, /requires a variable or member expression/);
});

// ---------------------------------------------------------------------------
// own — private deep copy
// ---------------------------------------------------------------------------

test('own: the callee gets a copy and the caller is untouched', async () => {
  const state = await expectOk(`
    fn corrupt(own data: Array) :: do
      data.push("CORRUPTED")
      std::io::println("inside:", data)
    end
    val payload = ["alpha", "beta"]
    corrupt(payload)
    std::io::println("outside:", payload)
  `);
  const lines = state.stdout().split('\n');
  assert.match(lines[0], /inside: \[alpha, beta, CORRUPTED\]/);
  assert.match(lines[1], /outside: \[alpha, beta\]/);
});

test('own: nested objects are copied too', async () => {
  const state = await expectOk(`
    fn touch(own cfg) :: do
      cfg.nested.value = 99
      std::io::println("inside:", cfg.nested.value)
    end
    val config = { nested: { value: 1 } }
    touch(config)
    std::io::println("outside:", config.nested.value)
  `);
  const lines = state.stdout().split('\n');
  assert.match(lines[0], /inside: 99/);
  assert.match(lines[1], /outside: 1/);
});

// ---------------------------------------------------------------------------
// mixed modes
// ---------------------------------------------------------------------------

test('modes can be mixed in one signature', async () => {
  const state = await expectOk(`
    fn split(out whole: i32, out frac: f64, in value: f64) :: do
      whole = std::math::floor(value)
      frac = value - whole
    end
    var w = 0
    var f = 0.0
    split(w, f, 3.75)
    std::io::println(w, f)
  `);
  assert.match(state.stdout(), /3 0\.75/);
});

test('a read-only binding cannot be passed on to an out/inout/ref parameter', async () => {
  const err = await expectRuntimeError(`
    fn bump(inout x: i32) :: do x = x + 1 end
    fn caller(in y: i32) :: do
      bump(y)
    end
    var v = 1
    caller(v)
  `);
  assert.match(err.message, /read-only binding 'y'/);
});

test('own/inout copies of a borrowed value are writable again', async () => {
  const state = await expectOk(`
    fn mutate(own cfg) :: do
      cfg.nested.value = 99
      std::io::println("inside:", cfg.nested.value)
    end
    fn relay(in cfg) :: do
      mutate(cfg)
    end
    val config = { nested: { value: 1 } }
    relay(config)
    std::io::println("outside:", config.nested.value)
  `);
  const lines = state.stdout().split('\n');
  assert.match(lines[0], /inside: 99/);
  assert.match(lines[1], /outside: 1/);
});

test('a method call on a borrowed record still works', async () => {
  const state = await expectOk(`
    contract Named :: spec
      fn title(in self) -> str;
    end
    type Book :: record { name: str }
    impl Named for Book :: bind
      fn title(in self) -> str :: do return "Book: " + self.name end
    end
    fn read(in item: Named) -> str :: do return item.title() end
    val b = Book@{ name: "V0ID" }
    std::io::println(read(b))
  `);
  assert.match(state.stdout(), /Book: V0ID/);
});

test('methods can be called on a value received as an in parameter', async () => {
  const state = await expectOk(`
    type Counter :: record { n: i32 }
    impl Counter :: bind
      fn bump(inout self) :: do self.n = self.n + 1 end
      fn value(in self) -> i32 :: do return self.n end
    end
    var c = Counter@{ n: 1 }
    c.bump()
    std::io::println(c.value())
  `);
  assert.match(state.stdout(), /2/);
});
