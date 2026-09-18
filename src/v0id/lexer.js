/**
 * V0IDSKRIPT v4.0 Industrial Lexer
 */

export const TokenType = {
  // Declarations & Bindings
  VAL: 'VAL',                 // val (immutable value)
  VAR: 'VAR',                 // var (mutable variable)
  PIN: 'PIN',                 // pin (pinned heap memory handle)
  CONST: 'CONST',             // const (compile-time constant)
  TYPE: 'TYPE',               // type (type definition)
  RECORD: 'RECORD',           // record (struct record block)
  ENUM: 'ENUM',               // enum (algebraic data enum block)
  CONTRACT: 'CONTRACT',       // contract (trait/interface specification)
  IMPL: 'IMPL',               // impl (implementation block)
  BIND: 'BIND',               // bind (bind keyword for impl block)
  FN: 'FN',                   // fn (function definition)
  DEF: 'DEF',                 // def (function definition alias)
  SPEC: 'SPEC',               // spec (spec block start for contract)

  // Memory Passing Modes
  IN: 'IN',                   // in (read-only immutable parameter)
  OUT: 'OUT',                 // out (return parameter)
  INOUT: 'INOUT',             // inout (mutable borrow parameter)
  OWN: 'OWN',                 // own (owned heap handle)
  REF: 'REF',                 // ref (reference handle)
  DEFER: 'DEFER',             // defer (deferred scope cleanup)

  // Control Flow & Scope Boundaries
  DO: 'DO',                   // do (execution block start)
  PASS: 'PASS',               // pass (loop body block start)
  END: 'END',                 // end (universal block boundary terminator)
  SELECT: 'SELECT',           // select (match/select statement)
  CASE: 'CASE',               // case (pattern match branch)
  ELSE: 'ELSE',               // else (conditional or default branch)
  IF: 'IF',                   // if (conditional branch)
  WHILE: 'WHILE',             // while (while loop)
  LOOP: 'LOOP',               // loop (for loop iterator)
  RETURN: 'RETURN',           // return (return statement)
  BREAK: 'BREAK',             // break (loop break)
  CONTINUE: 'CONTINUE',       // continue (loop continue)
  RAISE: 'RAISE',             // raise (raise exception)
  RESCUE: 'RESCUE',           // rescue (catch error)

  // Domain Operators & Tensors
  TENSOR: 'TENSOR',           // tensor (tensor block)
  GRID: 'GRID',               // grid (matrix grid construct)

  // Identifiers & Literals
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  NIL: 'NIL',

  // Operators & Sigils
  MAT_MUL: 'MAT_MUL',         // #* (Tensor GEMM Matrix Multiply)
  DOT_PROD: 'DOT_PROD',       // <.> (Vector Dot Product)
  CROSS_PROD: 'CROSS_PROD',   // <x> (Vector Cross Product)
  PIPELINE: 'PIPELINE',       // |> (Pipeline composition)
  DOUBLE_COLON: 'DOUBLE_COLON', // :: (Scope resolution)
  COLON_EQ: 'COLON_EQ',       // := (Signal binding)
  LEFT_ARROW_EQ: 'LEFT_ARROW_EQ', // <== (Signal update)
  THIN_ARROW: 'THIN_ARROW',   // -> (Return type arrow)
  FAT_ARROW: 'FAT_ARROW',     // => (Match arm fat arrow)
  STRUCT_AT: 'STRUCT_AT',     // @{ (Struct literal constructor)
  AT_MAP: 'AT_MAP',           // @map (Vectorized map)
  AT_FILTER: 'AT_FILTER',     // @filter (Vectorized filter)
  AT_REDUCE: 'AT_REDUCE',     // @reduce (Vectorized fold reduction)
  RANGE_INCL: 'RANGE_INCL',   // ..= (Inclusive range)
  RANGE: 'RANGE',             // .. (Exclusive range)

  // Standard Arithmetic & Logical
  PLUS: 'PLUS',               // +
  MINUS: 'MINUS',             // -
  STAR: 'STAR',               // *
  SLASH: 'SLASH',             // /
  PERCENT: 'PERCENT',         // %
  EQ: 'EQ',                   // =
  EQ_EQ: 'EQ_EQ',             // ==
  NOT_EQ: 'NOT_EQ',           // !=
  LT: 'LT',                   // <
  GT: 'GT',                   // >
  LTE: 'LTE',                 // <=
  GTE: 'GTE',                 // >=
  AND: 'AND',                 // &&
  OR: 'OR',                   // ||
  NOT: 'NOT',                 // !
  QUESTION: 'QUESTION',       // ?

  // Delimiters
  LPAREN: 'LPAREN',           // (
  RPAREN: 'RPAREN',           // )
  LBRACE: 'LBRACE',           // {
  RBRACE: 'RBRACE',           // }
  LBRACK: 'LBRACK',           // [
  RBRACK: 'RBRACK',           // ]
  COMMA: 'COMMA',             // ,
  DOT: 'DOT',                 // .
  COLON: 'COLON',             // :
  SEMICOLON: 'SEMICOLON',     // ;
  HASH: 'HASH',               // #
  AT: 'AT',                   // @

  EOF: 'EOF'
};

const KEYWORDS = {
  'val': TokenType.VAL,
  'var': TokenType.VAR,
  'pin': TokenType.PIN,
  'const': TokenType.CONST,
  'type': TokenType.TYPE,
  'record': TokenType.RECORD,
  'enum': TokenType.ENUM,
  'contract': TokenType.CONTRACT,
  'impl': TokenType.IMPL,
  'bind': TokenType.BIND,
  'fn': TokenType.FN,
  'def': TokenType.DEF,
  'spec': TokenType.SPEC,
  'in': TokenType.IN,
  'out': TokenType.OUT,
  'inout': TokenType.INOUT,
  'own': TokenType.OWN,
  'ref': TokenType.REF,
  'defer': TokenType.DEFER,
  'do': TokenType.DO,
  'pass': TokenType.PASS,
  'end': TokenType.END,
  'select': TokenType.SELECT,
  'case': TokenType.CASE,
  'else': TokenType.ELSE,
  'if': TokenType.IF,
  'while': TokenType.WHILE,
  'loop': TokenType.LOOP,
  'return': TokenType.RETURN,
  'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  'raise': TokenType.RAISE,
  'rescue': TokenType.RESCUE,
  'tensor': TokenType.TENSOR,
  'grid': TokenType.GRID,
  'true': TokenType.BOOLEAN,
  'false': TokenType.BOOLEAN,
  'nil': TokenType.NIL
};

export class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.length = source.length;
  }

  peek(offset = 0) {
    if (this.pos + offset >= this.length) return '\0';
    return this.source[this.pos + offset];
  }

  advance() {
    const ch = this.peek();
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  match(expected) {
    if (this.source.startsWith(expected, this.pos)) {
      for (let i = 0; i < expected.length; i++) this.advance();
      return true;
    }
    return false;
  }

  tokenize() {
    const tokens = [];

    while (this.pos < this.length) {
      const ch = this.peek();

      // Whitespace
      if (/\s/.test(ch)) {
        this.advance();
        continue;
      }

      // Single line comments starting with # or //
      if (ch === '#' && this.peek(1) !== '{' && this.peek(1) !== '*') {
        while (this.pos < this.length && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }
      if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.length && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      // Multi-line comments /* ... */
      if (ch === '/' && this.peek(1) === '*') {
        this.advance(); this.advance();
        while (this.pos < this.length && !(this.peek() === '*' && this.peek(1) === '/')) {
          this.advance();
        }
        if (this.pos < this.length) { this.advance(); this.advance(); }
        continue;
      }

      const line = this.line;
      const col = this.col;

      // Special Multi-Character Sigils
      if (this.match('@map')) { tokens.push({ type: TokenType.AT_MAP, value: '@map', line, col }); continue; }
      if (this.match('@filter')) { tokens.push({ type: TokenType.AT_FILTER, value: '@filter', line, col }); continue; }
      if (this.match('@reduce')) { tokens.push({ type: TokenType.AT_REDUCE, value: '@reduce', line, col }); continue; }
      if (this.match('@{')) { tokens.push({ type: TokenType.STRUCT_AT, value: '@{', line, col }); continue; }
      if (this.match('#*')) { tokens.push({ type: TokenType.MAT_MUL, value: '#*', line, col }); continue; }
      if (this.match('<.>')) { tokens.push({ type: TokenType.DOT_PROD, value: '<.>', line, col }); continue; }
      if (this.match('<x>')) { tokens.push({ type: TokenType.CROSS_PROD, value: '<x>', line, col }); continue; }
      if (this.match('::')) { tokens.push({ type: TokenType.DOUBLE_COLON, value: '::', line, col }); continue; }
      if (this.match(':=')) { tokens.push({ type: TokenType.COLON_EQ, value: ':=', line, col }); continue; }
      if (this.match('<==')) { tokens.push({ type: TokenType.LEFT_ARROW_EQ, value: '<==', line, col }); continue; }
      if (this.match('|>')) { tokens.push({ type: TokenType.PIPELINE, value: '|>', line, col }); continue; }
      if (this.match('->')) { tokens.push({ type: TokenType.THIN_ARROW, value: '->', line, col }); continue; }
      if (this.match('=>')) { tokens.push({ type: TokenType.FAT_ARROW, value: '=>', line, col }); continue; }
      if (this.match('..=')) { tokens.push({ type: TokenType.RANGE_INCL, value: '..=', line, col }); continue; }
      if (this.match('..')) { tokens.push({ type: TokenType.RANGE, value: '..', line, col }); continue; }
      if (this.match('==')) { tokens.push({ type: TokenType.EQ_EQ, value: '==', line, col }); continue; }
      if (this.match('!=')) { tokens.push({ type: TokenType.NOT_EQ, value: '!=', line, col }); continue; }
      if (this.match('<=')) { tokens.push({ type: TokenType.LTE, value: '<=', line, col }); continue; }
      if (this.match('>=')) { tokens.push({ type: TokenType.GTE, value: '>=', line, col }); continue; }
      if (this.match('&&')) { tokens.push({ type: TokenType.AND, value: '&&', line, col }); continue; }
      if (this.match('||')) { tokens.push({ type: TokenType.OR, value: '||', line, col }); continue; }

      // Numbers
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.peek(1)))) {
        let numStr = '';
        if (ch === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
          numStr += this.advance();
          numStr += this.advance();
          while (/[0-9a-fA-F_]/.test(this.peek())) {
            const d = this.advance();
            if (d !== '_') numStr += d;
          }
          tokens.push({ type: TokenType.NUMBER, value: parseInt(numStr, 16), line, col });
          continue;
        }

        while (/[0-9_]/.test(this.peek())) {
          const d = this.advance();
          if (d !== '_') numStr += d;
        }
        if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
          numStr += this.advance();
          while (/[0-9_]/.test(this.peek())) {
            const d = this.advance();
            if (d !== '_') numStr += d;
          }
        }
        tokens.push({ type: TokenType.NUMBER, value: parseFloat(numStr), line, col });
        continue;
      }

      // Strings (handling \ escapes properly)
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = this.advance();
        let strVal = '';
        while (this.pos < this.length && this.peek() !== quote) {
          if (this.peek() === '\\') {
            this.advance();
            const esc = this.advance();
            if (esc === 'n') strVal += '\n';
            else if (esc === 't') strVal += '\t';
            else if (esc === 'r') strVal += '\r';
            else strVal += esc; // captures \\, \", \', \|, etc.
          } else {
            strVal += this.advance();
          }
        }
        if (this.peek() === quote) this.advance();
        tokens.push({ type: TokenType.STRING, value: strVal, line, col });
        continue;
      }

      // Identifiers / Keywords
      if (/[a-zA-Z_$]/.test(ch)) {
        let id = '';
        while (/[a-zA-Z0-9_$]/.test(this.peek())) {
          id += this.advance();
        }
        const kwType = KEYWORDS[id];
        if (kwType) {
          tokens.push({ type: kwType, value: id, line, col });
        } else {
          tokens.push({ type: TokenType.IDENTIFIER, value: id, line, col });
        }
        continue;
      }

      // Single Character Punctuators
      switch (ch) {
        case '(': this.advance(); tokens.push({ type: TokenType.LPAREN, value: '(', line, col }); break;
        case ')': this.advance(); tokens.push({ type: TokenType.RPAREN, value: ')', line, col }); break;
        case '{': this.advance(); tokens.push({ type: TokenType.LBRACE, value: '{', line, col }); break;
        case '}': this.advance(); tokens.push({ type: TokenType.RBRACE, value: '}', line, col }); break;
        case '[': this.advance(); tokens.push({ type: TokenType.LBRACK, value: '[', line, col }); break;
        case ']': this.advance(); tokens.push({ type: TokenType.RBRACK, value: ']', line, col }); break;
        case ',': this.advance(); tokens.push({ type: TokenType.COMMA, value: ',', line, col }); break;
        case '.': this.advance(); tokens.push({ type: TokenType.DOT, value: '.', line, col }); break;
        case ':': this.advance(); tokens.push({ type: TokenType.COLON, value: ':', line, col }); break;
        case ';': this.advance(); tokens.push({ type: TokenType.SEMICOLON, value: ';', line, col }); break;
        case '+': this.advance(); tokens.push({ type: TokenType.PLUS, value: '+', line, col }); break;
        case '-': this.advance(); tokens.push({ type: TokenType.MINUS, value: '-', line, col }); break;
        case '*': this.advance(); tokens.push({ type: TokenType.STAR, value: '*', line, col }); break;
        case '/': this.advance(); tokens.push({ type: TokenType.SLASH, value: '/', line, col }); break;
        case '%': this.advance(); tokens.push({ type: TokenType.PERCENT, value: '%', line, col }); break;
        case '=': this.advance(); tokens.push({ type: TokenType.EQ, value: '=', line, col }); break;
        case '<': this.advance(); tokens.push({ type: TokenType.LT, value: '<', line, col }); break;
        case '>': this.advance(); tokens.push({ type: TokenType.GT, value: '>', line, col }); break;
        case '!': this.advance(); tokens.push({ type: TokenType.NOT, value: '!', line, col }); break;
        case '|': this.advance(); tokens.push({ type: TokenType.PIPELINE, value: '|', line, col }); break;
        case '@': this.advance(); tokens.push({ type: TokenType.AT, value: '@', line, col }); break;
        case '?': this.advance(); tokens.push({ type: TokenType.QUESTION, value: '?', line, col }); break;
        default:
          throw new Error(`[V0IDSKRIPT Lexer Error] Unexpected character '${ch}' at ${line}:${col}`);
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', line: this.line, col: this.col });
    return tokens;
  }
}
