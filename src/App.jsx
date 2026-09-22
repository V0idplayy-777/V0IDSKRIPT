import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Play, RotateCcw, BookOpen, Cpu, Terminal, Layout, Gauge, FileCode, Monitor, Send, Layers,
  Square, Keyboard
} from 'lucide-react';
import { Lexer } from './v0id/lexer.js';
import { Parser } from './v0id/parser.js';
import { V0idInterpreter, DEFAULT_LIMITS } from './v0id/interpreter.js';
import { registerV0idLanguage } from './v0id/monaco-v0id.js';
import { EXAMPLES } from './v0id/examples.js';

let logIdCounter = 0;
const nextLogId = () => `${Date.now()}-${logIdCounter++}`;

export default function App() {
  const [selectedExample, setSelectedExample] = useState(EXAMPLES[0].id);
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('split');
  const [stats, setExecutionStats] = useState({ timeMs: 0, steps: 0, status: 'IDLE' });
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [astTree, setAstTree] = useState(null);
  const [promptInput, setPromptInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [awaitingInput, setAwaitingInput] = useState(false);

  const canvasRef = useRef(null);
  const editorRef = useRef(null);
  const interpreterRef = useRef(null);
  const promptResolverRef = useRef(null);
  // Live input state (mutated in place so a running program sees updates).
  const keyStatesRef = useRef({});
  const mouseStateRef = useRef({ x: 0, y: 0, isDown: false });
  const mouseLabelRef = useRef(null);

  const pushLog = useCallback((msg) => {
    setLogs(prev => {
      const last = prev[prev.length - 1];
      // `print` (newline: false) continues the previous line, like a terminal.
      if (msg.newline === false && last && last.pending) {
        return [...prev.slice(0, -1), { ...last, text: last.text + msg.text }];
      }
      return [...prev, { ...msg, id: nextLogId(), pending: msg.newline === false }];
    });
  }, []);

  const handleSelectExample = (id) => {
    const ex = EXAMPLES.find(e => e.id === id);
    if (ex) {
      setSelectedExample(id);
      setCode(ex.code);
    }
  };

  const handleEditorWillMount = (monaco) => {
    registerV0idLanguage(monaco);
  };

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    const normalize = (key) => {
      const k = String(key).toLowerCase();
      if (k === ' ') return 'space';
      if (k.startsWith('arrow')) return k.slice(5);
      return k;
    };
    const handleKeyDown = (e) => { keyStatesRef.current[normalize(e.key)] = true; };
    const handleKeyUp = (e) => { keyStatesRef.current[normalize(e.key)] = false; };
    const handleBlur = () => { keyStatesRef.current = {}; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const drawGfxCommand = (ctx, cmd) => {
    if (!ctx) return;
    switch (cmd.action) {
      case 'init':
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, cmd.width || 800, cmd.height || 500);
        break;
      case 'clear':
        ctx.shadowBlur = 0;
        ctx.fillStyle = cmd.color || '#0f172a';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        break;
      case 'rect':
        ctx.fillStyle = cmd.color || '#3b82f6';
        ctx.strokeStyle = cmd.color || '#3b82f6';
        if (cmd.fill) {
          ctx.fillRect(cmd.x, cmd.y, cmd.w, cmd.h);
        } else {
          ctx.strokeRect(cmd.x, cmd.y, cmd.w, cmd.h);
        }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
        if (cmd.fill) {
          ctx.fillStyle = cmd.color || '#10b981';
          ctx.fill();
        } else {
          ctx.strokeStyle = cmd.color || '#10b981';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        break;
      case 'line':
        ctx.beginPath();
        ctx.moveTo(cmd.x1, cmd.y1);
        ctx.lineTo(cmd.x2, cmd.y2);
        ctx.strokeStyle = cmd.color || '#64748b';
        ctx.lineWidth = cmd.width || 1;
        ctx.stroke();
        break;
      case 'text':
        ctx.fillStyle = cmd.color || '#ffffff';
        ctx.font = `${cmd.size || 14}px "Fira Code", monospace`;
        ctx.fillText(cmd.str, cmd.x, cmd.y);
        break;
      default:
        break;
    }
  };

  const runCode = async () => {
    // Abort anything still running (including programs waiting on read_line).
    if (interpreterRef.current) interpreterRef.current.abort();
    if (promptResolverRef.current) {
      promptResolverRef.current(null);
      promptResolverRef.current = null;
    }

    setLogs([]);
    setAstTree(null);
    setAwaitingInput(false);

    const canvas = canvasRef.current;
    let ctx = null;
    if (canvas) {
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    let interpreter;
    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parseProgram();
      setAstTree(ast);

      interpreter = new V0idInterpreter({
        onLog: pushLog,
        onGfxDraw: (cmd) => {
          if (ctx) drawGfxCommand(ctx, cmd);
        },
        // `std::io::read_line` suspends here until the console submits a line.
        onPromptInput: () => new Promise((resolve) => {
          promptResolverRef.current = resolve;
          setAwaitingInput(true);
        }),
        keyStates: keyStatesRef.current,
        mouseState: mouseStateRef.current
      });
      interpreterRef.current = interpreter;

      setExecutionStats({ timeMs: 0, steps: 0, status: 'RUNNING' });
      setIsRunning(true);
      const res = await interpreter.run(code);
      setExecutionStats({
        timeMs: res.executionTimeMs,
        steps: res.totalSteps,
        status: 'SUCCESS'
      });
    } catch (err) {
      if (err && err.isAbort) {
        setExecutionStats({ timeMs: 0, steps: 0, status: 'ABORTED' });
        pushLog({ type: 'warn', text: err.message });
      } else {
        setExecutionStats({ timeMs: 0, steps: 0, status: 'ERROR' });
        pushLog({ type: 'error', text: err.message });
      }
    } finally {
      if (interpreterRef.current === interpreter) interpreterRef.current = null;
      setIsRunning(false);
      setAwaitingInput(false);
      promptResolverRef.current = null;
    }
  };

  const stopCode = () => {
    if (interpreterRef.current) interpreterRef.current.abort('Execution stopped by user.');
    if (promptResolverRef.current) {
      promptResolverRef.current(null);
      promptResolverRef.current = null;
    }
    setAwaitingInput(false);
  };

  const handleSendPrompt = (e) => {
    e.preventDefault();
    const text = promptInput;
    if (!text.trim() && !promptResolverRef.current) return;
    setPromptInput('');

    const resolver = promptResolverRef.current;
    if (resolver) {
      promptResolverRef.current = null;
      setAwaitingInput(false);
      pushLog({ type: 'stdin', text });
      resolver(text);
    } else {
      pushLog({ type: 'stdout', text: `> ${text}` });
    }
  };

  const handleCanvasMouse = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseStateRef.current.x = Math.round(((event.clientX - rect.left) / rect.width) * canvas.width);
    mouseStateRef.current.y = Math.round(((event.clientY - rect.top) / rect.height) * canvas.height);
    // Written straight into the DOM: moving the mouse must not re-render React.
    if (mouseLabelRef.current) {
      mouseLabelRef.current.textContent = `mouse: ${mouseStateRef.current.x},${mouseStateRef.current.y}`;
    }
  };

  useEffect(() => {
    runCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-100 font-mono select-none overflow-hidden">
      
      {/* Top Bar */}
      <header className="h-14 bg-[#1e293b] border-b border-[#334155] px-5 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 font-bold">
            V0
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base tracking-wide text-slate-100">
                V0IDSKRIPT
              </span>
              <span className="text-[11px] bg-[#0f172a] text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-semibold">
                v4.1 Kernel
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedExample}
            onChange={(e) => handleSelectExample(e.target.value)}
            className="bg-[#0f172a] text-xs text-slate-200 border border-[#334155] rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer hover:bg-[#1e293b] transition-all"
          >
            {EXAMPLES.map(ex => (
              <option key={ex.id} value={ex.id}>
                {ex.title} [{ex.category}]
              </option>
            ))}
          </select>

          <button
            onClick={runCode}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-1.5 rounded-lg shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Run Kernel Code</span>
          </button>

          <button
            onClick={stopCode}
            disabled={!isRunning}
            className={`flex items-center space-x-1.5 font-semibold text-xs px-3 py-1.5 rounded-lg border transition-all ${
              isRunning
                ? 'bg-rose-600/20 border-rose-500/50 text-rose-300 hover:bg-rose-600/40 cursor-pointer'
                : 'bg-[#0f172a] border-[#334155] text-slate-500 cursor-not-allowed'
            }`}
            title="Stop a running program (also cancels a pending read_line)"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>

          <button
            onClick={() => setLogs([])}
            className="p-1.5 bg-[#0f172a] hover:bg-[#1e293b] border border-[#334155] rounded-lg text-slate-300 transition-all cursor-pointer"
            title="Clear Terminal Output"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSpecModal(true)}
            className="flex items-center space-x-1.5 bg-[#0f172a] hover:bg-[#1e293b] border border-blue-500/40 text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>v4.1 Specification</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Split */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Side: Code Editor */}
        <div className="w-1/2 flex flex-col border-r border-[#334155] bg-[#0f172a]">
          
          <div className="h-9 bg-[#1e293b] border-b border-[#334155] px-4 flex items-center justify-between shrink-0 text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <FileCode className="w-4 h-4 text-blue-400" />
              <span className="font-semibold text-slate-200">{EXAMPLES.find(e => e.id === selectedExample)?.title}</span>
            </div>
            <span className="text-[11px] text-slate-400">Ctrl+Enter to Execute</span>
          </div>

          <div className="flex-1 relative">
            <Editor
              height="100%"
              language="v0idskript"
              theme="v0id-studio"
              value={code}
              onChange={(value) => setCode(value || '')}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 13,
                fontFamily: '"Fira Code", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                padding: { top: 10, bottom: 10 },
                lineNumbersMinChars: 3
              }}
            />
          </div>

          {/* Keyword & Operator Quick Bar */}
          <div className="h-9 bg-[#1e293b] border-t border-[#334155] px-3 flex items-center space-x-1.5 overflow-x-auto shrink-0 text-xs">
            <span className="text-[10px] text-slate-400 font-semibold uppercase mr-1">v4.1 Syntax:</span>
            {['val', 'var', 'pin', 'fn', 'type', 'record', 'contract', 'impl', 'bind', 'do...end', 'select', 'tensor', '#*', '<.>', '@map', '@reduce', 'out', 'inout'].map(kw => (
              <button
                key={kw}
                onClick={() => {
                  if (editorRef.current) {
                    const editor = editorRef.current;
                    editor.trigger('keyboard', 'type', { text: kw });
                    editor.focus();
                  }
                }}
                className="bg-[#0f172a] hover:bg-blue-600 hover:text-white border border-[#334155] text-slate-300 px-2 py-0.5 rounded text-xs font-mono transition-all cursor-pointer shrink-0"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: Output Views */}
        <div className="w-1/2 flex flex-col bg-[#0f172a]">
          
          <div className="h-9 bg-[#1e293b] border-b border-[#334155] px-4 flex items-center justify-between shrink-0">
            <div className="flex space-x-1">
              {[
                { id: 'split', label: 'Split View', icon: Layout },
                { id: 'console', label: 'Terminal', icon: Terminal },
                { id: 'viewport', label: 'Canvas Viewport', icon: Monitor },
                { id: 'profiler', label: 'Profiler', icon: Gauge },
                { id: 'ast', label: 'AST Inspector', icon: Layers }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-[#0f172a] text-blue-400 border border-blue-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-3 text-[11px] text-slate-400">
              <span className="text-emerald-400 font-bold">{stats.timeMs.toFixed(3)} ms</span>
              <span>({stats.steps} steps)</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            
            {/* Viewport Canvas */}
            {(activeTab === 'split' || activeTab === 'viewport') && (
              <div className={`p-3 bg-[#0f172a] border-b border-[#334155] flex items-center justify-center ${
                activeTab === 'split' ? 'h-1/2' : 'h-full'
              }`}>
                <div className="relative rounded border border-[#334155] bg-[#0f172a] overflow-hidden shadow-md">
                  <canvas
                    ref={canvasRef}
                    width={800}
                    height={500}
                    className="w-[580px] h-[300px] object-contain block bg-[#0f172a]"
                    onMouseMove={handleCanvasMouse}
                    onMouseDown={(e) => { mouseStateRef.current.isDown = true; handleCanvasMouse(e); }}
                    onMouseUp={() => { mouseStateRef.current.isDown = false; }}
                    onMouseLeave={() => { mouseStateRef.current.isDown = false; }}
                  />
                  <div className="absolute top-2 left-2 bg-[#1e293b]/90 px-2 py-0.5 rounded text-[10px] text-blue-400 border border-[#334155]">
                    2D/3D Viewport Canvas
                  </div>
                  <div
                    ref={mouseLabelRef}
                    className="absolute top-2 right-2 bg-[#1e293b]/90 px-2 py-0.5 rounded text-[10px] text-slate-400 border border-[#334155]"
                  >
                    mouse: 0,0
                  </div>
                </div>
              </div>
            )}

            {/* Terminal Console */}
            {(activeTab === 'split' || activeTab === 'console') && (
              <div className={`flex flex-col bg-[#0f172a] font-mono text-xs overflow-hidden ${
                activeTab === 'split' ? 'h-1/2' : 'h-full'
              }`}>
                <div className="flex-1 p-3 overflow-y-auto space-y-1">
                  {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500">
                      <Terminal className="w-6 h-6 mb-1 opacity-50" />
                      <p>Console Output Terminal Ready.</p>
                    </div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="flex items-start space-x-2">
                        <span className={`text-[10px] px-1 py-0.5 rounded font-bold shrink-0 ${
                          log.type === 'warn' ? 'bg-amber-950 text-amber-400' :
                          log.type === 'error' ? 'bg-rose-950 text-rose-400' :
                          log.type === 'bench' ? 'bg-emerald-950 text-emerald-400' :
                          log.type === 'stdin' ? 'bg-blue-950 text-blue-300' :
                          'bg-[#1e293b] text-slate-400'
                        }`}>
                          {log.type === 'warn' ? '[WARN]' : log.type === 'error' ? '[ERROR]' : log.type === 'bench' ? '[BENCH]' : log.type === 'stdin' ? '[STDIN]' : '[STDOUT]'}
                        </span>
                        <span className={`break-all whitespace-pre-wrap ${
                          log.type === 'stdin' ? 'text-blue-300' : 'text-slate-200'
                        }`}>{log.text}</span>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendPrompt} className="p-2 bg-[#1e293b] border-t border-[#334155] flex items-center space-x-2 shrink-0">
                  <span className={`font-bold ${awaitingInput ? 'text-emerald-400' : 'text-blue-400'}`}>
                    {awaitingInput ? '?' : '$'}
                  </span>
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder={awaitingInput ? 'Program is waiting for read_line — type and press Enter' : 'Interactive input console (read_line reads from here)'}
                    className={`flex-1 bg-[#0f172a] text-xs text-slate-100 border rounded px-2.5 py-1 focus:outline-none ${
                      awaitingInput ? 'border-emerald-500 focus:border-emerald-400' : 'border-[#334155] focus:border-blue-500'
                    }`}
                  />
                  {awaitingInput && (
                    <span className="flex items-center space-x-1 text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700">
                      <Keyboard className="w-3 h-3" />
                      <span>awaiting input</span>
                    </span>
                  )}
                  <button type="submit" className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500 cursor-pointer">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* Profiler Tab */}
            {activeTab === 'profiler' && (
              <div className="p-6 bg-[#0f172a] text-xs space-y-4 overflow-y-auto">
                <h3 className="text-sm font-bold text-slate-100">V0IDSKRIPT v4.1 Profiler</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1e293b] p-4 rounded border border-[#334155]">
                    <div className="text-slate-400 mb-1">Execution Time</div>
                    <div className="text-xl font-bold text-emerald-400">{stats.timeMs.toFixed(3)} ms</div>
                  </div>
                  <div className="bg-[#1e293b] p-4 rounded border border-[#334155]">
                    <div className="text-slate-400 mb-1">Total Steps Evaluated</div>
                    <div className="text-xl font-bold text-blue-400">{stats.steps} steps</div>
                  </div>
                </div>

                <div className="bg-[#1e293b] p-4 rounded border border-[#334155]">
                  <div className="text-slate-300 font-bold mb-2">Sandbox Limits (this run)</div>
                  <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-[11px] text-slate-400">
                    <div>Max steps</div>
                    <div className="text-slate-200">{DEFAULT_LIMITS.maxSteps.toLocaleString()}</div>
                    <div>Max iterations / loop</div>
                    <div className="text-slate-200">{DEFAULT_LIMITS.maxLoopIterations.toLocaleString()}</div>
                    <div>Max total loop iterations</div>
                    <div className="text-slate-200">{DEFAULT_LIMITS.maxTotalLoopIterations.toLocaleString()}</div>
                    <div>Max call depth</div>
                    <div className="text-slate-200">{DEFAULT_LIMITS.maxCallDepth.toLocaleString()}</div>
                    <div>Wall clock budget</div>
                    <div className="text-slate-200">{DEFAULT_LIMITS.maxTimeMs ? `${DEFAULT_LIMITS.maxTimeMs} ms` : 'disabled'}</div>
                    <div>Status</div>
                    <div className="text-slate-200">{stats.status}</div>
                  </div>
                  <p className="mt-3 text-[10px] text-slate-500">
                    Every limit is configurable: <code className="text-blue-400">new V0idInterpreter({'{ limits: { maxSteps: 0 } }'})</code>,
                    or <code className="text-blue-400">--max-steps N</code> / <code className="text-blue-400">--unlimited</code> on the CLI.
                  </p>
                </div>
              </div>
            )}

            {/* AST Inspector */}
            {activeTab === 'ast' && (
              <div className="p-4 bg-[#0f172a] text-xs font-mono overflow-y-auto h-full text-slate-300">
                <h3 className="text-sm font-bold text-slate-100 mb-2">V0IDSKRIPT v4.1 Parsed AST</h3>
                <pre className="bg-[#1e293b] p-3 rounded border border-[#334155] overflow-x-auto text-[11px]">
                  {JSON.stringify(astTree, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manual Documentation Modal */}
      {showSpecModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#0f172a] border border-[#334155] rounded-xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="h-12 bg-[#1e293b] border-b border-[#334155] px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  V0IDSKRIPT v4.1 Systems Kernel Specification Manual
                </h2>
              </div>
              <button onClick={() => setShowSpecModal(false)} className="text-slate-400 hover:text-white font-bold px-2 py-1 cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 text-slate-300 text-xs space-y-5 leading-relaxed">
              <section>
                <h3 className="text-sm font-bold text-blue-400 mb-1">1. Types are enforced</h3>
                <p>Annotations on <code className="text-slate-100">val</code>/<code className="text-slate-100">var</code>, parameters,
                <code className="text-slate-100">-&gt; T</code> return types, record fields, enum payloads and generic parameters are checked
                at runtime. Integers widen into floats (<code className="text-slate-100">i32</code> &#8594; <code className="text-slate-100">f64</code>),
                floats never narrow into integers, and <code className="text-slate-100">T?</code> also accepts <code className="text-slate-100">nil</code>.</p>
                <pre className="mt-2 bg-[#1e293b] p-3 rounded border border-[#334155] text-[11px] overflow-x-auto">{`val count: i32 = 4        # ok
val ratio: f64 = count    # ok (widening)
val bad:   i32 = 1.5      # Type Error
fn area(in r: f64) -> f64 :: do return 3.14 * r * r end`}</pre>
              </section>

              <section>
                <h3 className="text-sm font-bold text-blue-400 mb-1">2. Parameter modes have semantics</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li><code className="text-slate-100">in</code> (default) — read-only borrow: the callee can neither rebind nor write through it.</li>
                  <li><code className="text-slate-100">out</code> — write-only slot, starts as <code className="text-slate-100">nil</code> and is copied back to the caller on return.</li>
                  <li><code className="text-slate-100">inout</code> — copy-in / copy-out: reads the caller&apos;s value, writes it back on return.</li>
                  <li><code className="text-slate-100">own</code> — the callee gets a deep copy; the caller&apos;s value is untouched.</li>
                  <li><code className="text-slate-100">ref</code> — aliases the caller&apos;s storage; every read and write is immediate.</li>
                </ul>
                <pre className="mt-2 bg-[#1e293b] p-3 rounded border border-[#334155] text-[11px] overflow-x-auto">{`fn fill(out x: i32) :: do x = 42 end
var v = 0
fill(v)          # v == 42`}</pre>
              </section>

              <section>
                <h3 className="text-sm font-bold text-blue-400 mb-1">3. Contracts are verified</h3>
                <p><code className="text-slate-100">impl C for T :: bind ... end</code> must declare every method of <code className="text-slate-100">contract C</code>
                with the same parameter count, the same modes and matching types. A contract name can also be used as a parameter type.</p>
              </section>

              <section>
                <h3 className="text-sm font-bold text-blue-400 mb-1">4. Vectorised operators</h3>
                <pre className="mt-2 bg-[#1e293b] p-3 rounded border border-[#334155] text-[11px] overflow-x-auto">{`[1,2,3] @map |x| => x * 2
[1,2,3] @filter |x| => x > 1
[1,2,3] @reduce |acc, x| => acc + x, 0    # -> 6
a #* b      # tensor GEMM        u <.> v   # dot product
u <x> v     # cross product      x |> f()  # pipeline`}</pre>
              </section>

              <section>
                <h3 className="text-sm font-bold text-blue-400 mb-1">5. I/O, graphics and input</h3>
                <p><code className="text-slate-100">std::io::read_line()</code> suspends the program until a line is submitted: from this
                console in the playground, from stdin in the CLI. <code className="text-slate-100">gfx</code> draws to the canvas here and to the
                terminal (24-bit ANSI) or PNG files under the CLI. <code className="text-slate-100">input::is_key_pressed</code> reads real key
                presses in both, and <code className="text-slate-100">input::get_mouse</code> reports the pointer over the viewport.</p>
              </section>

              <section>
                <h3 className="text-sm font-bold text-blue-400 mb-1">6. Sandbox</h3>
                <p>Programs are limited to {DEFAULT_LIMITS.maxSteps.toLocaleString()} evaluated steps,
                {DEFAULT_LIMITS.maxLoopIterations.toLocaleString()} iterations per loop (and
                {DEFAULT_LIMITS.maxTotalLoopIterations.toLocaleString()} in total, which also covers <code className="text-slate-100">loop</code>),
                plus a call-depth guard. All limits are configurable via the
                <code className="text-slate-100">limits</code> option or the CLI flags.</p>
              </section>

              <p className="text-slate-500">Full reference: <code className="text-blue-400">README.md</code> in the repository root.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
