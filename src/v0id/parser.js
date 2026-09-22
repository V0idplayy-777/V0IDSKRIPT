import { TokenType } from './lexer.js';

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    /**
     * While a `@map` / `@filter` / `@reduce` callback is being parsed the
     * vectorised operators are suspended, so `xs @filter |x| => x > 1 @map f`
     * chains left to right instead of swallowing the next operator into the
     * callback. Parenthesised, bracketed and block expressions restore them.
     */
    this.noVectorOps = false;
  }

  /** Run `fn` with the vectorised operators disabled. */
  withoutVectorOps(fn) {
    const previous = this.noVectorOps;
    this.noVectorOps = true;
    try {
      return fn();
    } finally {
      this.noVectorOps = previous;
    }
  }

  /** Run `fn` with the vectorised operators re-enabled (nested scopes). */
  withVectorOps(fn) {
    const previous = this.noVectorOps;
    this.noVectorOps = false;
    try {
      return fn();
    } finally {
      this.noVectorOps = previous;
    }
  }

  peek(offset = 0) {
    if (this.pos + offset >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[this.pos + offset];
  }

  advance() {
    const token = this.peek();
    if (this.pos < this.tokens.length) this.pos++;
    return token;
  }

  match(...types) {
    const token = this.peek();
    if (types.includes(token.type)) {
      this.pos++;
      return token;
    }
    return null;
  }

  expect(type, errorMsg) {
    const token = this.peek();
    if (token.type === type) {
      this.pos++;
      return token;
    }
    throw new Error(`[V0IDSKRIPT Parse Error] ${errorMsg || `Expected ${type}, got ${token.type} ('${token.value}')`} at ${token.line}:${token.col}`);
  }

  expectIdentifier(errorMsg) {
    const token = this.peek();
    if (token.type === TokenType.IDENTIFIER || [
      TokenType.OUT, TokenType.IN, TokenType.REF, TokenType.OWN, TokenType.PIN, TokenType.FN, TokenType.DEF
    ].includes(token.type)) {
      this.pos++;
      return token;
    }
    throw new Error(`[V0IDSKRIPT Parse Error] ${errorMsg || `Expected identifier, got ${token.type} ('${token.value}')`} at ${token.line}:${token.col}`);
  }

  parseProgram() {
    const statements = [];
    while (this.peek().type !== TokenType.EOF) {
      statements.push(this.parseStatement());
    }
    return { type: 'Program', body: statements };
  }

  parseStatement() {
    const curr = this.peek();

    // Variable Declarations (val, var, pin, const)
    if ([TokenType.VAL, TokenType.VAR, TokenType.PIN, TokenType.CONST].includes(curr.type)) {
      return this.parseVarDecl();
    }

    // Function Declaration (fn, def)
    if (curr.type === TokenType.FN || curr.type === TokenType.DEF) {
      return this.parseFunctionDecl();
    }

    // Type Record / Enum Declaration
    if (curr.type === TokenType.TYPE) {
      return this.parseTypeDecl();
    }

    // Contract Declaration
    if (curr.type === TokenType.CONTRACT) {
      return this.parseContractDecl();
    }

    // Impl Declaration
    if (curr.type === TokenType.IMPL) {
      return this.parseImplDecl();
    }

    // Tensor Declaration Block
    if (curr.type === TokenType.TENSOR) {
      return this.parseTensorDecl();
    }

    // Control Flow Structures
    if (curr.type === TokenType.IF) return this.parseIfStatement();
    if (curr.type === TokenType.WHILE) return this.parseWhileStatement();
    if (curr.type === TokenType.LOOP) return this.parseLoopStatement();
    if (curr.type === TokenType.SELECT) return this.parseSelectStatement();

    // Jump Statements
    if (curr.type === TokenType.RETURN) {
      this.advance();
      let expr = null;
      if (this.peek().type !== TokenType.SEMICOLON && this.peek().type !== TokenType.END) {
        expr = this.parseExpression();
      }
      this.match(TokenType.SEMICOLON);
      return { type: 'ReturnStatement', argument: expr };
    }

    if (curr.type === TokenType.BREAK) {
      this.advance();
      this.match(TokenType.SEMICOLON);
      return { type: 'BreakStatement' };
    }

    if (curr.type === TokenType.CONTINUE) {
      this.advance();
      this.match(TokenType.SEMICOLON);
      return { type: 'ContinueStatement' };
    }

    // Scope Block do ... end
    if (curr.type === TokenType.DO) {
      return this.parseDoBlock();
    }

    // Expression Statement
    const expr = this.parseExpression();
    this.match(TokenType.SEMICOLON);
    return { type: 'ExpressionStatement', expression: expr };
  }

  parseVarDecl() {
    const kindToken = this.advance();
    const kind = kindToken.value;
    const isMut = kind === 'var' || kind === 'pin';

    const name = this.expectIdentifier("Expected variable name identifier").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    let init = null;
    if (this.match(TokenType.EQ, TokenType.COLON_EQ)) {
      init = this.parseExpression();
    }

    this.match(TokenType.SEMICOLON);

    return { type: 'VariableDeclaration', kind, name, isMut, typeAnnotation, init };
  }

  parseTypeAnnotation() {
    let name = this.expectIdentifier("Expected type name").value;
    let suffix = '';
    if (this.match(TokenType.LT)) {
      const typeParams = [];
      while (this.peek().type !== TokenType.GT && this.peek().type !== TokenType.EOF) {
        typeParams.push(this.parseTypeAnnotation());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.GT, "Expected '>' in type parameter");
      suffix = `<${typeParams.join(', ')}>`;
    }
    // Trailing `?` marks the type as nullable (nil is accepted as well).
    let nullable = '';
    while (this.match(TokenType.QUESTION)) nullable += '?';
    return `${name}${suffix}${nullable}`;
  }

  parseFunctionDecl() {
    this.advance(); // fn or def
    const name = this.expectIdentifier("Expected function name").value;

    // Optional Generic Parameters [T]
    let generics = [];
    if (this.match(TokenType.LBRACK)) {
      while (this.peek().type !== TokenType.RBRACK && this.peek().type !== TokenType.EOF) {
        generics.push(this.expectIdentifier().value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACK);
    }

    // Parameters (in/inout/out param: Type)
    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = [];
    while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
      // Memory passing modes: in (default) | out | inout | own | ref
      let mode = 'in';
      if (this.match(TokenType.INOUT)) mode = 'inout';
      else if (this.match(TokenType.OUT)) mode = 'out';
      else if (this.match(TokenType.OWN)) mode = 'own';
      else if (this.match(TokenType.REF)) mode = 'ref';
      else this.match(TokenType.IN);

      const pName = this.expectIdentifier("Expected parameter name").value;
      let pType = null;
      if (this.match(TokenType.COLON)) {
        pType = this.parseTypeAnnotation();
      }
      params.push({ name: pName, type: pType, mode });
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN, "Expected ')' after parameter list");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    // Check if contract signature without body or body block :: do ... end
    let body = null;
    if (this.match(TokenType.DOUBLE_COLON)) {
      body = this.parseDoBlock();
    } else {
      this.match(TokenType.SEMICOLON); // optional semicolon
    }

    return { type: 'FunctionDeclaration', name, generics, params, returnType, body };
  }

  parseTypeDecl() {
    this.expect(TokenType.TYPE, "Expected 'type'");
    const name = this.expectIdentifier("Expected type identifier").value;
    this.expect(TokenType.DOUBLE_COLON, "Expected '::' after type identifier");

    if (this.match(TokenType.RECORD)) {
      this.expect(TokenType.LBRACE, "Expected '{' in record type definition");
      const fields = [];
      while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
        const fieldName = this.expectIdentifier("Expected field name").value;
        this.expect(TokenType.COLON, "Expected ':' after field name");
        const fieldType = this.parseTypeAnnotation();
        fields.push({ name: fieldName, type: fieldType });
        this.match(TokenType.COMMA);
        this.match(TokenType.SEMICOLON);
      }
      this.expect(TokenType.RBRACE, "Expected '}' in record definition");
      return { type: 'RecordDeclaration', name, fields };
    }

    if (this.match(TokenType.ENUM)) {
      this.expect(TokenType.LBRACE, "Expected '{' in enum type definition");
      const variants = [];
      while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
        const variantName = this.expectIdentifier("Expected enum variant identifier").value;
        let tupleTypes = [];
        if (this.match(TokenType.LPAREN)) {
          while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
            tupleTypes.push(this.parseTypeAnnotation());
            if (!this.match(TokenType.COMMA)) break;
          }
          this.expect(TokenType.RPAREN);
        }
        variants.push({ name: variantName, tupleTypes });
        this.match(TokenType.COMMA);
        this.match(TokenType.SEMICOLON);
      }
      this.expect(TokenType.RBRACE, "Expected '}' in enum definition");
      return { type: 'EnumDeclaration', name, variants };
    }

    throw new Error(`[V0IDSKRIPT Parse Error] Expected 'record' or 'enum' in type definition for '${name}'`);
  }

  parseContractDecl() {
    this.expect(TokenType.CONTRACT, "Expected 'contract'");
    const name = this.expectIdentifier("Expected contract identifier").value;
    this.expect(TokenType.DOUBLE_COLON, "Expected '::' after contract identifier");
    this.expect(TokenType.SPEC, "Expected 'spec' block start in contract");

    const methods = [];
    while (this.peek().type !== TokenType.END && this.peek().type !== TokenType.EOF) {
      methods.push(this.parseFunctionDecl());
    }
    this.expect(TokenType.END, "Expected 'end' at end of contract specification");

    return { type: 'ContractDeclaration', name, methods };
  }

  parseImplDecl() {
    this.expect(TokenType.IMPL, "Expected 'impl'");
    let contractName = null;
    let targetName = this.expectIdentifier("Expected target or contract identifier").value;

    if (this.peek().value === 'for' || this.match(TokenType.FOR)) {
      this.advance(); // consume 'for'
      contractName = targetName;
      targetName = this.expectIdentifier("Expected target identifier after 'for'").value;
    }

    this.expect(TokenType.DOUBLE_COLON, "Expected '::' in impl block");
    this.expect(TokenType.BIND, "Expected 'bind' block start in impl declaration");

    const methods = [];
    while (this.peek().type !== TokenType.END && this.peek().type !== TokenType.EOF) {
      methods.push(this.parseFunctionDecl());
    }
    this.expect(TokenType.END, "Expected 'end' at end of impl bind block");

    return { type: 'ImplDeclaration', contractName, targetName, methods };
  }

  parseTensorDecl() {
    this.expect(TokenType.TENSOR, "Expected 'tensor'");
    const name = this.expectIdentifier("Expected tensor variable identifier").value;
    this.expect(TokenType.DOUBLE_COLON, "Expected '::'");
    this.expect(TokenType.GRID, "Expected 'grid'");

    this.expect(TokenType.LBRACK, "Expected '[' at start of tensor grid matrix");
    const rows = [];
    let currentRow = [];

    while (this.peek().type !== TokenType.RBRACK && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.SEMICOLON) {
        this.advance();
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        continue;
      }
      currentRow.push(this.parseExpression());
      if (this.peek().type === TokenType.COMMA) this.advance();
    }
    if (currentRow.length > 0) rows.push(currentRow);
    this.expect(TokenType.RBRACK, "Expected ']' at end of tensor grid");

    this.match(TokenType.SEMICOLON);

    return { type: 'TensorDeclaration', name, rows };
  }

  parseDoBlock() {
    if (this.peek().type === TokenType.DO) this.advance();
    else if (this.peek().type === TokenType.LBRACE) this.advance();

    const body = [];
    while (this.peek().type !== TokenType.END && this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      body.push(this.parseStatement());
    }

    if (this.peek().type === TokenType.END) this.advance();
    else if (this.peek().type === TokenType.RBRACE) this.advance();

    return { type: 'DoBlockStatement', body };
  }

  parseIfStatement() {
    this.expect(TokenType.IF, "Expected 'if'");
    let hasParen = !!this.match(TokenType.LPAREN);
    const condition = this.parseExpression();
    if (hasParen) this.expect(TokenType.RPAREN);

    this.match(TokenType.DOUBLE_COLON);
    const consequent = this.parseDoBlock();
    let alternate = null;

    if (this.match(TokenType.ELSE)) {
      if (this.peek().type === TokenType.IF) {
        alternate = this.parseIfStatement();
      } else {
        this.match(TokenType.DOUBLE_COLON);
        alternate = this.parseDoBlock();
      }
    }

    return { type: 'IfStatement', condition, consequent, alternate };
  }

  parseWhileStatement() {
    this.expect(TokenType.WHILE, "Expected 'while'");
    let hasParen = !!this.match(TokenType.LPAREN);
    const condition = this.parseExpression();
    if (hasParen) this.expect(TokenType.RPAREN);

    this.match(TokenType.DOUBLE_COLON);
    this.match(TokenType.PASS);
    const body = this.parseDoBlock();

    return { type: 'WhileStatement', condition, body };
  }

  parseLoopStatement() {
    this.expect(TokenType.LOOP, "Expected 'loop'");
    let hasParen = !!this.match(TokenType.LPAREN);
    const variable = this.expectIdentifier("Expected loop variable identifier").value;
    this.expect(TokenType.IN, "Expected 'in'");
    const iterable = this.parseExpression();
    if (hasParen) this.expect(TokenType.RPAREN);

    this.match(TokenType.DOUBLE_COLON);
    this.match(TokenType.PASS);
    const body = this.parseDoBlock();

    return { type: 'LoopStatement', variable, iterable, body };
  }

  parseSelectStatement() {
    this.expect(TokenType.SELECT, "Expected 'select'");
    const discriminant = this.parseExpression();
    this.match(TokenType.DOUBLE_COLON);

    const cases = [];
    while (this.peek().type !== TokenType.END && this.peek().type !== TokenType.EOF) {
      if (this.match(TokenType.CASE)) {
        const pattern = this.parsePattern();
        let guard = null;
        if (this.match(TokenType.IF)) {
          guard = this.parseExpression();
        }
        this.expect(TokenType.FAT_ARROW, "Expected '=>' in select arm");
        const body = this.parseStatement();
        cases.push({ pattern, guard, body });
      } else if (this.match(TokenType.ELSE)) {
        this.expect(TokenType.FAT_ARROW, "Expected '=>' in select default branch");
        const body = this.parseStatement();
        cases.push({ pattern: { type: 'WildcardPattern' }, guard: null, body });
      } else {
        break;
      }
    }
    this.expect(TokenType.END, "Expected 'end' at end of select statement");

    return { type: 'SelectStatement', discriminant, cases };
  }

  parsePattern() {
    const token = this.peek();
    if (token.value === '_') {
      this.advance();
      return { type: 'WildcardPattern' };
    }
    if (token.type === TokenType.NUMBER || token.type === TokenType.STRING || token.type === TokenType.BOOLEAN) {
      this.advance();
      return { type: 'LiteralPattern', value: token.value };
    }
    if (token.type === TokenType.IDENTIFIER || token.type === TokenType.OUT || token.type === TokenType.IN) {
      const name = this.advance().value;
      if (this.match(TokenType.DOUBLE_COLON)) {
        const variant = this.expectIdentifier("Expected enum variant identifier").value;
        let args = [];
        if (this.match(TokenType.LPAREN)) {
          while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
            args.push(this.expectIdentifier().value);
            if (!this.match(TokenType.COMMA)) break;
          }
          this.expect(TokenType.RPAREN);
        }
        return { type: 'EnumPattern', enumName: name, variant, args };
      }
      return { type: 'BindingPattern', name };
    }
    return { type: 'WildcardPattern' };
  }

  // --- Expressions ---
  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    let expr = this.parseTernary();

    if (this.match(TokenType.EQ, TokenType.COLON_EQ, TokenType.LEFT_ARROW_EQ)) {
      const right = this.parseAssignment();
      return { type: 'AssignmentExpression', left: expr, right };
    }

    return expr;
  }

  parseTernary() {
    let expr = this.parsePipeline();

    if (this.match(TokenType.QUESTION)) {
      const consequent = this.parseExpression();
      this.expect(TokenType.COLON, "Expected ':' in ternary expression");
      const alternate = this.parseExpression();
      return { type: 'TernaryExpression', condition: expr, consequent, alternate };
    }

    return expr;
  }

  parsePipeline() {
    let left = this.parseVectorOps();

    while (this.match(TokenType.PIPELINE)) {
      const right = this.parseVectorOps();
      left = { type: 'PipelineExpression', left, right };
    }

    return left;
  }

  parseVectorOps() {
    let left = this.parseLogicalOr();

    while (!this.noVectorOps) {
      if (this.match(TokenType.AT_MAP)) {
        const fn = this.withoutVectorOps(() => this.parseExpression());
        left = { type: 'VectorMapExpression', target: left, callback: fn };
      } else if (this.match(TokenType.AT_FILTER)) {
        const fn = this.withoutVectorOps(() => this.parseExpression());
        left = { type: 'VectorFilterExpression', target: left, callback: fn };
      } else if (this.match(TokenType.AT_REDUCE)) {
        // values @reduce |acc, x| => acc + x, initial
        const fn = this.withoutVectorOps(() => this.parseExpression());
        let initial = null;
        if (this.match(TokenType.COMMA)) {
          initial = this.withoutVectorOps(() => this.parseExpression());
        }
        left = { type: 'VectorReduceExpression', target: left, callback: fn, initial };
      } else if (this.match(TokenType.MAT_MUL)) {
        const right = this.parseLogicalOr();
        left = { type: 'MatrixMultiplyExpression', left, right };
      } else if (this.match(TokenType.DOT_PROD)) {
        const right = this.parseLogicalOr();
        left = { type: 'DotProductExpression', left, right };
      } else if (this.match(TokenType.CROSS_PROD)) {
        const right = this.parseLogicalOr();
        left = { type: 'CrossProductExpression', left, right };
      } else {
        break;
      }
    }

    return left;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match(TokenType.OR)) {
      const right = this.parseLogicalAnd();
      left = { type: 'BinaryExpression', operator: '||', left, right };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.match(TokenType.AND)) {
      const right = this.parseEquality();
      left = { type: 'BinaryExpression', operator: '&&', left, right };
    }
    return left;
  }

  parseEquality() {
    let left = this.parseRelational();
    while (true) {
      const op = this.match(TokenType.EQ_EQ, TokenType.NOT_EQ);
      if (!op) break;
      const right = this.parseRelational();
      left = { type: 'BinaryExpression', operator: op.value, left, right };
    }
    return left;
  }

  parseRelational() {
    let left = this.parseAdditive();
    while (true) {
      const op = this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE);
      if (!op) break;
      const right = this.parseAdditive();
      left = { type: 'BinaryExpression', operator: op.value, left, right };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (true) {
      const op = this.match(TokenType.PLUS, TokenType.MINUS);
      if (!op) break;
      const right = this.parseMultiplicative();
      left = { type: 'BinaryExpression', operator: op.value, left, right };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (true) {
      const op = this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT);
      if (!op) break;
      const right = this.parseUnary();
      left = { type: 'BinaryExpression', operator: op.value, left, right };
    }
    return left;
  }

  parseUnary() {
    const op = this.match(TokenType.NOT, TokenType.MINUS);
    if (op) {
      const arg = this.parseUnary();
      return { type: 'UnaryExpression', operator: op.value, argument: arg };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.DOT)) {
        const prop = this.expectIdentifier("Expected property identifier after '.'").value;
        expr = { type: 'MemberExpression', object: expr, property: prop, computed: false };
      } else if (this.peek().type === TokenType.DOUBLE_COLON && (this.peek(1).type === TokenType.IDENTIFIER || [TokenType.OUT, TokenType.IN, TokenType.REF, TokenType.OWN].includes(this.peek(1).type))) {
        this.advance(); // ::
        const prop = this.expectIdentifier("Expected namespace identifier after '::'").value;
        expr = { type: 'NamespaceExpression', object: expr, property: prop };
      } else if (this.match(TokenType.LBRACK)) {
        const index = this.withVectorOps(() => this.parseExpression());
        this.expect(TokenType.RBRACK, "Expected ']' after index");
        expr = { type: 'MemberExpression', object: expr, property: index, computed: true };
      } else if (this.match(TokenType.LPAREN)) {
        const args = [];
        while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
          args.push(this.withVectorOps(() => this.parseExpression()));
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN, "Expected ')' after call arguments");
        expr = { type: 'CallExpression', callee: expr, arguments: args };
      } else {
        break;
      }
    }

    return expr;
  }

  parsePrimary() {
    const token = this.peek();

    if (this.match(TokenType.NIL)) return { type: 'NilLiteral', value: null };

    // Range construct 0..10 or 0..=10
    if (token.type === TokenType.NUMBER && (this.peek(1).type === TokenType.RANGE || this.peek(1).type === TokenType.RANGE_INCL)) {
      const start = this.advance().value;
      const isInclusive = this.peek().type === TokenType.RANGE_INCL;
      this.advance();
      const end = this.parseExpression();
      return { type: 'RangeLiteral', start, end, isInclusive };
    }

    if (token.type === TokenType.NUMBER) { this.advance(); return { type: 'NumericLiteral', value: token.value }; }
    if (token.type === TokenType.STRING) { this.advance(); return { type: 'StringLiteral', value: token.value }; }
    if (token.type === TokenType.BOOLEAN) { this.advance(); return { type: 'BooleanLiteral', value: token.value === 'true' }; }

    // Struct Instantiation Point@{ x: 10, y: 20 }
    if ((token.type === TokenType.IDENTIFIER || [TokenType.OUT, TokenType.IN].includes(token.type)) && this.peek(1).type === TokenType.STRUCT_AT) {
      const structName = this.advance().value;
      this.advance(); // @{
      const props = [];
      while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
        const key = this.expectIdentifier("Expected key in struct instantiation").value;
        this.expect(TokenType.COLON, "Expected ':' after field key");
        const val = this.parseExpression();
        props.push({ key, value: val });
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in struct instantiation");
      return { type: 'StructLiteral', structName, properties: props };
    }

    // Anonymous Object Literal { key: val, ... }
    if (this.match(TokenType.LBRACE)) {
      const props = [];
      while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
        const key = this.expectIdentifier("Expected key in object literal").value;
        this.expect(TokenType.COLON, "Expected ':' after key in object literal");
        const val = this.withVectorOps(() => this.parseExpression());
        props.push({ key, value: val });
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' at end of object literal");
      return { type: 'ObjectLiteral', properties: props };
    }

    // Array Literal [1, 2, 3]
    if (this.match(TokenType.LBRACK)) {
      const elements = [];
      while (this.peek().type !== TokenType.RBRACK && this.peek().type !== TokenType.EOF) {
        elements.push(this.withVectorOps(() => this.parseExpression()));
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACK, "Expected ']' in array literal");
      return { type: 'ArrayLiteral', elements };
    }

    // Zero-param closure || => expr
    if (this.match(TokenType.OR)) {
      this.expect(TokenType.FAT_ARROW);
      const body = (this.peek().type === TokenType.DO || this.peek().type === TokenType.LBRACE) ? this.parseDoBlock() : this.parseExpression();
      return { type: 'ClosureExpression', params: [], body };
    }

    // Lambda Closure |a, b| => expr
    if (this.match(TokenType.PIPELINE)) {
      const params = [];
      while (this.peek().type !== TokenType.PIPELINE && this.peek().type !== TokenType.EOF) {
        params.push(this.expectIdentifier().value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.PIPELINE);
      this.expect(TokenType.FAT_ARROW);
      const body = (this.peek().type === TokenType.DO || this.peek().type === TokenType.LBRACE) ? this.parseDoBlock() : this.parseExpression();
      return { type: 'ClosureExpression', params, body };
    }

    // Parenthesized Expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.withVectorOps(() => this.parseExpression());
      this.expect(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    // Identifier or contextual keyword identifier
    if (token.type === TokenType.IDENTIFIER || [TokenType.OUT, TokenType.IN, TokenType.REF, TokenType.OWN].includes(token.type)) {
      this.advance();
      return { type: 'Identifier', name: token.value };
    }

    throw new Error(`[V0IDSKRIPT Parse Error] Unexpected primary token '${token.value}' (${token.type}) at ${token.line}:${token.col}`);
  }
}
