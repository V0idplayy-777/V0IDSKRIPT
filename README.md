# V0IDSKRIPT v4.0 Specification Manual & Comprehensive Systems Programming Guide
> **Version:** 4.0.0 (Production Release)  
> **Target Runtime:** WASM JIT & High-Speed Systems Kernel Engine  
> **Status:** Official Master Language Textbook & Specification Reference  

---

## CHAPTER 1: INTRODUCTION & MENTAL MODEL

### 1.1 What is V0IDSKRIPT?
**V0IDSKRIPT v4.0** is an independent, syntax-heavy, high-performance systems and application programming language. It is designed to construct complex software systems—including 3D game engines, neural network autograd computational graphs, data structures, and CLI utilities—while maintaining microsecond execution speeds.

V0IDSKRIPT abandons standard C/JS-style brace formatting in favor of explicit block bounds (`do...end`, `record...end`, `bind...end`, `spec...end`, `pass...end`), mode-annotated parameters (`in`, `out`, `inout`), algebraic data types (`enum`), contracts (`contract`), implementation blocks (`impl`), and domain-specific vector/matrix operators (`#*`, `<.>`, `<x>`, `@map`, `@filter`, `@reduce`).

### 1.2 The V0IDSKRIPT Execution Model
V0IDSKRIPT code compiles down to an Abstract Syntax Tree (AST) that executes on a flat, zero-copy evaluation engine. All matrix and tensor math routines run on contiguous `Float64Array` typed memory blocks, eliminating garbage collection pauses during 60 FPS viewport rendering.

---

## CHAPTER 2: LEXICAL STRUCTURE, TOKENS, SIGILS & OPERATORS

### 2.1 Lexical Grammar Reference Table

| Token / Sigil | Category | Description & Usage |
| :--- | :--- | :--- |
| `val` | Keyword | Immutable variable declaration (`val x: f64 = 10.0;`). |
| `var` | Keyword | Mutable variable declaration (`var count: i32 = 0;`). |
| `pin` | Keyword | Pinned memory allocation handle (`pin buffer: Array = [1, 2, 3];`). |
| `const` | Keyword | Compile-time constant (`const MAX_FPS: i32 = 60;`). |
| `type` | Keyword | Type definition start (`type Point3D :: record { ... }`). |
| `record` | Keyword | Struct record block type construct. |
| `enum` | Keyword | Algebraic enum type construct (`type Status :: enum { ... }`). |
| `contract` | Keyword | Interface protocol specification (`contract Geometry :: spec ... end`). |
| `impl` | Keyword | Contract or type implementation block (`impl Geometry for Sphere :: bind ... end`). |
| `bind` | Keyword | Block start keyword inside `impl` blocks. |
| `fn` / `def` | Keyword | Function definition keyword (`fn compute[T](in x: f64) -> f64 :: do ... end`). |
| `in` | Keyword | Immutable read-only function parameter mode. |
| `out` | Keyword | Return output function parameter mode. |
| `inout` | Keyword | Mutable borrow function parameter mode. |
| `do` | Keyword | Universal execution block start delimiter. |
| `pass` | Keyword | Universal loop body block start delimiter. |
| `end` | Keyword | Universal block boundary terminator. |
| `select` | Keyword | Structural pattern matching statement (`select expr :: case ... => ... end`). |
| `case` | Keyword | Pattern matching arm branch. |
| `loop` | Keyword | Iterator loop construct (`loop i in 0..100 :: pass ... end`). |
| `while` | Keyword | Conditional while loop (`while cond :: pass ... end`). |
| `tensor` | Keyword | Tensor matrix declaration keyword (`tensor M :: grid [ ... ]`). |
| `grid` | Keyword | Matrix grid construct indicator. |
| `#*` | Operator | Tensor GEMM matrix multiplication operator (`val C = A #* B`). |
| `<.>` | Operator | Vector inner dot product operator (`val d = u <.> v`). |
| `<x>` | Operator | Vector 3D cross product operator (`val c = u <x> v`). |
| `\|>` | Operator | Functional pipeline composition operator (`x \|> f \|> g`). |
| `::` | Operator | Scope resolution and block delimiter (`std::io::println`, `type P :: record`). |
| `:=` | Operator | Reactive signal binding operator (`var s := initial`). |
| `<==` | Operator | Reactive signal update operator (`s <== new_value`). |
| `@map` | Operator | Parallel vectorized map transform (`list @map \|x\| => x * 2`). |
| `@filter` | Operator | Vectorized predicate filter (`list @filter \|x\| => x > 0`). |
| `@reduce` | Operator | Vectorized fold reduction (`list @reduce(0) \|acc, x\| => acc + x`). |
| `@{` | Operator | Record struct literal instantiation syntax (`Point@{ x: 10, y: 20 }`). |
| `..=` | Operator | Inclusive numeric range iterator (`0..=100`). |

---

## CHAPTER 3: VARIABLES, MUTABILITY MODES & LIFETIMES

### 3.1 Immutable Values (`val`)
By default, variables declared with `val` cannot be reassigned:
```v0idskript
val pi: f64 = 3.1415926535;
val message: str = "Hello, V0IDSKRIPT!";
```

### 3.2 Mutable Variables (`var`)
To allow variable mutation, use `var`:
```v0idskript
var score: i32 = 0;
score = score + 100;
```

### 3.3 Pinned Memory Handles (`pin`)
For performance-critical buffer allocations that must remain contiguous in heap memory:
```v0idskript
pin frame_buffer: Array = [0, 0, 0, 0, 0, 0, 0, 0];
```

---

## CHAPTER 4: DATA TYPES

### 4.1 Primitive Types
- **Integers:** `i8`, `i16`, `i32`, `i64` (Signed), `u8`, `u16`, `u32`, `u64` (Unsigned).
- **Floats:** `f32`, `f64`.
- **Booleans:** `bool` (`true`, `false`).
- **Strings:** `str`.
- **Nil:** `nil`.

### 4.2 Record Structs (`record`)
Record structs group named fields together into a distinct data type:
```v0idskript
type Point3D :: record {
    x: f64,
    y: f64,
    z: f64
}

# Instantiating a record struct
val p = Point3D@{ x: 10.0, y: 20.0, z: 30.0 };
std::io::printf("Point X: %.2f", p.x);
```

### 4.3 Algebraic Enums (`enum`)
Enums can represent discrete states or carry tuple payload data:
```v0idskript
type NetworkStatus :: enum {
    Disconnected,
    Connecting(str),
    Connected(i32)
}

val status = NetworkStatus::Connected(200);
```

---

## CHAPTER 5: CONTROL FLOW & PATTERN MATCHING

### 5.1 Conditionals (`if / else`)
```v0idskript
val energy = 75.0;

if (energy > 50.0) :: do
    std::io::println("Energy levels optimal.");
end else :: do
    std::io::println("Low energy warning.");
end
```

### 5.2 Loop Iterators (`loop` & `while`)
```v0idskript
# Range iterator loop
loop i in 0..10 :: pass
    std::io::printf("Index: %d", i);
end

# While loop
var count = 5;
while (count > 0) :: pass
    std::io::printf("Countdown: %d", count);
    count = count - 1;
end
```

### 5.3 Pattern Matching (`select / case`)
```v0idskript
val current_status = NetworkStatus::Connected(200);

select current_status ::
    case NetworkStatus::Disconnected =>
        std::io::println("Status: Offline")
    case NetworkStatus::Connecting(host) =>
        std::io::printf("Connecting to %s...", host)
    case NetworkStatus::Connected(code) if code == 200 =>
        std::io::println("Status: Online (200 OK)")
    else =>
        std::io::println("Unknown status state")
end
```

---

## CHAPTER 6: FUNCTIONS, PARAMETER MODES & CLOSURES

### 6.1 Parameter Passing Modes (`in`, `inout`, `out`)
- `in`: Read-only parameter (default).
- `inout`: Mutable borrow handle.
- `out`: Return value output parameter.

```v0idskript
fn scale_vector(in factor: f64, inout v: Vec3) :: do
    v.x = v.x * factor;
    v.y = v.y * factor;
    v.z = v.z * factor;
end
```

### 6.2 Generic Functions
```v0idskript
fn swap[T](inout a: T, inout b: T) :: do
    val temp = a;
    a = b;
    b = temp;
end
```

### 6.3 Closures & Lambda Expressions
```v0idskript
val numbers = [1, 2, 3, 4, 5];
val squared = numbers @map |x| => x * x;
```

---

## CHAPTER 7: CONTRACTS (TRAITS) & IMPLEMENTATION BINDS

Contracts define protocol interfaces that types can implement using `impl ... for ... :: bind`:

```v0idskript
type Circle :: record {
    radius: f64
}

contract Shape :: spec
    fn area(in self) -> f64;
end

impl Shape for Circle :: bind
    fn area(in self) -> f64 :: do
        return std::math::PI * self.radius * self.radius;
    end
end

val c = Circle@{ radius: 10.0 };
std::io::printf("Circle Area: %.2f", c.area());
```

---

## CHAPTER 8: TENSOR GRID MATRIX & VECTOR OPERATORS

### 8.1 Tensor Grid Matrix Multiplication (`#*`)
V0IDSKRIPT provides contiguous GEMM matrix multiplication via `#*`:

```v0idskript
tensor Matrix_A :: grid [
    1.0, 2.0 ;
    3.0, 4.0
]

tensor Matrix_B :: grid [
    5.0, 6.0 ;
    7.0, 8.0
]

val Matrix_C = Matrix_A #* Matrix_B;
std::io::println("GEMM Product Matrix C:");
std::io::println(Matrix_C);
```

### 8.2 Vector Dot Product (`<.>`) & Cross Product (`<x>`)
```v0idskript
val v1 = std::math::vec3(1.0, 0.0, 0.0);
val v2 = std::math::vec3(0.0, 1.0, 0.0);

val dot_val = v1 <.> v2;    # 0.0
val cross_vec = v1 <x> v2;  # Vec3(0.0, 0.0, 1.0)
```

---

## CHAPTER 9: GRAPHICS VIEWPORT ENGINE (`gfx::*`)

### 9.1 Viewport API Reference

| Function | Signature | Description |
| :--- | :--- | :--- |
| `gfx::init` | `init(w: i32, h: i32)` | Initializes the viewport canvas. |
| `gfx::clear` | `clear(color: str)` | Clears the viewport canvas background color. |
| `gfx::rect` | `rect(x, y, w, h, color, fill)` | Renders a 2D rectangle. |
| `gfx::circle` | `circle(x, y, r, color, fill)` | Renders a 2D circle. |
| `gfx::line` | `line(x1, y1, x2, y2, color, width)` | Renders a line segment. |
| `gfx::text` | `text(str, x, y, size, color)` | Renders text string on canvas. |

---

## CHAPTER 10: MACHINE LEARNING AUTOGRAD ENGINE (`std::ai::*`)

V0IDSKRIPT includes a scalar autograd engine that tracks forward mathematical operations and computes backward gradients automatically:

```v0idskript
val w1 = std::ai::Value(2.0, "w1");
val x1 = std::ai::Value(1.5, "x1");
val b  = std::ai::Value(0.5, "b");

# Forward Pass
val prod = std::ai::mul(w1, x1);
val y_pred = std::ai::add(prod, b);
val loss = std::ai::relu(y_pred);

# Backward Pass: Automatic Gradient Computation
loss.backward();

std::io::printf("Weight Gradient dw1: %.4f", w1.grad);
std::io::printf("Bias Gradient db:   %.4f", b.grad);
```

---

## CHAPTER 11: STANDARD LIBRARY API INDEX (`std::*`)

1. **`std::io`**: Standard output printing, formatted string output, warning/error logging, interactive console line reading (`println`, `print`, `printf`, `warn`, `error`, `read_line`).
2. **`std::math`**: Trigonometric, logarithmic, scalar, and 3D vector operations (`sin`, `cos`, `sqrt`, `pow`, `abs`, `random`, `clamp`, `vec2`, `vec3`, `vec4`, `mat4_identity`, `mat4_perspective`).
3. **`std::collections`**: High-performance data structures (`HashMap`, `Queue`).
4. **`std::time`**: Precision timing and performance benchmarks (`now`, `bench`).
5. **`std::ai`**: Scalar autograd graphs (`Value`, `add`, `mul`, `relu`).

---

*V0IDSKRIPT v4.0 Systems Kernel Specification © 2026 Arena.ai - Master Reference Manual.*
