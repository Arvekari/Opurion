import { describe, expect, it, vi } from 'vitest';
import {
  createCommandActionsString,
  createCommandsMessage,
  detectProjectCommands,
  escapeBoltAActionTags,
  escapeBoltArtifactTags,
  escapeBoltTags,
  validateProjectPreflight,
} from '~/utils/projectCommands';

vi.mock('~/utils/fileUtils', () => ({
  generateId: vi.fn(() => 'generated-id'),
}));

describe('utils/projectCommands', () => {
  it('detects node project and selects preferred dev command', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite', start: 'node server.js' },
          dependencies: { react: '^18.0.0' },
        }),
      },
    ];

    const result = await detectProjectCommands(files as any);

    expect(result.type).toBe('Node.js');
    expect(result.startCommand).toBe('pnpm run dev');
    expect(result.setupCommand).toContain('pnpm install');
    expect(result.setupCommand).toContain('pnpm fund');
  });

  it('ignores empty script values and chooses next valid preferred script', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: '   ', start: 'node server.js' },
          dependencies: { express: '^4.0.0' },
        }),
      },
    ];

    const result = await detectProjectCommands(files as any);

    expect(result.type).toBe('Node.js');
    expect(result.startCommand).toBe('pnpm run start');
  });

  it('detects shadcn projects and appends init command', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { preview: 'vite preview' },
          dependencies: { react: '^18.0.0', 'shadcn-ui': '^0.1.0' },
        }),
      },
      {
        path: '/workspace/components.json',
        content: '{"style":"new-york","$schema":"shadcn"}',
      },
    ];

    const result = await detectProjectCommands(files as any);
    expect(result.setupCommand).toContain('npx shadcn@latest init');
    expect(result.startCommand).toBe('pnpm run preview');
  });

  it('handles invalid package.json by returning empty command set', async () => {
    const files = [{ path: '/workspace/package.json', content: '{invalid-json' }];

    const result = await detectProjectCommands(files as any);
    expect(result.type).toBe('');
    expect(result.setupCommand).toBe('');
  });

  it('detects static projects via index.html', async () => {
    const files = [{ path: '/workspace/index.html', content: '<html></html>' }];
    const result = await detectProjectCommands(files as any);

    expect(result.type).toBe('Static');
    expect(result.startCommand).toContain('node -e');
    expect(result.startCommand).toContain('Preview server listening');
  });

  it('detects nested static projects and starts server in the entry directory', async () => {
    const files = [{ path: '/workspace/public/index.html', content: '<html></html>' }];
    const result = await detectProjectCommands(files as any);

    expect(result.type).toBe('Static');
    expect(result.startCommand).toContain('cd public &&');
  });

  it('detects php projects and uses php preview fallback server', async () => {
    const files = [{ path: '/workspace/index.php', content: '<?php echo "hi"; ?><html><body>Hello</body></html>' }];
    const result = await detectProjectCommands(files as any);

    expect(result.type).toBe('PHP');
    expect(result.startCommand).toContain('node -e');
    expect(result.startCommand).toContain('php-static-fallback');
    expect(result.followupMessage).toContain('PHP-style project');
  });

  it('detects nested pnpm project and prefixes directory for commands', async () => {
    const files = [
      {
        path: '/workspace/frontend/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite' },
          dependencies: { react: '^18.0.0' },
        }),
      },
      {
        path: '/workspace/frontend/pnpm-lock.yaml',
        content: 'lockfileVersion: 9.0',
      },
    ];

    const result = await detectProjectCommands(files as any);
    expect(result.type).toBe('Node.js');
    expect(result.startCommand).toBe('cd frontend && pnpm run dev');
    expect(result.setupCommand).toContain('cd frontend');
    expect(result.setupCommand).toContain('pnpm install');
    expect(result.setupCommand).toContain('pnpm fund');
  });

  it('detects FastAPI project from main.py', async () => {
    const files = [
      { path: '/workspace/requirements.txt', content: 'fastapi\nuvicorn\n' },
      { path: '/workspace/main.py', content: 'from fastapi import FastAPI\napp = FastAPI()\n' },
    ];

    const result = await detectProjectCommands(files as any);
    expect(result.type).toBe('Python');
    expect(result.setupCommand).toBe('python -m pip install -r requirements.txt');
    expect(result.startCommand).toBe('uvicorn main:app --host 0.0.0.0 --port 8000');
  });

  it('falls back to python static HTTP preview when no explicit Python entrypoint is inferred', async () => {
    const files = [{ path: '/workspace/requirements.txt', content: 'requests\n' }];

    const result = await detectProjectCommands(files as any);

    expect(result.type).toBe('Python');
    expect(result.setupCommand).toBe('python -m pip install -r requirements.txt');
    expect(result.startCommand).toBe('python -m http.server 8000 --bind 0.0.0.0');
  });

  it('creates assistant command message when commands exist', () => {
    const message = createCommandsMessage({
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
      followupMessage: 'Running dev command',
    });

    expect(message).not.toBeNull();
    expect(message?.id).toBe('generated-id');
    expect(message?.content).toContain('<boltAction type="shell">npm install</boltAction>');
    expect(message?.content).toContain('<boltAction type="start">npm run dev</boltAction>');
  });

  it('returns null command message when no commands are present', () => {
    const message = createCommandsMessage({ type: 'Node.js', followupMessage: '' });
    expect(message).toBeNull();
  });

  it('escapes bolt tags correctly', () => {
    const artifact = '<boltArtifact id="a">X</boltArtifact>';
    const action = '<boltAction type="shell">npm run dev</boltAction>';

    expect(escapeBoltArtifactTags(artifact)).toContain('&lt;boltArtifact');
    expect(escapeBoltAActionTags(action)).toContain('&lt;boltAction');
    expect(escapeBoltTags(`${artifact}${action}`)).toContain('&lt;boltArtifact');
    expect(escapeBoltTags(`${artifact}${action}`)).toContain('&lt;boltAction');
  });

  it('builds command action string from setup and start commands', () => {
    const commands = createCommandActionsString({
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
      followupMessage: '',
    });

    expect(commands).toContain('<boltAction type="shell">npm install</boltAction>');
    expect(commands).toContain('<boltAction type="start">npm run dev</boltAction>');
    expect(createCommandActionsString({ type: 'Node.js', followupMessage: '' })).toBe('');
  });

  it('fails preflight when start script runtime package is not declared', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
        }),
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain("scripts.dev uses 'vite' but it is not declared");
  });

  it('passes preflight when start script runtime package is declared', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(true);
  });

  it('passes preflight when requested start script is missing but a fallback script exists', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { start: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(true);
    expect(result.issues.join('\n')).not.toContain('Missing scripts.dev');
  });

  it('fails preflight when vite.config.js content is malformed', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/vite.config.js',
        content: 'This is not a valid config export',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('Invalid Vite config');
  });

  it('passes preflight when vite.config.js exports an object', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        path: '/workspace/vite.config.js',
        content: "module.exports = { server: { host: '0.0.0.0', port: 4173 } };",
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(true);
  });

  it('fails preflight when postcss.config.json is malformed JSON', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/postcss.config.json',
        content: '{invalid-json',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('Invalid PostCSS JSON config');
  });

  it('passes preflight when postcss.config.json is valid JSON', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        path: '/workspace/postcss.config.json',
        content: JSON.stringify({ plugins: { autoprefixer: {} } }),
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(true);
  });

  it('fails preflight when index.html is empty', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '   \n\n  ',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('Empty HTML entrypoint');
  });

  it('fails preflight when vite entrypoint index.html is missing', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
        }),
      },
      {
        path: '/workspace/src/main.tsx',
        content: "import React from 'react';",
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('Missing HTML entrypoint');
  });

  it('fails preflight when dependency version spec is null', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
          dependencies: { react: null },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain('Invalid dependency spec in dependencies.react');
  });

  it('fails preflight when dependency section is not an object', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
          dependencies: null,
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain("package.json field 'dependencies' must be an object");
  });

  it('fails preflight when main imports named App but App module lacks named export', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        path: '/workspace/src/main.jsx',
        content: "import { App } from './App.jsx';\nimport ReactDOM from 'react-dom/client';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
      },
      {
        path: '/workspace/src/App.jsx',
        content: 'export default function App(){ return <div>Hello</div>; }',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain("does not export 'App'");
  });

  it('fails preflight when imported local App module is empty', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        path: '/workspace/src/main.jsx',
        content: "import App from './App.jsx';\nimport ReactDOM from 'react-dom/client';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
      },
      {
        path: '/workspace/src/App.jsx',
        content: '   \n\n ',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain("Empty source module: 'workspace/src/App.jsx'");
  });

  it('fails preflight when a source module has unclosed syntax before preview launch', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        path: '/workspace/src/main.jsx',
        content:
          "import App from './App.jsx';\nimport ReactDOM from 'react-dom/client';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
      },
      {
        path: '/workspace/src/App.jsx',
        content: 'export default function App() { return <div>Hello</div>;',
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain("Source syntax issue in 'workspace/src/App.jsx'");
    expect(result.issues.join('\n')).toContain('Unclosed brace');
  });

  it('fails preflight when a source module has an unterminated string', async () => {
    const files = [
      {
        path: '/workspace/package.json',
        content: JSON.stringify({
          scripts: { dev: 'vite --host 0.0.0.0 --port 4173' },
          devDependencies: { vite: '^5.0.0' },
          dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        }),
      },
      {
        path: '/workspace/index.html',
        content: '<!doctype html><html><body><div id="root"></div></body></html>',
      },
      {
        path: '/workspace/src/main.jsx',
        content:
          "import App from './App.jsx';\nimport ReactDOM from 'react-dom/client';\nReactDOM.createRoot(document.getElementById('root')).render(<App />);",
      },
      {
        path: '/workspace/src/App.jsx',
        content: "export default function App() { const title = 'broken; return <div>{title}</div>; }",
      },
    ];

    const result = await validateProjectPreflight(files as any, {
      type: 'Node.js',
      setupCommand: 'npm install',
      startCommand: 'npm run dev',
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join('\n')).toContain("Source syntax issue in 'workspace/src/App.jsx'");
    expect(result.issues.join('\n')).toContain('Unterminated string');
  });
});
