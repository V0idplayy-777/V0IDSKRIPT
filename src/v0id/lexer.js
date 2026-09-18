/**
 * V0IDSKRIPT Lexer / Tokenizer
 * Industrial-grade tokenizer supporting static types, algebraic data types,
 * pattern matching, control flow, traits, and matrix/vector primitives.
 */

export const TokenType = {
  // Keywords
  LET: 'LET',
  MUT: 'MUT',
  CONST: 'CONST',
  FN: 'FN',
  STRUCT: 'STRUCT',
  ENUM: 'ENUM',
  TRAIT: 'TRAIT',
  IMPL: 'IMPL',
  TYPE: 'TYPE',
  DEFER: 'DEFER',
  MATCH: 'MATCH',
  IF: 'IF',
  ELSE: 'ELSE',
  WHILE: 'WHILE',
  FOR: 'FOR',
  IN: 'IN',
  LOOP: 'LOOP',
  RETURN: 'RETURN',
  BREAK: 'BREAK',
  CONTINUE: 'CONTINUE',
  ASYNC: 'ASYNC',
  AWAIT: 'AWAIT',
  SPAWN: 'SPAWN',
  PUB: 'PUB',
  SELF: 'SELF',
  REF: 'REF',
  UNSAFE: 'UNSAFE',

  // Literals & Identifiers
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  NIL: 'NIL',

  // Operators & Sigils
  PIPE_DISPATCH: 'PIPE_DISPATCH',     // ~>
  PIPELINE: 'PIPELINE',               // |>
  DOUBLE_COLON: 'DOUBLE_COLON',       // ::
  THIN_ARROW: 'THIN_ARROW',           // ->
  FAT_ARROW: 'FAT_ARROW',             // =>
  RANGE: 'RANGE',                     // ..
  ELLIPSIS: 'ELLIPSIS',               // ...
  NULL_COALESCE: 'NULL_COALESCE',     // ??
  SAFE_NAVIGATION: 'SAFE_NAVIGATION', // ?.
  FORCE_UNWRAP: 'FORCE_UNWRAP',       // !!

  // Bitwise / References
  AMPERSAND: 'AMPERSAND',             // &
  PIPE: 'PIPE',                       // |
  CARET: 'CARET',                     // ^
  TILDE: 'TILDE',                     // ~
  SHL: 'SHL',                         // <<
  SHR: 'SHR',                         // >>

  // Arithmetic & Assignment
  PLUS: 'PLUS',                       // +
  MINUS: 'MINUS',                     // -
  STAR: 'STAR',                       // *
  SLASH: 'SLASH',                     // /
  PERCENT: 'PERCENT',                 // %
  EQ: 'EQ',                           // =
  PLUS_EQ: 'PLUS_EQ',                 // +=
  MINUS_EQ: 'MINUS_EQ',               // -=
  STAR_EQ: 'STAR_EQ',                 // *=
  SLASH_EQ: 'SLASH_EQ',               // /=
  PERCENT_EQ: 'PERCENT_EQ',           // %=

  // Relational & Logical
  EQ_EQ: 'EQ_EQ',                     // ==
  NOT_EQ: 'NOT_EQ',                   // !=
  LT: 'LT',                           // <
  GT: 'GT',                           // >
  LTE: 'LTE',                         // <=
  GTE: 'GTE',                         // >=
  AND: 'AND',                         // &&
  OR: 'OR',                           // ||
  NOT: 'NOT',                         // !

  // Delimiters
  LPAREN: 'LPAREN',                   // (
  RPAREN: 'RPAREN',                   // )
  LBRACE: 'LBRACE',                   // {
  RBRACE: 'RBRACE',                   // }
  LBRACK: 'LBRACK',                   // [
  RBRACK: 'RBRACK',                   // ]
  COMMA: 'COMMA',                     // ,
  DOT: 'DOT',                         // .
  COLON: 'COLON',                     // :
  SEMICOLON: 'SEMICOLON',             // ;
  HASH: 'HASH',                       // #
  AT: 'AT',                           // @
  QUESTION: 'QUESTION',               // ?

  EOF: 'EOF'
};

const KEYWORDS = {
  'let': TokenType.LET,
  'mut': TokenType.MUT,
  'const': TokenType.CONST,
  'fn': TokenType.FN,
  'struct': TokenType.STRUCT,
  'enum': TokenType.ENUM,
  'trait': TokenType.TRAIT,
  'impl': TokenType.IMPL,
  'type': TokenType.TYPE,
  'defer': TokenType.DEFER,
  'match': TokenType.MATCH,
  'if': TokenType.IF,
  'else': TokenType.ELSE,
  'while': TokenType.WHILE,
  'for': TokenType.FOR,
  'in': TokenType.IN,
  'loop': TokenType.LOOP,
  'return': TokenType.RETURN,
  'break': TokenType.BREAK,
  'continue': TokenType.CONTINUE,
  'async': TokenType.ASYNC,
  'await': TokenType.AWAIT,
  'spawn': TokenType.SPAWN,
  'pub': TokenType.PUB,
  'self': TokenType.SELF,
  'Self': TokenType.SELF,
  'ref': TokenType.REF,
  'unsafe': TokenType.UNSAFE,
  'true': TokenType.BOOLEAN,
  'false': TokenType.BOOLEAN,
  'nil': TokenType.NIL,
  'null': TokenType.NIL
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

      // Single line comments
      if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.length && this.peek() !== '\n') {
          this.advance();
        }
        continue;
      }

      // Multi line comments
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

      // Multi-char operators
      if (this.match('...')) { tokens.push({ type: TokenType.ELLIPSIS, value: '...', line, col }); continue; }
      if (this.match('..')) { tokens.push({ type: TokenType.RANGE, value: '..', line, col }); continue; }
      if (this.match('~>')) { tokens.push({ type: TokenType.PIPE_DISPATCH, value: '~>', line, col }); continue; }
      if (this.match('|>')) { tokens.push({ type: TokenType.PIPELINE, value: '|>', line, col }); continue; }
      if (this.match('::')) { tokens.push({ type: TokenType.DOUBLE_COLON, value: '::', line, col }); continue; }
      if (this.match('->')) { tokens.push({ type: TokenType.THIN_ARROW, value: '->', line, col }); continue; }
      if (this.match('=>')) { tokens.push({ type: TokenType.FAT_ARROW, value: '=>', line, col }); continue; }
      if (this.match('??')) { tokens.push({ type: TokenType.NULL_COALESCE, value: '??', line, col }); continue; }
      if (this.match('?.')) { tokens.push({ type: TokenType.SAFE_NAVIGATION, value: '?.', line, col }); continue; }
      if (this.match('!!')) { tokens.push({ type: TokenType.FORCE_UNWRAP, value: '!!', line, col }); continue; }
      if (this.match('<<')) { tokens.push({ type: TokenType.SHL, value: '<<', line, col }); continue; }
      if (this.match('>>')) { tokens.push({ type: TokenType.SHR, value: '>>', line, col }); continue; }
      if (this.match('==')) { tokens.push({ type: TokenType.EQ_EQ, value: '==', line, col }); continue; }
      if (this.match('!=')) { tokens.push({ type: TokenType.NOT_EQ, value: '!=', line, col }); continue; }
      if (this.match('<=')) { tokens.push({ type: TokenType.LTE, value: '<=', line, col }); continue; }
      if (this.match('>=')) { tokens.push({ type: TokenType.GTE, value: '>=', line, col }); continue; }
      if (this.match('&&')) { tokens.push({ type: TokenType.AND, value: '&&', line, col }); continue; }
      if (this.match('||')) { tokens.push({ type: TokenType.OR, value: '||', line, col }); continue; }
      if (this.match('+=')) { tokens.push({ type: TokenType.PLUS_EQ, value: '+=', line, col }); continue; }
      if (this.match('-=')) { tokens.push({ type: TokenType.MINUS_EQ, value: '-=', line, col }); continue; }
      if (this.match('*=')) { tokens.push({ type: TokenType.STAR_EQ, value: '*=', line, col }); continue; }
      if (this.match('/=')) { tokens.push({ type: TokenType.SLASH_EQ, value: '/=', line, col }); continue; }
      if (this.match('%=')) { tokens.push({ type: TokenType.PERCENT_EQ, value: '%=', line, col }); continue; }

      // Numbers (Hex, Float, Decimal)
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.peek(1)))) {
        let numStr = '';
        if (ch === '0' && (this.peek(1) === 'x' || this.peek(1) === 'X')) {
          numStr += this.advance(); // 0
          numStr += this.advance(); // x
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
          numStr += this.advance(); // .
          while (/[0-9_]/.test(this.peek())) {
            const d = this.advance();
            if (d !== '_') numStr += d;
          }
        }
        tokens.push({ type: TokenType.NUMBER, value: parseFloat(numStr), line, col });
        continue;
      }

      // Strings (double quotes, single quotes, backticks)
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
            else if (esc === '0') strVal += '\0';
            else strVal += esc;
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

      // Single-character punctuators & operators
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
        case '&': this.advance(); tokens.push({ type: TokenType.AMPERSAND, value: '&', line, col }); break;
        case '|': this.advance(); tokens.push({ type: TokenType.PIPE, value: '|', line, col }); break;
        case '^': this.advance(); tokens.push({ type: TokenType.CARET, value: '^', line, col }); break;
        case '~': this.advance(); tokens.push({ type: TokenType.TILDE, value: '~', line, col }); break;
        case '#': this.advance(); tokens.push({ type: TokenType.HASH, value: '#', line, col }); break;
        case '@': this.advance(); tokens.push({ type: TokenType.AT, value: '@', line, col }); break;
        case '?': this.advance(); tokens.push({ type: TokenType.QUESTION, value: '?', line, col }); break;
        default:
          throw new Error(`[V0IDSKRIPT Lexer Error] Unexpected token character '${ch}' at ${line}:${col}`);
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', line: this.line, col: this.col });
    return tokens;
  }
}
