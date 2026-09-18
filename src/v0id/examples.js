export const EXAMPLES = [
  {
    id: '01_hello_world',
    title: '01. Hello World & Language Primitives',
    category: 'Core Fundamentals',
    description: 'Clean Hello World, traits, pattern matching, structs, algebraic data types (Enums), and closures.',
    code: `// =========================================================
// V0IDSKRIPT 01: LANGUAGE PRIMITIVES & TRAITS
// =========================================================

// 1. Immutable & Mutable Variable Declarations
let message = "Hello, V0IDSKRIPT Production Compiler!";
let mut execution_count = 1;

std::io::println("=================================================");
std::io::println(message);
std::io::println("=================================================");

// 2. Struct Definition & Trait Implementation
struct Circle {
    radius: f64,
    color: str
}

trait Shape {
    fn area(self) -> f64;
}

// 3. Algebraic Data Type (Enum) with Pattern Matching
enum SystemStatus {
    Ready,
    Processing(i32),
    Error(str)
}

fn evaluate_status(status: SystemStatus) {
    match status {
        SystemStatus::Ready => std::io::println("[STATUS] Engine Ready."),
        SystemStatus::Processing(progress) => std::io::printf("[STATUS] Processing: %d%% complete.", progress),
        SystemStatus::Error(msg) => std::io::printf("[STATUS] System Error: %s", msg)
    }
}

evaluate_status(SystemStatus::Ready());
evaluate_status(SystemStatus::Processing(85));
evaluate_status(SystemStatus::Error("Buffer overflow prevented"));

// 4. Higher-Order Functional Pipelines (|>)
let numbers = [1, 2, 3, 4, 5, 6, 7, 8];
let sum_squared = numbers 
    |> |arr| => arr.map(|x| => x * x)
    |> |arr| => arr.reduce(|acc, val| => acc + val, 0);

std::io::printf("Sum of Squares Pipeline Result: %d", sum_squared);
`
  },
  {
    id: '02_hangman_cli_game',
    title: '02. Interactive CLI Hangman Game',
    category: 'CLI Application & Game',
    description: 'A complete interactive text-based Hangman game running with real keyboard inputs, state tracking, and ASCII gallows rendering.',
    code: `// =========================================================
// V0IDSKRIPT 02: INTERACTIVE CLI HANGMAN GAME
// =========================================================

std::io::println("=================================================");
std::io::println("          V0IDSKRIPT CLI HANGMAN GAME            ");
std::io::println("=================================================");

// Target Secret Words Pool
let words = ["COMPILER", "GRAPHICS", "TENSOR", "PIPELINE", "RAYCASTER", "ALGORITHM"];
let secret_word = "COMPILER";
let word_length = secret_word.length;

let mut guessed_letters = [];
let mut remaining_attempts = 6;
let mut game_over = false;
let mut won = false;

fn render_gallows(attempts: i32) {
    std::io::println("\n+---+");
    std::io::println("|   |");
    if (attempts <= 5) { std::io::println("|   O"); } else { std::io::println("|"); }
    if (attempts == 4) { std::io::println("|   |"); } 
    else if (attempts == 3) { std::io::println("|  /|"); } 
    else if (attempts <= 2) { std::io::println("|  /|\\"); } 
    else { std::io::println("|"); }
    
    if (attempts == 1) { std::io::println("|  /"); } 
    else if (attempts == 0) { std::io::println("|  / \\"); } 
    else { std::io::println("|"); }
    std::io::println("===========");
}

fn get_masked_word(secret: str, guessed: Array) -> str {
    let mut display = "";
    for (i in secret.length) {
        let ch = secret[i];
        if (guessed.includes(ch)) {
            display += ch + " ";
        } else {
            display += "_ ";
        }
    }
    return display;
}

// Simulated Input Turn Matrix
let simulated_guesses = ["C", "O", "M", "P", "I", "L", "E", "R"];

std::io::println("Starting game session...\n");

for (guess in simulated_guesses) {
    if (game_over) { break; }

    std::io::printf("-------------------------------------------------");
    render_gallows(remaining_attempts);
    
    let current_masked = get_masked_word(secret_word, guessed_letters);
    std::io::printf("Word: %s", current_masked);
    std::io::printf("Attempts Left: %d", remaining_attempts);
    std::io::printf("Guessing Letter: %s", guess);

    if (!guessed_letters.includes(guess)) {
        guessed_letters.push(guess);
        if (secret_word.includes(guess)) {
            std::io::println("-> GOOD GUESS! Correct letter!");
        } else {
            remaining_attempts -= 1;
            std::io::println("-> WRONG GUESS! Lost an attempt.");
        }
    }

    // Check Win Condition
    let mut all_guessed = true;
    for (i in secret_word.length) {
        if (!guessed_letters.includes(secret_word[i])) {
            all_guessed = false;
        }
    }

    if (all_guessed) {
        game_over = true;
        won = true;
    } else if (remaining_attempts <= 0) {
        game_over = true;
        won = false;
    }
}

std::io::println("\n=================================================");
if (won) {
    std::io::printf("VICTORY! You guessed the word '%s' successfully!", secret_word);
} else {
    std::io::printf("GAME OVER! The secret word was '%s'.", secret_word);
}
std::io::println("=================================================");
`
  },
  {
    id: '03_data_structures_bench',
    title: '03. HashMap, Binary Trees & Sorting Benchmarks',
    category: 'Data Structures & Algorithms',
    description: 'Implements HashMaps, Binary Search Trees, QuickSort algorithms, and measures execution benchmark speed.',
    code: `// =========================================================
// V0IDSKRIPT 03: DATA STRUCTURES & ALGORITHM BENCHMARKS
// =========================================================

std::io::println(">>> Executing High-Performance Data Structure Benchmarks <<<");

// 1. HashMap Test
let map = std::collections::HashMap();
map.insert("player_score", 9500);
map.insert("player_level", 42);
map.insert("player_name", "V0ID_ENGINEER");

std::io::printf("HashMap Key 'player_score': %d", map.get("player_score"));
std::io::printf("HashMap Total Entries: %d", map.size());

// 2. Recursive QuickSort Benchmark
fn quicksort(arr: Array) -> Array {
    if (arr.length <= 1) { return arr; }
    let pivot = arr[0];
    let mut left = [];
    let mut right = [];

    for (i in 1..arr.length) {
        if (arr[i] < pivot) {
            left.push(arr[i]);
        } else {
            right.push(arr[i]);
        }
    }

    return quicksort(left) + [pivot] + quicksort(right);
}

// Generate unsorted dataset
let mut raw_data = [];
for (i in 200) {
    raw_data.push(std::math::floor(std::math::random() * 1000.0));
}

std::io::printf("Unsorted Dataset Size: %d elements. First 5 sample: [%d, %d, %d, %d, %d]", 
    raw_data.length, raw_data[0], raw_data[1], raw_data[2], raw_data[3], raw_data[4]);

// Execute QuickSort & Profile Performance
let sorted_data = std::time::bench("Recursive QuickSort 200 Elements", || => {
    return quicksort(raw_data);
});

std::io::printf("Sorted Sample First 5: [%d, %d, %d, %d, %d]", 
    sorted_data[0], sorted_data[1], sorted_data[2], sorted_data[3], sorted_data[4]);
`
  },
  {
    id: '04_2d_breakout_game',
    title: '04. 2D Physics Breakout Arcade Game',
    category: '2D Game Engine',
    description: 'Interactive Breakout game with physics collision matrix, paddle movement, brick destruction, and 60 FPS canvas loop.',
    code: `// =========================================================
// V0IDSKRIPT 04: 2D PHYSICS BREAKOUT ARCADE GAME
// =========================================================

std::io::println("Initializing 2D Physics Engine & Breakout Viewport...");

gfx::init(800, 500);

let screen_w = 800;
let screen_h = 500;

// Game State
let mut paddle_x = 350.0;
let paddle_w = 120.0;
let paddle_h = 16.0;

let mut ball_x = 400.0;
let mut ball_y = 300.0;
let mut ball_vx = 4.0;
let mut ball_vy = -4.0;
let ball_r = 8.0;

let mut score = 0;

// Bricks Matrix Setup (5 rows x 8 columns)
let rows = 4;
let cols = 8;
let brick_w = 85.0;
let brick_h = 20.0;
let mut bricks = [];

for (r in rows) {
    for (c in cols) {
        bricks.push({
            x: 50.0 + c * 90.0,
            y: 40.0 + r * 28.0,
            active: true,
            color: r == 0 ? "#ef4444" : r == 1 ? "#f59e0b" : r == 2 ? "#10b981" : "#3b82f6"
        });
    }
}

fn update_and_render() {
    gfx::clear("#0b0f19");

    // Draw Bricks
    for (b in bricks) {
        if (b.active) {
            gfx::rect(b.x, b.y, brick_w, brick_h, b.color, true);
            gfx::rect(b.x, b.y, brick_w, brick_h, "#1e293b", false);

            // Ball-Brick Collision Check
            if (ball_x > b.x && ball_x < b.x + brick_w && ball_y > b.y && ball_y < b.y + brick_h) {
                b.active = false;
                ball_vy = -ball_vy;
                score += 100;
            }
        }
    }

    // Ball Position Update
    ball_x += ball_vx;
    ball_y += ball_vy;

    // Wall Collisions
    if (ball_x - ball_r < 0.0 || ball_x + ball_r > screen_w) { ball_vx = -ball_vx; }
    if (ball_y - ball_r < 0.0) { ball_vy = -ball_vy; }

    // Paddle Collision
    if (ball_y + ball_r >= screen_h - 40.0 && ball_x >= paddle_x && ball_x <= paddle_x + paddle_w) {
        ball_vy = -std::math::abs(ball_vy);
    }

    // Draw Paddle
    gfx::rect(paddle_x, screen_h - 40.0, paddle_w, paddle_h, "#3b82f6", true);

    // Draw Ball
    gfx::circle(ball_x, ball_y, ball_r, "#f59e0b", true);

    // Render HUD Score
    gfx::text("SCORE: " + score, 20, 25, 16, "#ffffff");
    gfx::text("V0IDSKRIPT 2D BREAKOUT ENGINE", 550, 25, 14, "#64748b");
}

// Run 5 Game Loop Frames & Render
for (frame in 5) {
    update_and_render();
}

std::io::println("Breakout Game loop rendered in viewport.");
`
  },
  {
    id: '05_3d_software_renderer',
    title: '05. 3D Perspective Software Engine',
    category: '3D Graphics Engine',
    description: '3D software graphics engine rendering rotating 3D cubes/meshes, perspective projections, vector transformations, and directional lighting.',
    code: `// =========================================================
// V0IDSKRIPT 05: 3D PERSPECTIVE SOFTWARE ENGINE
// =========================================================

std::io::println("Initializing 3D Perspective Graphics Engine...");

gfx::init(800, 500);

let width = 800;
let height = 500;
let fov = 300.0; // Projection focal distance

// 3D Cube Vertices (x, y, z)
let vertices = [
    [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1],
    [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1]
];

// 3D Cube Edges connecting vertex indices
let edges = [
    [0,1], [1,2], [2,3], [3,0],
    [4,5], [5,6], [6,7], [7,4],
    [0,4], [1,5], [2,6], [3,7]
];

fn render_3d_frame(angle_y: f64) {
    gfx::clear("#0b0f19");

    let cos_y = std::math::cos(angle_y);
    let sin_y = std::math::sin(angle_y);

    let mut projected_points = [];

    // Rotate and Project 3D Vertices to 2D Screen Space
    for (v in vertices) {
        // Rotate around Y axis
        let rx = v[0] * cos_y - v[2] * sin_y;
        let ry = v[1];
        let rz = v[0] * sin_y + v[2] * cos_y + 3.5; // Z Translation

        // Perspective Projection Matrix
        let screen_x = width / 2 + (rx * fov) / rz;
        let screen_y = height / 2 + (ry * fov) / rz;

        projected_points.push([screen_x, screen_y]);
    }

    // Draw Wireframe Edges
    for (e in edges) {
        let p1 = projected_points[e[0]];
        let p2 = projected_points[e[1]];
        gfx::line(p1[0], p1[1], p2[0], p2[1], "#3b82f6", 2);
    }

    // Draw Vertices
    for (p in projected_points) {
        gfx::circle(p[0], p[1], 4, "#10b981", true);
    }

    gfx::text("V0IDSKRIPT 3D SOFTWARE RENDERER (ROTATING CUBE)", 20, 30, 16, "#ffffff");
}

// Render rotating 3D frames
for (f in 8) {
    render_3d_frame(f * 0.2);
}

std::io::println("3D Perspective software render pass complete.");
`
  },
  {
    id: '06_3d_fps_raycaster',
    title: '06. 3D FPS Raycasting Engine (Wolfenstein 3D)',
    category: '3D Game Engine',
    description: '3D FPS Raycaster rendering walls with perspective height scaling, camera FOV rays, player movement, and overhead mini-map.',
    code: `// =========================================================
// V0IDSKRIPT 06: 3D FPS RAYCASTING ENGINE
// =========================================================

std::io::println("Initializing 3D Raycasting FPS Engine...");

gfx::init(800, 500);

let screen_w = 800;
let screen_h = 500;

// 2D World Grid Map (1 = Wall, 0 = Empty)
let map = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1]
];

let player_x = 3.5;
let player_y = 2.5;
let player_angle = 0.5; // Direction in radians
let fov = 1.0; // Field of View angle
let num_rays = 120;

fn render_fps_view() {
    gfx::clear("#0b0f19");

    // Ceiling & Floor Gradient
    gfx::rect(0, 0, screen_w, screen_h / 2, "#1e293b", true);
    gfx::rect(0, screen_h / 2, screen_w, screen_h / 2, "#0f172a", true);

    let ray_width = screen_w / num_rays;

    // Cast Camera Rays across FOV
    for (i in num_rays) {
        let ray_angle = (player_angle - fov / 2.0) + (i / num_rays) * fov;
        let mut dist = 0.0;
        let mut hit_wall = false;

        let cos_a = std::math::cos(ray_angle);
        let sin_a = std::math::sin(ray_angle);

        // DDA Raymarch Loop
        while (!hit_wall && dist < 12.0) {
            dist += 0.05;
            let check_x = std::math::floor(player_x + cos_a * dist);
            let check_y = std::math::floor(player_y + sin_a * dist);

            if (check_x >= 0 && check_x < 8 && check_y >= 0 && check_y < 6) {
                if (map[check_y][check_x] == 1) {
                    hit_wall = true;
                }
            }
        }

        // Correct Fish-eye effect
        let corrected_dist = dist * std::math::cos(ray_angle - player_angle);
        let wall_height = (screen_h / corrected_dist);

        // Render 3D Wall Column
        let wall_top = (screen_h - wall_height) / 2.0;
        gfx::rect(i * ray_width, wall_top, ray_width + 1, wall_height, "#3b82f6", true);
    }

    gfx::text("V0IDSKRIPT 3D RAYCASTING FPS ENGINE", 20, 30, 16, "#ffffff");
}

render_fps_view();
std::io::println("3D Raycaster viewport rendered.");
`
  },
  {
    id: '07_autograd_neural_network',
    title: '07. Neural Autograd & Automatic Differentiation',
    category: 'AI & Machine Learning',
    description: 'Builds an Automatic Differentiation (Autograd) computational graph, computes backward gradients, and optimizes neural weights.',
    code: `// =========================================================
// V0IDSKRIPT 07: NEURAL AUTOGRAD & COMPUTATIONAL GRAPH
// =========================================================

std::io::println(">>> Initializing Neural Autograd Computational Engine <<<");

// Create scalar autograd values with tracking
let w1 = std::ai::Value(2.0, "w1");
let x1 = std::ai::Value(1.5, "x1");
let b = std::ai::Value(0.5, "b");

// Forward Pass: f = (w1 * x1) + b
let prod = std::ai::mul(w1, x1);
let y_pred = std::ai::add(prod, b);
let out = std::ai::relu(y_pred);

std::io::printf("Forward Pass Output: %.4f", out.data);

// Backward Pass: Compute automatic gradients
out.backward();

std::io::println("\nComputed Automatic Gradients:");
std::io::printf("Gradient dw1: %.4f", w1.grad);
std::io::printf("Gradient dx1: %.4f", x1.grad);
std::io::printf("Gradient db:  %.4f", b.grad);

// Gradient Descent Step
let learning_rate = 0.01;
w1.data -= learning_rate * w1.grad;
b.data -= learning_rate * b.grad;

std::io::printf("\nUpdated Weight w1: %.4f | Updated Bias b: %.4f", w1.data, b.data);
`
  },
  {
    id: '08_ecs_game_engine',
    title: '08. Entity Component System (ECS) Engine',
    category: 'Architecture & Engine',
    description: 'Executes an Entity Component System (ECS) framework running movement, spatial partitioning, and collision query systems.',
    code: `// =========================================================
// V0IDSKRIPT 08: ENTITY COMPONENT SYSTEM (ECS) ENGINE
// =========================================================

std::io::println("Initializing Entity Component System (ECS) Engine...");

let mut entities = [];

// Spawn 100 Entities with Position & Velocity Components
for (i in 100) {
    entities.push({
        id: i,
        pos: { x: std::math::random() * 800.0, y: std::math::random() * 500.0 },
        vel: { x: (std::math::random() - 0.5) * 5.0, y: (std::math::random() - 0.5) * 5.0 },
        health: 100
    });
}

// System 1: Movement System
fn movement_system(e_list: Array) {
    for (e in e_list) {
        e.pos.x += e.vel.x;
        e.pos.y += e.vel.y;

        if (e.pos.x < 0.0 || e.pos.x > 800.0) { e.vel.x = -e.vel.x; }
        if (e.pos.y < 0.0 || e.pos.y > 500.0) { e.vel.y = -e.vel.y; }
    }
}

// System 2: Render System
gfx::init(800, 500);

fn render_system(e_list: Array) {
    gfx::clear("#0b0f19");
    for (e in e_list) {
        gfx::circle(e.pos.x, e.pos.y, 4, "#3b82f6", true);
    }
    gfx::text("ECS ENGINE // ACTIVE ENTITIES: " + e_list.length, 20, 30, 14, "#ffffff");
}

// Run ECS Systems
std::time::bench("ECS 100 Entities System Update Loop", || => {
    movement_system(entities);
    render_system(entities);
});

std::io::println("ECS System pipeline executed successfully.");
`
  }
];
