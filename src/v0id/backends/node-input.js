/**
 * V0IDSKRIPT — Node input backend
 * ============================================================================
 * Under the Node CLI `input::is_key_pressed` used to always return false and
 * `std::io::read_line` returned immediately. This backend gives both a real
 * source of truth:
 *
 *  - with a TTY: stdin is switched to raw mode, so individual key presses
 *    (arrows, space, letters, digits, enter, escape, ...) update the key state
 *    map that `input::is_key_pressed` reads. SGR mouse tracking is enabled so
 *    `input::get_mouse` reports real coordinates inside the graphics viewport.
 *  - without a TTY: keys stay false (nothing can be pressed) and lines are read
 *    from the piped stdin stream instead.
 *
 * Because raw mode swallows normal line editing, the line reader is implemented
 * here too: characters are echoed and assembled until Enter is pressed, so
 * `std::io::read_line` works with and without a TTY.
 */

const KEY_NAMES = {
  ' ': 'space',
  '\r': 'enter',
  '\n': 'enter',
  '\t': 'tab',
  '\x7f': 'backspace',
  '\x1b': 'escape'
};

export class TerminalInputBackend {
  constructor({
    stdin = process.stdin,
    stdout = process.stdout,
    holdMs = 250,
    mouse = true,
    viewport = () => ({ width: 800, height: 500 }),
    log = () => {},
    onExit = null
  } = {}) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.holdMs = holdMs;
    this.mouseEnabled = mouse;
    this.viewport = viewport;
    this.log = log;
    this.onExit = onExit;

    /** Plain object consumed by the interpreter (`keyStates[name] === true`). */
    this.keyStates = Object.create(null);
    this.mouseState = {
      x: 0,
      y: 0,
      isDown: false,
      getMouse: () => ({ x: this.mouseState.x, y: this.mouseState.y, clicked: this.mouseState.isDown })
    };

    this.raw = false;
    this.started = false;
    this.dataHandler = null;
    this.pendingLine = null;
    this.lineBuffer = '';
    this.lineQueue = [];
    this.timers = new Map();
    this.escapeBuffer = '';
    this.warned = false;
  }

  // -------------------------------------------------------------------------
  // lifecycle
  // -------------------------------------------------------------------------

  start() {
    if (this.started || !this.stdin) return this;
    this.started = true;

    const isTty = !!this.stdin.isTTY;
    this.raw = isTty;

    if (isTty && typeof this.stdin.setRawMode === 'function') {
      this.stdin.setRawMode(true);
    }
    this.stdin.setEncoding('utf8');
    this.stdin.resume();

    if (isTty && this.mouseEnabled && this.stdout && this.stdout.isTTY) {
      // SGR mouse tracking (press/drag/motion) + focus reporting off.
      this.stdout.write('\x1b[?1002h\x1b[?1006h');
    }

    this.dataHandler = (chunk) => this.handleData(String(chunk));
    this.stdin.on('data', this.dataHandler);

    const onEnd = () => {
      this.flushPartialLine();
      if (this.pendingLine) {
        const resolve = this.pendingLine;
        this.pendingLine = null;
        if (this.stdout) this.stdout.write('\n');
        resolve(null); // EOF
      }
    };
    this.stdin.on('end', onEnd);
    this.stdin.on('close', onEnd);

    if (!isTty) {
      this.log('[input] stdin is not a TTY: keyboard state stays false, lines are read from the pipe.');
    }

    return this;
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    if (this.dataHandler && this.stdin && this.stdin.off) this.stdin.off('data', this.dataHandler);
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    if (this.raw && this.stdin && typeof this.stdin.setRawMode === 'function') {
      try { this.stdin.setRawMode(false); } catch (e) { /* ignore */ }
    }
    if (this.raw && this.stdout && this.stdout.isTTY) {
      this.stdout.write('\x1b[?1002l\x1b[?1006l\x1b[?25h');
    }
    try { this.stdin.pause(); } catch (e) { /* ignore */ }
  }

  // -------------------------------------------------------------------------
  // stdin dispatch
  // -------------------------------------------------------------------------

  handleData(chunk) {
    for (const ch of chunk) {
      if (this.pendingLine) {
        this.feedLineEditor(ch);
        continue;
      }
      if (this.raw) {
        this.feedInputState(ch);
      } else {
        // Piped input is buffered until a read_line call consumes it.
        this.lineBuffer += ch;
      }
    }
    // Non-TTY stdin arrives in buffered chunks: split them into queued lines.
    if (!this.raw) this.drainBufferedLines();
  }

  /** Key state machine (raw mode only). */
  feedInputState(ch) {
    if (this.escapeBuffer) {
      this.escapeBuffer += ch;
      const buf = this.escapeBuffer;
      if (buf === '\x1b[') return;
      if (buf.startsWith('\x1b[<')) {
        if (!buf.endsWith('M') && !buf.endsWith('m')) return;
        this.handleMouse(buf);
        this.escapeBuffer = '';
        return;
      }
      const arrow = { A: 'up', B: 'down', C: 'right', D: 'left' }[ch];
      if (arrow) {
        this.press(arrow);
        this.escapeBuffer = '';
        return;
      }
      if (buf.length >= 3) {
        this.escapeBuffer = '';
        return;
      }
      return;
    }

    if (ch === '\x1b') {
      this.escapeBuffer = '\x1b';
      return;
    }

    if (ch === '\x03') { // Ctrl+C
      this.stop();
      if (typeof this.onExit === 'function') this.onExit();
      process.exit(0);
      return;
    }

    const name = KEY_NAMES[ch] || ch.toLowerCase();
    this.press(name);
  }

  handleMouse(sequence) {
    // \x1b[<button;col;rowM|m
    const body = sequence.slice(3, -1);
    const parts = body.split(';').map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return;
    const [button, col, row] = parts;
    const isRelease = sequence.endsWith('m');
    this.mouseState.isDown = !isRelease && (button === 0 || button === 32);

    const { width, height } = this.viewport();
    const cols = (this.stdout && this.stdout.columns) || 80;
    const rows = (this.stdout && this.stdout.rows) || 24;
    this.mouseState.x = Math.round(((col - 1) / Math.max(1, cols)) * width);
    this.mouseState.y = Math.round(((row - 1) / Math.max(1, rows * 2)) * height);
  }

  press(name) {
    if (!name) return;
    this.keyStates[name] = true;
    const existing = this.timers.get(name);
    if (existing) clearTimeout(existing);
    this.timers.set(name, setTimeout(() => {
      this.keyStates[name] = false;
      this.timers.delete(name);
    }, this.holdMs));
  }

  // -------------------------------------------------------------------------
  // line reader used by std::io::read_line
  // -------------------------------------------------------------------------

  readLine(prompt = '') {
    if (this.lineQueue.length) return Promise.resolve(this.lineQueue.shift());
    if (!this.stdin) return Promise.resolve(null);

    return new Promise((resolve) => {
      this.pendingLine = resolve;
      // Echo the prompt for non-interactive callers (std::io already prints it).
      if (prompt && this.stdout && !this.started) this.stdout.write(String(prompt));
      if (!this.started) this.start();
      // Piped data can arrive before the program asks for it.
      this.drainBufferedLines();
    });
  }

  feedLineEditor(ch) {
    const resolve = this.pendingLine;
    if (!resolve) return;

    if (ch === '\r' || ch === '\n') {
      this.pendingLine = null;
      const line = this.lineBuffer;
      this.lineBuffer = '';
      if (this.stdout) this.stdout.write('\n');
      resolve(line);
      return;
    }
    if (ch === '\x7f' || ch === '\b') {
      if (this.lineBuffer.length) {
        this.lineBuffer = this.lineBuffer.slice(0, -1);
        if (this.stdout) this.stdout.write('\b \b');
      }
      return;
    }
    if (ch === '\x03') {
      this.stop();
      if (typeof this.onExit === 'function') this.onExit();
      process.exit(0);
      return;
    }
    if (ch === '\x1b') return; // ignore escape sequences while typing a line

    this.lineBuffer += ch;
    if (this.stdout) this.stdout.write(ch);
  }

  /** Split buffered (non TTY) stdin into complete lines. */
  drainBufferedLines() {
    while (this.lineBuffer.indexOf('\n') !== -1) {
      const idx = this.lineBuffer.indexOf('\n');
      const complete = this.lineBuffer.slice(0, idx).replace(/\r$/, '');
      this.lineBuffer = this.lineBuffer.slice(idx + 1);
      if (this.pendingLine) {
        const resolve = this.pendingLine;
        this.pendingLine = null;
        resolve(complete);
      } else {
        this.lineQueue.push(complete);
      }
    }
  }

  /** Flush a trailing line that was never terminated by a newline. */
  flushPartialLine() {
    if (!this.lineBuffer.length) return;
    const rest = this.lineBuffer.replace(/\r$/, '');
    this.lineBuffer = '';
    if (this.pendingLine) {
      const resolve = this.pendingLine;
      this.pendingLine = null;
      resolve(rest);
    } else {
      this.lineQueue.push(rest);
    }
  }
}

export default TerminalInputBackend;
