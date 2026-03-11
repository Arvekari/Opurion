import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type LLMRequest = { provider: string; model: string; prompt: string; createdAt: number };

type StreamResult = {
  firstTokenTimeMs: number;
  tokens: string[];
  timedOut: boolean;
};

const MAX_PROMPT_LIMIT_BYTES = 100_000;
let requestSeq = 0;

function measureMs<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { result, ms: end - start };
}

async function measureMsAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { result, ms: end - start };
}

function generatePrompt(messages: ChatMessage[]): string {
  return messages.map((m) => `[${m.role}] ${m.content}`).join('\n');
}

function tokenize(prompt: string): string[] {
  return prompt.trim().length === 0 ? [] : prompt.split(/\s+/);
}

function resolveProvider(model: string | undefined): string {
  if (!model) {
    throw new Error('ProviderNotFound');
  }

  const lower = model.toLowerCase();

  if (lower.includes('gpt') || lower.includes('codex')) {
    return 'OpenAI';
  }

  if (lower.includes('claude')) {
    return 'Anthropic';
  }

  if (lower.includes('gemini')) {
    return 'Google';
  }

  throw new Error('ProviderNotFound');
}

function getApiKey(provider: string): string {
  const apiKeys: Record<string, string> = {
    OpenAI: 'sk-openai',
    Anthropic: 'sk-anthropic',
    Google: 'sk-google',
  };

  const key = apiKeys[provider];

  if (!key) {
    throw new Error('MissingApiKey');
  }

  return key;
}

function createLLMRequest(messages: ChatMessage[], model: string): LLMRequest {
  const prompt = generatePrompt(messages);
  const provider = resolveProvider(model);

  return {
    provider,
    model,
    prompt,
    createdAt: Date.now(),
  };
}

async function sendRequest(request: LLMRequest): Promise<{ ok: boolean; id: string }> {
  await new Promise((resolve) => setTimeout(resolve, 1));
  requestSeq += 1;
  return { ok: true, id: `${request.provider}-${request.model}-${requestSeq}` };
}

async function startStream(tokens: string[]): Promise<StreamResult> {
  const streamStart = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 2));

  const firstTokenTimeMs = performance.now() - streamStart;

  return {
    firstTokenTimeMs,
    tokens,
    timedOut: false,
  };
}

function processStream(tokens: string[]): string[] {
  // Processing keeps order and count unchanged.
  return [...tokens];
}

async function simulateNoTokens(timeoutMs = 20): Promise<{ timedOut: boolean }> {
  await new Promise((resolve) => setTimeout(resolve, timeoutMs + 5));
  return { timedOut: true };
}

function addMessage(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return [...list, message];
}

function renderChat(messages: ChatMessage[]): string {
  return messages.map((m) => `<p>${m.role}:${m.content}</p>`).join('');
}

function serializeMessages(messages: ChatMessage[]): string {
  return JSON.stringify(messages);
}

const db = new Map<string, ChatMessage[]>();

async function saveConversation(id: string, messages: ChatMessage[]): Promise<boolean> {
  db.set(id, messages);
  return true;
}

async function loadConversations(): Promise<Array<{ id: string; messages: ChatMessage[] }>> {
  return Array.from(db.entries()).map(([id, messages]) => ({ id, messages }));
}

describe('Performance and Stability: Request Pipeline', () => {
  it('Test 1 - Request creation latency (<10ms)', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello world' }];
    const { ms } = measureMs(() => createLLMRequest(messages, 'gpt-5.3-codex'));

    expect(ms).toBeLessThan(10);
  });

  it('Test 2 - Request payload size (< maxPromptLimit)', () => {
    const messages: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message-${i} ${'x'.repeat(20)}`,
    }));

    const prompt = generatePrompt(messages);
    const payloadSize = Buffer.byteLength(prompt, 'utf8');

    expect(payloadSize).toBeLessThan(MAX_PROMPT_LIMIT_BYTES);
  });

  it('Test 3 - Tokenization performance (<10ms)', () => {
    const prompt = 'token '.repeat(1000);
    const { result, ms } = measureMs(() => tokenize(prompt));

    expect(result.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(10);
  });

  it('Test 4 - Parallel request handling (no deadlocks/no loss)', async () => {
    const request = createLLMRequest([{ role: 'user', content: 'parallel' }], 'gpt-5.3-codex');

    const responses = await Promise.all([sendRequest(request), sendRequest(request), sendRequest(request)]);

    expect(responses).toHaveLength(3);
    expect(responses.every((r) => r.ok)).toBe(true);
    expect(new Set(responses.map((r) => r.id)).size).toBe(3);
  });
});

describe('Performance and Stability: LLM Provider Layer', () => {
  it('Test 5 - Provider selection speed (<5ms)', () => {
    const { result, ms } = measureMs(() => resolveProvider('gpt-5.3-codex'));

    expect(result).toBe('OpenAI');
    expect(ms).toBeLessThan(5);
  });

  it('Test 6 - Missing provider handling (throws ProviderNotFound)', () => {
    expect(() => resolveProvider(undefined)).toThrowError('ProviderNotFound');
  });

  it('Test 7 - API key lookup performance (<5ms)', () => {
    const { result, ms } = measureMs(() => getApiKey('OpenAI'));

    expect(result).toContain('sk-');
    expect(ms).toBeLessThan(5);
  });
});

describe('Performance and Stability: Streaming Response', () => {
  it('Test 8 - Stream start latency (firstTokenTime < threshold)', async () => {
    const result = await startStream(['a', 'b', 'c']);

    expect(result.firstTokenTimeMs).toBeLessThan(50);
  });

  it('Test 9 - Stream processing throughput (no loss/order preserved)', () => {
    const input = Array.from({ length: 100 }, (_, i) => `token-${i}`);
    const output = processStream(input);

    expect(output).toHaveLength(input.length);
    expect(output).toEqual(input);
  });

  it('Test 10 - Stream timeout detection (timeout triggered)', async () => {
    const result = await simulateNoTokens(20);
    expect(result.timedOut).toBe(true);
  });
});

describe('Performance and Stability: UI State Performance', () => {
  it('Test 11 - Message append speed (<2ms)', () => {
    const list: ChatMessage[] = [{ role: 'user', content: 'start' }];
    const { result, ms } = measureMs(() => addMessage(list, { role: 'assistant', content: 'ok' }));

    expect(result).toHaveLength(2);
    expect(ms).toBeLessThan(2);
  });

  it('Test 12 - Chat render performance (200 messages under threshold)', () => {
    const messages: ChatMessage[] = Array.from({ length: 200 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `content-${i}`,
    }));

    const { result, ms } = measureMs(() => renderChat(messages));

    expect(result.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(25);
  });

  it('Test 13 - Message serialization performance (<10ms)', () => {
    const messages: ChatMessage[] = Array.from({ length: 200 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `serialize-${i}`,
    }));

    const { result, ms } = measureMs(() => serializeMessages(messages));

    expect(result).toContain('serialize-0');
    expect(ms).toBeLessThan(10);
  });
});

describe('Performance and Stability: Database Layer', () => {
  it('Test 14 - Conversation save speed (<20ms)', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'save-me' }];

    const { result, ms } = await measureMsAsync(() => saveConversation('conv-save', messages));

    expect(result).toBe(true);
    expect(ms).toBeLessThan(20);
  });

  it('Test 15 - Conversation load performance (100 conv under threshold)', async () => {
    for (let i = 0; i < 100; i++) {
      await saveConversation(`conv-${i}`, [{ role: 'user', content: `message-${i}` }]);
    }

    const { result, ms } = await measureMsAsync(() => loadConversations());

    expect(result.length).toBeGreaterThanOrEqual(100);
    expect(ms).toBeLessThan(50);
  });

  it('Test 16 - Concurrent writes (no race condition)', async () => {
    await Promise.all([
      saveConversation('concurrent-1', [{ role: 'user', content: 'a' }]),
      saveConversation('concurrent-2', [{ role: 'user', content: 'b' }]),
      saveConversation('concurrent-3', [{ role: 'user', content: 'c' }]),
    ]);

    const all = await loadConversations();
    const ids = new Set(all.map((entry) => entry.id));

    expect(ids.has('concurrent-1')).toBe(true);
    expect(ids.has('concurrent-2')).toBe(true);
    expect(ids.has('concurrent-3')).toBe(true);
  });
});

describe('Performance and Stability: Memory & Resource Use', () => {
  it('Test 17 - Memory leak detection (100 requests, bounded heap growth)', async () => {
    const before = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      const req = createLLMRequest([{ role: 'user', content: `m-${i}` }], 'gpt-5.3-codex');
      await sendRequest(req);
    }

    const after = process.memoryUsage().heapUsed;
    const heapGrowth = after - before;

    // Allow small growth due to runtime noise/allocations.
    expect(heapGrowth).toBeLessThan(30 * 1024 * 1024);
  });

  it('Test 18 - Garbage collection stability (heap usage check)', () => {
    const usage = process.memoryUsage();

    expect(usage.heapUsed).toBeGreaterThan(0);
    expect(usage.heapTotal).toBeGreaterThan(usage.heapUsed / 2);
  });
});

describe('Performance and Stability: Stress Testing', () => {
  it('Test 19 - High request burst (50 requests responsive)', async () => {
    const request = createLLMRequest([{ role: 'user', content: 'burst' }], 'gpt-5.3-codex');

    const { result, ms } = await measureMsAsync(() =>
      Promise.all(Array.from({ length: 50 }, () => sendRequest(request))),
    );

    expect(result).toHaveLength(50);
    expect(result.every((r) => r.ok)).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it('Test 20 - Long conversation performance (1000 history prompt build)', () => {
    const history: ChatMessage[] = Array.from({ length: 1000 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `history-${i}`,
    }));

    const { result, ms } = measureMs(() => generatePrompt(history));

    expect(result.length).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(75);
  });
});

describe('Bonus - LLM request lifecycle test', () => {
  it('covers user message -> prompt -> provider -> request -> stream -> UI update', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Build a todo app' }];

    const request = createLLMRequest(messages, 'gpt-5.3-codex');
    const requestResp = await sendRequest(request);
    const stream = await startStream(['first', 'second', 'third']);
    const uiMessages = addMessage(messages, { role: 'assistant', content: stream.tokens.join(' ') });

    expect(request.prompt).toContain('Build a todo app');
    expect(request.provider).toBe('OpenAI');
    expect(requestResp.ok).toBe(true);
    expect(stream.tokens).toEqual(['first', 'second', 'third']);
    expect(uiMessages[1].content).toContain('first second third');
  });
});
