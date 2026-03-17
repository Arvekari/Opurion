import { describe, expect, it } from 'vitest';
import {
  buildProjectPlanContent,
  buildProjectPlanStatusContent,
  formatProjectPlanRunStatus,
  shouldPersistProjectPlan,
} from '../../../app/lib/collab/project-plan';

describe('app/lib/collab/project-plan.ts', () => {
  it('persists discuss-mode planning into a plan document', () => {
    const content = buildProjectPlanContent({
      userRequest: 'Design a new billing dashboard and list the files involved.',
      assistantResponse:
        '# Plan\n- Define dashboard metrics\n- Reuse existing billing API\n- Create src/routes/billing.tsx\n- Create src/components/BillingChart.tsx',
      chatMode: 'discuss',
    });

    expect(content).toContain('# Active Project Plan');
    expect(content).toContain('Design a new billing dashboard');
    expect(content).toContain('src/routes/billing.tsx');
    expect(content).toContain('Verification Intent');
  });

  it('persists build-mode replies when they contain planning or file structure guidance', () => {
    expect(
      shouldPersistProjectPlan({
        userRequest: 'Implement auth refresh tokens.',
        assistantResponse: '- Update src/auth/session.ts\n- Add src/routes/api.refresh.ts\n- Then wire middleware',
        chatMode: 'build',
      }),
    ).toBe(true);
  });

  it('ignores auto-repair prompts and non-planning build chatter', () => {
    expect(
      shouldPersistProjectPlan({
        userRequest: 'Auto-repair request: preview validation failed.',
        assistantResponse: 'Fixed package.json and restarted the preview.',
        chatMode: 'build',
      }),
    ).toBe(false);

    expect(
      shouldPersistProjectPlan({
        userRequest: 'Fix the broken button.',
        assistantResponse: 'Done.',
        chatMode: 'build',
      }),
    ).toBe(false);
  });

  it('builds a separate status document so the main plan stays clean', () => {
    const content = buildProjectPlanStatusContent({
      userRequest: 'Finish billing dashboard implementation.',
      chatMode: 'build',
      status: 'completed',
      assistantResponse: 'Implemented the route and chart components and verified the preview.',
      updatedAt: '2026-03-17T12:00:00.000Z',
    });

    expect(formatProjectPlanRunStatus('in_progress')).toBe('In progress');
    expect(content).toContain('# Active Project Plan Status');
    expect(content).toContain('Run status: Completed');
    expect(content).toContain('Finish billing dashboard implementation.');
    expect(content).toContain('.plan.md stays focused on objectives and structure');
  });
});