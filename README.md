# V0IDSKRIPT: Official Systems Language Specification & Reference Manual
> **Document Version:** 1.0.0 (Production Release)  
> **Status:** Standard Reference Specification  
> **Compiler Target:** Native WASM JIT & High-Speed Bytecode Engine  

---

## 1. Architecture & Design Principles

**V0IDSKRIPT** is a high-performance systems and application programming language engineered for mission-critical software, 2D/3D game engines, machine learning runtimes, data structures, and CLI applications. 

### Core Design Pillars
1. **Zero-Overhead Abstractions:** Traits, generics, and algebraic data types compile down to direct, contiguous memory layouts without runtime dynamic dispatch tax.
2. **Explicit Memory & Mutability:** Variables are immutable by default (`let`). Mutability must be explicitly declared (`let mut`). Scope cleanup is guaranteed via `defer` blocks.
3. **Comprehensive Pattern Matching:** Algebraic Enums support tuple and struct payloads with full destructuring and conditional guard clauses (`match event { Event::KeyPress(key) if key == 13 => ... }`).
4. **Integrated 2D/3D Engine & AI Autograd:** Native stdlib support for 3D vector math (`Vec3`, `Mat4`), perspective rendering, 2D physics viewport drawing, and automatic differentiation (`std::ai::Value`).

---

## 2. Complete Lexical Token & Keyword Index

V0IDSKRIPT provides an expressive keyword set designed for maximum clarity and safety.

### 2.1 Keyword Reference Table

| Keyword | Description & Usage Example |
| :--- | :--- |
| `let` | Immutable variable binding (`let x: f64 = 10.0;`) |
| `mut` | Mutable variable binding (`let mut count = 0;`) |
| `const` | Compile-time constant (`const MAX_FPS: i32 = 60;`) |
| `fn` | Function declaration (`fn calculate(a: f64) -> f64 { ... }`) |
| `struct` | Struct type definition (`struct Point { x: f64, y: f64 }`) |
| `enum` | Algebraic data type definition (`enum State { Idle, Running(i32) }`) |
| `trait` | Interface protocol contract (`trait Renderable { fn draw(self); }`) |
| `impl` | Implementation block for structs or traits (`impl Renderable for Player { ... }`) |
| `type` | Type alias declaration (`type Matrix4 = Mat4;`) |
| `defer` | Deferred scope cleanup execution (`defer file.close();`) |
| `match` | Pattern matching expression (`match state { State::Idle => ..., _ => ... }`) |
| `if` / `else` | Conditional branching (`if (x > 0) { ... } else { ... }`) |
| `while` | Conditional loop (`while (running) { ... }`) |
| `for` / `in` | Iterator loop (`for (i in 0..100) { ... }`) |
| `loop` | Unbounded infinite loop (`loop { if (done) break; }`) |
| `return` | Return value from function (`return result;`) |
| `break` / `continue` | Loop control flow statements |
| `pub` | Public visibility modifier (`pub fn init() { ... }`) |
| `self` / `Self` | Receiver handle in struct method implementations |

### 2.2 Operator & Sigil Reference Table

| Operator | Name | Usage & Description |
| :--- | :--- | :--- |
| `\|>` | **Pipeline Operator** | Passes left expression as argument into right function (`x \|> transform`). |
| `~>` | **Dispatch Pipe** | Alternative pipeline operator (`data ~> process`). |
| `::` | **Namespace Resolution** | Resolves module/enum paths (`std::io::println`, `Status::Ready`). |
| `->` | **Return Type Arrow** | Function return type annotation (`fn get() -> i32`). |
| `=>` | **Fat Arrow** | Match arm expression separator (`Variant => statement`). |
| `..` | **Range Operator** | Constructs numeric ranges (`0..100`). |
| `??` | **Null Coalescing** | Fallback value operator for nil options (`value ?? fallback`). |
| `?.` | **Safe Navigation** | Safely accesses properties on optional values (`obj?.prop`). |
| `!!` | **Forced Unwrap** | Unwraps non-nil value or raises error (`option!!`). |

---

## 3. Type System & Memory Model

V0IDSKRIPT features a strong type system combining primitive scalar types, linear vector types, arrays, and algebraic data types.

### 3.1 Scalar & Linear Primitives
- **Integers:** `i8`, `i16`, `i32`, `i64` (Signed), `u8`, `u16`, `u32`, `u64` (Unsigned).
- **Floating Point:** `f32`, `f64`.
- **Booleans:** `bool` (`true`, `false`).
- **Strings & Characters:** `str`, `char`.
- **Vector & Matrix Primitives:** `Vec2`, `Vec3`, `Vec4`, `Mat4`, `Quat`.

### 3.2 Structs & Trait Polymorphism
```v0idskript
struct Sphere {
    radius: f64,
    center: Vec3
}

trait Geometry {
    fn volume(self) -> f64;
}

impl Geometry for Sphere {
    fn volume(self) -> f64 {
        return (4.0 / 3.0) * std::math::PI * std::math::pow(self.radius, 3.0);
    }
}
```

### 3.3 Algebraic Enums & Pattern Matching
```v0idskript
enum GameEvent {
    KeyPress(i32),
    Collision(Vec3, Vec3),
    Quit
}

fn handle_event(event: GameEvent) {
    match event {
        GameEvent::KeyPress(key) if key == 32 => std::io::println("Jump pressed!"),
        GameEvent::Collision(p1, p2)         => std::io::printf("Collision detected at %s", p1),
        GameEvent::Quit                       => std::io::println("Exiting game engine..."),
        _                                    => std::io::println("Unhandled event.")
    }
}
```

---

## 4. 2D/3D Graphics Engine & Viewport API (`gfx::*`)

V0IDSKRIPT provides built-in hardware-accelerated 2D and 3D graphics rendering primitives.

| Function | Signature | Description |
| :--- | :--- | :--- |
| `gfx::init` | `init(w: i32, h: i32)` | Initializes the graphical canvas viewport. |
| `gfx::clear` | `clear(color: str)` | Clears the viewport canvas background. |
| `gfx::rect` | `rect(x, y, w, h, color, fill)` | Renders a 2D rectangle. |
| `gfx::circle` | `circle(x, y, r, color, fill)` | Renders a 2D circle. |
| `gfx::line` | `line(x1, y1, x2, y2, color, w)` | Draws a 2D line segment. |
| `gfx::text` | `text(str, x, y, size, color)` | Renders text on the canvas. |

---

## 5. Neural Autograd Engine (`std::ai::*`)

V0IDSKRIPT includes an Automatic Differentiation (Autograd) scalar engine for building machine learning computational graphs.

```v0idskript
let w1 = std::ai::Value(2.0, "w1");
let x1 = std::ai::Value(1.5, "x1");
let b  = std::ai::Value(0.5, "b");

// Forward Pass: f = (w1 * x1) + b
let out = std::ai::relu(std::ai::add(std::ai::mul(w1, x1), b));

// Backward Pass: Automatic Backpropagation Gradients
out.backward();

std::io::printf("Weight Gradient dw1: %.4f", w1.grad);
```

---

## 6. Standard Library Reference (`std::*`)

1. **`std::io`**: Output printing, error logs, formatted output, interactive stdin reading (`println`, `printf`, `warn`, `error`, `read_line`).
2. **`std::math`**: Trigonometric, logarithmic, scalar, and 3D vector operations (`sin`, `cos`, `sqrt`, `pow`, `abs`, `random`, `clamp`, `vec3`, `vec3_add`, `vec3_dot`).
3. **`std::collections`**: High-performance data structures (`HashMap`, `Queue`, `List`, `Stack`).
4. **`std::time`**: High-precision performance profilers (`now`, `bench`).
5. **`std::ai`**: Scalar autograd graphs (`Value`, `add`, `mul`, `relu`).

---

## 7. Complete Application Case Studies

### 7.1 Interactive Hangman CLI Game
```v0idskript
let secret_word = "COMPILER";
let mut guessed_letters = [];
let mut attempts = 6;

while (attempts > 0) {
    let guess = std::io::read_line("Guess a letter:");
    if (!guessed_letters.includes(guess)) {
        guessed_letters.push(guess);
        if (!secret_word.includes(guess)) {
            attempts -= 1;
        }
    }
}
```

### 7.2 3D Perspective Software Engine
```v0idskript
gfx::init(800, 500);

let vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]];
let edges = [[0,1], [1,2], [2,3], [3,0]];

fn render_frame(angle: f64) {
    gfx::clear("#0b0f19");
    // Perspective transformation math
}
```

---

*V0IDSKRIPT Language Specification © 2026 V0idplayy*
