import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('app/styles/variables.scss workbench split', () => {
  it('sets workbench split to 20/80 for active workbench layout', () => {
    const filePath = join(process.cwd(), 'app', 'styles', 'variables.scss');
    const source = readFileSync(filePath, 'utf8');

    expect(source.includes('--workbench-width: 80%;')).toBe(true);
    expect(source.includes('--workbench-left: 20%;')).toBe(true);
    expect(source.includes('--workbench-inner-width: var(--workbench-width);')).toBe(true);
  });
});
