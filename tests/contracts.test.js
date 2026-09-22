import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectOk, expectRuntimeError } from './helpers.js';

// ---------------------------------------------------------------------------
// contract / impl verification
// ---------------------------------------------------------------------------

const CONTRACT = `
  contract Shape :: spec
    fn area(in self) -> f64;
    fn scale(inout self, in factor: f64) -> f64;
  end
`;

test('a complete impl block is accepted', async () => {
  const state = await expectOk(`
    ${CONTRACT}
    type Square :: record { side: f64 }
    impl Shape for Square :: bind
      fn area(in self) -> f64 :: do return self.side * self.side end
      fn scale(inout self, in factor: f64) -> f64 :: do
        self.side = self.side * factor
        return self.side
      end
    end
    var sq = Square@{ side: 3.0 }
    std::io::println("area:", sq.area())
    sq.scale(2.0)
    std::io::println("side:", sq.side)
  `);
  const lines = state.stdout().split('\n');
  assert.match(lines[0], /area: 9/);
  assert.match(lines[1], /side: 6/);
});

test('a missing method is reported', async () => {
  const err = await expectRuntimeError(`
    contract Shape :: spec
      fn area(in self) -> f64;
      fn perimeter(in self) -> f64;
    end
    type Square :: record { side: f64 }
    impl Shape for Square :: bind
      fn area(in self) -> f64 :: do return self.side * self.side end
    end
  `);
  assert.match(err.message, /does not satisfy contract 'Shape': missing method\(s\) 'perimeter'/);
});

test('a return type mismatch is reported', async () => {
  const err = await expectRuntimeError(`
    contract Shape :: spec
      fn area(in self) -> f64;
    end
    type Square :: record { side: f64 }
    impl Shape for Square :: bind
      fn area(in self) -> i32 :: do return 1 end
    end
  `);
  assert.match(err.message, /return type is 'i32' but the contract declares 'f64'/);
});

test('a missing return type is reported', async () => {
  const err = await expectRuntimeError(`
    contract Shape :: spec
      fn area(in self) -> f64;
    end
    type Square :: record { side: f64 }
    impl Shape for Square :: bind
      fn area(in self) :: do return 1.0 end
    end
  `);
  assert.match(err.message, /missing return type 'f64' declared by the contract/);
});

test('a parameter type mismatch is reported', async () => {
  const err = await expectRuntimeError(`
    contract Shape :: spec
      fn scale(in self, in factor: f64) -> f64;
    end
    type Square :: record { side: f64 }
    impl Shape for Square :: bind
      fn scale(in self, in factor: str) -> f64 :: do return 1.0 end
    end
  `);
  assert.match(err.message, /parameter 2 \('factor'\) has type 'str' but the contract declares 'f64'/);
});

test('a parameter mode mismatch is reported', async () => {
  const err = await expectRuntimeError(`
    contract Shape :: spec
      fn scale(inout self, in factor: f64) -> f64;
    end
    type Square :: record { side: f64 }
    impl Shape for Square :: bind
      fn scale(in self, in factor: f64) -> f64 :: do return 1.0 end
    end
  `);
  assert.match(err.message, /must use mode 'inout' but uses 'in'/);
});

test('an unknown contract is reported', async () => {
  const err = await expectRuntimeError(`
    type Square :: record { side: f64 }
    impl Shap for Square :: bind
      fn area(in self) -> f64 :: do return 1.0 end
    end
  `);
  assert.match(err.message, /Cannot implement unknown contract 'Shap'/);
});

test('impl methods are dispatched on record instances', async () => {
  const state = await expectOk(`
    contract Greeter :: spec
      fn greet(in self) -> str;
    end
    type Person :: record { name: str }
    impl Greeter for Person :: bind
      fn greet(in self) -> str :: do return "hi, I am " + self.name end
    end
    val p = Person@{ name: "Ada" }
    std::io::println(p.greet())
  `);
  assert.match(state.stdout(), /hi, I am Ada/);
});

test('a bound method can be passed around as a value', async () => {
  const state = await expectOk(`
    contract Greeter :: spec
      fn greet(in self) -> str;
    end
    type Person :: record { name: str }
    impl Greeter for Person :: bind
      fn greet(in self) -> str :: do return "hi " + self.name end
    end
    fn shout(in f: fn) -> str :: do return f() end
    val p = Person@{ name: "Ada" }
    std::io::println(shout(p.greet))
  `);
  assert.match(state.stdout(), /hi Ada/);
});

// ---------------------------------------------------------------------------
// @reduce
// ---------------------------------------------------------------------------

test('@reduce folds with an explicit initial value', async () => {
  const state = await expectOk(`
    val xs = [1, 2, 3, 4]
    std::io::println(xs @reduce |acc, x| => acc + x, 0)
  `);
  assert.match(state.stdout(), /10/);
});

test('@reduce seeds from the first element without an initial value', async () => {
  const state = await expectOk(`
    val xs = [1, 2, 3, 4]
    std::io::println(xs @reduce |acc, x| => acc + x)
  `);
  assert.match(state.stdout(), /10/);
});

test('@reduce works with strings and non numeric accumulators', async () => {
  const state = await expectOk(`
    val names = ["ada", "bob"]
    std::io::println(names @reduce |acc, n| => acc + ", " + n, "team:")
  `);
  assert.match(state.stdout(), /team:, ada, bob/);
});

test('@reduce composes with @map and @filter', async () => {
  const state = await expectOk(`
    val xs = [1, 2, 3, 4, 5]
    val odd_squares = xs @filter |x| => x % 2 == 1 @map |x| => x * x
    std::io::println("odd squares:", odd_squares)
    std::io::println("sum:", odd_squares @reduce |acc, x| => acc + x, 0)
  `);
  assert.match(state.stdout(), /odd squares: \[1, 9, 25\]/);
  assert.match(state.stdout(), /sum: 35/);
});

test('@reduce accepts a named function as the callback', async () => {
  const state = await expectOk(`
    fn add(in a: i32, in b: i32) -> i32 :: do return a + b end
    std::io::println([1, 2, 3] @reduce add, 10)
  `);
  assert.match(state.stdout(), /16/);
});

test('@reduce rejects a non vector left hand side', async () => {
  const err = await expectRuntimeError(`std::io::println(5 @reduce |acc, x| => acc + x, 0)`);
  assert.match(err.message, /'@reduce' expects an Array/);
});

test('.reduce(fn, init) still works as a method', async () => {
  const state = await expectOk(`
    val xs = [1, 2, 3]
    std::io::println(xs.reduce(|acc, x| => acc * x, 1))
  `);
  assert.match(state.stdout(), /6/);
});
