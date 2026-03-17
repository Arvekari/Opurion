import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  streamTextMock,
  resolveApiKeysMock,
  resolveProviderSettingsMock,
  resolveCustomPromptMock,
  processMcpMessagesForRequestMock,
  extractPropertiesFromMessageMock,
} = vi.hoisted(() => ({
  streamTextMock: vi.fn(),
  resolveApiKeysMock: vi.fn(),
  resolveProviderSettingsMock: vi.fn(),
  resolveCustomPromptMock: vi.fn(),
  processMcpMessagesForRequestMock: vi.fn(),
  extractPropertiesFromMessageMock: vi.fn(),
}));

vi.mock('~/lib/.server/llm/constants', () => ({
  MAX_RESPONSE_SEGMENTS: 3,
  MAX_TOKENS: 4096,
}));

vi.mock('~/lib/common/prompts/prompts', () => ({
  CONTINUE_PROMPT: 'continue',
}));

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: streamTextMock,
}));

vi.mock('~/lib/.server/llm/select-context', () => ({
  getFilePaths: vi.fn(() => []),
  selectContext: vi.fn(async () => undefined),
}));

vi.mock('~/lib/.server/llm/create-summary', () => ({
  createSummary: vi.fn(async () => 'summary'),
}));

vi.mock('~/lib/.server/llm/utils', () => ({
  extractPropertiesFromMessage: extractPropertiesFromMessageMock,
}));

vi.mock('~/lib/services/mcpService', () => ({
  MCPService: {
    getInstance: () => ({
      toolsWithoutExecute: {},
      processToolCall: vi.fn(),
    }),
  },
}));

vi.mock('~/lib/.server/llm/stream-recovery', () => ({
  StreamRecoveryManager: class {
    startMonitoring() {}
    updateActivity() {}
    stop() {}
  },
}));

vi.mock('~/lib/api/cookies', () => ({
  resolveApiKeys: resolveApiKeysMock,
  resolveProviderSettings: resolveProviderSettingsMock,
  resolveCustomPrompt: resolveCustomPromptMock,
}));

vi.mock('~/lib/.server/agents/agentRunService', () => ({
  AgentRunService: {
    getInstance: () => ({
      createRun: vi.fn(() => ({ runId: 'run-1' })),
      getRun: vi.fn(() => ({ runId: 'run-1', state: 'running', steps: [], error: undefined })),
      beginStep: vi.fn(() => 'step-1'),
      completeStep: vi.fn(),
      completeRun: vi.fn(),
      failRun: vi.fn(),
    }),
  },
}));

vi.mock('~/integrations/mcp/adapter', () => ({
  processMcpMessagesForRequest: processMcpMessagesForRequestMock,
}));

vi.mock('~/platform/http/request-context', () => ({
  getRequestId: vi.fn(() => 'req-1'),
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { action } from '~/routes/api.chat';

describe('api.chat streaming end-to-end regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveApiKeysMock.mockResolvedValue({});
    resolveProviderSettingsMock.mockResolvedValue({});
    resolveCustomPromptMock.mockResolvedValue(undefined);
    processMcpMessagesForRequestMock.mockImplementation(async ({ messages }) => messages);
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'gpt-4o-mini', provider: 'OpenAI' });
  });

  it('streams delayed text chunks to response body (guards against non-awaited stream bug)', async () => {
    streamTextMock.mockImplementation(async () => ({
      fullStream: (async function* () {
        // Delayed chunk reproduces the old race where execute returned too early.
        await new Promise((resolve) => setTimeout(resolve, 25));
        yield { type: 'text-delta', text: 'SMOKE_OK' };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
      })(),
    }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: 'u1', role: 'user', content: '[Model: gpt-4o-mini]\n\n[Provider: OpenAI]\n\nhello' }],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;

    expect(response.status).toBe(200);

    const text = await response.text();

    expect(text).toContain('SMOKE_OK');
    expect(streamTextMock).toHaveBeenCalled();
  });

  it('runs multiple Ollama recovery rounds when split mode produces repeated narrative output', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'tiny-coder-6.7b', provider: 'Ollama' });

    streamTextMock
      .mockImplementationOnce(async () => ({
        fullStream: (async function* () {
          yield {
            type: 'text-delta',
            text: 'I will now explain what files you should create and why this app architecture is good for maintainability.',
          };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
        })(),
      }))
      .mockImplementationOnce(async () => ({
        fullStream: (async function* () {
          yield {
            type: 'text-delta',
            text: 'Second attempt still narrative. Next you should create package.json and App.tsx with clean components.',
          };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
        })(),
      }))
      .mockImplementationOnce(async () => ({
        fullStream: (async function* () {
          yield {
            type: 'text-delta',
            text: '<boltArtifact id="a" title="Build"><boltAction type="file" filePath="/index.html"><!doctype html><html><body>ok</body></html></boltAction></boltArtifact>',
          };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
        })(),
      }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: 'u1', role: 'user', content: '[Model: tiny-coder-6.7b]\n\n[Provider: Ollama]\n\nbuild app' }],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
        ollamaBridgedSystemPromptSplit: false,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(3);
    expect(text).toContain('<boltArtifact');

    const firstCallArgs = streamTextMock.mock.calls[0][0];
    const secondCallArgs = streamTextMock.mock.calls[1][0];
    const thirdCallArgs = streamTextMock.mock.calls[2][0];

    expect(firstCallArgs.forcedProvider).toBe('Ollama');
    expect(firstCallArgs.forcedModel).toBe('tiny-coder-6.7b');
    expect(secondCallArgs.forcedProvider).toBe('Ollama');
    expect(secondCallArgs.forcedModel).toBe('tiny-coder-6.7b');
    expect(thirdCallArgs.forcedProvider).toBe('Ollama');
    expect(thirdCallArgs.forcedModel).toBe('tiny-coder-6.7b');
  });

  it('completes partial cloud build artifacts into runnable React project essentials', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'gpt-5.4', provider: 'OpenAI' });

    streamTextMock.mockImplementationOnce(async () => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: `Missing pieces likely include clearer feature coverage and stronger sectioning.\n\n<boltArtifact id="react-ui" title="App" type="bundled">\n<boltAction type="file" filePath="/src/App.jsx">\nexport default function App(){ return <h1>Professional Landing</h1>; }\n</boltAction>\n</boltArtifact>`,
        };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
      })(),
    }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: '[Model: gpt-5.4]\n\n[Provider: OpenAI]\n\nBuild a professional React landing page with runnable project files.',
          },
        ],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('/src/App.jsx');
    expect(text).toContain('/package.json');
    expect(text).toContain('/index.html');
    expect(text).toContain('npm run dev');
  });

  it('streams cloud build prose progressively while still emitting executable artifact content plus synthesized essentials', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'gpt-5.4', provider: 'OpenAI' });

    streamTextMock.mockImplementationOnce(async () => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: `I am preparing the implementation now.\n\n<boltArtifact id="react-ui" title="App" type="bundled">\n<boltAction type="file" filePath="/src/App.jsx">\nexport default function App(){ return <section><h1>Digital Assistant Services</h1></section>; }\n</boltAction>\n</boltArtifact>`,
        };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
      })(),
    }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: '[Model: gpt-5.4]\n\n[Provider: OpenAI]\n\nBuild a Digital Assistant Services page with runnable project files.',
          },
        ],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('<boltArtifact');
    expect(text).toContain('/src/App.jsx');
    expect(text).toContain('/package.json');
    expect(text).toContain('I am preparing the implementation now.');
  });

  it('preserves progressive premium Opurion intro build output for the provided e2e prompt', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'gpt-5.4', provider: 'OpenAI' });

    streamTextMock.mockImplementationOnce(async () => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: 'I am drafting a premium Opurion introduction experience now, starting with the hero and capability framing.\n\n',
        };
        yield {
          type: 'text-delta',
          text: '<boltArtifact id="opurion-intro" title="Opurion Introduction" type="bundled">\n<boltAction type="file" filePath="/src/App.jsx">\nexport default function App(){ return <main><section><h1>Opurion</h1><p>Cloud and private LLM orchestration with secure transactions, real-time integrations, and personalized workflows.</p><ul><li>Supported models</li><li>Private Ollama</li><li>Cloud LLM routing</li></ul></section></main>; }\n</boltAction>\n</boltArtifact>',
        };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
      })(),
    }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'u1',
            role: 'user',
            content:
              '[Model: gpt-5.4]\n\n[Provider: OpenAI]\n\ncreate, a modern page designed to provide a comprehensive set of your services and capabilities. As your digital assistant, I offer enhanced navigation, real-time data integration, secure transactions, and personalized user experiences.\nwell i wanted modern premium html5 fraphical introdcution page about opurion (you) and your capabilities supported models cloud and pitvate llm capabilities etc',
          },
        ],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('premium Opurion introduction experience');
    expect(text).toContain('<boltArtifact');
    expect(text).toContain('/src/App.jsx');
    expect(text).toContain('Supported models');
    expect(text).toContain('Private Ollama');
    expect(text).toContain('Cloud LLM routing');
    expect(text).toContain('/package.json');
    expect(text).toContain('/index.html');
  });

  it('does not drop cloud build responses when only narrative text is returned', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'gpt-5.4', provider: 'OpenAI' });

    streamTextMock.mockImplementationOnce(async () => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: 'Plain narrative fallback from cloud model.',
        };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
      })(),
    }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: 'u1', role: 'user', content: '[Model: gpt-5.4]\n\n[Provider: OpenAI]\n\nbuild app' }],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('Plain narrative fallback from cloud model.');
  });

  it('completes small-model trivial vite shell into runnable React output on the initial request', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'tiny-coder-6.7b', provider: 'Ollama' });

    streamTextMock.mockImplementationOnce(async () => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: [
            'I will create a Digital Assistant Services page for you.',
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
          ].join('\n'),
        };
        yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
      })(),
    }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: 'u1', role: 'user', content: '[Model: tiny-coder-6.7b]\n\n[Provider: Ollama]\n\nBuild a Digital Assistant Services page.' }],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
        ollamaBridgedSystemPromptSplit: false,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('/App.tsx');
    expect(text).toContain('/package.json');
    expect(text).toContain('/index.html');
    expect(text).toContain('npm run dev');
    expect(text).not.toContain('<div id="root"></div>');
  });

  it('continues recovery rounds until requested file target is produced', async () => {
    extractPropertiesFromMessageMock.mockReturnValue({ model: 'tiny-coder-6.7b', provider: 'Ollama' });

    streamTextMock
      .mockImplementationOnce(async () => ({
        fullStream: (async function* () {
          yield {
            type: 'text-delta',
            text: '<boltArtifact id="a" title="Build"><boltAction type="file" filePath="/index.html"><!doctype html><html><body>Initial</body></html></boltAction></boltArtifact>',
          };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
        })(),
      }))
      .mockImplementationOnce(async () => ({
        fullStream: (async function* () {
          yield {
            type: 'text-delta',
            text: '<boltArtifact id="b" title="About"><boltAction type="file" filePath="/about-me.md"># About Me - Opurion\nPrivate AI with Ollama.</boltAction></boltArtifact>',
          };
          yield { type: 'finish', finishReason: 'stop', totalUsage: { promptTokens: 1, completionTokens: 1 } };
        })(),
      }));

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: 'u1',
            role: 'user',
            content:
              '[Model: tiny-coder-6.7b]\n\n[Provider: Ollama]\n\nPlease create a modern premium page and create about-me.md introducing capabilities and private AI with Ollama.',
          },
        ],
        files: {},
        contextOptimization: false,
        chatMode: 'build',
        maxLLMSteps: 1,
        ollamaBridgedSystemPromptSplit: false,
      }),
    });

    const response = (await action({ request, context: { cloudflare: { env: {} } } } as any)) as Response;
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(text).toContain('/about-me.md');
    expect(text).toContain('Private AI with Ollama');
  });
});
