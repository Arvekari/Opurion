import type { Message } from 'ai';
import { generateId } from './fileUtils';

export interface ProjectCommands {
  type: string;
  setupCommand?: string;
  startCommand?: string;
  followupMessage: string;
}

export interface ProjectPreflightResult {
  ok: boolean;
  issues: string[];
}

interface FileContent {
  content: string;
  path: string;
}

interface ParsedPackageJson {
  file: FileContent;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
}

const NODE_SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'stream',
  'timers',
  'url',
  'util',
  'zlib',
]);

function buildBuiltinPreviewServerCommand(simulatePhp = false): string {
  const phpTransform = simulatePhp
    ? "if(ext==='.php'){const rendered=stripPhp(content.toString('utf8')).trim();res.setHeader('X-Bolt-Preview-Mode','php-static-fallback');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(rendered||'<!doctype html><html><body><main style=\"font-family:system-ui,sans-serif;padding:24px\"><h1>PHP preview fallback</h1><p>PHP execution is not available in this environment, so this preview renders the PHP template shell without running server-side logic.</p></main></body></html>');return;}"
    : '';

  return `node -e "const http=require('http');const fs=require('fs');const path=require('path');const root=process.cwd();const port=Number(process.env.PORT||4173);const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.txt':'text/plain; charset=utf-8'};const stripPhp=(source)=>source.replace(/<\\?(?:php|=)[\\s\\S]*?\\?>/g,'');const resolvePath=(requestPath)=>{const clean=decodeURIComponent((requestPath||'/').split('?')[0]);const relative=clean==='/'?'':clean.replace(/^\\//,'');const direct=path.join(root,relative);if(relative&&fs.existsSync(direct)&&fs.statSync(direct).isFile())return direct;if(relative&&fs.existsSync(direct)&&fs.statSync(direct).isDirectory()){const htmlIndex=path.join(direct,'index.html');const phpIndex=path.join(direct,'index.php');if(fs.existsSync(htmlIndex))return htmlIndex;if(fs.existsSync(phpIndex))return phpIndex;}const rootHtml=path.join(root,'index.html');const rootPhp=path.join(root,'index.php');if(fs.existsSync(rootHtml))return rootHtml;if(fs.existsSync(rootPhp))return rootPhp;return direct;};const server=http.createServer((req,res)=>{const filePath=resolvePath(req.url||'/');if(!fs.existsSync(filePath)||!fs.statSync(filePath).isFile()){res.statusCode=404;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('Not Found');return;}const ext=path.extname(filePath).toLowerCase();const content=fs.readFileSync(filePath);${phpTransform}res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.end(content);});server.listen(port,'0.0.0.0',()=>console.log('Preview server listening on http://0.0.0.0:'+port));"`;
}

// Helper function to make any command non-interactive
function makeNonInteractive(command: string): string {
  // Set environment variables for non-interactive mode
  const envVars = 'export CI=true DEBIAN_FRONTEND=noninteractive FORCE_COLOR=0';

  // Common interactive packages and their non-interactive flags
  const interactivePackages = [
    { pattern: /npx\s+([^@\s]+@?[^\s]*)\s+init/g, replacement: 'echo "y" | npx --yes $1 init --defaults --yes' },
    { pattern: /npx\s+create-([^\s]+)/g, replacement: 'npx --yes create-$1 --template default' },
    { pattern: /npx\s+([^@\s]+@?[^\s]*)\s+add/g, replacement: 'npx --yes $1 add --defaults --yes' },
    { pattern: /npm\s+install(?!\s+--)/g, replacement: 'npm install --yes --no-audit --no-fund --silent' },
    { pattern: /yarn\s+add(?!\s+--)/g, replacement: 'yarn add --non-interactive' },
    { pattern: /pnpm\s+add(?!\s+--)/g, replacement: 'pnpm add --yes' },
  ];

  let processedCommand = command;

  // Apply replacements for known interactive patterns
  interactivePackages.forEach(({ pattern, replacement }) => {
    processedCommand = processedCommand.replace(pattern, replacement);
  });

  return `${envVars} && ${processedCommand}`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function getDirectoryPath(filePath: string): string {
  const normalized = toPosixPath(filePath);
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === -1) {
    return '';
  }

  return normalized.slice(0, lastSlash);
}

function getPathDepth(filePath: string): number {
  return toPosixPath(filePath)
    .split('/')
    .filter(Boolean).length;
}

function getShallowestFile(files: FileContent[], predicate: (file: FileContent) => boolean): FileContent | undefined {
  return files.filter(predicate).sort((left, right) => getPathDepth(left.path) - getPathDepth(right.path))[0];
}

function makeCommandWithDirectoryPrefix(command: string, directory: string): string {
  if (!directory) {
    return command;
  }

  return `cd ${directory} && ${command}`;
}

export function extractWorkingDirectoryFromCommand(command?: string): string {
  const match = command?.match(/^\s*cd\s+(["']?)(.+?)\1\s*&&/);

  if (!match) {
    return '';
  }

  return normalizeWorkspaceRelativeDirectory(match[2]);
}

function normalizeWorkspaceRelativeDirectory(directory: string): string {
  const normalized = toPosixPath(directory).replace(/\/+$/, '');

  if (!normalized || normalized === '/') {
    return '';
  }

  // Strip /home/project WebContainer root prefix.
  // package.json at /home/project/package.json → project root → no cd needed (return '').
  // package.json at /home/project/packages/app/package.json → cd packages/app.
  if (normalized === '/home/project' || normalized === 'home/project') {
    return '';
  }

  if (normalized.startsWith('/home/project/')) {
    return normalized.slice('/home/project/'.length);
  }

  if (normalized.startsWith('home/project/')) {
    return normalized.slice('home/project/'.length);
  }

  const withoutLeadingSlash = normalized.replace(/^\/+/, '');

  if (withoutLeadingSlash === 'workspace') {
    return '';
  }

  return withoutLeadingSlash.replace(/^workspace\//, '');
}

function detectPackageManager(files: FileContent[], packageDirectory: string): 'npm' | 'pnpm' | 'yarn' {
  const normalizedDir = packageDirectory.replace(/^\/+/, '').replace(/\/+$/, '');

  const hasLockFile = (lockFileName: string) => {
    return files.some((file) => {
      const normalizedPath = toPosixPath(file.path).replace(/^\/+/, '');
      const candidatePath = normalizedDir ? `${normalizedDir}/${lockFileName}` : lockFileName;
      return normalizedPath.endsWith(candidatePath);
    });
  };

  if (hasLockFile('pnpm-lock.yaml')) {
    return 'pnpm';
  }

  if (hasLockFile('yarn.lock')) {
    return 'yarn';
  }

  return 'pnpm';
}

function toWorkspaceRelativePath(filePath: string): string {
  const normalized = toPosixPath(filePath).replace(/^\/+/, '');

  if (normalized.startsWith('home/project/')) {
    return normalized.slice('home/project/'.length);
  }

  if (normalized === 'home/project') {
    return '';
  }

  return normalized;
}

function toProjectRelativePath(filePath: string, workingDirectory: string): string {
  const workspacePath = toWorkspaceRelativePath(filePath);

  if (!workingDirectory) {
    return workspacePath;
  }

  const prefix = `${workingDirectory.replace(/^\/+|\/+$/g, '')}/`;

  if (workspacePath.startsWith(prefix)) {
    return workspacePath.slice(prefix.length);
  }

  return workspacePath;
}

function parseStartScriptName(startCommand?: string): string | undefined {
  if (!startCommand) {
    return undefined;
  }

  const normalized = startCommand.replace(/^\s*cd\s+["']?.+?["']?\s*&&\s*/, '').trim();
  const npmMatch = normalized.match(/^(?:npm|pnpm)\s+run\s+([\w:-]+)/);

  if (npmMatch?.[1]) {
    return npmMatch[1];
  }

  const yarnMatch = normalized.match(/^yarn\s+([\w:-]+)/);
  return yarnMatch?.[1];
}

function getPreferredScriptName(scripts: Record<string, unknown>, preferredOrder: string[]): string | undefined {
  return preferredOrder.find((name) => {
    const value = scripts[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

const SCRIPT_SYSTEM_COMMANDS = new Set([
  'node',
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'sh',
  'bash',
  'zsh',
  'cmd',
  'echo',
  'true',
  'false',
  'cd',
]);

function getScriptRuntimePackage(scriptValue: string): string | undefined {
  const firstSegment = scriptValue.split(/&&|\|\||;/)[0]?.trim();

  if (!firstSegment) {
    return undefined;
  }

  const tokens = firstSegment.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return undefined;
  }

  let index = 0;

  // Skip leading environment variable assignments: FOO=bar vite
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) {
    index++;
  }

  const token = tokens[index];

  if (!token) {
    return undefined;
  }

  if (token === 'npx') {
    let npxIndex = index + 1;

    while (npxIndex < tokens.length && tokens[npxIndex].startsWith('-')) {
      npxIndex++;
    }

    return tokens[npxIndex];
  }

  if ((token === 'pnpm' || token === 'npm' || token === 'yarn') && tokens[index + 1] === 'exec') {
    return tokens[index + 2];
  }

  if (token === 'cross-env') {
    let envIndex = index + 1;

    while (envIndex < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[envIndex])) {
      envIndex++;
    }

    return tokens[envIndex];
  }

  if (
    SCRIPT_SYSTEM_COMMANDS.has(token) ||
    token.startsWith('./') ||
    token.startsWith('../') ||
    token.startsWith('/') ||
    token.startsWith('node:')
  ) {
    return undefined;
  }

  return token;
}

function extractPackageName(specifier: string): string | undefined {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return undefined;
  }

  if (specifier.startsWith('http://') || specifier.startsWith('https://') || specifier.startsWith('data:')) {
    return undefined;
  }

  if (specifier.startsWith('@vite/virtual') || specifier.startsWith('virtual:')) {
    return undefined;
  }

  const cleaned = specifier.split('?')[0].split('#')[0];

  if (cleaned.startsWith('@')) {
    const [scope, name] = cleaned.split('/');
    return scope && name ? `${scope}/${name}` : cleaned;
  }

  return cleaned.split('/')[0];
}

function extractImportedPackages(files: FileContent[], workingDirectory: string): Set<string> {
  const packages = new Set<string>();
  const importRegex = /(?:import\s+(?:[^'";]+\s+from\s+)?|require\s*\(|import\s*\()\s*['"]([^'"\n]+)['"]/g;

  for (const file of files) {
    const workspacePath = toWorkspaceRelativePath(file.path);
    const extension = workspacePath.slice(workspacePath.lastIndexOf('.')).toLowerCase();

    if (!NODE_SOURCE_EXTENSIONS.includes(extension)) {
      continue;
    }

    if (workingDirectory) {
      const dirPrefix = `${workingDirectory.replace(/^\/+|\/+$/g, '')}/`;

      if (!workspacePath.startsWith(dirPrefix)) {
        continue;
      }
    }

    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(file.content)) !== null) {
      const candidate = extractPackageName(match[1]);

      if (!candidate || NODE_BUILTINS.has(candidate)) {
        continue;
      }

      packages.add(candidate);
    }
  }

  return packages;
}

function validateHtmlEntrypoints(files: FileContent[], workingDirectory: string): string[] {
  const issues: string[] = [];
  const htmlFiles = files.filter((file) => {
    const workspacePath = toWorkspaceRelativePath(file.path);

    if (!workspacePath.endsWith('index.html')) {
      return false;
    }

    if (!workingDirectory) {
      return true;
    }

    return workspacePath.startsWith(`${workingDirectory.replace(/^\/+|\/+$/g, '')}/`);
  });

  const workspacePaths = new Set(files.map((file) => toWorkspaceRelativePath(file.path)));

  for (const htmlFile of htmlFiles) {
    const htmlWithoutComments = htmlFile.content.replace(/<!--[\s\S]*?-->/g, '').trim();

    if (!htmlWithoutComments) {
      issues.push(
        `Empty HTML entrypoint: '${toWorkspaceRelativePath(htmlFile.path)}' has no renderable content, so preview will be blank.`,
      );
      continue;
    }

    const projectRelativePath = toProjectRelativePath(htmlFile.path, workingDirectory);
    const htmlDirectory = getDirectoryPath(projectRelativePath);
    const scriptRegex = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;

    while ((match = scriptRegex.exec(htmlFile.content)) !== null) {
      const src = match[1];

      if (
        !src ||
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('//') ||
        src.startsWith('data:')
      ) {
        continue;
      }

      const cleanSrc = src.split('?')[0].split('#')[0].replace(/^\.\//, '');
      const candidateProjectPath = cleanSrc.startsWith('/')
        ? cleanSrc.replace(/^\/+/, '')
        : [htmlDirectory, cleanSrc].filter(Boolean).join('/');
      const workspaceCandidate = workingDirectory
        ? `${workingDirectory.replace(/^\/+|\/+$/g, '')}/${candidateProjectPath}`.replace(/\/+/g, '/')
        : candidateProjectPath;

      if (!workspacePaths.has(workspaceCandidate) && !workspacePaths.has(candidateProjectPath)) {
        issues.push(`Broken HTML script link: '${src}' referenced by '${toWorkspaceRelativePath(htmlFile.path)}'`);
      }
    }
  }

  return issues;
}

function validatePostcssJsonConfigs(files: FileContent[], workingDirectory: string): string[] {
  const issues: string[] = [];
  const jsonConfigPattern = /(?:^|\/)(?:postcss\.config\.json|\.postcssrc|\.postcssrc\.json)$/i;

  const postcssJsonFiles = files.filter((file) => {
    const workspacePath = toWorkspaceRelativePath(file.path);

    if (!jsonConfigPattern.test(workspacePath)) {
      return false;
    }

    if (!workingDirectory) {
      return true;
    }

    return workspacePath.startsWith(`${workingDirectory.replace(/^\/+|\/+$/g, '')}/`);
  });

  for (const configFile of postcssJsonFiles) {
    try {
      JSON.parse(configFile.content);
    } catch {
      issues.push(`Invalid PostCSS JSON config at '${toWorkspaceRelativePath(configFile.path)}'.`);
    }
  }

  return issues;
}

function validatePackageDependencySpecs(packageJson: any): string[] {
  const issues: string[] = [];
  const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const;

  for (const sectionName of dependencySections) {
    const sectionValue = packageJson?.[sectionName];

    if (sectionValue === undefined) {
      continue;
    }

    if (sectionValue === null || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
      issues.push(`package.json field '${sectionName}' must be an object mapping package names to version strings.`);
      continue;
    }

    for (const [packageName, versionSpec] of Object.entries(sectionValue as Record<string, unknown>)) {
      if (typeof versionSpec !== 'string' || versionSpec.trim().length === 0) {
        issues.push(`Invalid dependency spec in ${sectionName}.${packageName}: expected a non-empty string version.`);
      }
    }
  }

  return issues;
}

function stripJsComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1')
    .trim();
}

function normalizeLocalImportPath(pathValue: string): string {
  const withoutQuery = pathValue.split('?')[0].split('#')[0];
  return withoutQuery.replace(/\\/g, '/');
}

function resolveLocalImportTarget(
  importerWorkspacePath: string,
  importPath: string,
  sourceFileMap: Map<string, string>,
): string | undefined {
  const importerDirectory = getDirectoryPath(importerWorkspacePath);
  const normalizedImportPath = normalizeLocalImportPath(importPath).replace(/^\.\//, '');
  const rawTarget = normalizedImportPath.startsWith('/')
    ? normalizedImportPath.replace(/^\/+/, '')
    : [importerDirectory, normalizedImportPath].filter(Boolean).join('/');

  const directCandidates = [
    rawTarget,
    ...NODE_SOURCE_EXTENSIONS.map((ext) => `${rawTarget}${ext}`),
    ...NODE_SOURCE_EXTENSIONS.map((ext) => `${rawTarget}/index${ext}`),
  ];

  return directCandidates.find((candidate) => sourceFileMap.has(candidate));
}

function getDeclaredExports(moduleContent: string): { hasDefaultExport: boolean; namedExports: Set<string> } {
  const content = stripJsComments(moduleContent);
  const namedExports = new Set<string>();
  const hasDefaultExport = /export\s+default\b/.test(content);

  const declarationRegex = /export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;

  while ((match = declarationRegex.exec(content)) !== null) {
    namedExports.add(match[1]);
  }

  const listRegex = /export\s*\{([^}]+)\}/g;

  while ((match = listRegex.exec(content)) !== null) {
    const exportedMembers = match[1]
      .split(',')
      .map((member) => member.trim())
      .filter(Boolean)
      .map((member) => {
        const aliasMatch = member.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        return aliasMatch ? aliasMatch[2] : member;
      });

    exportedMembers.forEach((member) => namedExports.add(member));
  }

  return { hasDefaultExport, namedExports };
}

function validateReactModuleExports(files: FileContent[], workingDirectory: string): string[] {
  const issues: string[] = [];
  const normalizedWorkingDirectory = workingDirectory.replace(/^\/+|\/+$/g, '');
  const sourceFiles = files.filter((file) => {
    const workspacePath = toWorkspaceRelativePath(file.path);
    const extension = workspacePath.slice(workspacePath.lastIndexOf('.')).toLowerCase();

    if (!NODE_SOURCE_EXTENSIONS.includes(extension)) {
      return false;
    }

    if (!normalizedWorkingDirectory) {
      return true;
    }

    return workspacePath.startsWith(`${normalizedWorkingDirectory}/`);
  });

  if (sourceFiles.length === 0) {
    return issues;
  }

  const sourceFileMap = new Map<string, string>(sourceFiles.map((file) => [toWorkspaceRelativePath(file.path), file.content]));
  const entryFileNames = new Set(['main.js', 'main.jsx', 'main.ts', 'main.tsx', 'index.js', 'index.jsx', 'index.ts', 'index.tsx']);

  for (const file of sourceFiles) {
    const importerWorkspacePath = toWorkspaceRelativePath(file.path);
    const baseName = importerWorkspacePath.split('/').pop() ?? '';

    if (!entryFileNames.has(baseName)) {
      continue;
    }

    const content = file.content;
    const importRegex = /import\s+([^'";]+)\s+from\s+['"]([^'"\n]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const specifierClause = match[1].trim();
      const importSource = match[2].trim();

      if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
        continue;
      }

      const resolvedTarget = resolveLocalImportTarget(importerWorkspacePath, importSource, sourceFileMap);

      if (!resolvedTarget) {
        issues.push(`Broken local import: '${importSource}' referenced by '${importerWorkspacePath}' cannot be resolved.`);
        continue;
      }

      const targetContent = sourceFileMap.get(resolvedTarget) ?? '';
      const normalizedTargetContent = stripJsComments(targetContent);

      if (!normalizedTargetContent) {
        issues.push(`Empty source module: '${resolvedTarget}' is empty but imported by '${importerWorkspacePath}'.`);
        continue;
      }

      const exports = getDeclaredExports(targetContent);
      const namedImportMatch = specifierClause.match(/\{([^}]+)\}/);
      const defaultImportClause = specifierClause.split(',')[0]?.trim();
      const hasDefaultImport = !!defaultImportClause && !defaultImportClause.startsWith('{') && !defaultImportClause.startsWith('*');

      if (hasDefaultImport && !exports.hasDefaultExport) {
        issues.push(
          `Import/export mismatch: '${importerWorkspacePath}' default-imports '${importSource}', but '${resolvedTarget}' has no default export.`,
        );
      }

      if (namedImportMatch) {
        const importedNames = namedImportMatch[1]
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
            return aliasMatch ? aliasMatch[1] : part;
          });

        for (const importedName of importedNames) {
          if (!exports.namedExports.has(importedName)) {
            issues.push(
              `Import/export mismatch: '${importerWorkspacePath}' imports '{ ${importedName} }' from '${importSource}', but '${resolvedTarget}' does not export '${importedName}'.`,
            );
          }
        }
      }
    }
  }

  return issues;
}

function isViteConfigPath(workspacePath: string): boolean {
  return /(?:^|\/)vite\.config\.(?:js|mjs|cjs|ts|mts|cts)$/i.test(workspacePath);
}

function isLikelyValidViteConfig(content: string): boolean {
  const normalized = content.trim();

  if (!normalized) {
    return false;
  }

  if (normalized.includes('```') || /<bolt(?:Artifact|Action)\b/i.test(normalized)) {
    return false;
  }

  return /module\.exports\s*=|export\s+default|defineConfig\s*\(/i.test(normalized);
}

export async function validateProjectPreflight(
  files: FileContent[],
  commands: Pick<ProjectCommands, 'type' | 'setupCommand' | 'startCommand'>,
): Promise<ProjectPreflightResult> {
  if (commands.type !== 'Node.js') {
    return { ok: true, issues: [] };
  }

  const workingDirectory = extractWorkingDirectoryFromCommand(commands.startCommand || commands.setupCommand);
  const normalizedWorkingDirectory = workingDirectory.replace(/^\/+|\/+$/g, '');
  const packageJsonSuffix = normalizedWorkingDirectory ? `${normalizedWorkingDirectory}/package.json` : 'package.json';
  const packageJsonFile = files.find((file) => toWorkspaceRelativePath(file.path).endsWith(packageJsonSuffix));

  if (!packageJsonFile) {
    return {
      ok: false,
      issues: [
        `Missing package.json in '${normalizedWorkingDirectory || 'project root'}' required for Node.js start command.`,
      ],
    };
  }

  let packageJson: any;

  try {
    packageJson = JSON.parse(packageJsonFile.content);
  } catch {
    return {
      ok: false,
      issues: [`package.json at '${toWorkspaceRelativePath(packageJsonFile.path)}' is invalid JSON.`],
    };
  }

  const issues: string[] = [];
  issues.push(...validatePackageDependencySpecs(packageJson));
  const startScript = parseStartScriptName(commands.startCommand);
  const scripts = (packageJson?.scripts || {}) as Record<string, unknown>;
  const fallbackStartScript = getPreferredScriptName(scripts, ['dev', 'start', 'preview']);
  const effectiveStartScript =
    startScript && typeof scripts[startScript] === 'string' && scripts[startScript].trim().length > 0
      ? startScript
      : fallbackStartScript;

  if (startScript && !effectiveStartScript) {
    issues.push(`Missing scripts.${startScript} in package.json for start command '${commands.startCommand}'.`);
  }

  const declaredDependencies = new Set([
    ...Object.keys(packageJson?.dependencies || {}),
    ...Object.keys(packageJson?.devDependencies || {}),
    ...Object.keys(packageJson?.optionalDependencies || {}),
    ...Object.keys(packageJson?.peerDependencies || {}),
  ]);

  const importedPackages = extractImportedPackages(files, normalizedWorkingDirectory);
  const missingDependencies = [...importedPackages].filter((dependency) => !declaredDependencies.has(dependency));

  if (missingDependencies.length > 0) {
    issues.push(`Missing dependencies in package.json: ${missingDependencies.slice(0, 12).join(', ')}`);
  }

  if (effectiveStartScript && typeof scripts[effectiveStartScript] === 'string') {
    const runtimePackage = getScriptRuntimePackage(scripts[effectiveStartScript] as string);

    if (runtimePackage && !declaredDependencies.has(runtimePackage)) {
      issues.push(
        `scripts.${effectiveStartScript} uses '${runtimePackage}' but it is not declared in package.json dependencies/devDependencies.`,
      );
    }
  }

  const startScriptValue = effectiveStartScript ? scripts[effectiveStartScript] : undefined;
  const startCommandWithoutCd = (commands.startCommand || '').replace(/^\s*cd\s+["']?.+?["']?\s*&&\s*/, '').trim();
  const startRuntimePackage = startScriptValue ? getScriptRuntimePackage(startScriptValue) : getScriptRuntimePackage(startCommandWithoutCd);
  const usesVite =
    startRuntimePackage === 'vite' ||
    /\bnpx\s+(?:--yes\s+)?vite\b/i.test(startCommandWithoutCd) ||
    (typeof startScriptValue === 'string' && /\bvite\b/i.test(startScriptValue));

  if (usesVite) {
    const normalizedWorkingDirectoryPrefix = normalizedWorkingDirectory ? `${normalizedWorkingDirectory}/` : '';
    const expectedEntrypointPath = `${normalizedWorkingDirectoryPrefix}index.html`;
    const hasViteEntrypoint = files.some((file) => {
      const workspacePath = toWorkspaceRelativePath(file.path);
      return workspacePath === expectedEntrypointPath || workspacePath.endsWith(`/${expectedEntrypointPath}`);
    });

    if (!hasViteEntrypoint) {
      issues.push(
        `Missing HTML entrypoint: '${expectedEntrypointPath}' is required for Vite startup and preview rendering.`,
      );
    }

    const viteConfigFiles = files.filter((file) => {
      const workspacePath = toWorkspaceRelativePath(file.path);

      if (!isViteConfigPath(workspacePath)) {
        return false;
      }

      if (!normalizedWorkingDirectory) {
        return true;
      }

      return workspacePath.startsWith(`${normalizedWorkingDirectory}/`);
    });

    for (const viteConfigFile of viteConfigFiles) {
      if (!isLikelyValidViteConfig(viteConfigFile.content)) {
        issues.push(
          `Invalid Vite config at '${toWorkspaceRelativePath(viteConfigFile.path)}': config must export or return an object.`,
        );
      }
    }
  }

  issues.push(...validatePostcssJsonConfigs(files, normalizedWorkingDirectory));
  issues.push(...validateHtmlEntrypoints(files, normalizedWorkingDirectory));
  issues.push(...validateReactModuleExports(files, normalizedWorkingDirectory));

  return {
    ok: issues.length === 0,
    issues,
  };
}

function buildStartCommand(packageManager: 'npm' | 'pnpm' | 'yarn', script: string): string {
  if (packageManager === 'yarn') {
    return `yarn ${script}`;
  }

  if (packageManager === 'pnpm') {
    return `pnpm run ${script}`;
  }

  return `npm run ${script}`;
}

function buildInstallCommand(packageManager: 'npm' | 'pnpm' | 'yarn'): string {
  if (packageManager === 'yarn') {
    return 'yarn install --non-interactive';
  }

  if (packageManager === 'pnpm') {
    return 'pnpm install --frozen-lockfile=false';
  }

  return 'pnpm install --frozen-lockfile=false';
}

export async function detectProjectCommands(files: FileContent[]): Promise<ProjectCommands> {
  const hasFile = (name: string) => files.some((f) => f.path.endsWith(name));
  const hasFileContent = (name: string, content: string) =>
    files.some((f) => f.path.endsWith(name) && f.content.includes(content));

  const packageJsonFiles = files.filter((f) => f.path.endsWith('package.json'));

  if (packageJsonFiles.length > 0) {
    const parsedPackageJsons: ParsedPackageJson[] = [];

    for (const packageJsonFile of packageJsonFiles) {
      try {
        const packageJson = JSON.parse(packageJsonFile.content);
        parsedPackageJsons.push({
          file: packageJsonFile,
          scripts: packageJson?.scripts || {},
          dependencies: {
            ...(packageJson?.dependencies || {}),
            ...(packageJson?.devDependencies || {}),
          },
        });
      } catch (error) {
        console.error('Error parsing package.json:', error);
      }
    }

    if (parsedPackageJsons.length === 0) {
      return { type: '', setupCommand: '', followupMessage: '' };
    }

    const preferredCommands = ['dev', 'start', 'preview'];

    parsedPackageJsons.sort((left, right) => getPathDepth(left.file.path) - getPathDepth(right.file.path));

    const packageWithPreferredCommand = parsedPackageJsons.find((entry) => getPreferredScriptName(entry.scripts, preferredCommands));

    const selectedPackage = packageWithPreferredCommand || parsedPackageJsons[0];
    const availableCommand = getPreferredScriptName(selectedPackage.scripts, preferredCommands);
    const packageDirectory = normalizeWorkspaceRelativeDirectory(getDirectoryPath(selectedPackage.file.path));
    const packageManager = detectPackageManager(files, packageDirectory);

    // Check if this is a shadcn project
    const isShadcnProject =
      hasFileContent('components.json', 'shadcn') ||
      Object.keys(selectedPackage.dependencies).some((dep) => dep.includes('shadcn')) ||
      hasFile('components.json');

    let baseSetupCommand = buildInstallCommand(packageManager);

    if (isShadcnProject) {
      baseSetupCommand += ' && npx shadcn@latest init';
    }

    const setupCommand = makeNonInteractive(makeCommandWithDirectoryPrefix(baseSetupCommand, packageDirectory));

    if (availableCommand) {
      const startCommand = makeCommandWithDirectoryPrefix(
        buildStartCommand(packageManager, availableCommand),
        packageDirectory,
      );

      return {
        type: 'Node.js',
        setupCommand,
        startCommand,
        followupMessage: `Found "${availableCommand}" script in package.json. Running "${startCommand}" after installation.`,
      };
    }

    return {
      type: 'Node.js',
      setupCommand,
      followupMessage:
        'Would you like me to inspect package.json to determine the available scripts for running this project?',
    };
  }

  const hasRequirementsTxt = hasFile('requirements.txt');
  const hasPyprojectToml = hasFile('pyproject.toml');

  if (hasRequirementsTxt || hasPyprojectToml || hasFile('manage.py') || hasFile('app.py') || hasFile('main.py')) {
    const pythonSetupCommand = hasRequirementsTxt ? 'python -m pip install -r requirements.txt' : undefined;

    if (hasFile('manage.py')) {
      return {
        type: 'Python',
        setupCommand: pythonSetupCommand,
        startCommand: 'python manage.py runserver 0.0.0.0:8000',
        followupMessage: 'Detected a Django-style project. Starting development server with manage.py.',
      };
    }

    if (hasFileContent('main.py', 'FastAPI')) {
      return {
        type: 'Python',
        setupCommand: pythonSetupCommand,
        startCommand: 'uvicorn main:app --host 0.0.0.0 --port 8000',
        followupMessage: 'Detected FastAPI app in main.py. Starting with uvicorn.',
      };
    }

    if (hasFileContent('app.py', 'FastAPI')) {
      return {
        type: 'Python',
        setupCommand: pythonSetupCommand,
        startCommand: 'uvicorn app:app --host 0.0.0.0 --port 8000',
        followupMessage: 'Detected FastAPI app in app.py. Starting with uvicorn.',
      };
    }

    if (hasFile('main.py')) {
      return {
        type: 'Python',
        setupCommand: pythonSetupCommand,
        startCommand: 'python main.py',
        followupMessage: 'Detected Python project entrypoint main.py. Starting with python main.py.',
      };
    }

    if (hasFile('app.py')) {
      return {
        type: 'Python',
        setupCommand: pythonSetupCommand,
        startCommand: 'python app.py',
        followupMessage: 'Detected Python project entrypoint app.py. Starting with python app.py.',
      };
    }

    return {
      type: 'Python',
      setupCommand: pythonSetupCommand,
      startCommand: 'python -m http.server 8000 --bind 0.0.0.0',
      followupMessage:
        'Detected Python project files but no explicit app entrypoint. Starting a Python static HTTP preview server as fallback.',
    };
  }

  const phpEntryFile =
    getShallowestFile(files, (file) => /(?:^|\/)index\.php$/i.test(toPosixPath(file.path))) ||
    getShallowestFile(files, (file) => /\.php$/i.test(toPosixPath(file.path)));

  if (phpEntryFile) {
    const phpDirectory = normalizeWorkspaceRelativeDirectory(getDirectoryPath(phpEntryFile.path));

    return {
      type: 'PHP',
      startCommand: makeCommandWithDirectoryPrefix(buildBuiltinPreviewServerCommand(true), phpDirectory),
      followupMessage:
        'Detected a PHP-style project. Starting a built-in preview server with PHP-template fallback rendering so the preview can be verified even without a native PHP runtime.',
    };
  }

  const htmlEntryFile = getShallowestFile(files, (file) => /(?:^|\/)index\.html$/i.test(toPosixPath(file.path)));

  if (htmlEntryFile) {
    const staticDirectory = normalizeWorkspaceRelativeDirectory(getDirectoryPath(htmlEntryFile.path));

    return {
      type: 'Static',
      startCommand: makeCommandWithDirectoryPrefix(buildBuiltinPreviewServerCommand(false), staticDirectory),
      followupMessage: 'Detected a static site entrypoint. Starting the built-in preview server.',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
}

export function createCommandsMessage(commands: ProjectCommands): Message | null {
  if (!commands.setupCommand && !commands.startCommand) {
    return null;
  }

  let commandString = '';

  if (commands.setupCommand) {
    commandString += `
<boltAction type="shell">${commands.setupCommand}</boltAction>`;
  }

  if (commands.startCommand) {
    commandString += `
<boltAction type="start">${commands.startCommand}</boltAction>
`;
  }

  return {
    role: 'assistant',
    content: `
${commands.followupMessage ? `\n\n${commands.followupMessage}` : ''}
<boltArtifact id="project-setup" title="Project Setup">
${commandString}
</boltArtifact>`,
    id: generateId(),
    createdAt: new Date(),
  };
}

export function escapeBoltArtifactTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltArtifact[^>]*>)([\s\S]*?)(<\/boltArtifact>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltAActionTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltAction[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltTags(input: string) {
  return escapeBoltArtifactTags(escapeBoltAActionTags(input));
}

// We have this seperate function to simplify the restore snapshot process in to one single artifact.
export function createCommandActionsString(commands: ProjectCommands): string {
  if (!commands.setupCommand && !commands.startCommand) {
    // Return empty string if no commands
    return '';
  }

  let commandString = '';

  if (commands.setupCommand) {
    commandString += `
<boltAction type="shell">${commands.setupCommand}</boltAction>`;
  }

  if (commands.startCommand) {
    commandString += `
<boltAction type="start">${commands.startCommand}</boltAction>
`;
  }

  return commandString;
}
