import { describe, expect, it } from 'vitest';

describe('services/ai-sdk mcp compatibility', () => {
  it('exports MCP client factory from @ai-sdk/mcp', async () => {
    const mcpModule = await import('@ai-sdk/mcp');
    expect(typeof mcpModule.experimental_createMCPClient).toBe('function');
  });

  it('exports stdio transport from @ai-sdk/mcp/mcp-stdio', async () => {
    const stdioModule = await import('@ai-sdk/mcp/mcp-stdio');
    expect(typeof stdioModule.Experimental_StdioMCPTransport).toBe('function');
  });
});
