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
    const token = this.peek();

    // Attributes like #[inline]
    let attributes = [];
    if (token.type === TokenType.HASH && this.peek(1).type === TokenType.LBRACK) {
      this.match(TokenType.HASH);
      this.match(TokenType.LBRACK);
      const attr = this.expect(TokenType.IDENTIFIER, "Expected attribute name").value;
      this.expect(TokenType.RBRACK, "Expected ']' after attribute");
      attributes.push(attr);
    }

    const curr = this.peek();

    // Variable Declarations
    if ([TokenType.LET, TokenType.MUT, TokenType.CONST].includes(curr.type)) {
      return this.parseVarDecl(attributes);
    }

    // Function Declaration
    if (curr.type === TokenType.FN || (curr.type === TokenType.ASYNC && this.peek(1).type === TokenType.FN)) {
      return this.parseFunctionDecl(attributes);
    }

    // Struct Declaration
    if (curr.type === TokenType.STRUCT) {
      return this.parseStructDecl();
    }

    // Enum Declaration
    if (curr.type === TokenType.ENUM) {
      return this.parseEnumDecl();
    }

    // Trait Declaration
    if (curr.type === TokenType.TRAIT) {
      return this.parseTraitDecl();
    }

    // Impl Block
    if (curr.type === TokenType.IMPL) {
      return this.parseImplDecl();
    }

    // Defer Statement
    if (curr.type === TokenType.DEFER) {
      this.advance(); // defer
      const stmt = this.parseStatement();
      return { type: 'DeferStatement', statement: stmt };
    }

    // Control Flow
    if (curr.type === TokenType.IF) return this.parseIfStatement();
    if (curr.type === TokenType.WHILE) return this.parseWhileStatement();
    if (curr.type === TokenType.FOR) return this.parseForStatement();
    if (curr.type === TokenType.LOOP) return this.parseLoopStatement();
    if (curr.type === TokenType.MATCH) return this.parseMatchStatement();

    // Return / Break / Continue
    if (curr.type === TokenType.RETURN) {
      this.advance();
      let expr = null;
      if (this.peek().type !== TokenType.SEMICOLON) expr = this.parseExpression();
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

    // Block Statement
    if (curr.type === TokenType.LBRACE) {
      return this.parseBlockStatement();
    }

    // Expression Statement
    const expr = this.parseExpression();
    this.match(TokenType.SEMICOLON);
    return { type: 'ExpressionStatement', expression: expr };
  }

  parseVarDecl(attributes = []) {
    const kind = this.advance().value; // let / mut / const
    let isMut = kind === 'mut';

    if (this.peek().type === TokenType.MUT) {
      this.advance();
      isMut = true;
    }

    const name = this.expect(TokenType.IDENTIFIER, "Expected variable identifier").value;

    let typeAnnotation = null;
    if (this.match(TokenType.COLON)) {
      typeAnnotation = this.parseTypeAnnotation();
    }

    let init = null;
    if (this.match(TokenType.EQ)) {
      init = this.parseExpression();
    }

    this.match(TokenType.SEMICOLON);

    return {
      type: 'VariableDeclaration',
      kind,
      name,
      isMut,
      typeAnnotation,
      init,
      attributes
    };
  }

  parseTypeAnnotation() {
    let name = this.expect(TokenType.IDENTIFIER, "Expected type identifier").value;
    if (this.match(TokenType.LT)) {
      const genericArgs = [];
      while (this.peek().type !== TokenType.GT && this.peek().type !== TokenType.EOF) {
        genericArgs.push(this.parseTypeAnnotation());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.GT, "Expected '>' in type parameter");
      return `${name}<${genericArgs.join(', ')}>`;
    }
    return name;
  }

  parseFunctionDecl(attributes = []) {
    const isAsync = !!this.match(TokenType.ASYNC);
    this.expect(TokenType.FN, "Expected 'fn'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected function name").value;

    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params = [];
    while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
      const isParamMut = !!this.match(TokenType.MUT);
      const isRef = !!this.match(TokenType.AMPERSAND, TokenType.REF);
      const pName = this.expect(TokenType.IDENTIFIER, "Expected parameter name").value;
      let pType = null;
      if (this.match(TokenType.COLON)) {
        pType = this.parseTypeAnnotation();
      }
      params.push({ name: pName, type: pType, isMut: isParamMut, isRef });
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType = null;
    if (this.match(TokenType.THIN_ARROW)) {
      returnType = this.parseTypeAnnotation();
    }

    const body = this.parseBlockStatement();

    return {
      type: 'FunctionDeclaration',
      name,
      params,
      returnType,
      isAsync,
      attributes,
      body
    };
  }

  parseStructDecl() {
    this.expect(TokenType.STRUCT, "Expected 'struct'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected struct name").value;
    this.expect(TokenType.LBRACE, "Expected '{' in struct definition");

    const fields = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const isPub = !!this.match(TokenType.PUB);
      const fieldName = this.expect(TokenType.IDENTIFIER, "Expected field name").value;
      this.expect(TokenType.COLON, "Expected ':' after field name");
      const fieldType = this.parseTypeAnnotation();
      fields.push({ name: fieldName, type: fieldType, isPub });
      this.match(TokenType.COMMA);
      this.match(TokenType.SEMICOLON);
    }
    this.expect(TokenType.RBRACE, "Expected '}' in struct definition");

    return { type: 'StructDeclaration', name, fields };
  }

  parseEnumDecl() {
    this.expect(TokenType.ENUM, "Expected 'enum'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected enum name").value;
    this.expect(TokenType.LBRACE, "Expected '{' in enum definition");

    const variants = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      const variantName = this.expect(TokenType.IDENTIFIER, "Expected enum variant identifier").value;
      let payload = null;

      // Tuple variant: Variant(i32, String)
      if (this.match(TokenType.LPAREN)) {
        const tupleTypes = [];
        while (this.peek().type !== TokenType.RPAREN && this.peek().type !== TokenType.EOF) {
          tupleTypes.push(this.parseTypeAnnotation());
          if (!this.match(TokenType.COMMA)) break;
        }
        this.expect(TokenType.RPAREN);
        payload = { kind: 'tuple', types: tupleTypes };
      }

      variants.push({ name: variantName, payload });
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' in enum definition");

    return { type: 'EnumDeclaration', name, variants };
  }

  parseTraitDecl() {
    this.expect(TokenType.TRAIT, "Expected 'trait'");
    const name = this.expect(TokenType.IDENTIFIER, "Expected trait name").value;
    this.expect(TokenType.LBRACE, "Expected '{' in trait declaration");

    const methods = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      methods.push(this.parseFunctionDecl([]));
    }
    this.expect(TokenType.RBRACE, "Expected '}' in trait declaration");

    return { type: 'TraitDeclaration', name, methods };
  }

  parseImplDecl() {
    this.expect(TokenType.IMPL, "Expected 'impl'");
    let traitName = null;
    let targetName = this.expect(TokenType.IDENTIFIER, "Expected target identifier in impl").value;

    if (this.match(TokenType.FOR)) {
      traitName = targetName;
      targetName = this.expect(TokenType.IDENTIFIER, "Expected target struct for trait impl").value;
    }

    this.expect(TokenType.LBRACE, "Expected '{' in impl block");
    const methods = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      methods.push(this.parseFunctionDecl([]));
    }
    this.expect(TokenType.RBRACE, "Expected '}' in impl block");

    return { type: 'ImplDeclaration', traitName, targetName, methods };
  }

  parseIfStatement() {
    this.expect(TokenType.IF, "Expected 'if'");
    let condition = null;
    if (this.peek().type === TokenType.LPAREN) {
      this.advance();
      condition = this.parseExpression();
      this.expect(TokenType.RPAREN);
    } else {
      condition = this.parseExpression();
    }

    const consequent = this.parseBlockStatement();
    let alternate = null;

    if (this.match(TokenType.ELSE)) {
      if (this.peek().type === TokenType.IF) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlockStatement();
      }
    }

    return { type: 'IfStatement', condition, consequent, alternate };
  }

  parseWhileStatement() {
    this.expect(TokenType.WHILE, "Expected 'while'");
    let condition = null;
    if (this.peek().type === TokenType.LPAREN) {
      this.advance();
      condition = this.parseExpression();
      this.expect(TokenType.RPAREN);
    } else {
      condition = this.parseExpression();
    }
    const body = this.parseBlockStatement();
    return { type: 'WhileStatement', condition, body };
  }

  parseForStatement() {
    this.expect(TokenType.FOR, "Expected 'for'");
    let hasParen = !!this.match(TokenType.LPAREN);
    let varName = this.expect(TokenType.IDENTIFIER, "Expected loop variable name").value;
    this.expect(TokenType.IN, "Expected 'in'");
    const iterable = this.parseExpression();
    if (hasParen) this.expect(TokenType.RPAREN);
    const body = this.parseBlockStatement();
    return { type: 'ForStatement', variable: varName, iterable, body };
  }

  parseLoopStatement() {
    this.expect(TokenType.LOOP, "Expected 'loop'");
    const body = this.parseBlockStatement();
    return { type: 'LoopStatement', body };
  }

  parseMatchStatement() {
    this.expect(TokenType.MATCH, "Expected 'match'");
    const discriminant = this.parseExpression();
    this.expect(TokenType.LBRACE, "Expected '{' in match statement");

    const cases = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      let pattern = this.parsePattern();
      let guard = null;

      if (this.match(TokenType.IF)) {
        guard = this.parseExpression();
      }

      this.expect(TokenType.FAT_ARROW, "Expected '=>' in match arm");
      const body = this.parseStatement();
      cases.push({ pattern, guard, body });
      this.match(TokenType.COMMA);
    }
    this.expect(TokenType.RBRACE, "Expected '}' in match statement");

    return { type: 'MatchStatement', discriminant, cases };
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

  parseBlockStatement() {
    this.expect(TokenType.LBRACE, "Expected '{'");
    const body = [];
    while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE, "Expected '}'");
    return { type: 'BlockStatement', body };
  }

  // --- Expressions ---
  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    let expr = this.parsePipeline();

    if ([TokenType.EQ, TokenType.PLUS_EQ, TokenType.MINUS_EQ, TokenType.STAR_EQ, TokenType.SLASH_EQ].includes(this.peek().type)) {
      const op = this.advance().value;
      const right = this.parseAssignment();
      return { type: 'AssignmentExpression', operator: op, left: expr, right };
    }

    return expr;
  }

  parsePipeline() {
    let left = this.parseLogicalOr();

    while (this.peek().type === TokenType.PIPELINE || this.peek().type === TokenType.PIPE_DISPATCH) {
      this.advance();
      const right = this.parseLogicalOr();
      left = { type: 'PipelineExpression', left, right };
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
    const op = this.match(TokenType.NOT, TokenType.MINUS, TokenType.STAR, TokenType.AMPERSAND);
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
      } else if (this.match(TokenType.DOUBLE_COLON)) {
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
      } else if (this.match(TokenType.FORCE_UNWRAP)) {
        expr = { type: 'ForceUnwrapExpression', argument: expr };
      } else {
        break;
      }
    }

    return expr;
  }

  parsePrimary() {
    const token = this.peek();

    if (this.match(TokenType.NIL)) return { type: 'NilLiteral', value: null };

    // Range construct 0..10
    if (token.type === TokenType.NUMBER && this.peek(1).type === TokenType.RANGE) {
      const start = this.advance().value;
      this.advance(); // ..
      const end = this.parseExpression();
      return { type: 'RangeLiteral', start, end };
    }

    if (token.type === TokenType.NUMBER) { this.advance(); return { type: 'NumericLiteral', value: token.value }; }
    if (token.type === TokenType.STRING) { this.advance(); return { type: 'StringLiteral', value: token.value }; }
    if (token.type === TokenType.BOOLEAN) { this.advance(); return { type: 'BooleanLiteral', value: token.value === 'true' }; }

    // Array / Vector Literal [1, 2, 3]
    if (this.match(TokenType.LBRACK)) {
      const elements = [];
      while (this.peek().type !== TokenType.RBRACK && this.peek().type !== TokenType.EOF) {
        elements.push(this.parseExpression());
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RBRACK, "Expected ']' in array literal");
      return { type: 'ArrayLiteral', elements };
    }

    // Zero-parameter Closure || => expr or || => { ... }
    if (this.match(TokenType.OR)) {
      this.expect(TokenType.FAT_ARROW, "Expected '=>' after '||'");
      const body = this.peek().type === TokenType.LBRACE ? this.parseBlockStatement() : this.parseExpression();
      return { type: 'ClosureExpression', params: [], body };
    }

    // Lambda Closure |a, b| => expr or |a, b| => { ... }
    if (this.match(TokenType.PIPE)) {
      const params = [];
      while (this.peek().type !== TokenType.PIPE && this.peek().type !== TokenType.EOF) {
        params.push(this.expect(TokenType.IDENTIFIER, "Expected parameter identifier in closure").value);
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.PIPE);
      this.expect(TokenType.FAT_ARROW);
      const body = this.peek().type === TokenType.LBRACE ? this.parseBlockStatement() : this.parseExpression();
      return { type: 'ClosureExpression', params, body };
    }

    // Parenthesized Expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, "Expected ')'");
      return expr;
    }

    // Identifiers & Self
    if (token.type === TokenType.IDENTIFIER || token.type === TokenType.SELF) {
      this.advance();
      return { type: 'Identifier', name: token.value };
    }

    throw new Error(`[V0IDSKRIPT Parse Error] Unexpected primary expression token '${token.value}' (${token.type}) at ${token.line}:${token.col}`);
  }
}
