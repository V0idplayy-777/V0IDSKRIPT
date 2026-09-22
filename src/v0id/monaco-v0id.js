/**
 * Monaco Editor Syntax Highlighting Definition for V0IDSKRIPT v3.0
 */

export function registerV0idLanguage(monaco) {
  if (!monaco) return;

  if (monaco.languages.getLanguages().some(lang => lang.id === 'v0idskript')) {
    return;
  }

  monaco.languages.register({ id: 'v0idskript' });

  monaco.languages.setMonarchTokensProvider('v0idskript', {
    defaultToken: 'invalid',
    keywords: [
      'val', 'var', 'pin', 'const', 'type', 'record', 'enum', 'contract',
      'impl', 'bind', 'fn', 'def', 'spec', 'in', 'out', 'inout', 'own',
      'ref', 'rel', 'do', 'pass', 'end', 'select', 'case', 'else', 'if',
      'while', 'loop', 'return', 'break', 'continue', 'raise', 'rescue',
      'ensure', 'tensor', 'grid', 'true', 'false', 'nil'
    ],

    typeKeywords: [
      'i8', 'i16', 'i32', 'i64', 'u8', 'u16', 'u32', 'u64', 'f32', 'f64',
      'bool', 'str', 'char', 'Array', 'HashMap', 'Vec2', 'Vec3', 'Vec4', 'Mat4',
      'Tensor', 'Object', 'Value', 'fn'
    ],

    builtins: [
      'std', 'sys', 'math', 'gfx', 'input', 'io', 'collections', 'time', 'ai'
    ],

    operators: [
      '#*', '<.>', '<x>', '|>', '::', ':=', '<==', '->', '=>', '@map', '@filter', '@reduce',
      '..=', '..', '=', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '!',
      '+', '-', '*', '/', '%'
    ],

    symbols: /[=><!~?:&|+\-*\/^%#@]+/,

    tokenizer: {
      root: [
        [/[a-zA-Z_$][a-zA-Z0-9_$]*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@builtins': 'variable.predefined',
            '@default': 'identifier'
          }
        }],

        [/\s+/, 'white'],
        [/#.*/, 'comment'],
        [/\/\/.*/, 'comment'],
        [/\/\*/, 'comment', '@comment'],

        [/0[xX][0-9a-fA-F_]+/, 'number.hex'],
        [/[0-9_]+(\.[0-9_]+)?/, 'number.float'],

        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        [/`([^`\\]|\\.)*`/, 'string'],

        [/@symbols/, {
          cases: {
            '@operators': 'operator',
            '@default': ''
          }
        }],

        [/[{}()\[\]]/, '@brackets'],
        [/[,;.]/, 'delimiter']
      ],

      comment: [
        [/[^\/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment']
      ]
    }
  });

  // Industrial VS Code Dark Studio Theme
  monaco.editor.defineTheme('v0id-studio', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'type', foreground: '4EC9B0', fontStyle: 'bold' },
      { token: 'variable.predefined', foreground: 'DCDCAA' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'operator', foreground: 'D4D4D4', fontStyle: 'bold' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }
    ],
    colors: {
      'editor.background': '#0f172a',
      'editor.foreground': '#f8fafc',
      'editor.lineHighlightBackground': '#1e293b',
      'editorCursor.foreground': '#38bdf8',
      'editorWhitespace.foreground': '#334155',
      'editorIndentGuide.background': '#1e293b',
      'editorIndentGuide.activeBackground': '#38bdf8'
    }
  });
}
