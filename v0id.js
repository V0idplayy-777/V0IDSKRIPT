import fs from 'fs';
import path from 'path';
import { V0idInterpreter } from './src/v0id/interpreter.js';

const filename = process.argv[2];
if (!filename) {
  console.log("Usage: node v0id.js <file.v0id>");
  process.exit(1);
}

const filePath = path.resolve(filename);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const code = fs.readFileSync(filePath, 'utf-8');

const interpreter = new V0idInterpreter({
  onLog: (msg) => {
    console.log(`[${msg.type.toUpperCase()}] ${msg.text}`);
  },
  onGfxDraw: () => {},
  onUIRender: () => {}
});

try {
  const result = interpreter.run(code);
  let finalVal = result.result;
  if (finalVal && finalVal.__return) finalVal = finalVal.value;

  console.log(`\n-----------------------------------`);
  console.log(`V0IDSKRIPT Execution Complete!`);
  console.log(`Execution Time: ${result.executionTimeMs.toFixed(3)} ms`);
  console.log(`Total Instructions Executed: ${result.totalSteps}`);
} catch (err) {
  console.error(`\n[V0IDSKRIPT ERROR]`, err.message);
  process.exit(1);
}
