import { describe, expect, it } from 'vitest';
import { stripExecutableMarkup } from '~/lib/chat/executableMarkup';

describe('lib/chat/executableMarkup', () => {
  it('removes bolt artifact and action blocks from neutral discussion content', () => {
    const input = `Here is a neutral discussion reply.

<boltArtifact id="setup" title="Initial files" type="bundled">
  <boltAction type="file" filePath="src/main.ts">console.log('hi')</boltAction>
</boltArtifact>

Let us first agree on the plan.`;

    expect(stripExecutableMarkup(input)).toBe('Here is a neutral discussion reply.\n\nLet us first agree on the plan.');
  });
});
