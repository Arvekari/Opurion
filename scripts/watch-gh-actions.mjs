#!/usr/bin/env node

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = {
    sha: 'HEAD',
    repo: '',
    pollSeconds: 20,
    timeoutSeconds: 1800,
    detach: false,
    logFile: '',
    requireImagePublish: false,
    image: 'ghcr.io/arvekari/ebolt2',
    imageTag: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--sha' && argv[i + 1]) {
      args.sha = argv[++i];
    } else if (arg === '--repo' && argv[i + 1]) {
      args.repo = argv[++i];
    } else if (arg === '--poll' && argv[i + 1]) {
      args.pollSeconds = Number(argv[++i]) || 20;
    } else if (arg === '--timeout' && argv[i + 1]) {
      args.timeoutSeconds = Number(argv[++i]) || 1800;
    } else if (arg === '--detach') {
      args.detach = true;
    } else if (arg === '--log-file' && argv[i + 1]) {
      args.logFile = argv[++i];
    } else if (arg === '--require-image-publish') {
      args.requireImagePublish = true;
    } else if (arg === '--image' && argv[i + 1]) {
      args.image = argv[++i];
    } else if (arg === '--image-tag' && argv[i + 1]) {
      args.imageTag = argv[++i];
    }
  }

  return args;
}

function run(command) {
  return execSync(command, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function logger(logFile) {
  return {
    info(message) {
      const line = `[${nowIso()}] ${message}`;
      console.log(line);

      if (logFile) {
        mkdirSync(dirname(logFile), { recursive: true });
        appendFileSync(logFile, `${line}\n`, 'utf8');
      }
    },
    error(message) {
      const line = `[${nowIso()}] ERROR ${message}`;
      console.error(line);

      if (logFile) {
        mkdirSync(dirname(logFile), { recursive: true });
        appendFileSync(logFile, `${line}\n`, 'utf8');
      }
    },
  };
}

function getRepoFromOrigin() {
  const remoteUrl = run('git remote get-url origin');

  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/]+?)(\.git)?$/);

  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/);

  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  throw new Error(`Unable to parse GitHub repo from origin URL: ${remoteUrl}`);
}

function resolveSha(rawSha) {
  if (rawSha === 'HEAD') {
    return run('git rev-parse HEAD');
  }

  return rawSha;
}

function resolveImageTag(args, sha) {
  if (args.imageTag) {
    return args.imageTag;
  }

  return `sha-${sha.slice(0, 7)}`;
}

async function fetchRuns(repo, sha) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    'User-Agent': 'bolt2-dyi-gh-watcher',
    Accept: 'application/vnd.github+json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=100`, {
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${text}`);
  }

  const parsed = await response.json();
  const runs = Array.isArray(parsed.workflow_runs) ? parsed.workflow_runs : [];

  return runs.filter((runItem) => runItem.head_sha === sha);
}

function summarizeFailures(runs) {
  return runs
    .filter((runItem) => runItem.status === 'completed' && !['success', 'skipped'].includes(runItem.conclusion || ''))
    .map((runItem) => ({
      name: runItem.name,
      conclusion: runItem.conclusion,
      url: runItem.html_url,
    }));
}

function imageExists(imageRef) {
  try {
    run(`docker manifest inspect ${imageRef}`);
    return true;
  } catch {
    return false;
  }
}

async function waitForPublishedImage(args, sha, log) {
  const imageTag = resolveImageTag(args, sha);
  const imageRef = `${args.image}:${imageTag}`;
  const start = Date.now();

  log.info(`Verifying Docker image publication: ${imageRef}`);

  while (Date.now() - start < args.timeoutSeconds * 1000) {
    if (imageExists(imageRef)) {
      log.info(`Published image detected: ${imageRef}`);
      return;
    }

    log.info(`Image not published yet: ${imageRef}; waiting...`);
    await sleep(args.pollSeconds * 1000);
  }

  throw new Error(`Timed out waiting for published Docker image: ${imageRef}`);
}

async function watch(args) {
  const log = logger(args.logFile);

  const repo = args.repo || getRepoFromOrigin();
  const sha = resolveSha(args.sha);
  const hasToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);

  log.info(`Watching GitHub Actions for repo=${repo} sha=${sha}`);
  log.info(`GitHub API auth token present: ${hasToken ? 'yes' : 'no (using anonymous API limits)'}`);

  const start = Date.now();
  let observedRun = false;

  while (Date.now() - start < args.timeoutSeconds * 1000) {
    const runs = await fetchRuns(repo, sha);

    if (runs.length === 0) {
      log.info('No workflow runs found for SHA yet; waiting...');
      await sleep(args.pollSeconds * 1000);
      continue;
    }

    observedRun = true;

    const inProgress = runs.filter((runItem) => runItem.status !== 'completed');
    const failures = summarizeFailures(runs);

    const summary = runs
      .map((runItem) => `${runItem.name}:${runItem.status}/${runItem.conclusion || 'pending'}`)
      .join(' | ');

    log.info(`Runs: ${summary}`);

    if (inProgress.length > 0) {
      await sleep(args.pollSeconds * 1000);
      continue;
    }

    if (failures.length > 0) {
      failures.forEach((failure) => log.error(`Failure: ${failure.name} (${failure.conclusion}) ${failure.url}`));
      process.exit(1);
    }

    log.info('All workflows for this SHA completed without failures.');

    if (args.requireImagePublish) {
      await waitForPublishedImage(args, sha, log);
    }

    process.exit(0);
  }

  if (!observedRun) {
    log.error('Timed out waiting for workflows to appear for this SHA.');
  } else {
    log.error('Timed out waiting for workflows to complete.');
  }

  process.exit(1);
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const scriptPath = fileURLToPath(import.meta.url);

  if (args.detach) {
    const forwardArgs = process.argv.slice(2).filter((arg) => arg !== '--detach');
    const detachedLog = args.logFile || resolve('.git/gh-watch.log');

    const child = spawn(process.execPath, [scriptPath, ...forwardArgs, '--log-file', detachedLog], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();
    console.log(`Started detached GitHub Actions watcher. Log: ${detachedLog}`);
    process.exit(0);
  }

  try {
    await watch(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${nowIso()}] ERROR ${message}`);
    process.exit(1);
  }
})();
