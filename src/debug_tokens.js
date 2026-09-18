import fs from 'fs';
import { Lexer } from './src/v0id/lexer.js';

const code = fs.readFileSync('test.v0id', 'utf-8');
const lexer = new Lexer(code);
const tokens = lexer.tokenize();

tokens.forEach(t => {
  if (t.line >= 40 && t.line <= 46) {
    console.log(`L${t.line}:C${t.col} [${t.type}] '${t.value}'`);
  }
});
