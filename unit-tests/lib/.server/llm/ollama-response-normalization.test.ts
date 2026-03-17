import { describe, expect, it } from 'vitest';

import {
  hasBoltMarkup,
  shouldNormalizeOllamaBuildMode,
  shouldRetryOllamaBuildNarrative,
  synthesizeMissingFileArtifactForStartOnlyOutput,
  synthesizeMissingProjectEssentialsForExistingArtifacts,
  synthesizePreviewStartActionForExistingArtifacts,
  synthesizeBoltArtifactFromContent,
} from '~/lib/.server/llm/ollama-response-normalization';

describe('lib/.server/llm/ollama-response-normalization', () => {
  it('normalizes only for Ollama build mode', () => {
    expect(shouldNormalizeOllamaBuildMode({ chatMode: 'build', providerName: 'Ollama' })).toBe(true);
    expect(shouldNormalizeOllamaBuildMode({ chatMode: 'build', providerName: 'ollama' })).toBe(true);

    expect(shouldNormalizeOllamaBuildMode({ chatMode: 'discuss', providerName: 'Ollama' })).toBe(false);
    expect(shouldNormalizeOllamaBuildMode({ chatMode: 'build', providerName: 'OpenAI' })).toBe(false);
    expect(shouldNormalizeOllamaBuildMode({ chatMode: 'build', providerName: undefined })).toBe(false);
  });

  it('detects raw and escaped bolt markup', () => {
    expect(hasBoltMarkup('<boltArtifact id="x"><boltAction type="file" filePath="/index.html">x</boltAction></boltArtifact>')).toBe(true);
    expect(hasBoltMarkup('&lt;boltArtifact id="x"&gt;&lt;boltAction type="file" filePath="/index.html"&gt;x&lt;/boltAction&gt;&lt;/boltArtifact&gt;')).toBe(true);
    expect(hasBoltMarkup('plain markdown without executable tags')).toBe(false);
  });

  it('synthesizes html artifact from fenced html output', () => {
    const content = [
      "Sure, here's a web page:",
      '',
      '```html',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head><title>Hi</title></head>',
      '<body><h1>Hello</h1></body>',
      '</html>',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('<boltArtifact');
    expect(normalized).toContain('<boltAction type="file" filePath="/index.html">');
    expect(normalized).toContain('<boltAction type="start">');
    expect(normalized).toContain('npx --yes vite --host 0.0.0.0 --port 4173');
    expect(normalized).toContain('<h1>Hello</h1>');
  });

  it('does not add start action for non-web synthesized files', () => {
    const content = [
      'Here is config:',
      '',
      '```json',
      '{"name":"demo","version":"1.0.0"}',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/package.json"');
    expect(normalized).not.toContain('<boltAction type="start">');
  });

  it('does not synthesize generic JSON error payloads into package.json artifacts', () => {
    const content = [
      '```json',
      JSON.stringify(
        {
          error:
            'Build mode does not support narrative descriptions. Please provide specific implementation requests using Bolt syntax for file creation or modification.',
        },
        null,
        2,
      ),
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeUndefined();
  });

  it('does not synthesize when bolt markup already exists', () => {
    const content = '<boltArtifact id="already" title="Already">\n<boltAction type="file" filePath="/index.html">x</boltAction>\n</boltArtifact>';
    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeUndefined();
  });

  it('unwraps fenced JSON artifact payloads into bolt artifacts', () => {
    const content = [
      '```json',
      JSON.stringify(
        {
          artifacts: [
            {
              id: 'create-index',
              title: 'Create /index.html',
              actions: [
                {
                  type: 'file',
                  file: 'index.html',
                  content: '<!DOCTYPE html><html><body><h1>Recovered</h1></body></html>',
                },
              ],
            },
          ],
        },
        null,
        2,
      ),
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('<boltArtifact');
    expect(normalized).toContain('filePath="/index.html"');
    expect(normalized).toContain('<h1>Recovered</h1>');
    expect(normalized).not.toContain('"artifacts"');
  });

  it('triggers background re-ask only for long plain narrative content', () => {
    const narrative = [
      'Welcome to the portfolio.',
      'This page introduces capabilities, project highlights, design principles, and contact options.',
      'It is crafted to be modern, responsive, and engaging for desktop and mobile experiences.',
      'The layout emphasizes readability, visual hierarchy, and strong professional presentation.',
      'Animations and color accents support user engagement while preserving accessibility.',
      'The final result should align with high production quality standards and excellent usability.',
    ].join(' ');

    expect(shouldRetryOllamaBuildNarrative(narrative)).toBe(true);
    expect(shouldRetryOllamaBuildNarrative('Short narrative only.')).toBe(false);
    expect(shouldRetryOllamaBuildNarrative('```html\n<html></html>\n```')).toBe(false);
    expect(shouldRetryOllamaBuildNarrative('```bash\nnpm install\nnpm run dev\n```')).toBe(true);
    expect(shouldRetryOllamaBuildNarrative('<boltArtifact id="x"></boltArtifact>')).toBe(false);
  });

  it('triggers background re-ask for model error JSON payloads', () => {
    const payload = JSON.stringify({
      error:
        'Build mode does not support narrative descriptions. Please provide specific implementation requests using Bolt syntax for file creation or modification.',
    });

    expect(shouldRetryOllamaBuildNarrative(payload)).toBe(true);
  });

  it('triggers background re-ask for narrative HTML with outline markers', () => {
    const content = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<body>',
      '<p>Here\'s an outline of what we\'ll include:</p>',
      '<p>1. **About Us** 2. **Capabilities**</p>',
      '<p>### Contact</p>',
      '</body>',
      '</html>',
    ].join('\n');

    expect(shouldRetryOllamaBuildNarrative(content)).toBe(true);
  });

  it('synthesizes index.html for long plain narrative content', () => {
    const content = [
      'Welcome to Opurion.',
      '',
      'Build a modern website landing page for a developer portfolio.',
      'I am a software-focused AI assistant with strengths across backend, frontend, architecture, and delivery.',
      'I can help design and implement production-ready experiences and systems.',
      '',
      'You can contact me for collaboration and implementation support.',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('<boltArtifact');
    expect(normalized).toContain('filePath="/index.html"');
    expect(normalized).toContain('<!DOCTYPE html>');
    expect(normalized).toContain('<boltAction type="start">');
    expect(normalized).toContain('npx --yes vite --host 0.0.0.0 --port 4173');
  });

  it('does not synthesize long narrative when file intent is unclear', () => {
    const content = [
      'I can assist with architecture and implementation strategy.',
      'The response should stay concise, clear, and practical for production workflows.',
      'This is intentionally narrative and does not declare a stack, file, or executable target.',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeUndefined();
  });

  it('synthesizes python file when narrative mentions crawler.py', () => {
    const content = [
      'Create crawler.py that fetches pages and prints extracted links.',
      'Include a runnable entrypoint and keep the script simple.',
      'Use Python and make it executable from the terminal.',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/crawler.py"');
  });

  it('prefers code-pattern inference for express server code', () => {
    const content = [
      '```javascript',
      "import express from 'express';",
      'const app = express();',
      "app.get('/', (_req, res) => res.send('ok'));",
      'app.listen(3000);',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/server.js"');
    expect(normalized).not.toContain('<boltAction type="start">');
  });

  it('maps Laravel route patterns to routes/web.php', () => {
    const content = [
      '```php',
      'use Illuminate\\Support\\Facades\\Route;',
      "Route::get('/', function () { return 'hello'; });",
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/routes/web.php"');
  });

  it('maps Vite config patterns to vite.config.ts', () => {
    const content = [
      '```ts',
      "import { defineConfig } from 'vite';",
      'export default defineConfig({ server: { port: 4173 } });',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/vite.config.ts"');
  });

  it('synthesizes vite.config.js as CommonJS config when filename is mentioned', () => {
    const content = [
      'Please create vite.config.js for local preview and keep the configuration simple, explicit, and readable for a generated project.',
      'Set host to 0.0.0.0 and keep port 4173 so WebContainer preview binding is stable and does not depend on localhost defaults.',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/vite.config.js"');
    expect(normalized).toContain('module.exports = {');
    expect(normalized).toContain("host: '0.0.0.0'");
    expect(normalized).toContain('port: 4173');
    expect(normalized).not.toContain('createServer');
  });

  it('recovers React scaffold shell output into App.tsx instead of generated-output.txt', () => {
    const content = [
      '```bash',
      'npx create-react-app bolt2dyi-app',
      'cd bolt2dyi-app',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/App.tsx"');
    expect(normalized).not.toContain('filePath="/generated-output.txt"');
    expect(normalized).toContain('export default function App');
  });

  it('does not synthesize unknown shell-only fenced output into generic files', () => {
    const content = [
      '```bash',
      'mkdir my-app',
      'cd my-app',
      'npm install',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeUndefined();
  });

  it('creates CV-oriented React content when prompt requests cv', () => {
    const content = [
      '```bash',
      'npx create-react-app bolt2dyi-app',
      'cd bolt2dyi-app',
      '```',
      '',
      'Create a CV page in React with profile and skills sections.',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/App.tsx"');
    expect(normalized).toContain('Curriculum Vitae');
    expect(normalized).toContain('Core Skills');
    expect(normalized).toContain('filePath="/package.json"');
    expect(normalized).toContain('"react"');
    expect(normalized).toContain('<boltAction type="start">');
    expect(normalized).toContain('npm run dev');
  });

  it('converts html content to React file when react intent is explicit', () => {
    const content = [
      'Convert this to React TSX and create a CV.',
      '',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<body><h1>My CV</h1></body>',
      '</html>',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/App.tsx"');
    expect(normalized).toContain('Curriculum Vitae');
    expect(normalized).toContain('filePath="/package.json"');
  });

  it('does not preserve a trivial Vite shell as the final recovered implementation', () => {
    const content = [
      'Build a polished React landing page for Digital Assistant Services with sections for expertise, capabilities, and contact.',
      '',
      '```html',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '    <title>Bolt React App</title>',
      '  </head>',
      '  <body>',
      '    <div id="root"></div>',
      '    <script type="module" src="/src/main.tsx"></script>',
      '  </body>',
      '</html>',
      '```',
    ].join('\n');

    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeDefined();
    expect(normalized).toContain('filePath="/App.tsx"');
    expect(normalized).toContain('filePath="/package.json"');
    expect(normalized).not.toContain('<div id="root"></div>');
  });

  it('does not synthesize for short plain non-code content', () => {
    const content = 'Short answer without code.';
    const normalized = synthesizeBoltArtifactFromContent(content);

    expect(normalized).toBeUndefined();
  });

  it('adds preview start action for existing index.html artifact when missing', () => {
    const content = `<boltArtifact id="a" title="index" type="bundled">
<boltAction type="file" filePath="/index.html">
<!DOCTYPE html><html><body>Hi</body></html>
</boltAction>
</boltArtifact>`;

    const preview = synthesizePreviewStartActionForExistingArtifacts(content);

    expect(preview).toBeDefined();
    expect(preview).toContain('<boltAction type="start">');
    expect(preview).toContain('npx --yes vite --host 0.0.0.0 --port 4173');
  });

  it('prefers npm run dev when package.json dev script is present', () => {
    const content = `<boltArtifact id="a" title="web" type="bundled">
<boltAction type="file" filePath="/index.html"><!DOCTYPE html><html></html></boltAction>
<boltAction type="file" filePath="/package.json">{"name":"demo","scripts":{"dev":"vite","start":"vite preview"}}</boltAction>
</boltArtifact>`;

    const preview = synthesizePreviewStartActionForExistingArtifacts(content);

    expect(preview).toBeDefined();
    expect(preview).toContain('npm run dev');
  });

  it('does not add preview action when start action already exists', () => {
    const content = `<boltArtifact id="a" title="web" type="bundled">
<boltAction type="file" filePath="/index.html"><!DOCTYPE html><html></html></boltAction>
<boltAction type="start">npm run dev</boltAction>
</boltArtifact>`;

    const preview = synthesizePreviewStartActionForExistingArtifacts(content);

    expect(preview).toBeUndefined();
  });

  it('synthesizes missing index file when output only contains start action', () => {
    const startOnly = `<boltArtifact id="a" title="Launch Preview" type="shell">
<boltAction type="start">npm run dev</boltAction>
</boltArtifact>`;

    const missingFile = synthesizeMissingFileArtifactForStartOnlyOutput({
      content: startOnly,
      fallbackNarrative:
        'Welcome to Opurion. This page introduces capabilities and provides a modern responsive profile layout.',
    });

    expect(missingFile).toBeDefined();
    expect(missingFile).toContain('filePath="/index.html"');
    expect(missingFile).toContain('<!DOCTYPE html>');
  });

  it('synthesizes missing python file when start action calls python crawler.py', () => {
    const startOnly = `<boltArtifact id="a" title="Run Crawler" type="shell">
<boltAction type="start">python crawler.py</boltAction>
</boltArtifact>`;

    const missingFile = synthesizeMissingFileArtifactForStartOnlyOutput({
      content: startOnly,
      fallbackNarrative: 'Create crawler.py that prints fetched URLs for smoke testing.',
    });

    expect(missingFile).toBeDefined();
    expect(missingFile).toContain('filePath="/crawler.py"');
    expect(missingFile).toContain("if __name__ == '__main__':");
  });

  it('synthesizes missing server.js when start action calls node server.js', () => {
    const startOnly = `<boltArtifact id="a" title="Run Server" type="shell">
<boltAction type="start">node server.js</boltAction>
</boltArtifact>`;

    const missingFile = synthesizeMissingFileArtifactForStartOnlyOutput({
      content: startOnly,
      fallbackNarrative: 'Build a small HTTP server to return a plain text status response.',
    });

    expect(missingFile).toBeDefined();
    expect(missingFile).toContain('filePath="/server.js"');
    expect(missingFile).toContain('createServer');
  });

  it('does not synthesize missing index file when file action already exists', () => {
    const hasFile = `<boltArtifact id="a" title="Web" type="bundled">
<boltAction type="file" filePath="/index.html"><!DOCTYPE html><html></html></boltAction>
<boltAction type="start">npm run dev</boltAction>
</boltArtifact>`;

    const missingFile = synthesizeMissingFileArtifactForStartOnlyOutput({ content: hasFile });

    expect(missingFile).toBeUndefined();
  });

  it('synthesizes missing React essentials when artifact contains App.jsx only', () => {
    const partialReactArtifact = `<boltArtifact id="a" title="React UI" type="bundled">
<boltAction type="file" filePath="/src/App.jsx">
export default function App(){ return <h1>Hello</h1>; }
</boltAction>
</boltArtifact>`;

    const essentials = synthesizeMissingProjectEssentialsForExistingArtifacts(partialReactArtifact);

    expect(essentials).toBeDefined();
    expect(essentials).toContain('filePath="/src/main.js"');
    expect(essentials).toContain('filePath="/package.json"');
    expect(essentials).toContain('filePath="/index.html"');
    expect(essentials).toContain('<script type="module" src="/src/main.js"></script>');
    expect(essentials).toContain('<boltAction type="start">');
    expect(essentials).toContain('npm run dev');
  });

  it('reuses an existing JavaScript entry file when synthesizing index.html', () => {
    const partialReactArtifact = `<boltArtifact id="a" title="React UI" type="bundled">
<boltAction type="file" filePath="/src/App.js">
export default function App(){ return <h1>Hello</h1>; }
</boltAction>
<boltAction type="file" filePath="/src/index.js">
import './index.css';
</boltAction>
</boltArtifact>`;

    const essentials = synthesizeMissingProjectEssentialsForExistingArtifacts(partialReactArtifact);

    expect(essentials).toBeDefined();
    expect(essentials).toContain('<script type="module" src="/src/index.js"></script>');
    expect(essentials).not.toContain('/src/main.tsx');
  });

  it('does not synthesize React essentials when already present', () => {
    const completeReactArtifact = `<boltArtifact id="a" title="React UI" type="bundled">
<boltAction type="file" filePath="/src/App.jsx">export default function App(){ return <h1>Hello</h1>; }</boltAction>
<boltAction type="file" filePath="/src/main.js">import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App.jsx'; ReactDOM.createRoot(document.getElementById('root')).render(<App />);</boltAction>
<boltAction type="file" filePath="/package.json">{"name":"x","scripts":{"dev":"vite"}}</boltAction>
<boltAction type="file" filePath="/index.html"><!DOCTYPE html><html></html></boltAction>
<boltAction type="start">npm run dev</boltAction>
</boltArtifact>`;

    const essentials = synthesizeMissingProjectEssentialsForExistingArtifacts(completeReactArtifact);

    expect(essentials).toBeUndefined();
  });
});
