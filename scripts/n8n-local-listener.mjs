#!/usr/bin/env node

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { resolveAgentIdentity, resolveListenerConfigPathForAgent } from './listener-config-resolution.mjs';

function nowIso() {
  return new Date().toISOString();
}

function normalizeReturnAddress(returnAddress = {}) {
  const protocol = String(returnAddress.protocol || 'http').trim() || 'http';
  const pathRaw = String(returnAddress.path || '/publish-status').trim() || '/publish-status';
  const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
  const port = Number(returnAddress.port || 8788);
  const fqdn = String(returnAddress.fqdn || '').trim();
  const ip = String(returnAddress.ip || '').trim();
  const preferred = String(returnAddress.hostSelection || returnAddress.mode || 'fqdn').trim().toLowerCase();
  const hostSelection = preferred === 'ip' ? 'ip' : 'fqdn';
  const selectedHost = hostSelection === 'ip' ? ip || fqdn : fqdn || ip;
  const callbackUrl = selectedHost ? `${protocol}://${selectedHost}${port ? `:${port}` : ''}${path}` : '';

  return {
    protocol,
    port,
    path,
    hostSelection,
    mode: hostSelection,
    fqdn,
    ip,
    host: selectedHost,
    callbackUrl,
  };
}

function loadConfig() {
  const resolution = resolveListenerConfigPathForAgent({ defaultPath: resolve('listener-config.json') });
  const configPath = resolution.path;
  const runtimeAgent = resolveAgentIdentity();
  const defaultConfig = {
    agent: {
      id: runtimeAgent.agentId,
      name: runtimeAgent.agentId,
      hostName: runtimeAgent.hostName,
    },
    listener: { host: '0.0.0.0', port: 8788 },
    returnAddress: {
      protocol: 'http',
      hostSelection: 'fqdn',
      fqdn: 'localhost',
      ip: '',
      port: 8788,
      path: '/publish-status',
    },
    endpoints: {
      health: '/health',
      config: '/config',
      publishStatus: '/publish-status',
      taskPush: '/task-push',
      taskKeepAlive: '/task-keepalive',
      feedbackStatus: '/feedback-loop/status',
    },
    storage: {
      inboxDir: 'bolt.work/n8n/copilot-inbox',
      publishStatusLatestFile: 'publish-status.latest.json',
      taskPushLatestFile: 'task-push.latest.json',
      taskPushPromptFile: 'task-push.latest-prompt.md',
      taskPushHistoryDir: 'task-push-history',
      taskKeepAliveLatestFile: 'task-keepalive.latest.json',
      feedbackWatchdogLatestFile: 'feedback-watchdog.latest.json',
      callbackLatestFile: 'callback.latest.json',
      callbackLatestMarkdownFile: 'callback.latest.md',
      feedbackLoopCommandLatestFile: 'feedback-loop.command.latest.json',
      feedbackLoopCommandMarkdownFile: 'feedback-loop.command.latest.md',
      feedbackLoopCommandHistoryDir: 'feedback-loop-command-history',
      windowsSecurityRequestFile: 'windows-security-request.latest.json',
      windowsSecurityRequestMarkdownFile: 'windows-security-request.latest.md',
    },
    feedbackLoop: {
      enabled: true,
      inactivitySeconds: 300,
      checkIntervalSeconds: 20,
      promptCooldownSeconds: 120,
      emitFromWatchdog: false,
      emitFromCallbacks: true,
      minCommandIntervalSeconds: 180,
      continueCommand: 'pnpm run ongoing:auto:continue',
      restartCommand: 'pnpm run ongoing:cycle -- scan',
    },
    network: {
      allowedSourceHosts: ['127.0.0.1', '::1', 'localhost', '172.17.132.201'],
    },
    vscodeGuard: {
      enabled: true,
      checkIntervalSeconds: 20,
      processNames: ['Code.exe', 'code.exe', 'Code - Insiders.exe', 'Code - OSS.exe'],
    },
    n8nQueue: {
      enabled: true,
      workflowName: 'Project-bolt2-machine-task-push-sync',
      tableName: 'Project-bolt2-machine-task-queue',
    },
  };

  if (!existsSync(configPath)) {
    return {
      ...defaultConfig,
      returnAddress: normalizeReturnAddress(defaultConfig.returnAddress),
    };
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf8'));

  const mergedConfig = {
    ...defaultConfig,
    ...raw,
    agent: { ...defaultConfig.agent, ...(raw.agent || {}) },
    listener: { ...defaultConfig.listener, ...(raw.listener || {}) },
    returnAddress: { ...defaultConfig.returnAddress, ...(raw.returnAddress || {}) },
    endpoints: { ...defaultConfig.endpoints, ...(raw.endpoints || {}) },
    storage: { ...defaultConfig.storage, ...(raw.storage || {}) },
    network: { ...defaultConfig.network, ...(raw.network || {}) },
    vscodeGuard: { ...defaultConfig.vscodeGuard, ...(raw.vscodeGuard || {}) },
    n8nQueue: { ...defaultConfig.n8nQueue, ...(raw.n8nQueue || {}) },
    feedbackLoop: { ...defaultConfig.feedbackLoop, ...(raw.feedbackLoop || {}) },
  };

  mergedConfig.returnAddress = normalizeReturnAddress(mergedConfig.returnAddress);
  mergedConfig.agent = {
    ...mergedConfig.agent,
    id: String(mergedConfig.agent?.id || runtimeAgent.agentId).trim() || runtimeAgent.agentId,
    name: String(mergedConfig.agent?.name || mergedConfig.agent?.id || runtimeAgent.agentId).trim() || runtimeAgent.agentId,
    hostName: String(mergedConfig.agent?.hostName || runtimeAgent.hostName).trim() || runtimeAgent.hostName,
    configResolution: resolution.mode,
  };
  return mergedConfig;
}

function run(command) {
  return execSync(command, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}

function runPowerShell(command) {
  const escaped = String(command || '').replace(/"/g, '\\"');
  return run(`powershell -NoProfile -Command "${escaped}"`);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
}

function isWindows() {
  return process.platform === 'win32';
}

function writeWindowsSecurityRequest(filePath, payload) {
  const content = {
    createdAt: nowIso(),
    status: 'action-required',
    area: 'windows-security-center-firewall',
    ...payload,
  };

  writeJsonFile(filePath, content);
  return content;
}

function resolveWindowsSecurityRequest(requestPath, requestMarkdownPath, payload = {}) {
  const content = {
    createdAt: nowIso(),
    status: 'resolved',
    area: 'windows-security-center-firewall',
    ...payload,
  };

  writeJsonFile(requestPath, content);

  if (requestMarkdownPath) {
    writeFileSync(requestMarkdownPath, toWindowsSecurityRequestMarkdown(content), 'utf8');
  }

  return content;
}

function toWindowsSecurityRequestMarkdown(payload) {
  const products = Array.isArray(payload?.securityProducts) ? payload.securityProducts : [];
  const lines = [
    '# Windows Port Open Request',
    '',
    `- CreatedAt: ${payload?.createdAt || nowIso()}`,
    `- Reason: ${payload?.reason || 'listener-port-open-request'}`,
    `- Host: ${payload?.listener?.host || ''}`,
    `- Port: ${payload?.listener?.port || ''}`,
    `- Protocol: ${payload?.listener?.protocol || 'tcp'}`,
    `- RequiredAction: ${payload?.requiredAction || ''}`,
    '',
    '## Security Products',
  ];

  if (products.length === 0) {
    lines.push('- none-detected');
  } else {
    for (const product of products) {
      lines.push(`- ${product}`);
    }
  }

  lines.push('', '## Port State', '```json', JSON.stringify(payload?.portState || {}, null, 2), '```', '');
  return lines.join('\n');
}

function openWindowsSecurityCenter() {
  if (!isWindows()) {
    return false;
  }

  try {
    runPowerShell("Start-Process 'windowsdefender://FirewallAndNetworkProtection'");
    return true;
  } catch {
    try {
      run('control.exe /name Microsoft.WindowsFirewall');
      return true;
    } catch {
      return false;
    }
  }
}

function showWindowsPortAlertPopup(port, reason) {
  if (!isWindows()) {
    return false;
  }

  const normalizedPort = Number(port || 8788);
  const message =
    `Port action required for n8n local listener.\n\n` +
    `Please open inbound TCP port ${normalizedPort} in your security product or Windows Firewall.\n\n` +
    `Reason: ${reason || 'port-open-request-forwarding-failed'}`;

  try {
    const command =
      `Add-Type -AssemblyName PresentationFramework; ` +
      `[System.Windows.MessageBox]::Show('${message.replace(/'/g, "''")}', 'Bolt2 Listener Port Alert', 'OK', 'Warning') | Out-Null`;
    runPowerShell(command);
    return true;
  } catch {
    // continue to fallback
  }

  try {
    const vbs =
      `Set WshShell = CreateObject("WScript.Shell")\n` +
      `WshShell.Popup "${message.replace(/"/g, '""').replace(/\n/g, ' ')}", 0, "Bolt2 Listener Port Alert", 48`;
    const tempPath = resolve('bolt.work', 'n8n', 'popup-alert.vbs');
    mkdirSync(resolve(tempPath, '..'), { recursive: true });
    writeFileSync(tempPath, vbs, 'utf8');
    run(`wscript.exe "${tempPath}"`);
    return true;
  } catch {
    // continue to fallback
  }

  try {
    const msgText = `Bolt2 Listener Port Alert: Open inbound TCP ${normalizedPort}. Reason: ${reason || 'port-open-request'}`;
    run(`msg.exe * "${msgText.replace(/"/g, "'")}"`);
    return true;
  } catch {
    return false;
  }
}

function getWindowsSecurityProducts() {
  if (!isWindows()) {
    return [];
  }

  const command =
    `$result = @{ antivirus = @(); firewall = @() }; ` +
    `try { $av = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop | Select-Object -ExpandProperty displayName; if ($av) { $result.antivirus = @($av) } } catch {} ` +
    `try { $fw = Get-CimInstance -Namespace root/SecurityCenter2 -ClassName FirewallProduct -ErrorAction Stop | Select-Object -ExpandProperty displayName; if ($fw) { $result.firewall = @($fw) } } catch {} ` +
    `$result | ConvertTo-Json -Depth 5`;

  try {
    const output = runPowerShell(command);
    const parsed = safeJsonParse(output, { antivirus: [], firewall: [] });
    const antivirus = Array.isArray(parsed?.antivirus) ? parsed.antivirus : [];
    const firewall = Array.isArray(parsed?.firewall) ? parsed.firewall : [];

    return [...new Set([...antivirus, ...firewall].map((item) => String(item || '').trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function evaluateWindowsPortOpenState(port) {
  if (!isWindows()) {
    return {
      supported: false,
      ok: true,
      reason: 'non-windows-platform',
    };
  }

  const normalizedPort = Number(port || 8788);
  const checkRuleCommand =
    `$port='${normalizedPort}'; ` +
    `$hasRule = Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue ` +
    `| Get-NetFirewallPortFilter -ErrorAction SilentlyContinue ` +
    `| Where-Object { $_.Protocol -eq 'TCP' -and ($_.LocalPort -eq $port -or $_.LocalPort -eq 'Any') } ` +
    `| Select-Object -First 1; ` +
    `if ($null -eq $hasRule) { 'MISSING' } else { 'FOUND' }`;

  try {
    const checkResult = runPowerShell(checkRuleCommand);

    if (String(checkResult).includes('FOUND')) {
      return {
        supported: true,
        ok: true,
        check: 'inbound-allow-rule-found',
        port: normalizedPort,
      };
    }

    return {
      supported: true,
      ok: false,
      check: 'inbound-allow-rule-missing',
      port: normalizedPort,
    };
  } catch (error) {
    return {
      supported: true,
      ok: false,
      check: 'check-failed',
      port: normalizedPort,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createPortOpenRequestPayload({ host, port, reason, portState, securityProducts, extra }) {
  return {
    reason,
    listener: {
      host,
      port,
      protocol: 'tcp',
    },
    securityProducts,
    requestForwarding: {
      forwardedToProducts: securityProducts,
      forwardedToWindowsSecurityCenter: true,
    },
    portState,
    requiredAction: `Open inbound TCP port ${port} for listener host ${host}.`,
    ...extra,
  };
}

function forwardPortOpenRequest({ requestPath, requestMarkdownPath, requestPayload }) {
  let writeOk = false;
  let markdownWriteOk = false;
  let opened = false;
  let writeError = '';

  try {
    const content = writeWindowsSecurityRequest(requestPath, requestPayload);

    if (requestMarkdownPath) {
      writeFileSync(requestMarkdownPath, toWindowsSecurityRequestMarkdown(content), 'utf8');
      markdownWriteOk = true;
    }

    writeOk = true;
  } catch (error) {
    writeError = error instanceof Error ? error.message : String(error);
  }

  opened = openWindowsSecurityCenter();

  const forwarded = writeOk && requestPayload.securityProducts.length > 0;

  return {
    forwarded,
    writeOk,
    markdownWriteOk,
    opened,
    writeError,
  };
}

function isVsCodeRunning(processNames) {
  const names = (processNames || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean);

  if (names.length === 0) {
    return true;
  }

  try {
    if (process.platform === 'win32') {
      const output = run('tasklist');
      const normalized = output.toLowerCase();
      return names.some((name) => normalized.includes(name));
    }

    const output = run('ps -A -o comm');
    const normalized = output.toLowerCase();
    return names.some((name) => normalized.includes(name.replace('.exe', '')));
  } catch {
    return true;
  }
}

function writeJsonFile(filePath, payload) {
  mkdirSync(resolve(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJsonBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', (error) => rejectBody(error));
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();

        if (!text) {
          resolveBody({});
          return;
        }

        resolveBody(JSON.parse(text));
      } catch (error) {
        rejectBody(error);
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function toPrompt(payload) {
  const status = String(payload.status || 'unknown').trim();
  const source = String(payload.source || 'n8n').trim();
  const title = String(payload.title || payload.objective || payload.summary || '').trim();
  const taskId = String(payload.taskId || '').trim();
  const details = String(payload.details || payload.description || '').trim();

  const lines = [
    'New n8n task push received.',
    `Source: ${source}`,
    `Status: ${status}`,
  ];

  if (taskId) {
    lines.push(`TaskId: ${taskId}`);
  }

  if (title) {
    lines.push(`Objective: ${title}`);
  }

  if (details) {
    lines.push('', details);
  }

  lines.push('', 'Validate against .ongoing-work.md and continue the highest-priority open objective.');
  return lines.join('\n');
}

function truncateText(value, maxLength = 800) {
  const text = String(value || '');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`;
}

const SENSITIVE_FIELD_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'x-n8n-api-key',
  'api-key',
  'apikey',
  'token',
  'access_token',
  'refresh_token',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'client_secret',
]);

function sanitizePayloadForStorage(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayloadForStorage(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output = {};

  for (const [key, nested] of Object.entries(value)) {
    const keyToken = String(key || '').trim().toLowerCase();

    if (SENSITIVE_FIELD_NAMES.has(keyToken)) {
      output[key] = '[redacted]';
      continue;
    }

    output[key] = sanitizePayloadForStorage(nested);
  }

  return output;
}

function normalizeCallbackPayload(rawPayload = {}) {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return {};
  }

  if (rawPayload.payload && typeof rawPayload.payload === 'object') {
    return {
      ...rawPayload,
      ...rawPayload.payload,
    };
  }

  return rawPayload;
}

function buildCallbackSummary(type, envelope) {
  const payload = normalizeCallbackPayload(envelope?.payload || {});

  return {
    type,
    receivedAt: envelope?.receivedAt || nowIso(),
    endpoint: envelope?.endpoint || '',
    remoteHost: envelope?.remoteHost || '',
    source: String(payload.source || payload.workflow || 'n8n').trim(),
    workflow: String(payload.workflow || '').trim(),
    status: String(payload.status || payload.deliveryStatus || 'accepted').trim(),
    taskId: String(payload.taskId || '').trim(),
    title: String(payload.title || payload.objective || payload.text || '').trim(),
    callbackUrl: String(payload.callbackUrl || '').trim(),
    deliveryError: String(payload.deliveryError || '').trim(),
    payloadPreview: truncateText(JSON.stringify(payload, null, 2), 1200),
  };
}

function toCallbackMarkdown(summary) {
  const lines = ['# Callback Latest', '', `- ReceivedAt: ${summary.receivedAt}`, `- Type: ${summary.type}`, `- Endpoint: ${summary.endpoint}`, `- RemoteHost: ${summary.remoteHost}`, `- Source: ${summary.source}`, `- Workflow: ${summary.workflow || 'n/a'}`, `- Status: ${summary.status}`];

  if (summary.taskId) {
    lines.push(`- TaskId: ${summary.taskId}`);
  }

  if (summary.title) {
    lines.push(`- Title: ${summary.title}`);
  }

  if (summary.callbackUrl) {
    lines.push(`- CallbackUrl: ${summary.callbackUrl}`);
  }

  if (summary.deliveryError) {
    lines.push(`- DeliveryError: ${summary.deliveryError}`);
  }

  lines.push('', '## Payload Preview', '```json', summary.payloadPreview, '```', '');
  return lines.join('\n');
}

function emitCallbackOutput(summary, callbackLatestPath, callbackLatestMarkdownPath) {
  console.log(`[${nowIso()}] CALLBACK_RECEIVED type=${summary.type} endpoint=${summary.endpoint} source=${summary.source} status=${summary.status} taskId=${summary.taskId || 'n/a'}`);

  if (summary.title) {
    console.log(`[${nowIso()}] CALLBACK_TITLE ${summary.title}`);
  }

  if (summary.callbackUrl) {
    console.log(`[${nowIso()}] CALLBACK_URL ${summary.callbackUrl}`);
  }

  if (summary.deliveryError) {
    console.log(`[${nowIso()}] CALLBACK_DELIVERY_ERROR ${summary.deliveryError}`);
  }

  console.log(`[${nowIso()}] CALLBACK_OUTPUT_FILES json=${callbackLatestPath} markdown=${callbackLatestMarkdownPath}`);
}

function buildFeedbackLoopCommand(payload = {}, options = {}) {
  const normalized = normalizeCallbackPayload(payload);
  const explicitCommand = String(normalized.command || (normalized.feedbackLoop || {}).command || '').trim();
  const continueCommand = String(options.continueCommand || 'pnpm run ongoing:auto:continue').trim();
  const restartCommand = String(options.restartCommand || 'pnpm run ongoing:cycle -- scan').trim();
  const status = String(normalized.status || normalized.deliveryStatus || normalized.result || '').trim().toLowerCase();
  const action = String(normalized.action || normalized.nextAction || '').trim().toLowerCase();
  const jobPulse = String(normalized.jobPulse || '').trim().toLowerCase();
  const queueState = String(normalized.queueState || '').trim().toLowerCase();
  const finalRemark = String(normalized.finalRemark || '').trim().toLowerCase();

  if (explicitCommand) {
    return {
      shouldEmit: true,
      command: explicitCommand,
      reason: 'explicit-command',
    };
  }

  const restartSignal =
    queueState === 'empty' ||
    action.includes('restart-cycle') ||
    jobPulse.includes('start-new-ongoing') ||
    finalRemark.includes('start a new ongoing-work scan') ||
    finalRemark.includes('start-new-ongoing-check-job');

  if (restartSignal) {
    return {
      shouldEmit: true,
      command: restartCommand,
      reason: 'cycle-restart-signal',
    };
  }

  const continueSignal =
    status.includes('partial') ||
    status.includes('in_progress') ||
    action.includes('continue') ||
    jobPulse.includes('continue') ||
    finalRemark.includes('continue') ||
    finalRemark.includes('autonomous_execution_continues') ||
    finalRemark.includes('autonomous_continue_no_confirmation');

  if (continueSignal) {
    return {
      shouldEmit: true,
      command: continueCommand,
      reason: 'continue-signal',
    };
  }

  return {
    shouldEmit: false,
    command: '',
    reason: 'no-feedback-signal',
  };
}

function toFeedbackCommandMarkdown(commandPayload) {
  const lines = [
    '# Feedback Loop Command',
    '',
    `- GeneratedAt: ${commandPayload.generatedAt}`,
    `- Endpoint: ${commandPayload.endpoint}`,
    `- Source: ${commandPayload.source || 'n8n'}`,
    `- Reason: ${commandPayload.reason}`,
    `- Status: ${commandPayload.status || 'n/a'}`,
    `- TaskId: ${commandPayload.taskId || 'n/a'}`,
    '',
    '## Command',
    `- ${commandPayload.command}`,
    '',
  ];

  if (commandPayload.title) {
    lines.push('## Title', commandPayload.title, '');
  }

  return lines.join('\n');
}

function emitFeedbackCommandOutput(commandPayload, latestPath, markdownPath) {
  console.log(
    `[${nowIso()}] FEEDBACK_LOOP_COMMAND reason=${commandPayload.reason} command="${commandPayload.command}" source=${commandPayload.source || 'n8n'} taskId=${commandPayload.taskId || 'n/a'}`,
  );
  console.log(`[${nowIso()}] FEEDBACK_LOOP_FILES json=${latestPath} markdown=${markdownPath}`);
}

function persistFeedbackCommandArtifacts({
  envelope,
  commandInfo,
  latestPath,
  markdownPath,
  historyDir,
}) {
  const payload = normalizeCallbackPayload(envelope?.payload || {});
  const commandPayload = {
    generatedAt: nowIso(),
    endpoint: envelope?.endpoint || '',
    remoteHost: envelope?.remoteHost || '',
    source: String(payload.source || payload.workflow || 'n8n').trim(),
    status: String(payload.status || payload.deliveryStatus || payload.result || '').trim(),
    taskId: String(payload.taskId || '').trim(),
    title: String(payload.title || payload.objective || payload.text || '').trim(),
    reason: commandInfo.reason,
    command: commandInfo.command,
    payload,
  };

  writeJsonFile(latestPath, commandPayload);
  writeFileSync(markdownPath, toFeedbackCommandMarkdown(commandPayload), 'utf8');

  const historyPath = resolve(historyDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeJsonFile(historyPath, commandPayload);

  emitFeedbackCommandOutput(commandPayload, latestPath, markdownPath);

  return {
    command: commandPayload.command,
    reason: commandPayload.reason,
    latestFile: latestPath,
    markdownFile: markdownPath,
    historyFile: historyPath,
  };
}

function getRemoteHost(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function normalizeHostToken(value) {
  let host = String(value || '').trim().toLowerCase();

  if (!host) {
    return '';
  }

  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  if (host.startsWith('::ffff:')) {
    host = host.slice('::ffff:'.length);
  }

  const colonCount = (host.match(/:/g) || []).length;

  if (host.includes(':') && colonCount === 1) {
    const parts = host.split(':');
    const maybePort = parts[1] || '';

    if (/^\d+$/.test(maybePort)) {
      host = parts[0];
    }
  }

  return host;
}

function isAllowedRemoteHost(remoteHost, allowedHostsSet) {
  if (!allowedHostsSet || allowedHostsSet.size === 0) {
    return true;
  }

  const normalizedRemote = normalizeHostToken(remoteHost);

  if (allowedHostsSet.has(normalizedRemote)) {
    return true;
  }

  if (normalizedRemote === '::1' && (allowedHostsSet.has('127.0.0.1') || allowedHostsSet.has('localhost'))) {
    return true;
  }

  if (normalizedRemote === '127.0.0.1' && (allowedHostsSet.has('::1') || allowedHostsSet.has('localhost'))) {
    return true;
  }

  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const configResolution = resolveListenerConfigPathForAgent({ defaultPath: resolve('listener-config.json') });
  const configPath = configResolution.path;
  const config = loadConfig();

  if (args.includes('--print-config')) {
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  if (args.includes('--print-return-address')) {
    console.log(JSON.stringify(config.returnAddress, null, 2));
    return;
  }

  const inboxDir = resolve(config.storage.inboxDir);
  const publishStatusLatestPath = resolve(inboxDir, config.storage.publishStatusLatestFile);
  const taskPushLatestPath = resolve(inboxDir, config.storage.taskPushLatestFile);
  const taskPushPromptPath = resolve(inboxDir, config.storage.taskPushPromptFile);
  const taskPushHistoryDir = resolve(inboxDir, config.storage.taskPushHistoryDir);
  const taskKeepAliveLatestPath = resolve(inboxDir, config.storage.taskKeepAliveLatestFile);
  const feedbackWatchdogLatestPath = resolve(inboxDir, config.storage.feedbackWatchdogLatestFile);
  const callbackLatestPath = resolve(inboxDir, config.storage.callbackLatestFile);
  const callbackLatestMarkdownPath = resolve(inboxDir, config.storage.callbackLatestMarkdownFile);
  const feedbackLoopCommandLatestPath = resolve(inboxDir, config.storage.feedbackLoopCommandLatestFile);
  const feedbackLoopCommandMarkdownPath = resolve(inboxDir, config.storage.feedbackLoopCommandMarkdownFile);
  const feedbackLoopCommandHistoryDir = resolve(inboxDir, config.storage.feedbackLoopCommandHistoryDir);
  const windowsSecurityRequestPath = resolve(inboxDir, config.storage.windowsSecurityRequestFile);
  const windowsSecurityRequestMarkdownPath = resolve(inboxDir, config.storage.windowsSecurityRequestMarkdownFile);

  mkdirSync(inboxDir, { recursive: true });
  mkdirSync(taskPushHistoryDir, { recursive: true });
  mkdirSync(feedbackLoopCommandHistoryDir, { recursive: true });

  const allowedHosts = new Set((config.network.allowedSourceHosts || []).map((item) => normalizeHostToken(item)).filter(Boolean));

  const feedbackState = {
    lastHeardAt: '',
    lastKeepAliveAt: '',
    lastTaskId: '',
    lastSource: '',
    active: false,
    lastPromptedAt: '',
    lastPromptReason: '',
    lastCommandAt: '',
    lastCommand: '',
    lastCommandTaskId: '',
    emittedCommandKeys: new Set(),
  };

  function clearEmittedCommandKeysForTask(taskId) {
    const normalizedTaskId = String(taskId || '').trim();

    if (!normalizedTaskId) {
      return;
    }

    for (const key of feedbackState.emittedCommandKeys) {
      if (key.endsWith(`|${normalizedTaskId}`)) {
        feedbackState.emittedCommandKeys.delete(key);
      }
    }
  }

  function writeFeedbackWatchdogState(extra = {}) {
    writeJsonFile(feedbackWatchdogLatestPath, {
      updatedAt: nowIso(),
      active: feedbackState.active,
      lastHeardAt: feedbackState.lastHeardAt,
      lastKeepAliveAt: feedbackState.lastKeepAliveAt,
      lastTaskId: feedbackState.lastTaskId,
      lastSource: feedbackState.lastSource,
      lastPromptedAt: feedbackState.lastPromptedAt,
      lastPromptReason: feedbackState.lastPromptReason,
      ...extra,
    });
  }

  function updateFeedbackState(payload = {}, envelope = {}, source = 'callback') {
    const normalized = normalizeCallbackPayload(payload);
    const now = nowIso();
    const status = String(normalized.status || normalized.deliveryStatus || normalized.result || '').trim().toLowerCase();
    const taskId = String(normalized.taskId || '').trim();
    const explicitActive = typeof normalized.activeTask === 'boolean' ? normalized.activeTask : null;

    feedbackState.lastHeardAt = now;
    feedbackState.lastSource = source;

    if (taskId) {
      feedbackState.lastTaskId = taskId;
    }

    if (source === 'keepalive') {
      feedbackState.lastKeepAliveAt = now;
      feedbackState.active = true;
    }

    if (explicitActive !== null) {
      feedbackState.active = explicitActive;
    } else if (status) {
      if (['done', 'completed', 'success', 'closed', 'cancelled', 'failed'].includes(status)) {
        feedbackState.active = false;
        clearEmittedCommandKeysForTask(taskId || feedbackState.lastTaskId);
      } else if (['partial', 'in_progress', 'queued', 'running', 'accepted'].includes(status)) {
        feedbackState.active = true;
      }
    } else if (taskId) {
      feedbackState.active = true;
    }

    writeFeedbackWatchdogState({
      source,
      endpoint: envelope?.endpoint || '',
      status,
    });
  }

  function shouldEmitFeedbackCommand(commandInfo, payload = {}, source = 'callback') {
    if (!commandInfo?.shouldEmit) {
      return {
        shouldEmit: false,
        reason: 'no-feedback-signal',
      };
    }

    if (source === 'watchdog' && !config.feedbackLoop?.emitFromWatchdog) {
      return {
        shouldEmit: false,
        reason: 'watchdog-emission-disabled',
      };
    }

    if (source !== 'watchdog' && config.feedbackLoop?.emitFromCallbacks === false) {
      return {
        shouldEmit: false,
        reason: 'callback-emission-disabled',
      };
    }

    const nowMs = Date.now();
    const minIntervalSeconds = Math.max(1, Number(config.feedbackLoop?.minCommandIntervalSeconds || 180));

    if (feedbackState.lastCommandAt) {
      const lastMs = Date.parse(feedbackState.lastCommandAt);

      if (Number.isFinite(lastMs) && (nowMs - lastMs) / 1000 < minIntervalSeconds) {
        return {
          shouldEmit: false,
          reason: 'command-min-interval',
        };
      }
    }

    const normalized = normalizeCallbackPayload(payload);
    const taskId = String(normalized.taskId || feedbackState.lastTaskId || 'no-task').trim() || 'no-task';
    const command = String(commandInfo.command || '').trim();
    const emissionKey = `${command}|${taskId}`;

    if (feedbackState.emittedCommandKeys.has(emissionKey)) {
      return {
        shouldEmit: false,
        reason: 'duplicate-command-task',
      };
    }

    return {
      shouldEmit: true,
      reason: '',
      emissionKey,
      taskId,
    };
  }

  function markFeedbackCommandEmitted(command, taskId, emissionKey) {
    feedbackState.lastCommandAt = nowIso();
    feedbackState.lastCommand = String(command || '').trim();
    feedbackState.lastCommandTaskId = String(taskId || '').trim();

    if (emissionKey) {
      feedbackState.emittedCommandKeys.add(emissionKey);
    }
  }

  function tryEmitWatchdogContinueCommand() {
    if (!config.feedbackLoop?.enabled || !feedbackState.active) {
      return;
    }

    const nowMs = Date.now();
    const inactivitySeconds = Math.max(1, Number(config.feedbackLoop.inactivitySeconds || 300));
    const cooldownSeconds = Math.max(1, Number(config.feedbackLoop.promptCooldownSeconds || 120));
    const lastSignalIso = feedbackState.lastKeepAliveAt || feedbackState.lastHeardAt;

    if (!lastSignalIso) {
      return;
    }

    const lastSignalMs = Date.parse(lastSignalIso);

    if (!Number.isFinite(lastSignalMs)) {
      return;
    }

    const silentForSeconds = (nowMs - lastSignalMs) / 1000;

    if (silentForSeconds < inactivitySeconds) {
      return;
    }

    if (feedbackState.lastPromptedAt) {
      const lastPromptedMs = Date.parse(feedbackState.lastPromptedAt);

      if (Number.isFinite(lastPromptedMs) && (nowMs - lastPromptedMs) / 1000 < cooldownSeconds) {
        return;
      }
    }

    const watchdogEnvelope = {
      receivedAt: nowIso(),
      endpoint: 'feedback-watchdog',
      remoteHost: 'local-watchdog',
      payload: {
        source: 'listener-feedback-watchdog',
        status: 'partial',
        taskId: feedbackState.lastTaskId || 'watchdog-active-task',
        title: 'No keepalive received recently; continue objective execution.',
      },
    };

    const watchdogCommandInfo = {
      shouldEmit: true,
      command: String(config.feedbackLoop.continueCommand || 'pnpm run ongoing:auto:continue').trim(),
      reason: 'watchdog-inactivity-timeout',
    };
    const watchdogDecision = shouldEmitFeedbackCommand(watchdogCommandInfo, watchdogEnvelope.payload, 'watchdog');

    if (!watchdogDecision.shouldEmit) {
      writeFeedbackWatchdogState({
        source: 'watchdog',
        silentForSeconds: Math.round(silentForSeconds),
        inactivityThresholdSeconds: inactivitySeconds,
        skippedReason: watchdogDecision.reason,
      });
      return;
    }

    const feedbackCommand = persistFeedbackCommandArtifacts({
      envelope: watchdogEnvelope,
      commandInfo: watchdogCommandInfo,
      latestPath: feedbackLoopCommandLatestPath,
      markdownPath: feedbackLoopCommandMarkdownPath,
      historyDir: feedbackLoopCommandHistoryDir,
    });
    markFeedbackCommandEmitted(feedbackCommand.command, watchdogDecision.taskId, watchdogDecision.emissionKey);

    feedbackState.lastPromptedAt = nowIso();
    feedbackState.lastPromptReason = feedbackCommand.reason;

    writeFeedbackWatchdogState({
      source: 'watchdog',
      silentForSeconds: Math.round(silentForSeconds),
      inactivityThresholdSeconds: inactivitySeconds,
      command: feedbackCommand.command,
      commandFile: feedbackCommand.latestFile,
    });
  }

  const server = createServer(async (req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const remoteHost = getRemoteHost(req);

    if (method === 'GET' && pathname === config.endpoints.health) {
      sendJson(res, 200, {
        status: 'ok',
        service: 'n8n-local-listener',
        now: nowIso(),
      });
      return;
    }

    if (method === 'GET' && pathname === config.endpoints.config) {
      sendJson(res, 200, {
        agent: config.agent,
        listener: config.listener,
        returnAddress: config.returnAddress,
        callbackUrl: config.returnAddress.callbackUrl,
        endpoints: config.endpoints,
        feedbackLoop: config.feedbackLoop,
      });
      return;
    }

    if (method === 'GET' && pathname === config.endpoints.feedbackStatus) {
      sendJson(res, 200, {
        status: 'ok',
        feedbackLoop: {
          ...config.feedbackLoop,
          state: feedbackState,
        },
        file: feedbackWatchdogLatestPath,
      });
      return;
    }

    if (
      method === 'POST' &&
      (pathname === config.endpoints.publishStatus || pathname === config.endpoints.taskPush || pathname === config.endpoints.taskKeepAlive)
    ) {
      if (!isAllowedRemoteHost(remoteHost, allowedHosts)) {
        console.warn(
          `[${nowIso()}] CALLBACK_REJECTED reason=source-host-not-allowed endpoint=${pathname} remoteHost=${remoteHost} normalizedRemoteHost=${normalizeHostToken(remoteHost)} allowedHosts=${Array.from(allowedHosts).join(',')}`,
        );
        sendJson(res, 403, {
          status: 'forbidden',
          reason: 'source-host-not-allowed',
          remoteHost,
          normalizedRemoteHost: normalizeHostToken(remoteHost),
          allowedHosts: Array.from(allowedHosts),
        });
        return;
      }

      let body;

      try {
        body = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, {
          status: 'bad-request',
          reason: 'invalid-json',
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const envelope = {
        receivedAt: nowIso(),
        endpoint: pathname,
        remoteHost,
        payload: sanitizePayloadForStorage(body),
      };

      if (pathname === config.endpoints.taskKeepAlive) {
        writeJsonFile(taskKeepAliveLatestPath, envelope);
        updateFeedbackState(body || {}, envelope, 'keepalive');

        const summary = buildCallbackSummary('task-keepalive', envelope);
        writeJsonFile(callbackLatestPath, {
          summary,
          envelope,
        });
        writeFileSync(callbackLatestMarkdownPath, toCallbackMarkdown(summary), 'utf8');
        emitCallbackOutput(summary, callbackLatestPath, callbackLatestMarkdownPath);

        sendJson(res, 202, {
          status: 'accepted',
          type: 'task-keepalive',
          file: taskKeepAliveLatestPath,
          callbackLatestFile: callbackLatestPath,
          callbackLatestMarkdownFile: callbackLatestMarkdownPath,
          feedbackStatusFile: feedbackWatchdogLatestPath,
          active: feedbackState.active,
          lastHeardAt: feedbackState.lastHeardAt,
          lastKeepAliveAt: feedbackState.lastKeepAliveAt,
          lastTaskId: feedbackState.lastTaskId,
        });
        return;
      }

      if (pathname === config.endpoints.publishStatus) {
        writeJsonFile(publishStatusLatestPath, envelope);
        updateFeedbackState(body || {}, envelope, 'publish-status');

        const summary = buildCallbackSummary('publish-status', envelope);
        writeJsonFile(callbackLatestPath, {
          summary,
          envelope,
        });
        writeFileSync(callbackLatestMarkdownPath, toCallbackMarkdown(summary), 'utf8');
        emitCallbackOutput(summary, callbackLatestPath, callbackLatestMarkdownPath);

        let feedbackCommand = null;
        const feedbackCommandInfo = buildFeedbackLoopCommand(body || {}, {
          continueCommand: config.feedbackLoop?.continueCommand,
          restartCommand: config.feedbackLoop?.restartCommand,
        });

        const feedbackDecision = shouldEmitFeedbackCommand(feedbackCommandInfo, body || {}, 'publish-status');

        if (feedbackDecision.shouldEmit) {
          feedbackCommand = persistFeedbackCommandArtifacts({
            envelope,
            commandInfo: feedbackCommandInfo,
            latestPath: feedbackLoopCommandLatestPath,
            markdownPath: feedbackLoopCommandMarkdownPath,
            historyDir: feedbackLoopCommandHistoryDir,
          });
          markFeedbackCommandEmitted(feedbackCommand.command, feedbackDecision.taskId, feedbackDecision.emissionKey);
        }

        sendJson(res, 202, {
          status: 'accepted',
          type: 'publish-status',
          file: publishStatusLatestPath,
          callbackLatestFile: callbackLatestPath,
          callbackLatestMarkdownFile: callbackLatestMarkdownPath,
          feedbackLoopCommand: feedbackCommand?.command || '',
          feedbackLoopCommandReason: feedbackCommand?.reason || '',
          feedbackLoopCommandFile: feedbackCommand?.latestFile || '',
          feedbackLoopCommandMarkdownFile: feedbackCommand?.markdownFile || '',
        });
        return;
      }

      writeJsonFile(taskPushLatestPath, envelope);
      updateFeedbackState(body || {}, envelope, 'task-push');

      const historyPath = resolve(taskPushHistoryDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      writeJsonFile(historyPath, envelope);

      const prompt = toPrompt(body || {});
      writeFileSync(taskPushPromptPath, `${prompt}\n`, 'utf8');

      const summary = buildCallbackSummary('task-push', envelope);
      writeJsonFile(callbackLatestPath, {
        summary,
        envelope,
      });
      writeFileSync(callbackLatestMarkdownPath, toCallbackMarkdown(summary), 'utf8');
      emitCallbackOutput(summary, callbackLatestPath, callbackLatestMarkdownPath);

      let feedbackCommand = null;
      const feedbackCommandInfo = buildFeedbackLoopCommand(body || {}, {
        continueCommand: config.feedbackLoop?.continueCommand,
        restartCommand: config.feedbackLoop?.restartCommand,
      });

      const feedbackDecision = shouldEmitFeedbackCommand(feedbackCommandInfo, body || {}, 'task-push');

      if (feedbackDecision.shouldEmit) {
        feedbackCommand = persistFeedbackCommandArtifacts({
          envelope,
          commandInfo: feedbackCommandInfo,
          latestPath: feedbackLoopCommandLatestPath,
          markdownPath: feedbackLoopCommandMarkdownPath,
          historyDir: feedbackLoopCommandHistoryDir,
        });
        markFeedbackCommandEmitted(feedbackCommand.command, feedbackDecision.taskId, feedbackDecision.emissionKey);
      }

      sendJson(res, 202, {
        status: 'accepted',
        type: 'task-push',
        latestFile: taskPushLatestPath,
        historyFile: historyPath,
        promptFile: taskPushPromptPath,
        callbackLatestFile: callbackLatestPath,
        callbackLatestMarkdownFile: callbackLatestMarkdownPath,
        feedbackLoopCommand: feedbackCommand?.command || '',
        feedbackLoopCommandReason: feedbackCommand?.reason || '',
        feedbackLoopCommandFile: feedbackCommand?.latestFile || '',
        feedbackLoopCommandMarkdownFile: feedbackCommand?.markdownFile || '',
      });
      return;
    }

    sendJson(res, 404, {
      status: 'not-found',
      method,
      path: pathname,
    });
  });

  const host = String(config.listener.host || '0.0.0.0');
  const port = Number(config.listener.port || 8788);
  let guardInterval = null;
  let feedbackWatchdogInterval = null;

  const securityProducts = getWindowsSecurityProducts();
  const portState = evaluateWindowsPortOpenState(port);

  if (portState.supported && !portState.ok) {
    const requestPayload = createPortOpenRequestPayload({
      host,
      port,
      reason: 'listener-port-open-request',
      portState,
      securityProducts,
    });
    const forwardState = forwardPortOpenRequest({
      requestPath: windowsSecurityRequestPath,
      requestMarkdownPath: windowsSecurityRequestMarkdownPath,
      requestPayload,
    });

    console.log(`[${nowIso()}] WINDOWS_SECURITY_REQUEST created at ${windowsSecurityRequestPath}`);
    console.log(`[${nowIso()}] WINDOWS_SECURITY_REQUEST_MARKDOWN created at ${windowsSecurityRequestMarkdownPath}`);
    console.log(`[${nowIso()}] SECURITY_PRODUCTS_DETECTED ${securityProducts.join(', ') || 'none-detected'}`);
    console.log(
      `[${nowIso()}] WINDOWS_SECURITY_FORWARD forwarded=${forwardState.forwarded} writeOk=${forwardState.writeOk} markdownWriteOk=${forwardState.markdownWriteOk} opened=${forwardState.opened}`,
    );

    const popupShown = showWindowsPortAlertPopup(
      port,
      forwardState.forwarded ? 'security-request-created' : 'security-request-forwarding-failed',
    );
    console.error(`[${nowIso()}] WINDOWS_PORT_ALERT popup=${popupShown ? 'shown' : 'failed'} tcp=${port}`);
  } else if (portState.supported && portState.ok) {
    resolveWindowsSecurityRequest(windowsSecurityRequestPath, windowsSecurityRequestMarkdownPath, {
      reason: 'listener-port-open-verified',
      listener: {
        host,
        port,
        protocol: 'tcp',
      },
      portState,
      requiredAction: 'No action required. Inbound TCP port is verified open for listener.',
    });
  }

  server.listen(port, host, () => {
    console.log(`[${nowIso()}] n8n local listener started on http://${host}:${port}`);
    console.log(`[${nowIso()}] agent id: ${config.agent?.id || 'unknown-agent'}`);
    console.log(`[${nowIso()}] agent config resolution: ${configResolution.mode}`);
    console.log(`[${nowIso()}] config file: ${configPath}`);
    console.log(`[${nowIso()}] return address: ${JSON.stringify(config.returnAddress)}`);
    console.log(`[${nowIso()}] return host selection: ${config.returnAddress.hostSelection}`);
    console.log(`[${nowIso()}] return callback URL: ${config.returnAddress.callbackUrl || 'not-configured'}`);
    console.log(`[${nowIso()}] n8n queue strategy: ${JSON.stringify(config.n8nQueue)}`);

    if (portState.supported && portState.ok) {
      console.log(
        `[${nowIso()}] windows inbound TCP ${port} rule verified.`,
      );
    }

    if (config.vscodeGuard?.enabled) {
      const intervalMs = Math.max(5, Number(config.vscodeGuard.checkIntervalSeconds || 20)) * 1000;
      const processNames = config.vscodeGuard.processNames || [];

      guardInterval = setInterval(() => {
        if (!isVsCodeRunning(processNames)) {
          console.log(`[${nowIso()}] VS Code process not detected; shutting down n8n local listener.`);
          clearInterval(guardInterval);
          server.close(() => {
            process.exit(0);
          });
        }
      }, intervalMs);

      console.log(`[${nowIso()}] VS Code guard enabled with ${intervalMs / 1000}s interval.`);
    }

    if (config.feedbackLoop?.enabled) {
      const intervalMs = Math.max(1, Number(config.feedbackLoop.checkIntervalSeconds || 20)) * 1000;

      feedbackWatchdogInterval = setInterval(() => {
        try {
          tryEmitWatchdogContinueCommand();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[${nowIso()}] feedback watchdog error: ${message}`);
        }
      }, intervalMs);

      console.log(
        `[${nowIso()}] feedback watchdog enabled interval=${intervalMs / 1000}s inactivity=${Math.max(1, Number(config.feedbackLoop.inactivitySeconds || 300))}s cooldown=${Math.max(1, Number(config.feedbackLoop.promptCooldownSeconds || 120))}s`,
      );
    }
  });

  server.on('close', () => {
    if (guardInterval) {
      clearInterval(guardInterval);
    }

    if (feedbackWatchdogInterval) {
      clearInterval(feedbackWatchdogInterval);
    }
  });

  server.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);

    if (isWindows()) {
      const requestPayload = createPortOpenRequestPayload({
        host,
        port,
        reason: 'listener-port-open-failed',
        portState: evaluateWindowsPortOpenState(port),
        securityProducts: getWindowsSecurityProducts(),
        extra: {
          error: message,
        },
      });
      const forwardState = forwardPortOpenRequest({
        requestPath: windowsSecurityRequestPath,
        requestMarkdownPath: windowsSecurityRequestMarkdownPath,
        requestPayload,
      });

      console.error(`[${nowIso()}] WINDOWS_SECURITY_REQUEST created at ${windowsSecurityRequestPath}`);
      console.error(`[${nowIso()}] WINDOWS_SECURITY_REQUEST_MARKDOWN created at ${windowsSecurityRequestMarkdownPath}`);
      console.error(
        `[${nowIso()}] WINDOWS_SECURITY_FORWARD forwarded=${forwardState.forwarded} writeOk=${forwardState.writeOk} markdownWriteOk=${forwardState.markdownWriteOk} opened=${forwardState.opened} after listener bind error.`,
      );

      const popupShown = showWindowsPortAlertPopup(
        port,
        forwardState.forwarded ? 'listener-port-open-failed-request-created' : 'listener-port-open-failed',
      );
      console.error(`[${nowIso()}] WINDOWS_PORT_ALERT popup=${popupShown ? 'shown' : 'failed'} tcp=${port}`);
    }

    console.error(`[${nowIso()}] listener server error: ${message}`);
    process.exit(1);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${nowIso()}] n8n-local-listener error: ${message}`);
  process.exit(1);
});
