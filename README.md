# V0IDSKRIPT v3.0 Systems Kernel Specification & Language Reference
> **Document Version:** 3.0.0 (Systems Kernel Specification)  
> **Compiler Architecture:** Native WASM JIT & High-Performance Bytecode Engine  

---

## 1. Architectural Design & Philosophy

**V0IDSKRIPT v3.0** is an independent, high-density systems and application programming language designed from the ground up to support high-performance game engines, neural network autograd computational graphs, data structures, and CLI software.

It features a distinct block structure grammar (`do...end`, `record...end`, `bind...end`, `spec...end`, `pass...end`), explicit variable ownership (`val`, `var`, `pin`), mode-annotated function parameters (`in`, `out`, `inout`), domain-specific matrix operators (`#*`, `<.>`, `<x>`), and vectorized parallel operators (`@map`, `@filter`, `@reduce`).

---

## 2. Token & Grammar Reference Index

### 2.1 Keyword Lexicon

| Keyword | Description & Syntax Structure |
| :--- | :--- |
| `val` | Immutable variable binding (`val x: f64 = 10.0;`) |
| `var` | Mutable variable binding (`var count: i32 = 0;`) |
| `pin` | Pinned memory buffer handle (`pin buf: Array = [1, 2, 3];`) |
| `type` | Type definition keyword (`type Point :: record { ... }`) |
| `record` | Record / Struct data construct (`type Point :: record { x: f64, y: f64 }`) |
| `enum` | Algebraic Enum data construct (`type Status :: enum { Idle, Active(i32) }`) |
| `contract` | Contract interface specification (`contract Renderable :: spec ... end`) |
| `impl` | Implementation block for contracts or types (`impl Geometry for Sphere :: bind ... end`) |
| `bind` | Block start keyword for contract/type implementations |
| `fn` / `def` | Function definition keyword (`fn calc[T](in x: f64) -> f64 :: do ... end`) |
| `in` | Immutable read-only parameter passing mode (`in param: Type`) |
| `out` | Write-out parameter return mode (`out result: Type`) |
| `inout` | Mutable borrow parameter mode (`inout state: State`) |
| `do` | Universal execution block start keyword |
| `pass` | Loop block start keyword |
| `end` | Universal block boundary terminator |
| `select` | Pattern matching selection statement (`select state :: case ... => ... else => ... end`) |
| `case` | Pattern branch inside `select` statement |
| `loop` | Loop iterator construct (`loop i in 0..100 :: pass ... end`) |
| `while` | Conditional while loop (`while cond :: pass ... end`) |
| `tensor` | Tensor variable declaration block |
| `grid` | Tensor matrix grid construct (`tensor M :: grid [ 1, 2 ; 3, 4 ]`) |

### 2.2 Operator & Sigil Reference Index

| Operator | Name | Description & Usage |
| :--- | :--- | :--- |
| `#*` | **Matrix GEMM Multiply** | High-speed tensor dot-product matrix multiplication (`A #* B`). |
| `<.>` | **Vector Dot Product** | Vector inner product operator (`u <.> v`). |
| `<x>` | **Vector Cross Product** | Vector 3D cross product operator (`u <x> v`). |
| `\|>` | **Pipeline Composition** | Pipes left expression output into right function (`x \|> transform`). |
| `::` | **Namespace / Type Scope** | Resolves modules, types, and block bounds (`std::io::println`, `type Point :: record`). |
| `:=` | **Signal Binding** | Binds a reactive signal variable (`signal := initial`). |
| `@map` | **Vector Map** | Applies parallel map transform across array (`arr @map \|x\| => x * 2`). |
| `@filter` | **Vector Filter** | Filters array using predicate function (`arr @filter \|x\| => x > 0`). |
| `@{` | **Struct Instantiation** | Instantiates a record struct (`Point@{ x: 10, y: 20 }`). |
| `..=` | **Inclusive Range** | Inclusive numeric range iterator (`0..=100`). |

---

## 3. Code Examples Across Domain Categories

### 3.1 Core Language: Contracts & Pattern Matching
```v0idskript
type Point :: record {
    x: f64,
    y: f64
}

contract Drawable :: spec
    fn draw(in self)
end

impl Drawable for Point :: bind
    fn draw(in self) :: do
        std::io::printf("Point Location: (%.2f, %.2f)", self.x, self.y)
    end
end

type Status :: enum {
    Ready,
    Running(i32)
}

fn evaluate(in s: Status) :: do
    select s ::
        case Status::Ready => std::io::println("Engine Ready")
        case Status::Running(pct) => std::io::printf("Running: %d%%", pct)
    end
end
```

### 3.2 High-Performance Tensor Grid Math
```v0idskript
tensor Matrix_A :: grid [
    1.0, 2.0 ;
    3.0, 4.0
]

tensor Matrix_B :: grid [
    5.0, 6.0 ;
    7.0, 8.0
]

# High-Speed GEMM Dot Product
val Matrix_C = Matrix_A #* Matrix_B
std::io::println("Matrix GEMM Product C (A #* B):")
std::io::println(Matrix_C)
```

---

*V0IDSKRIPT v3.0 Specification Manual © 2026 V0idplayy - Systems Kernel Edition.*
