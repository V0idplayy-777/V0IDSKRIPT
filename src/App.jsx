import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Play, RotateCcw, BookOpen, Cpu, Terminal, Layout, Gauge, FileCode, Monitor, Send, Layers
} from 'lucide-react';
import { Lexer } from './v0id/lexer.js';
import { Parser } from './v0id/parser.js';
import { V0idInterpreter } from './v0id/interpreter.js';
import { registerV0idLanguage } from './v0id/monaco-v0id.js';
import { EXAMPLES } from './v0id/examples.js';

export default function App() {
  const [selectedExample, setSelectedExample] = useState(EXAMPLES[0].id);
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('split');
  const [stats, setExecutionStats] = useState({ timeMs: 0, steps: 0, status: 'IDLE' });
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [astTree, setAstTree] = useState(null);
  const [promptInput, setPromptInput] = useState('');
  const [keyStates, setKeyStates] = useState({});

  const canvasRef = useRef(null);
  const editorRef = useRef(null);

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
    const handleKeyDown = (e) => setKeyStates(prev => ({ ...prev, [e.key.toLowerCase()]: true }));
    const handleKeyUp = (e) => setKeyStates(prev => ({ ...prev, [e.key.toLowerCase()]: false }));
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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

  const runCode = () => {
    setLogs([]);
    setAstTree(null);

    const canvas = canvasRef.current;
    let ctx = null;
    if (canvas) {
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    try {
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parseProgram();
      setAstTree(ast);

      const interpreter = new V0idInterpreter({
        onLog: (msg) => {
          setLogs(prev => [...prev, { ...msg, id: Date.now() + Math.random() }]);
        },
        onGfxDraw: (cmd) => {
          if (ctx) drawGfxCommand(ctx, cmd);
        },
        keyStates
      });

      setExecutionStats({ timeMs: 0, steps: 0, status: 'RUNNING' });
      const res = interpreter.run(code);
      setExecutionStats({
        timeMs: res.executionTimeMs,
        steps: res.totalSteps,
        status: 'SUCCESS'
      });
    } catch (err) {
      setExecutionStats({ timeMs: 0, steps: 0, status: 'ERROR' });
      setLogs(prev => [...prev, { type: 'error', text: err.message, id: Date.now() }]);
    }
  };

  const handleSendPrompt = (e) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    setLogs(prev => [...prev, { type: 'stdout', text: `> ${promptInput}`, id: Date.now() }]);
    setPromptInput('');
  };

  useEffect(() => {
    runCode();
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
                v3.0 Kernel
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
            <span>v3.0 Specification</span>
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
            <span className="text-[10px] text-slate-400 font-semibold uppercase mr-1">v3.0 Syntax:</span>
            {['val', 'var', 'pin', 'fn', 'type', 'record', 'contract', 'impl', 'bind', 'do...end', 'select', 'tensor', '#*', '<.>', '@map'].map(kw => (
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
                  />
                  <div className="absolute top-2 left-2 bg-[#1e293b]/90 px-2 py-0.5 rounded text-[10px] text-blue-400 border border-[#334155]">
                    2D/3D Viewport Canvas
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
                          'bg-[#1e293b] text-slate-400'
                        }`}>
                          {log.type === 'warn' ? '[WARN]' : log.type === 'error' ? '[ERROR]' : log.type === 'bench' ? '[BENCH]' : '[STDOUT]'}
                        </span>
                        <span className="text-slate-200 break-all whitespace-pre-wrap">{log.text}</span>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleSendPrompt} className="p-2 bg-[#1e293b] border-t border-[#334155] flex items-center space-x-2 shrink-0">
                  <span className="text-blue-400 font-bold">$</span>
                  <input
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder="Interactive input console..."
                    className="flex-1 bg-[#0f172a] text-xs text-slate-100 border border-[#334155] rounded px-2.5 py-1 focus:outline-none focus:border-blue-500"
                  />
                  <button type="submit" className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500 cursor-pointer">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* Profiler Tab */}
            {activeTab === 'profiler' && (
              <div className="p-6 bg-[#0f172a] text-xs space-y-4 overflow-y-auto">
                <h3 className="text-sm font-bold text-slate-100">V0IDSKRIPT v3.0 Profiler</h3>
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
              </div>
            )}

            {/* AST Inspector */}
            {activeTab === 'ast' && (
              <div className="p-4 bg-[#0f172a] text-xs font-mono overflow-y-auto h-full text-slate-300">
                <h3 className="text-sm font-bold text-slate-100 mb-2">V0IDSKRIPT v3.0 Parsed AST</h3>
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
                  V0IDSKRIPT v3.0 Systems Kernel Specification Manual
                </h2>
              </div>
              <button onClick={() => setShowSpecModal(false)} className="text-slate-400 hover:text-white font-bold px-2 py-1 cursor-pointer">
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 text-slate-300 text-xs space-y-4 leading-relaxed">
              <p>Full reference specification located at <code className="text-blue-400">/home/user/V0IDSKRIPT_SPEC_AND_GUIDE.md</code></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
