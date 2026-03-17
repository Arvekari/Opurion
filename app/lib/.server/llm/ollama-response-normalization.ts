import { generateId } from 'ai';
import { path } from '~/utils/path';

type InferredFileTarget = {
  filePath: string;
  reason:
    | 'language'
    | 'html-snippet'
    | 'code-pattern'
    | 'filename-mention'
    | 'start-command'
    | 'narrative-web'
    | 'shell-scaffold';
};

type StructuredArtifactAction = {
  type?: string;
  filePath?: string;
  file?: string;
  path?: string;
  content?: unknown;
  command?: unknown;
};

type StructuredArtifact = {
  id?: string;
  title?: string;
  actions?: StructuredArtifactAction[];
};

function hasReactIntent(content: string): boolean {
  return /\breact\b|\btsx\b|\bjsx\b|\bcreate-react-app\b|\bvite\s+react\b/i.test(content);
}

function hasCvIntent(content: string): boolean {
  return /\b(cv|resume|curriculum vitae)\b/i.test(content);
}

function isTrivialViteHtmlShell(content: string): boolean {
  const normalized = content.trim();

  if (!/<!doctype html>|<html[\s>]/i.test(normalized)) {
    return false;
  }

  const hasRootMount = /<div\s+id=["']root["']\s*><\/div>/i.test(normalized);
  const hasMainScript = /<script[^>]+src=["']\/src\/main\.(?:tsx|jsx|ts|js)["'][^>]*><\/script>/i.test(normalized);
  const hasMeaningfulBodyContent = /<(?:h1|h2|section|article|main|nav|form|button|ul|ol|table|canvas|svg)\b/i.test(normalized);

  return hasRootMount && hasMainScript && !hasMeaningfulBodyContent;
}

function normalizeStructuredActionContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  return JSON.stringify(value, null, 2);
}

function actionToBoltMarkup(action: StructuredArtifactAction): string | undefined {
  const normalizedType = (action.type || '').toLowerCase();

  if (normalizedType === 'file') {
    const filePath = ensureAbsoluteFilePath(action.filePath || action.file || action.path || 'generated-output.txt');
    const content = normalizeStructuredActionContent(action.content);

    return `<boltAction type="file" filePath="${filePath}">
${content}
</boltAction>`;
  }

  if (normalizedType === 'shell') {
    const command = normalizeStructuredActionContent(action.command ?? action.content).trim();

    if (!command) {
      return undefined;
    }

    return `<boltAction type="shell">
${command}
</boltAction>`;
  }

  if (normalizedType === 'start') {
    const command = normalizeStructuredActionContent(action.command ?? action.content).trim();

    if (!command) {
      return undefined;
    }

    return `<boltAction type="start">
${command}
</boltAction>`;
  }

  return undefined;
}

function parseStructuredArtifactPayload(content: string): StructuredArtifact[] | undefined {
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  const candidates = [trimmed];

  if (fencedMatch?.[1]) {
    candidates.unshift(fencedMatch[1].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { artifacts?: StructuredArtifact[]; actions?: StructuredArtifactAction[] };

      if (Array.isArray(parsed?.artifacts)) {
        return parsed.artifacts;
      }

      if (Array.isArray(parsed?.actions)) {
        return [{ title: 'Recovered Artifact', actions: parsed.actions }];
      }
    } catch {
      // Ignore non-JSON candidates.
    }
  }

  return undefined;
}

function synthesizeBoltArtifactsFromStructuredPayload(content: string): string | undefined {
  const artifacts = parseStructuredArtifactPayload(content);

  if (!artifacts?.length) {
    return undefined;
  }

  const normalizedArtifacts = artifacts
    .map((artifact, index) => {
      const actions = Array.isArray(artifact.actions) ? artifact.actions.map(actionToBoltMarkup).filter(Boolean) : [];

      if (actions.length === 0) {
        return undefined;
      }

      return `<boltArtifact id="${artifact.id || `structured-${generateId()}`}" title="${artifact.title || `Recovered Artifact ${index + 1}`}" type="bundled">
${actions.join('\n')}
</boltArtifact>`;
    })
    .filter((artifact): artifact is string => Boolean(artifact));

  if (normalizedArtifacts.length === 0) {
    return undefined;
  }

  return `\n${normalizedArtifacts.join('\n')}\n`;
}

export function shouldNormalizeOllamaBuildMode(params: {
  chatMode: 'discuss' | 'build';
  providerName?: string;
}): boolean {
  return params.chatMode === 'build' && (params.providerName || '').toLowerCase() === 'ollama';
}

export function hasBoltMarkup(content: string): boolean {
  return /<boltArtifact\b|<boltAction\b|&lt;boltArtifact\b|&lt;boltAction\b/i.test(content);
}

function isLikelyErrorPayload(content: string): boolean {
  const trimmed = content.trim();

  if (!trimmed) {
    return false;
  }

  if (/\bBuild mode does not support narrative descriptions\b/i.test(trimmed)) {
    return true;
  }

  const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  const candidate = fencedJsonMatch?.[1]?.trim() || trimmed;

  if (!/^\{[\s\S]*\}$/.test(candidate)) {
    return false;
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;

    if (Array.isArray((parsed as any).artifacts) || Array.isArray((parsed as any).actions)) {
      return false;
    }

    const errorValue = parsed.error;

    return typeof errorValue === 'string' && errorValue.trim().length > 0;
  } catch {
    return false;
  }
}

function isLikelyNarrativeHtml(content: string): boolean {
  if (!/<!doctype html>|<html[\s>]/i.test(content)) {
    return false;
  }

  const normalized = content.toLowerCase();

  const narrativePhrases = [
    "here's an outline",
    'here is an outline',
    'sample structure',
    "we'll include",
    'we will include',
    'this structure provides',
  ];

  const hasNarrativePhrase = narrativePhrases.some((phrase) => normalized.includes(phrase));
  const hasMarkdownResidue = /\*\*[^*]+\*\*|(^|\n)#{2,}\s+/m.test(content);
  const hasOutlineListPattern = /<p>\s*\d+\.\s*\*\*/i.test(content);

  return hasNarrativePhrase || hasMarkdownResidue || hasOutlineListPattern;
}

export function shouldRetryOllamaBuildNarrative(content: string): boolean {
  const trimmed = content.trim();

  if (!trimmed || hasBoltMarkup(trimmed)) {
    return false;
  }

  if (/<!doctype html>|<html[\s>]/i.test(trimmed)) {
    return isLikelyNarrativeHtml(trimmed);
  }

  if (trimmed.length < 24) {
    return false;
  }

  if (isLikelyErrorPayload(trimmed)) {
    return true;
  }

  return !synthesizeBoltArtifactFromContent(trimmed);
}

export function synthesizePreviewStartActionForExistingArtifacts(content: string): string | undefined {
  const trimmed = content.trim();

  if (!trimmed || !hasBoltMarkup(trimmed)) {
    return undefined;
  }

  const hasIndexFileAction = /<boltAction\s+type="file"[^>]*filePath="\/index\.html"/i.test(trimmed);
  const hasStartAction = /<boltAction\s+type="start"/i.test(trimmed);

  if (!hasIndexFileAction || hasStartAction) {
    return undefined;
  }

  const packageJsonMatch = trimmed.match(
    /<boltAction\s+type="file"[^>]*filePath="\/package\.json"[^>]*>\s*([\s\S]*?)\s*<\/boltAction>/i,
  );

  let previewStartCommand = 'npx --yes vite --host 0.0.0.0 --port 4173';

  if (packageJsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(packageJsonMatch[1]);
      const scripts = parsed?.scripts ?? {};

      if (typeof scripts.dev === 'string' && scripts.dev.trim().length > 0) {
        previewStartCommand = 'npm run dev';
      } else if (typeof scripts.start === 'string' && scripts.start.trim().length > 0) {
        previewStartCommand = 'npm run start';
      }
    } catch {
      // Keep default command when package.json is not valid JSON
    }
  }

  return `\n<boltArtifact id="ollama-preview-${generateId()}" title="Launch Preview" type="shell">\n<boltAction type="start">\n${previewStartCommand}\n</boltAction>\n</boltArtifact>\n`;
}

export function synthesizeMissingProjectEssentialsForExistingArtifacts(content: string): string | undefined {
  const trimmed = content.trim();

  if (!trimmed || !hasBoltMarkup(trimmed)) {
    return undefined;
  }

  const filePathMatches = Array.from(trimmed.matchAll(/<boltAction\s+type="file"[^>]*filePath="([^"]+)"/gi));
  const normalizedFilePaths = filePathMatches.map((match) => (match[1] || '').trim()).filter(Boolean);
  const filePaths = new Set(normalizedFilePaths.map((filePath) => filePath.toLowerCase()));

  if (filePaths.size === 0) {
    return undefined;
  }

  const hasPackageJson = filePaths.has('/package.json');
  const hasIndexHtml = filePaths.has('/index.html');
  const hasReactEntry =
    Array.from(filePaths).some((filePath) => /(?:^|\/)app\.(?:tsx|jsx|ts|js)$/i.test(filePath)) ||
    Array.from(filePaths).some((filePath) => /(?:^|\/)(?:main|index)\.(?:tsx|jsx|ts|js)$/i.test(filePath)) ||
    trimmed.includes("from 'react'") ||
    trimmed.includes('from "react"');

  const hasStartAction = /<boltAction\s+type="start"/i.test(trimmed);

  if (!hasReactEntry) {
    return undefined;
  }

  const existingEntryFile = normalizedFilePaths.find((filePath) => /(?:^|\/)(?:main|index)\.(?:tsx|jsx|ts|js)$/i.test(filePath));
  const appFile = normalizedFilePaths.find((filePath) => /(?:^|\/)app\.(?:tsx|jsx|ts|js)$/i.test(filePath));
  const synthesizedEntryFile = !existingEntryFile && appFile
    ? path.join(path.dirname(appFile), /\.tsx?$/i.test(appFile) ? 'main.tsx' : 'main.js')
    : undefined;
  const htmlEntryFile = existingEntryFile || synthesizedEntryFile || '/src/main.tsx';

  const actions: string[] = [];

  if (synthesizedEntryFile && appFile) {
    const appImportPath = `./${path.basename(appFile)}`;
    const isTypeScriptEntry = /\.tsx?$/i.test(synthesizedEntryFile);
    const usesTypedAppImport = /\.tsx?$/i.test(appFile);

    actions.push(`<boltAction type="file" filePath="${synthesizedEntryFile}">
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '${appImportPath}';

ReactDOM.createRoot(document.getElementById('root')${isTypeScriptEntry ? ' as HTMLElement' : ''}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
</boltAction>`);
  }

  if (!hasPackageJson) {
    actions.push(`<boltAction type="file" filePath="/package.json">
${JSON.stringify(
  {
    name: 'opurion-react-app',
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite --host 0.0.0.0 --port 4173',
      build: 'vite build',
      preview: 'vite preview --host 0.0.0.0 --port 4173',
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/react': '^18.3.3',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.1',
      typescript: '^5.6.2',
      vite: '^5.4.8',
    },
  },
  null,
  2,
)}
</boltAction>`);
  }

  if (!hasIndexHtml) {
    actions.push(`<boltAction type="file" filePath="/index.html">
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Opurion React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${htmlEntryFile}"></script>
  </body>
</html>
</boltAction>`);
  }

  if (!hasStartAction) {
    actions.push(`<boltAction type="start">
npm run dev
</boltAction>`);
  }

  if (actions.length === 0) {
    return undefined;
  }

  return `\n<boltArtifact id="ollama-essentials-${generateId()}" title="Add Missing Project Essentials" type="bundled">\n${actions.join(
    '\n',
  )}\n</boltArtifact>\n`;
}

export function synthesizeMissingFileArtifactForStartOnlyOutput(params: {
  content: string;
  fallbackNarrative?: string;
}): string | undefined {
  const trimmed = params.content.trim();

  if (!trimmed || !hasBoltMarkup(trimmed)) {
    return undefined;
  }

  const hasStartAction = /<boltAction\s+type="start"/i.test(trimmed);
  const hasAnyFileAction = /<boltAction\s+type="file"/i.test(trimmed);

  if (!hasStartAction || hasAnyFileAction) {
    return undefined;
  }

  const startCommandMatch = trimmed.match(/<boltAction\s+type="start"[^>]*>\s*([\s\S]*?)\s*<\/boltAction>/i);
  const startCommand = startCommandMatch?.[1]?.trim() ?? '';

  const sourceNarrative = (params.fallbackNarrative || '').trim();

  const inferredTarget = inferTargetFromStartCommand(startCommand) ?? inferTargetFromNarrative(sourceNarrative);

  if (!inferredTarget) {
    return undefined;
  }

  const synthesizedContent = synthesizeContentForTarget(
    inferredTarget.filePath,
    sourceNarrative.length >= 80
      ? sourceNarrative
      : 'Generated automatically from a build response where only preview/start actions were returned.',
  );

  return buildArtifactPayload(inferredTarget.filePath, synthesizedContent);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function narrativeToHtmlDocument(content: string): string {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '```' && !line.startsWith('```'));

  const blocks: string[] = [];
  let current: string[] = [];

  const flushCurrent = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    if (!line) {
      flushCurrent();
      continue;
    }

    current.push(line);
  }

  flushCurrent();

  const renderedBlocks = blocks
    .map((block) => {
      const heading = block.match(/^#{1,3}\s+(.+)$/);

      if (heading) {
        return `<h2>${escapeHtml(heading[1])}</h2>`;
      }

      const listLines = block
        .split('\n')
        .map((line) => line.match(/^[-*]\s+(.+)$/)?.[1])
        .filter((item): item is string => Boolean(item));

      if (listLines.length >= 2 && listLines.length === block.split('\n').length) {
        return `<ul>${listLines.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
      }

      return `<p>${escapeHtml(block.replace(/\n+/g, ' '))}</p>`;
    })
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Opurion Introduction</title>
  <style>
    :root { color-scheme: dark light; }
    body { margin: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: radial-gradient(circle at top, #1e293b, #0b1020 55%); color: #e2e8f0; }
    .container { max-width: 900px; margin: 0 auto; padding: 56px 24px; }
    .card { background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 18px; padding: 32px; backdrop-filter: blur(8px); }
    h1 { margin: 0 0 16px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    h2 { margin: 24px 0 12px; font-size: 1.2rem; color: #93c5fd; }
    p, li { line-height: 1.7; color: #cbd5e1; }
    ul { margin: 0; padding-left: 20px; }
  </style>
</head>
<body>
  <main class="container">
    <section class="card">
      <h1>Opurion</h1>
      ${renderedBlocks}
    </section>
  </main>
</body>
</html>`;
}

function sanitizeNarrativeForComment(content: string): string {
  const compact = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return compact.slice(0, 500) || 'Generated by Opurion.';
}

function narrativeToNodeServer(content: string): string {
  const summary = sanitizeNarrativeForComment(content);

  return `import http from 'node:http';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);

const message = ${JSON.stringify(summary)};

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
});

server.listen(port, host, () => {
  console.log('Server listening on http://' + host + ':' + port);
});`;
}

function narrativeToPythonScript(content: string): string {
  const summary = sanitizeNarrativeForComment(content);

  return `#!/usr/bin/env python3
"""Generated by Opurion from narrative recovery."""

def main() -> None:
    print(${JSON.stringify(summary)})


if __name__ == '__main__':
    main()
`;
}

function narrativeToPhpPage(content: string): string {
  const summary = escapeHtml(sanitizeNarrativeForComment(content));

  return `<?php
declare(strict_types=1);
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opurion Generated Page</title>
</head>
<body>
  <main>
    <h1>Opurion</h1>
    <p>${summary}</p>
  </main>
</body>
</html>`;
}

function narrativeToReactComponent(content: string, useTypeScript: boolean): string {
  const summary = sanitizeNarrativeForComment(content);
  const isCvIntent = /\b(cv|resume|curriculum vitae)\b/i.test(content);

  if (isCvIntent) {
    if (useTypeScript) {
      return `type SkillGroup = {
  title: string;
  items: string[];
};

const skillGroups: SkillGroup[] = [
  { title: 'Frontend', items: ['React', 'TypeScript', 'Vite', 'Tailwind CSS'] },
  { title: 'Backend', items: ['Node.js', 'Express', 'PostgreSQL', 'REST APIs'] },
  { title: 'Delivery', items: ['Testing', 'CI/CD', 'Monitoring', 'Security'] },
];

export default function App(): JSX.Element {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>Curriculum Vitae</h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>${escapeHtml(summary)}</p>

      <section style={{ marginTop: 24 }}>
        <h2>Profile</h2>
        <p>Senior full-stack developer and solution architect focused on production-grade applications.</p>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Core Skills</h2>
        {skillGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 6 }}>{group.title}</h3>
            <ul style={{ marginTop: 0 }}>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
`;
    }

    return `const skillGroups = [
  { title: 'Frontend', items: ['React', 'JavaScript', 'Vite', 'CSS'] },
  { title: 'Backend', items: ['Node.js', 'Express', 'PostgreSQL', 'REST APIs'] },
  { title: 'Delivery', items: ['Testing', 'CI/CD', 'Monitoring', 'Security'] },
];

export default function App() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>Curriculum Vitae</h1>
      <p style={{ marginTop: 0, opacity: 0.85 }}>${escapeHtml(summary)}</p>

      <section style={{ marginTop: 24 }}>
        <h2>Profile</h2>
        <p>Senior full-stack developer and solution architect focused on production-grade applications.</p>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Core Skills</h2>
        {skillGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 6 }}>{group.title}</h3>
            <ul style={{ marginTop: 0 }}>
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
`;
  }

  if (useTypeScript) {
    return `export default function App(): JSX.Element {
  return (
    <main>
      <h1>Opurion</h1>
      <p>${escapeHtml(summary)}</p>
    </main>
  );
}
`;
  }

  return `export default function App() {
  return (
    <main>
      <h1>Opurion</h1>
      <p>${escapeHtml(summary)}</p>
    </main>
  );
}
`;
}

function narrativeToViteConfig(content: string, format: 'esm' | 'cjs' = 'esm'): string {
  const summary = sanitizeNarrativeForComment(content);

  if (format === 'cjs') {
    return `// ${summary}
module.exports = {
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
};
`;
  }

  return `import { defineConfig } from 'vite';

// ${summary}
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
});
`;
}

function narrativeToPackageJson(content: string): string {
  const summary = sanitizeNarrativeForComment(content);

  return JSON.stringify(
    {
      name: 'bolt-generated-project',
      version: '1.0.0',
      private: true,
      description: summary,
      scripts: {
        dev: 'vite',
        start: 'vite',
        build: 'vite build',
        preview: 'vite preview --host 0.0.0.0 --port 4173',
      },
      devDependencies: {
        vite: '^5.4.8',
      },
    },
    null,
    2,
  );
}

function synthesizeContentForTarget(filePath: string, narrative: string): string {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.endsWith('/index.html') || normalizedPath.endsWith('.html')) {
    return narrativeToHtmlDocument(narrative);
  }

  if (normalizedPath.endsWith('/package.json')) {
    return narrativeToPackageJson(narrative);
  }

  if (normalizedPath.endsWith('/vite.config.ts') || normalizedPath.endsWith('/vite.config.mts')) {
    return narrativeToViteConfig(narrative);
  }

  if (normalizedPath.endsWith('/vite.config.js') || normalizedPath.endsWith('/vite.config.cjs')) {
    return narrativeToViteConfig(narrative, 'cjs');
  }

  if (normalizedPath.endsWith('/vite.config.mjs')) {
    return narrativeToViteConfig(narrative, 'esm');
  }

  if (normalizedPath.endsWith('/routes/web.php')) {
    return `<?php
use Illuminate\\Support\\Facades\\Route;

Route::get('/', function () {
    return ${JSON.stringify(sanitizeNarrativeForComment(narrative))};
});
`;
  }

  if (normalizedPath.endsWith('.php')) {
    return narrativeToPhpPage(narrative);
  }

  if (normalizedPath.endsWith('.py')) {
    return narrativeToPythonScript(narrative);
  }

  if (normalizedPath.endsWith('.tsx')) {
    return narrativeToReactComponent(narrative, true);
  }

  if (normalizedPath.endsWith('.jsx')) {
    return narrativeToReactComponent(narrative, false);
  }

  if (normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.js')) {
    return narrativeToNodeServer(narrative);
  }

  return sanitizeNarrativeForComment(narrative);
}

function inferTargetFromStartCommand(command: string): InferredFileTarget | undefined {
  const normalized = command.trim();

  if (!normalized) {
    return undefined;
  }

  const nodeMatch = normalized.match(/\bnode\s+([^\s]+\.(?:m?js|cjs|ts))\b/i);

  if (nodeMatch?.[1]) {
    return {
      filePath: ensureAbsoluteFilePath(nodeMatch[1]),
      reason: 'start-command',
    };
  }

  const pythonMatch = normalized.match(/\bpython(?:3)?\s+([^\s]+\.py)\b/i);

  if (pythonMatch?.[1]) {
    return {
      filePath: ensureAbsoluteFilePath(pythonMatch[1]),
      reason: 'start-command',
    };
  }

  if (/\bphp\s+-S\b/i.test(normalized)) {
    return {
      filePath: '/index.php',
      reason: 'start-command',
    };
  }

  if (/\bnpm\s+run\s+(?:dev|start)\b|\byarn\s+(?:dev|start)\b|\bpnpm\s+(?:dev|start)\b|\bvite\b/i.test(normalized)) {
    return {
      filePath: '/index.html',
      reason: 'start-command',
    };
  }

  return undefined;
}

function ensureAbsoluteFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\\\/g, '/').trim();

  if (!normalized) {
    return '/generated-output.txt';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function inferTargetFromFilenameMention(content: string): InferredFileTarget | undefined {
  const match = content.match(/(?:^|[^\w\/.-])((?:[\w.-]+\/)*[\w.-]+\.(?:html|js|mjs|cjs|ts|tsx|jsx|py|php|json))(?![\w\/.-])/i);

  if (!match?.[1]) {
    return undefined;
  }

  const filePath = ensureAbsoluteFilePath(match[1]);

  if (filePath.toLowerCase() === '/web.php') {
    return {
      filePath: '/routes/web.php',
      reason: 'filename-mention',
    };
  }

  return {
    filePath,
    reason: 'filename-mention',
  };
}

function inferTargetFromCodePatterns(code: string): InferredFileTarget | undefined {
  const normalized = code.trim();

  if (!normalized) {
    return undefined;
  }

  if (/<!doctype html>|<html[\s>]/i.test(normalized)) {
    return { filePath: '/index.html', reason: 'html-snippet' };
  }

  if (/^\s*\{[\s\S]*"(?:name|scripts|dependencies|devDependencies)"[\s\S]*\}\s*$/i.test(normalized)) {
    return { filePath: '/package.json', reason: 'code-pattern' };
  }

  if (/defineConfig\s*\(|from\s+['"]vite['"]|export\s+default\s+defineConfig/i.test(normalized)) {
    return { filePath: '/vite.config.ts', reason: 'code-pattern' };
  }

  if (/Route::(?:get|post|put|patch|delete)\s*\(/.test(normalized)) {
    return { filePath: '/routes/web.php', reason: 'code-pattern' };
  }

  if (/^\s*<\?php|\$[a-zA-Z_][\w]*\s*=|function\s+[a-zA-Z_][\w]*\s*\(/.test(normalized) && /;/.test(normalized)) {
    return { filePath: '/index.php', reason: 'code-pattern' };
  }

  if (/\bimport\s+express\b|\brequire\(['"]express['"]\)|\bapp\.listen\s*\(/.test(normalized)) {
    return { filePath: '/server.js', reason: 'code-pattern' };
  }

  if (
    /\b(create-react-app|npm\s+create\s+vite(?:@latest)?|pnpm\s+create\s+vite|yarn\s+create\s+vite)\b/i.test(
      normalized,
    ) && /\breact\b/i.test(normalized)
  ) {
    return { filePath: '/App.tsx', reason: 'shell-scaffold' };
  }

  if (/\bfrom\s+['"]react['"]|\bReact\.|return\s*\(\s*<|export\s+default\s+function\s+[A-Z]/.test(normalized)) {
    const isTypeScript = /:\s*(?:React\.|JSX\.|FC<|FunctionComponent<)|interface\s+[A-Z]/.test(normalized);

    return { filePath: isTypeScript ? '/App.tsx' : '/App.jsx', reason: 'code-pattern' };
  }

  if (/^\s*(?:import\s+[\w.]+|from\s+[\w.]+\s+import\s+|def\s+[a-zA-Z_][\w]*\s*\(|if\s+__name__\s*==\s*['"]__main__['"]\s*:)/m.test(normalized)) {
    return { filePath: '/main.py', reason: 'code-pattern' };
  }

  return undefined;
}

function inferTargetFromLanguage(language: string, code: string): InferredFileTarget | undefined {
  const normalized = language.toLowerCase().trim();

  if (normalized === 'html' || /<!doctype html>|<html[\s>]/i.test(code)) {
    return { filePath: '/index.html', reason: 'language' };
  }

  if (normalized === 'css') {
    return { filePath: '/styles.css', reason: 'language' };
  }

  if (normalized === 'json') {
    return { filePath: '/package.json', reason: 'language' };
  }

  if (normalized === 'ts' || normalized === 'typescript') {
    return { filePath: '/main.ts', reason: 'language' };
  }

  if (normalized === 'tsx') {
    return { filePath: '/App.tsx', reason: 'language' };
  }

  if (normalized === 'jsx') {
    return { filePath: '/App.jsx', reason: 'language' };
  }

  if (normalized === 'js' || normalized === 'javascript') {
    return { filePath: '/main.js', reason: 'language' };
  }

  if (normalized === 'python' || normalized === 'py') {
    return { filePath: '/main.py', reason: 'language' };
  }

  if (normalized === 'php') {
    return { filePath: '/index.php', reason: 'language' };
  }

  return undefined;
}

function isLikelyShellCommandBlock(code: string): boolean {
  const lines = code
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return false;
  }

  const commandLikeLines = lines.filter((line) =>
    /^(?:\$\s*)?(?:npm|pnpm|yarn|npx|node|python(?:3)?|php|composer|pip|git|cd|mkdir|touch|echo|cat)\b/i.test(line),
  );

  return commandLikeLines.length >= Math.max(1, Math.ceil(lines.length * 0.5));
}

function inferTargetFromNarrative(content: string): InferredFileTarget | undefined {
  if (hasReactIntent(content) || hasCvIntent(content)) {
    return {
      filePath: '/App.tsx',
      reason: 'code-pattern',
    };
  }

  const filenameMention = inferTargetFromFilenameMention(content);

  if (filenameMention) {
    return filenameMention;
  }

  if (/\b(web\s*page|website|landing\s*page|html|frontend|portfolio\s*page)\b/i.test(content)) {
    return {
      filePath: '/index.html',
      reason: 'narrative-web',
    };
  }

  return undefined;
}

function buildArtifactPayload(filePath: string, code: string): string {
  const title = filePath.split('/').pop() || 'Generated file';
  const isReactEntry = /\/App\.(?:tsx|jsx)$|\/main\.(?:tsx|jsx)$/i.test(filePath);
  const shouldAutoPreview = filePath === '/index.html' || isReactEntry;
  const previewCommand = isReactEntry ? 'npm run dev' : 'npx --yes vite --host 0.0.0.0 --port 4173';
  const previewStartAction = shouldAutoPreview
    ? `
<boltAction type="start">
${previewCommand}
</boltAction>`
    : '';

  const reactPackageJson = isReactEntry
    ? `
<boltAction type="file" filePath="/package.json">
${JSON.stringify(
  {
    name: 'opurion-react-app',
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'vite --host 0.0.0.0 --port 4173',
      build: 'vite build',
      preview: 'vite preview --host 0.0.0.0 --port 4173',
    },
    dependencies: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@types/react': '^18.3.3',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.1',
      typescript: '^5.6.2',
      vite: '^5.4.8',
    },
  },
  null,
  2,
)}
</boltAction>`
    : '';

  return `\n<boltArtifact id="ollama-normalized-${generateId()}" title="${title}" type="bundled">\n<boltAction type="file" filePath="${filePath}">\n${code}\n</boltAction>${reactPackageJson}${previewStartAction}\n</boltArtifact>\n`;
}

export function synthesizeBoltArtifactFromContent(content: string): string | undefined {
  if (!content || hasBoltMarkup(content)) {
    return undefined;
  }

  if (isLikelyErrorPayload(content)) {
    return undefined;
  }

  const structuredArtifacts = synthesizeBoltArtifactsFromStructuredPayload(content);

  if (structuredArtifacts) {
    return structuredArtifacts;
  }

  const fencedMatch = content.match(/```([a-zA-Z0-9_+\-]*)\s*\n([\s\S]*?)```/);

  if (fencedMatch) {
    const language = fencedMatch[1] || '';
    const code = fencedMatch[2]?.trim() || '';

    if (!code) {
      return undefined;
    }

    const inferredFromLanguage = inferTargetFromLanguage(language, code);
    const inferredFromCode = inferTargetFromCodePatterns(code);
    const target = inferredFromCode ?? inferredFromLanguage;

    if (!target) {
      if (isLikelyShellCommandBlock(code)) {
        return undefined;
      }

      return undefined;
    }

    if (target.reason === 'shell-scaffold') {
      const synthesized = synthesizeContentForTarget(target.filePath, content);
      return buildArtifactPayload(target.filePath, synthesized);
    }

    if (target.filePath === '/index.html' && isTrivialViteHtmlShell(code)) {
      if (hasReactIntent(content) || /\/src\/main\.(?:tsx|jsx|ts|js)/i.test(code)) {
        return buildArtifactPayload('/App.tsx', narrativeToReactComponent(content, true));
      }

      return buildArtifactPayload('/index.html', narrativeToHtmlDocument(content));
    }

    return buildArtifactPayload(target.filePath, code);
  }

  const htmlMatch = content.match(/<!doctype html>[\s\S]*?<\/html>/i);

  if (htmlMatch?.[0]) {
    if (isTrivialViteHtmlShell(htmlMatch[0])) {
      if (hasReactIntent(content) || /\/src\/main\.(?:tsx|jsx|ts|js)/i.test(htmlMatch[0])) {
        const reactSource = narrativeToReactComponent(content, true);
        return buildArtifactPayload('/App.tsx', reactSource);
      }

      const narrativeOnly = content.replace(htmlMatch[0], '').trim();
      return buildArtifactPayload('/index.html', narrativeToHtmlDocument(narrativeOnly || 'Build a professional web page.'));
    }

    if (hasReactIntent(content) || hasCvIntent(content)) {
      const reactSource = narrativeToReactComponent(content, true);
      return buildArtifactPayload('/App.tsx', reactSource);
    }

    const html = htmlMatch[0].trim();
    return buildArtifactPayload('/index.html', html);
  }

  const maybeCodeLike = content.trim();
  const inferredFromCode = inferTargetFromCodePatterns(maybeCodeLike);

  if (inferredFromCode) {
    return buildArtifactPayload(inferredFromCode.filePath, maybeCodeLike);
  }

  const trimmed = content.trim();

  if (trimmed.length < 120) {
    return undefined;
  }

  const inferredFromNarrative = inferTargetFromNarrative(trimmed);

  if (!inferredFromNarrative) {
    return undefined;
  }

  const synthesized = synthesizeContentForTarget(inferredFromNarrative.filePath, trimmed);
  return buildArtifactPayload(inferredFromNarrative.filePath, synthesized);
}
