#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const startupTimeoutMs = Number(process.env.DOCKER_SMOKE_TIMEOUT_MS || 15000);
const dockerImageTag = process.env.DOCKER_SMOKE_IMAGE_TAG || `bolt2-dyi:smoke-${Date.now()}`;
const dockerContainerName = process.env.DOCKER_SMOKE_CONTAINER_NAME || `bolt2-dyi-smoke-${Date.now()}`;
const dockerTarget = process.env.DOCKER_SMOKE_TARGET || 'bolt2-dyi-production';
const dockerfilePath = process.env.DOCKER_SMOKE_DOCKERFILE || 'docs/docker/composed/Dockerfile';
const dockerBuildContext = process.env.DOCKER_SMOKE_CONTEXT || '.';
const hostLogDir = resolve(process.env.DOCKER_SMOKE_LOG_DIR || 'bolt.work/docker-test/logs');
const containerLogDir = process.env.DOCKER_SMOKE_CONTAINER_LOG_DIR || '/bolt-work/docker-test/logs';
const maxLogRotations = Math.max(1, Number(process.env.DOCKER_SMOKE_MAX_LOG_ROTATIONS || 3));
const runId = new Date().toISOString().replace(/[.:]/g, '-');

function safeName(input) {
  return input.replace(/[^a-z0-9._-]/gi, '_');
}

function ensureLogDir() {
  mkdirSync(hostLogDir, { recursive: true });
}

function rotateLogs() {
  ensureLogDir();

  const entries = readdirSync(hostLogDir)
    .filter((name) => name.toLowerCase().endsWith('.log'))
    .map((name) => {
      const fullPath = resolve(hostLogDir, name);
      const stats = statSync(fullPath);

      return {
        name,
        fullPath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = entries.slice(maxLogRotations);

  for (const entry of toDelete) {
    unlinkSync(entry.fullPath);
    console.log(`Removed old docker smoke log: ${entry.fullPath}`);
  }
}

function writeContainerLogFile(containerRef, stage) {
  ensureLogDir();

  const logsResult = runCommandCapture('docker', ['logs', containerRef]);
  const logs = `${logsResult.stdout || ''}\n${logsResult.stderr || ''}`;
  const fileName = `${runId}-${safeName(dockerImageTag)}-${safeName(stage)}.log`;
  const filePath = resolve(hostLogDir, fileName);

  writeFileSync(filePath, logs, 'utf8');
  rotateLogs();

  console.log(`Docker smoke logs saved: ${filePath}`);
  return logs;
}

function runCommand(command, args, options = {}) {
  const useShell = command === 'docker' ? false : process.platform === 'win32';

  return spawnSync(command, args, {
    stdio: 'inherit',
    shell: useShell,
    ...options,
  });
}

function runCommandCapture(command, args) {
  const useShell = command === 'docker' ? false : process.platform === 'win32';

  return spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
    encoding: 'utf8',
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkDockerCli() {
  const result = runCommandCapture('docker', ['--version']);

  if ((result.status ?? 1) !== 0) {
    console.error('❌ Docker CLI not available. Install Docker Desktop/Engine and ensure docker is in PATH.');
    process.exit(result.status ?? 1);
  }

  console.log(`Docker detected: ${result.stdout.trim()}`);
}

function runBuild() {
  console.log('Running production build for Docker/startup smoke...');

  const result = runCommand('pnpm', ['-s', 'build']);

  if ((result.status ?? 1) !== 0) {
    console.error('❌ Build failed during Docker smoke check.');
    process.exit(result.status ?? 1);
  }
}

function assertNoErrorLogs(logText, source) {
  const errorPattern = /(^|\b)(error:|syntaxerror|unhandled|uncaught|exception|fatal)(\b|$)/im;

  if (errorPattern.test(logText)) {
    console.error(`❌ ${source} logs contain error markers.`);
    console.error('--- captured logs ---');
    console.error(logText.trim() || '<empty>');
    process.exit(1);
  }
}

function runStartupSmoke() {
  console.log('Starting built server startup smoke check...');

  const child = spawn(process.execPath, ['build/server/index.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let finished = false;

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const done = (code, signal) => {
    if (finished) {
      return;
    }

    finished = true;

    if ((code ?? 0) !== 0 && signal !== 'SIGTERM') {
      console.error('❌ Built server exited with error during startup smoke check.');

      if (stdout.trim()) {
        console.error('--- startup stdout ---');
        console.error(stdout.trim());
      }

      if (stderr.trim()) {
        console.error('--- startup stderr ---');
        console.error(stderr.trim());
      }

      process.exit(code ?? 1);
    }

    const combinedLogs = `${stdout}\n${stderr}`;
    assertNoErrorLogs(combinedLogs, 'Built server startup');

    console.log('✅ Built server startup smoke check passed.');
  };

  const timer = setTimeout(() => {
    if (finished) {
      return;
    }

    child.kill();
    done(0, 'SIGTERM');
  }, startupTimeoutMs);

  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    done(code, signal);
  });

  child.on('error', (error) => {
    clearTimeout(timer);

    if (!finished) {
      finished = true;
      const details = error instanceof Error ? error.message : String(error);
      console.error(`❌ Startup smoke check could not launch built server: ${details}`);
      process.exit(1);
    }
  });
}

function buildDockerImage() {
  console.log(
    `Building Docker image for smoke test: ${dockerImageTag} (dockerfile=${dockerfilePath}, context=${dockerBuildContext})`,
  );

  let result = runCommand('docker', [
    'build',
    '-f',
    dockerfilePath,
    '--target',
    dockerTarget,
    '-t',
    dockerImageTag,
    dockerBuildContext,
  ]);

  if ((result.status ?? 1) !== 0) {
    console.warn(`Docker target '${dockerTarget}' build failed, retrying without explicit target...`);
    result = runCommand('docker', ['build', '-f', dockerfilePath, '-t', dockerImageTag, dockerBuildContext]);
  }

  if ((result.status ?? 1) !== 0) {
    console.error('❌ Docker image build failed during smoke check.');
    process.exit(result.status ?? 1);
  }
}

function removeDockerContainer(containerRef = dockerContainerName) {
  runCommandCapture('docker', ['rm', '-f', containerRef]);
}

function removeDockerImage() {
  runCommandCapture('docker', ['rmi', dockerImageTag]);
}

async function runDockerContainerSmoke() {
  console.log('Starting Docker container smoke check...');
  ensureLogDir();
  console.log(`Docker smoke log mapping: ${hostLogDir} -> ${containerLogDir}`);

  removeDockerContainer();

  const runResult = runCommandCapture('docker', [
    'run',
    '-d',
    '--name',
    dockerContainerName,
    '-v',
    `${hostLogDir}:${containerLogDir}`,
    '-e',
    `BOLT_SMOKE_LOG_DIR=${containerLogDir}`,
    dockerImageTag,
  ]);

  if ((runResult.status ?? 1) !== 0) {
    console.error('❌ Docker container failed to start.');
    console.error(runResult.stderr || runResult.stdout || '<no output>');
    process.exit(runResult.status ?? 1);
  }

  const containerRef = (runResult.stdout || '').trim() || dockerContainerName;

  const start = Date.now();

  try {
    while (Date.now() - start < startupTimeoutMs) {
      const inspectResult = runCommandCapture('docker', [
        'inspect',
        '--format',
        '{{.State.Status}}|{{.State.Running}}|{{.State.ExitCode}}',
        containerRef,
      ]);

      if ((inspectResult.status ?? 1) !== 0) {
        const logs = writeContainerLogFile(containerRef, 'inspect-failed');
        console.error('❌ Docker container is not inspectable during smoke check.');
        if ((inspectResult.stderr || '').trim()) {
          console.error(inspectResult.stderr.trim());
        }
        console.error(logs.trim() || '<empty logs>');
        process.exit(1);
      }

      const [status, running, exitCode] = inspectResult.stdout.trim().split('|');

      if (running !== 'true') {
        const logs = writeContainerLogFile(containerRef, 'container-exited');
        console.error(`❌ Docker container exited early (status=${status}, exitCode=${exitCode}).`);
        console.error(logs.trim() || '<empty logs>');
        process.exit(1);
      }

      await sleep(1000);
    }

    const logs = writeContainerLogFile(containerRef, 'startup');
    assertNoErrorLogs(logs, 'Docker container startup');

    console.log('✅ Docker container startup smoke check passed with clean logs.');
  } finally {
    removeDockerContainer(containerRef);
    removeDockerImage();
  }
}

async function main() {
  checkDockerCli();
  runBuild();
  runStartupSmoke();
  buildDockerImage();
  await runDockerContainerSmoke();
}

main().catch((error) => {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`❌ Docker smoke script failed unexpectedly: ${details}`);
  process.exit(1);
});