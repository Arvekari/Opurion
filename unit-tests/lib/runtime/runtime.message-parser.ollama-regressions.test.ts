import { describe, expect, it, vi } from 'vitest';

describe('runtime/message-parser Ollama regressions', () => {
  it('parses HTML-escaped bolt artifact/action tags into executable callbacks', async () => {
    const { StreamingMessageParser } = await import('~/lib/runtime/message-parser');

    const onArtifactOpen = vi.fn();
    const onArtifactClose = vi.fn();
    const onActionOpen = vi.fn();
    const onActionClose = vi.fn();

    const parser = new StreamingMessageParser({
      callbacks: {
        onArtifactOpen,
        onArtifactClose,
        onActionOpen,
        onActionClose,
      },
    });

    const input =
      'Before &lt;boltArtifact title="Some title" id="artifact_1"&gt;&lt;boltAction type="shell"&gt;npm install&lt;/boltAction&gt;&lt;/boltArtifact&gt; After';

    const output = parser.parse('msg-escaped-1', input);

    expect(output).toContain('__boltArtifact__');
    expect(output).toContain('Before');
    expect(output).toContain('After');
    expect(onArtifactOpen).toHaveBeenCalledTimes(1);
    expect(onArtifactClose).toHaveBeenCalledTimes(1);
    expect(onActionOpen).toHaveBeenCalledTimes(1);
    expect(onActionClose).toHaveBeenCalledTimes(1);

    const actionArg = onActionClose.mock.calls[0][0];
    expect(actionArg.action.type).toBe('shell');
    expect(actionArg.action.content).toContain('npm install');
  });

  it('auto-wraps Ollama-style html code blocks without explicit filename into /index.html', async () => {
    const { EnhancedStreamingMessageParser } = await import('~/lib/runtime/enhanced-message-parser');

    const onArtifactOpen = vi.fn();
    const onActionClose = vi.fn();

    const parser = new EnhancedStreamingMessageParser({
      callbacks: {
        onArtifactOpen,
        onActionClose,
      },
    });

    const input = [
      "Sure, here's a web page:",
      '',
      '```html',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <title>Bolt intro</title>',
      '</head>',
      '<body>',
      '  <h1>Hello from Bolt</h1>',
      '</body>',
      '</html>',
      '```',
    ].join('\n');

    const output = parser.parse('msg-ollama-html-1', input);

    expect(output).toContain('__boltArtifact__');
    expect(onArtifactOpen).toHaveBeenCalledTimes(1);
    expect(onActionClose).toHaveBeenCalledTimes(1);

    const actionArg = onActionClose.mock.calls[0][0];
    expect(actionArg.action.type).toBe('file');
    expect(actionArg.action.filePath).toBe('/index.html');
    expect(actionArg.action.content).toContain('<h1>Hello from Bolt</h1>');
  });

  it('strips CDATA wrapper from file content so package.json is valid JSON', async () => {
    const { StreamingMessageParser } = await import('~/lib/runtime/message-parser');

    const onActionClose = vi.fn();

    const parser = new StreamingMessageParser({
      callbacks: {
        onActionClose,
      },
    });

    const jsonContent = '{\n  "name": "my-app",\n  "version": "1.0.0"\n}';
    const input = [
      '<boltArtifact title="pkg" id="art1">',
      `<boltAction type="file" filePath="package.json"><![CDATA[${jsonContent}]]></boltAction>`,
      '</boltArtifact>',
    ].join('');

    parser.parse('msg-cdata-1', input);

    expect(onActionClose).toHaveBeenCalledTimes(1);
    const actionArg = onActionClose.mock.calls[0][0];
    expect(actionArg.action.type).toBe('file');
    // Content must not contain the CDATA wrapper
    expect(actionArg.action.content).not.toContain('<![CDATA[');
    expect(actionArg.action.content).not.toContain(']]>');
    // Content must be valid JSON
    expect(() => JSON.parse(actionArg.action.content.trim())).not.toThrow();
    expect(JSON.parse(actionArg.action.content.trim()).name).toBe('my-app');
  });
});
