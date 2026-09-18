import { TokenType } from './lexer.js';

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
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
    const kindToken = this.advance(); // val, var, pin, const
    const kind = kindToken.value;
    const isMut = kind === 'var' || kind === 'pin';

    const name = this.expect(TokenType.IDENTIFIER, "Expected variable name identifier").value;

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
    let name = this.expect(TokenType.IDENTIFIER, "Expected type name").value;
    if (this.match(TokenType.LT)) {
      const typeParams = [];
      while (this.peek().type !== TokenType.GT && this.peek().type !== TokenType.EOF) {
        typeParams.push(this.parseTypeAnnotation());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.GT, "Expected '>' in type parameter");
      return `${name}<${typeParams.join(', ')}>`;
    }
    return name;
  }

  parseFunctionDecl() {
    this.advance(); // fn or def
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;

    // Optional Generic Parameters [T]
    let generics = [];
    if (this.match(TokenType.LBRACK)) {
      while (this.peek().type !== TokenType.RBRACK && this.peek().type !== TokenType.EOF) {
        generics.push(this.expect(TokenType.IDENTIFIER).value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACK);
    }

    // Parameters (in/inout/out param: Type)
    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = [];
    while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
      let mode = 'in';
      if (this.match(TokenType.INOUT)) mode = 'inout';
      else if (this.match(TokenType.OUT)) mode = 'out';
      else this.match(TokenType.IN);

      const pName = this.expect(TokenType.IDENTIFIER, "Expected parameter name").value;
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

    // Function Block Bounds: :: do ... end or { ... }
    this.match(TokenType.DOUBLE_COLON);
    const body = this.parseDoBlock();

    return { type: 'FunctionDeclaration', name, generics, params, returnType, body };
  }

  parseTypeDecl() {
    this.expect(TokenType.TYPE, "Expected 'type'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected type identifier").value;
    this.expect(TokenType.DOUBLE_COLON, "Expected '::' after type identifier");

    if (this.match(TokenType.RECORD)) {
      this.expect(TokenType.LBRACE, "Expected '{' in record type definition");
      const fields = [];
      while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
        const fieldName = this.expect(TokenType.IDENTIFIER, "Expected field name").value;
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
        const variantName = this.expect(TokenType.IDENTIFIER, "Expected enum variant identifier").value;
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
    const name = this.expect(TokenType.IDENTIFIER, "Expected contract identifier").value;
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
    let targetName = this.expect(TokenType.IDENTIFIER, "Expected target or contract identifier").value;

    if (this.match(TokenType.FOR)) {
      contractName = targetName;
      targetName = this.expect(TokenType.IDENTIFIER, "Expected target identifier after 'for'").value;
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
    const name = this.expect(TokenType.IDENTIFIER, "Expected tensor variable identifier").value;
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
    const variable = this.expect(TokenType.IDENTIFIER, "Expected loop variable identifier").value;
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
    if (token.type === TokenType.IDENTIFIER) {
      const name = this.advance().value;
      if (this.match(TokenType.DOUBLE_COLON)) {
        const variant = this.expect(TokenType.IDENTIFIER).value;
        let args = [];
        if (this.match(TokenType.LPAREN)) {
          while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
            args.push(this.expect(TokenType.IDENTIFIER).value);
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

  // --- Expressions & Vector/Matrix Operators ---
  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    let expr = this.parsePipeline();

    if (this.match(TokenType.EQ, TokenType.COLON_EQ, TokenType.LEFT_ARROW_EQ)) {
      const right = this.parseAssignment();
      return { type: 'AssignmentExpression', left: expr, right };
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

    while (true) {
      if (this.match(TokenType.AT_MAP)) {
        const fn = this.parseExpression();
        left = { type: 'VectorMapExpression', target: left, callback: fn };
      } else if (this.match(TokenType.AT_FILTER)) {
        const fn = this.parseExpression();
        left = { type: 'VectorFilterExpression', target: left, callback: fn };
      } else if (this.match(TokenType.MAT_MUL)) { // #* Matrix GEMM
        const right = this.parseLogicalOr();
        left = { type: 'MatrixMultiplyExpression', left, right };
      } else if (this.match(TokenType.DOT_PROD)) { // <.> Dot product
        const right = this.parseLogicalOr();
        left = { type: 'DotProductExpression', left, right };
      } else if (this.match(TokenType.CROSS_PROD)) { // <x> Cross product
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
        const prop = this.expect(TokenType.IDENTIFIER, "Expected property identifier after '.'").value;
        expr = { type: 'MemberExpression', object: expr, property: prop, computed: false };
      } else if (this.peek().type === TokenType.DOUBLE_COLON && this.peek(1).type === TokenType.IDENTIFIER) {
        this.advance(); // ::
        const prop = this.expect(TokenType.IDENTIFIER, "Expected namespace identifier after '::'").value;
        expr = { type: 'NamespaceExpression', object: expr, property: prop };
      } else if (this.match(TokenType.LBRACK)) {
        const index = this.parseExpression();
        this.expect(TokenType.RBRACK, "Expected ']' after index");
        expr = { type: 'MemberExpression', object: expr, property: index, computed: true };
      } else if (this.match(TokenType.LPAREN)) {
        const args = [];
        while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
          args.push(this.parseExpression());
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
      this.advance(); // .. or ..=
      const end = this.parseExpression();
      return { type: 'RangeLiteral', start, end, isInclusive };
    }

    if (token.type === TokenType.NUMBER) { this.advance(); return { type: 'NumericLiteral', value: token.value }; }
    if (token.type === TokenType.STRING) { this.advance(); return { type: 'StringLiteral', value: token.value }; }
    if (token.type === TokenType.BOOLEAN) { this.advance(); return { type: 'BooleanLiteral', value: token.value === 'true' }; }

    // Struct Instantiation Point@{ x: 10, y: 20 }
    if (token.type === TokenType.IDENTIFIER && this.peek(1).type === TokenType.STRUCT_AT) {
      const structName = this.advance().value;
      this.advance(); // @{
      const props = [];
      while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
        const key = this.expect(TokenType.IDENTIFIER, "Expected key in struct instantiation").value;
        this.expect(TokenType.COLON, "Expected ':' after field key");
        const val = this.parseExpression();
        props.push({ key, value: val });
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACE, "Expected '}' in struct instantiation");
      return { type: 'StructLiteral', structName, properties: props };
    }

    // Array Literal [1, 2, 3]
    if (this.match(TokenType.LBRACK)) {
      const elements = [];
      while (this.peek().type !== TokenType.RBRACK && this.peek().type !== TokenType.EOF) {
        elements.push(this.parseExpression());
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
        params.push(this.expect(TokenType.IDENTIFIER).value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.PIPELINE);
      this.expect(TokenType.FAT_ARROW);
      const body = (this.peek().type === TokenType.DO || this.peek().type === TokenType.LBRACE) ? this.parseDoBlock() : this.parseExpression();
      return { type: 'ClosureExpression', params, body };
    }

    // Parenthesized Expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // Identifier
    if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      return { type: 'Identifier', name: token.value };
    }

    throw new Error(`[V0IDSKRIPT Parse Error] Unexpected primary token '${token.value}' (${token.type}) at ${token.line}:${token.col}`);
  }
}
