export const EXAMPLES = [
  {
    id: '01_hello_world',
    title: '01. Language Primitives & Contracts (v4.0)',
    category: 'Core Fundamentals',
    description: 'Distinct V0IDSKRIPT v4.0 block bounds (do...end, record...end, bind...end), contracts, implementations, and vector operators.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 Systems Kernel Language Demo
# =========================================================

std::io::println("=================================================")
std::io::println("   V0IDSKRIPT v4.0 SYSTEMS KERNEL INITIALIZED   ")
std::io::println("=================================================")

# 1. Immutable (val) & Mutable (var) Declarations
val system_id: str = "V0ID-KERNEL-9"
var execution_step: i32 = 1

std::io::printf("Kernel ID: %s | Step: %d", system_id, execution_step)

# 2. Record Definition & Contract Implementation
type Sphere :: record {
    radius: f64,
    center: Vec3
}

contract Geometry :: spec
    fn volume(in self) -> f64;
end

impl Geometry for Sphere :: bind
    fn volume(in self) -> f64 :: do
        return (4.0 / 3.0) * std::math::PI * std::math::pow(self.radius, 3.0)
    end
end

val sphere = Sphere@{ radius: 5.0, center: std::math::vec3(0.0, 0.0, 0.0) }
std::io::printf("Sphere Radius 5.0 Volume: %.2f", sphere.volume())

# 3. Algebraic Enum & Select Pattern Matching
type Status :: enum {
    Ready,
    Processing(i32),
    Error(str)
}

fn handle_status(in state: Status) :: do
    select state ::
        case Status::Ready =>
            std::io::println("[STATUS] Engine Core Ready.")
        case Status::Processing(progress) =>
            std::io::printf("[STATUS] Engine Processing: %d%%", progress)
        case Status::Error(msg) =>
            std::io::printf("[STATUS] Engine Fault: %s", msg)
    end
end

handle_status(Status::Ready())
handle_status(Status::Processing(92))
handle_status(Status::Error("Memory alignment boundary check passed"))

# 4. Vectorized Map (@map) & Pipeline (|>)
val numbers = [1, 2, 3, 4, 5, 6, 7, 8]
val transformed = numbers @map |x| => x * x + 10

std::io::println("Vector Mapping (@map |x| => x * x + 10):")
std::io::println(transformed)
`
  },
  {
    id: '02_hangman_cli_game',
    title: '02. Interactive CLI Hangman Game (v4.0)',
    category: 'CLI Application',
    description: 'Interactive CLI text game written in V0IDSKRIPT v4.0 syntax with letter checking, gallows ASCII art, and state tracking.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 INTERACTIVE CLI HANGMAN GAME
# =========================================================

std::io::println("=================================================")
std::io::println("          V0IDSKRIPT CLI HANGMAN GAME            ")
std::io::println("=================================================")

val secret_word = "KERNEL"
var guessed_letters = []
var attempts_left = 6
var is_won = false

fn render_gallows(in attempts: i32) :: do
    std::io::println("\n+---+")
    std::io::println("|   |")
    if (attempts <= 5) :: do std::io::println("|   O") end else :: do std::io::println("|") end
    if (attempts == 4) :: do std::io::println("|   |") end
    else if (attempts == 3) :: do std::io::println("|  /|") end
    else if (attempts <= 2) :: do std::io::println("|  /|/") end
    else :: do std::io::println("|") end

    if (attempts == 1) :: do std::io::println("|  /") end
    else if (attempts == 0) :: do std::io::println("|  / /") end
    else :: do std::io::println("|") end
    std::io::println("===========")
end

fn get_masked_word(in word: str, in guessed: Array) -> str :: do
    var masked = ""
    loop i in 0..word.length :: pass
        val ch = word[i]
        if (guessed.includes(ch)) :: do
            masked = masked + ch + " "
        end else :: do
            masked = masked + "_ "
        end
    end
    return masked
end

val simulated_user_inputs = ["K", "E", "R", "N", "E", "L"]

loop step in 0..simulated_user_inputs.length :: pass
    if (is_won || attempts_left <= 0) :: do break; end

    render_gallows(attempts_left)
    val current_guess = simulated_user_inputs[step]
    
    std::io::printf("Current Word: %s", get_masked_word(secret_word, guessed_letters))
    std::io::printf("Guessing Letter: %s", current_guess)

    if (!guessed_letters.includes(current_guess)) :: do
        guessed_letters.push(current_guess)
        if (secret_word.includes(current_guess)) :: do
            std::io::println("-> CORRECT GUESS!")
        end else :: do
            attempts_left = attempts_left - 1
            std::io::println("-> WRONG GUESS!")
        end
    end

    # Check Win Condition
    var all_found = true
    loop idx in 0..secret_word.length :: pass
        if (!guessed_letters.includes(secret_word[idx])) :: do
            all_found = false
        end
    end

    if (all_found) :: do
        is_won = true
    end
end

std::io::println("\n=================================================")
if (is_won) :: do
    std::io::printf("VICTORY! You solved the word '%s'!", secret_word)
end else :: do
    std::io::printf("GAME OVER! Secret word was '%s'.", secret_word)
end
std::io::println("=================================================")
`
  },
  {
    id: '03_data_structures_bench',
    title: '03. HashMap, Binary Search & QuickSort (v4.0)',
    category: 'Algorithms',
    description: 'Implements HashMaps, Binary Search Tree traversals, QuickSort algorithms, and measures execution performance.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 DATA STRUCTURES & ALGORITHM SUITE
# =========================================================

std::io::println(">>> Executing High-Performance Data Structure Benchmarks <<<")

# 1. HashMap Test
val map = std::collections::HashMap()
map.insert("node_id", 1024)
map.insert("node_name", "COMPILER_CORE")
map.insert("active", true)

std::io::printf("HashMap Key 'node_id': %d", map.get("node_id"))
std::io::printf("HashMap Total Entries: %d", map.size())

# 2. Recursive QuickSort Algorithm
fn quicksort(in arr: Array) -> Array :: do
    if (arr.length <= 1) :: do return arr; end
    val pivot = arr[0]
    var left = []
    var right = []

    loop i in 1..arr.length :: pass
        if (arr[i] < pivot) :: do
            left.push(arr[i])
        end else :: do
            right.push(arr[i])
        end
    end

    return quicksort(left) + [pivot] + quicksort(right)
end

var raw_dataset = [42, 12, 89, 5, 23, 77, 1, 99, 34, 18, 65]
std::io::println("Unsorted Array:")
std::io::println(raw_dataset)

val sorted = std::time::bench("Recursive QuickSort 11 Elements", || => do
    return quicksort(raw_dataset)
end)

std::io::println("Sorted QuickSort Result:")
std::io::println(sorted)
`
  },
  {
    id: '04_2d_breakout_game',
    title: '04. 2D Physics Breakout Arcade Engine (v4.0)',
    category: '2D Game Engine',
    description: '2D Breakout Arcade game written in V0IDSKRIPT v4.0 with ball bouncing physics, paddle movement, brick destruction matrix, and 60 FPS canvas loop.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 2D PHYSICS BREAKOUT ARCADE ENGINE
# =========================================================

std::io::println("Initializing 2D Physics Engine & Breakout Viewport...")

gfx::init(800, 500)

val screen_w = 800
val screen_h = 500

var paddle_x = 340.0
val paddle_w = 120.0
val paddle_h = 16.0

var ball_x = 400.0
var ball_y = 300.0
var ball_vx = 4.0
var ball_vy = -4.0
val ball_r = 8.0

var score = 0

# Bricks Setup (4 rows x 8 columns)
val rows = 4
val cols = 8
val brick_w = 85.0
val brick_h = 20.0
var bricks = []

loop r in 0..rows :: pass
    loop c in 0..cols :: pass
        bricks.push({
            x: 50.0 + c * 90.0,
            y: 40.0 + r * 28.0,
            active: true,
            color: r == 0 ? "#ef4444" : r == 1 ? "#f59e0b" : r == 2 ? "#10b981" : "#3b82f6"
        })
    end
end

fn update_and_render_frame() :: do
    gfx::clear("#0f172a")

    # Render Active Bricks & Check Collisions
    loop i in 0..bricks.length :: pass
        val b = bricks[i]
        if (b.active) :: do
            gfx::rect(b.x, b.y, brick_w, brick_h, b.color, true)
            gfx::rect(b.x, b.y, brick_w, brick_h, "#1e293b", false)

            if (ball_x > b.x && ball_x < b.x + brick_w && ball_y > b.y && ball_y < b.y + brick_h) :: do
                b.active = false
                ball_vy = -ball_vy
                score = score + 100
            end
        end
    end

    # Position Integration
    ball_x = ball_x + ball_vx
    ball_y = ball_y + ball_vy

    # Wall Bounce Physics
    if (ball_x - ball_r < 0.0 || ball_x + ball_r > screen_w) :: do ball_vx = -ball_vx; end
    if (ball_y - ball_r < 0.0) :: do ball_vy = -ball_vy; end

    # Paddle Bounce Physics
    if (ball_y + ball_r >= screen_h - 40.0 && ball_x >= paddle_x && ball_x <= paddle_x + paddle_w) :: do
        ball_vy = -std::math::abs(ball_vy)
    end

    # Draw Paddle & Ball
    gfx::rect(paddle_x, screen_h - 40.0, paddle_w, paddle_h, "#3b82f6", true)
    gfx::circle(ball_x, ball_y, ball_r, "#f59e0b", true)

    # Render Canvas HUD
    gfx::text("SCORE: " + score, 20, 25, 16, "#ffffff")
    gfx::text("V0IDSKRIPT v4.0 2D BREAKOUT PHYSICS ENGINE", 480, 25, 14, "#64748b")
end

loop frame in 0..5 :: pass
    update_and_render_frame()
end

std::io::println("Breakout 2D physics frame passes rendered successfully.")
`
  },
  {
    id: '05_3d_software_renderer',
    title: '05. 3D Perspective Software Engine (v4.0)',
    category: '3D Graphics',
    description: '3D perspective software renderer displaying rotating 3D meshes, 3D vector transformations, backface projection, and wireframe rendering.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 3D PERSPECTIVE SOFTWARE ENGINE
# =========================================================

std::io::println("Initializing 3D Perspective Software Graphics Engine...")

gfx::init(800, 500)

val width = 800
val height = 500
val fov = 300.0

# 3D Cube Vertices
val vertices = [
    [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1],
    [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1]
]

# 3D Cube Edges
val edges = [
    [0,1], [1,2], [2,3], [3,0],
    [4,5], [5,6], [6,7], [7,4],
    [0,4], [1,5], [2,6], [3,7]
]

fn render_3d_frame(in angle_y: f64) :: do
    gfx::clear("#0f172a")

    val cos_y = std::math::cos(angle_y)
    val sin_y = std::math::sin(angle_y)

    var projected_points = []

    # Rotate & Project 3D Vertices to 2D Canvas Screen
    loop i in 0..vertices.length :: pass
        val v = vertices[i]
        val rx = v[0] * cos_y - v[2] * sin_y
        val ry = v[1]
        val rz = v[0] * sin_y + v[2] * cos_y + 3.5

        val screen_x = width / 2 + (rx * fov) / rz
        val screen_y = height / 2 + (ry * fov) / rz

        projected_points.push([screen_x, screen_y])
    end

    # Render Wireframe Edges
    loop e_idx in 0..edges.length :: pass
        val e = edges[e_idx]
        val p1 = projected_points[e[0]]
        val p2 = projected_points[e[1]]
        gfx::line(p1[0], p1[1], p2[0], p2[1], "#3b82f6", 2)
    end

    # Render Vertex Points
    loop p_idx in 0..projected_points.length :: pass
        val p = projected_points[p_idx]
        gfx::circle(p[0], p[1], 4, "#10b981", true)
    end

    gfx::text("V0IDSKRIPT v4.0 3D PERSPECTIVE SOFTWARE ENGINE", 20, 30, 16, "#ffffff")
end

loop f in 0..8 :: pass
    render_3d_frame(f * 0.25)
end

std::io::println("3D Perspective software render pass complete.")
`
  },
  {
    id: '06_3d_fps_raycaster',
    title: '06. 3D FPS Raycasting Engine (Wolfenstein 3D)',
    category: '3D Game Engine',
    description: '3D Raycaster calculating perspective wall heights, raymarching FOV vectors, camera positioning, and ceiling/floor gradient passes.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 3D FPS RAYCASTING ENGINE
# =========================================================

std::io::println("Initializing 3D FPS Raycasting Engine...")

gfx::init(800, 500)

val screen_w = 800
val screen_h = 500

val map = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1]
]

val player_x = 3.5
val player_y = 2.5
val player_angle = 0.5
val fov = 1.0
val num_rays = 120

fn render_fps_pass() :: do
    gfx::clear("#0f172a")

    # Draw Ceiling & Floor Gradient
    gfx::rect(0, 0, screen_w, screen_h / 2, "#1e293b", true)
    gfx::rect(0, screen_h / 2, screen_w, screen_h / 2, "#0f172a", true)

    val ray_width = screen_w / num_rays

    # Raymarch across FOV
    loop i in 0..num_rays :: pass
        val ray_angle = (player_angle - fov / 2.0) + (i / num_rays) * fov
        var dist = 0.0
        var hit_wall = false

        val cos_a = std::math::cos(ray_angle)
        val sin_a = std::math::sin(ray_angle)

        while (!hit_wall && dist < 12.0) :: pass
            dist = dist + 0.05
            val check_x = std::math::floor(player_x + cos_a * dist)
            val check_y = std::math::floor(player_y + sin_a * dist)

            if (check_x >= 0 && check_x < 8 && check_y >= 0 && check_y < 6) :: do
                if (map[check_y][check_x] == 1) :: do
                    hit_wall = true
                end
            end
        end

        val corrected_dist = dist * std::math::cos(ray_angle - player_angle)
        val wall_height = (screen_h / corrected_dist)
        val wall_top = (screen_h - wall_height) / 2.0

        gfx::rect(i * ray_width, wall_top, ray_width + 1, wall_height, "#3b82f6", true)
    end

    gfx::text("V0IDSKRIPT v4.0 3D FPS RAYCASTING ENGINE", 20, 30, 16, "#ffffff")
end

render_fps_pass()
std::io::println("3D Raycaster viewport pass rendered successfully.")
`
  },
  {
    id: '07_tensor_gemm_matrix',
    title: '07. High-Dimensional Tensor Grid Engine (v4.0)',
    category: 'Math & Tensors',
    description: 'High-performance Tensor GEMM matrix operations using explicit tensor grid constructs, matrix multiplies (#*), dot products (<.>), and cross products (<x>).',
    code: `# =========================================================
# V0IDSKRIPT v4.0 HIGH-DIMENSIONAL TENSOR GRID ENGINE
# =========================================================

std::io::println(">>> Executing Tensor Grid Matrix Math Engine <<<")

# 1. Tensor Grid Matrix Declarations (tensor M :: grid [ ... ])
tensor Matrix_A :: grid [
    1.0, 2.0, 0.0, 0.5 ;
    0.0, 1.5, 3.0, 1.0 ;
    2.5, 0.0, 1.0, 0.0 ;
    0.0, 1.0, 0.0, 2.0
]

tensor Matrix_B :: grid [
    2.0, 0.0, 1.0, 0.0 ;
    1.0, 3.0, 0.0, 1.0 ;
    0.0, 1.0, 2.0, 0.5 ;
    1.5, 0.0, 0.0, 1.0
]

std::io::println("Tensor Matrix A (4x4):")
std::io::println(Matrix_A)

std::io::println("Tensor Matrix B (4x4):")
std::io::println(Matrix_B)

# 2. Tensor GEMM Matrix Multiplication Operator (#*)
val Matrix_C = std::time::bench("Tensor GEMM Matrix Multiply (#*)", || => do
    return Matrix_A #* Matrix_B
end)

std::io::println("Tensor GEMM Result Matrix C (A #* B):")
std::io::println(Matrix_C)

# 3. Vector Dot Product (<.>) & Cross Product (<x>) Operators
val v1 = std::math::vec3(1.0, 0.0, 0.0)
val v2 = std::math::vec3(0.0, 1.0, 0.0)

val dot_res = v1 <.> v2
val cross_res = v1 <x> v2

std::io::printf("Vector v1 <.> v2 Dot Product: %.2f", dot_res)
std::io::printf("Vector v1 <x> v2 Cross Product: %s", cross_res)
`
  },
  {
    id: '08_autograd_neural_network',
    title: '08. Neural Autograd Computational Graph (v4.0)',
    category: 'Machine Learning',
    description: 'Automatic Differentiation (Autograd) scalar computational engine computing forward predictions, backward gradients, and optimizing neural weights.',
    code: `# =========================================================
# V0IDSKRIPT v4.0 NEURAL AUTOGRAD COMPUTATIONAL GRAPH
# =========================================================

std::io::println(">>> Initializing Neural Autograd Computational Engine <<<")

val w1 = std::ai::Value(2.0, "w1")
val x1 = std::ai::Value(1.5, "x1")
val bias = std::ai::Value(0.5, "bias")

# Forward Pass: f = relu((w1 * x1) + bias)
val prod = std::ai::mul(w1, x1)
val y_pred = std::ai::add(prod, bias)
val result_node = std::ai::relu(y_pred)

std::io::printf("Forward Pass Output: %.4f", result_node.data)

# Backward Pass: Automatic Gradient Computation
result_node.backward()

std::io::println("\nComputed Automatic Gradients:")
std::io::printf("Gradient dw1:   %.4f", w1.grad)
std::io::printf("Gradient dx1:   %.4f", x1.grad)
std::io::printf("Gradient dbias: %.4f", bias.grad)

# Gradient Descent Weight Update
val learning_rate = 0.01
w1.data = w1.data - learning_rate * w1.grad
bias.data = bias.data - learning_rate * bias.grad

std::io::printf("\nUpdated Weight w1: %.4f | Updated Bias: %.4f", w1.data, bias.data)
`
  }
];
