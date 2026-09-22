# V0IDSKRIPT

A systems-flavoured scripting language with an industrial, block-delimited syntax
(`do … end`, `spec … end`, `bind … end`) and a compact runtime: a hand-written
lexer, a recursive-descent parser and a tree-walking interpreter.

It runs in two places with the same engine:

| Target | Entry point | Notes |
| ------ | ----------- | ----- |
| Browser playground (Monaco editor + canvas + terminal) | `npm run dev` | React + Vite, deployed to GitHub Pages |
| Node CLI | `node v0id.js program.v0id` | terminal graphics (ANSI or PNG), keyboard/mouse/stdin input |

```bash
npm install
npm run dev            # playground on http://localhost:3000/V0IDSKRIPT/
npm test               # 106 tests (node:test)

node v0id.js examples/terminal_gfx.v0id --gfx=ansi
node v0id.js examples/terminal_input.v0id
```

---

## Previously known limitations — now fixed

The list below mirrors the "Known Quirks & Current Limitations" section that used
to describe the language. Every one of those items has been implemented; the
[Remaining limitations](#remaining-limitations) section lists what is still open.

### 1. Type annotations are enforced

`i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 bool str Array Vec2 Vec3 Vec4 Mat4 Tensor
Value fn Object`, user `record`/`enum`/`contract` names, parameterised types
(`Array<f64>`, `Array<Array<i32>>`) and nullable types (`str?`) are all checked at
runtime, in every position an annotation can appear:

```v0id
val count: i32 = 4          # ok
val ratio: f64 = count      # ok — integers widen into floats
val bad:   i32 = 1.5        # Type Error: expects 'i32' but got 'f64'
val maybe: str? = nil       # ok — '?' also accepts nil

var hp: f64 = 100.0
hp = "full"                 # Type Error on assignment

fn area(in r: f64) -> f64 :: do return 3.14159 * r * r end
area("2.0")                 # Type Error on the parameter
fn wrong() -> i32 :: do return "nope" end   # Type Error on the return value
```

* integers widen into floats, floats never narrow into integers
* sized integers are range checked (`val b: i8 = 200` fails)
* record fields, enum variant payloads and payload arity are verified
* generic parameters are inferred per call and then enforced consistently:
  `fn first[T](in xs: Array<T>) -> T` binds `T` from the first call
* a contract name can be used as a parameter type — the value must be a record
  with a matching `impl`
* unknown type names are reported instead of silently passing

Type checks happen while the program runs (this is still a tree-walking
interpreter, not a static type checker), so a branch that never executes is
never checked.

### 2. Parameter modes have real semantics

`in` / `out` / `inout` / `own` / `ref` now change how arguments are bound:

| Mode | Bound as | Callee may rebind | Callee may write through | Caller sees |
| ---- | -------- | ----------------- | ------------------------ | ----------- |
| `in` (default) | read-only view | no | no | original value |
| `out` | write-only slot, starts `nil` | yes | yes | value copied back on return |
| `inout` | deep copy in, copy out | yes | yes (on the copy) | value copied back on return |
| `own` | private deep copy | yes | yes | nothing (caller value untouched) |
| `ref` | alias of the caller's storage | yes | yes | every change, immediately |

```v0id
fn fill(out x: i32) :: do x = 42 end
var v = 0
fill(v)                     # v == 42

fn double(inout x: i32) :: do x = x * 2 end
var n = 21
double(n)                   # n == 42

fn corrupt(own xs: Array) :: do xs.push("X") end
val data = ["a"]
corrupt(data)               # data is still ["a"]

fn heal(ref hp: f64, in amount: f64) :: do hp = hp + amount end
heal(player.hp, 5.0)        # writes straight into player.hp

fn touch(in xs: Array) :: do xs.push(1) end   # Error: read-only borrow
```

`in` is enforced with a read-only view (a `Proxy` that rejects writes, including
writes through methods such as `Array#push` and nested objects), and `out`,
`inout` and `ref` require a storage location — a variable or a member expression
— as the argument. Read-only and immutable (`val`) bindings cannot be handed to
those modes.

### 3. `contract` / `impl` are cross-checked

`impl X for Y :: bind … end` is verified against `contract X :: spec … end` when
the block is declared. A mismatch is a hard error, not a silent registration:

```v0id
contract Damageable :: spec
    fn take_damage(inout self, in amount: f64) -> f64;
    fn alive(in self) -> bool;
end

impl Damageable for Enemy :: bind
    fn take_damage(inout self, in amount: f64) -> f64 :: do
        self.hp = self.hp - amount
        return self.hp
    end
    fn alive(in self) -> bool :: do return self.hp > 0.0 end
end
```

Checked at declaration time: every contract method exists, and each one matches
the declared parameter count, parameter modes, parameter types and return type.
Implementing an unknown contract is an error too. Contract names are also usable
as parameter types, and impl methods can be passed around as bound values.

### 4. `@reduce` is wired up

```v0id
[1, 2, 3, 4] @reduce |acc, x| => acc + x, 0      # -> 10
[1, 2, 3, 4] @reduce |acc, x| => acc + x         # -> 10 (seeds from element 0)
names        @reduce |acc, n| => acc + ", " + n, "team:"
```

The callback can be a closure or a named function, and `@map` / `@filter` /
`@reduce` now chain left to right:

```v0id
xs @filter |x| => x % 2 == 1 @map |x| => x * x   # -> [1, 9, 25]
```

`.reduce(fn, init)` remains available as a method.

### 5. `std::io::read_line` reads real input

Evaluation is asynchronous, so a program suspends until a line arrives instead
of continuing with `nil`:

```v0id
std::io::print("Name? ")
val name = std::io::read_line()
val age  = std::io::read_number("Age? ")
```

* **playground** — the console input box under the terminal; the program shows an
  *awaiting input* indicator while it waits, and the **Stop** button cancels it.
* **CLI** — stdin. With a TTY the line editor runs in raw mode (typed characters
  are echoed, backspace works); with piped input lines are read from the stream,
  so `echo "Ada" | node v0id.js program.v0id` works.

Suspending works anywhere in the call stack — inside functions, inside loops.

### 6. `gfx` and `input` work outside the browser

Under the Node CLI the `gfx` namespace renders to a real target:

* `--gfx=ansi` (default on a TTY) — 24-bit colour terminal rendering using
  upper-half-block characters, two vertical pixels per cell, redrawn per frame
* `--gfx=png` (default when stdout is not a TTY) — real PNG frames written to
  `./v0id_gfx_out` (override with `--gfx-out=<dir>`), one file per rendered frame
* `--gfx=none` — disabled

`rect`, `circle`, `line` and `text` (5×7 bitmap font, drawn into the framebuffer)
are all implemented, so the same program draws on a canvas, in the terminal or
into a PNG without changes.

`input` is wired to the terminal too:

* `input::is_key_pressed("a" | "space" | "up" | …)` reflects real key presses.
  With a TTY stdin is switched to raw mode and arrows/space/enter/escape/letters
  are tracked; because terminals cannot report key *release*, a press stays
  "held" for `--hold-time` milliseconds (default 250).
* `input::get_mouse()` reports real pointer coordinates: the playground tracks
  the cursor over the canvas, the CLI enables SGR mouse tracking and maps the
  cell position onto the graphics viewport.

### 7. Sandbox limits are configurable

The defaults are unchanged (2,000,000 steps and 500,000 iterations per loop), but
every limit can now be raised, lowered or disabled, and they cover every loop
construct — previously only `while` was capped, so `loop i in 0..∞` could spin
forever.

| Limit | Default | CLI flag | Constructor option |
| ----- | ------- | -------- | ------------------ |
| evaluated AST nodes | 2,000,000 | `--max-steps=N` | `maxSteps` |
| iterations of one loop | 500,000 | `--max-loop-iterations=N` | `maxLoopIterations` |
| total loop iterations | 5,000,000 | `--max-total-loop-iterations=N` | `maxTotalLoopIterations` |
| call depth | 1,000 | `--max-call-depth=N` | `maxCallDepth` |
| wall clock | disabled | `--timeout=MS` | `maxTimeMs` |
| all of the above | — | `--unlimited` | `limits: { maxSteps: 0, … }` |

`0` disables an individual limit. Every message says which limit tripped and how
to raise it, and the new call-depth guard reports runaway recursion instead of
crashing the host. The playground shows the active limits on the Profiler tab,
and a running program can be cancelled with `interpreter.abort()` (the **Stop**
button) — including one that is parked on `read_line`.

---

## Language tour

```v0id
# declarations: val (immutable), var (mutable)
val system_id: str = "V0ID-KERNEL-9"
var attempts: i32 = 3

# records, enums and pattern matching
type Status :: enum { Ready, Processing(i32), Error(str) }

select state ::
    case Status::Ready          => std::io::println("ready")
    case Status::Processing(p)  => std::io::printf("at %d%%", p)
    case Status::Error(msg)     => std::io::println(msg)
end

# control flow
if (attempts > 0) :: do … end else :: do … end
while (running) :: pass … end
loop i in 0..10 :: pass … end          # 0..=10 is inclusive
loop item in collection :: pass … end

# vectorised operators
[1, 2, 3] @map |x| => x * 2
[1, 2, 3] @filter |x| => x > 1
[1, 2, 3] @reduce |acc, x| => acc + x, 0
a #* b        # tensor GEMM multiply
u <.> v       # dot product
u <x> v       # cross product (Vec3)
x |> f()      # pipeline: f(x)

# tensors
tensor M :: grid [ 1.0, 2.0 ; 3.0, 4.0 ]

# standard library
std::io, std::math, std::collections, std::time, std::ai (autograd),
gfx, input
```

Blocks may also be written with braces (`{ … }`) instead of `do … end`, and `def`
is an alias for `fn`.

---

## Architecture

```
src/v0id/lexer.js         tokeniser (sigils, ranges, comments, strings)
src/v0id/parser.js        recursive-descent parser -> AST
src/v0id/types.js         type parsing, checking, widening, deep copy,
                          read-only views, signature comparison
src/v0id/interpreter.js   environments, async evaluator, parameter modes,
                          registries (records/enums/contracts), standard library
src/v0id/backends/
    node-gfx.js           terminal ANSI renderer + minimal PNG encoder
    node-input.js         raw-mode keyboard, SGR mouse, line reader
v0id.js                   CLI runner
tests/                    node:test suites (types, modes, contracts, io,
                          sandbox, examples, cli)
```

`V0idInterpreter.run()` is `async` (`await interpreter.run(code)`) because input
can suspend a program; `interpreter.abort()` cancels one.

---

## Remaining limitations

Honest list of what is still missing:

* **Type checking is runtime only.** There is no static pass, so unexecuted
  code is unchecked. `Array<T>` element checks are exhaustive up to 128 elements
  and sampled (64 evenly spaced) above that, to keep hot loops cheap.
* **`pin` is parsed but behaves like `var`.** Pinned heap handles are not
  implemented.
* **`defer` is tokenised but not implemented.** Deferred scope cleanup is not
  wired into the evaluator.
* **Terminal key state has no key-up.** A press stays held for
  `--hold-time` ms; terminal mouse coordinates are mapped from character cells,
  so they are approximate.
* **Async evaluation costs throughput.** Suspending `read_line` support makes
  every AST node an `await`, which is roughly 2–3× slower than the previous
  synchronous walk on tight numeric loops (examples still run in tens of
  milliseconds).
* **`std::ai` covers scalars only** (`Value`, `add`, `mul`, `relu`, `backward`).
* **No module system.** `std::` namespaces are the only import mechanism.
* **`in` read-only views are not identity-preserving.** Comparing a borrowed
  value with the original using `==` still works (views are unwrapped), but
  `===`-style identity through host code can differ.
