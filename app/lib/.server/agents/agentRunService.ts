import { createScopedLogger } from '~/utils/logger';
import { listAgentRunRecords, readAgentRunRecord, upsertAgentRunRecord } from '~/lib/.server/persistence';

const logger = createScopedLogger('agent-run-service');

export type AgentRunState =
  | 'queued'
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type AgentStepStage = 'plan' | 'execute' | 'verify';

export type AgentStepState = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentRunStep {
  id: string;
  stage: AgentStepStage;
  label: string;
  state: AgentStepState;
  output?: string;
  error?: string;
  startedAt: string;
  endedAt?: string;
}

export interface AgentRunRecord {
  runId: string;
  state: AgentRunState;
  engine: 'llm' | 'openclaw' | 'workflow';
  request: {
    system: string;
    message: string;
    model: string;
    provider: string;
  };
  steps: AgentRunStep[];
  outputs: string[];
  cancelled: boolean;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: {
    message: string;
    stage?: AgentStepStage;
  };
  metadata?: Record<string, unknown>;
}

export interface ExecuteRunHandlers {
  timeoutMs: number;
  plan?: (run: AgentRunRecord) => Promise<string[]>;
  execute: (run: AgentRunRecord) => Promise<string>;
  verify?: (run: AgentRunRecord) => Promise<{ success: boolean; notes?: string }>;
}

function isTerminalState(state: AgentRunState) {
  return ['completed', 'failed', 'cancelled', 'timed_out'].includes(state);
}

function newStepId() {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export class AgentRunService {
  private static _instance: AgentRunService;
  private _runs = new Map<string, AgentRunRecord>();
  private _env?: Record<string, any>;

  static getInstance() {
    if (!AgentRunService._instance) {
      AgentRunService._instance = new AgentRunService();
    }

    return AgentRunService._instance;
  }

  setEnvironment(env?: Record<string, any>) {
    this._env = env;
  }

  createRun(input: {
    request: AgentRunRecord['request'];
    engine?: AgentRunRecord['engine'];
    timeoutMs?: number;
    metadata?: Record<string, unknown>;
  }): AgentRunRecord {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = nowIso();
    const run: AgentRunRecord = {
      runId,
      state: 'queued',
      engine: input.engine ?? 'llm',
      request: input.request,
      steps: [],
      outputs: [],
      cancelled: false,
      timeoutMs: input.timeoutMs ?? 120000,
      createdAt,
      updatedAt: createdAt,
      metadata: input.metadata,
    };

    this._runs.set(runId, run);
    this._persistRun(run);

    return run;
  }

  getRun(runId: string) {
    return this._runs.get(runId);
  }

  async getRunPersisted(runId: string): Promise<AgentRunRecord | null> {
    const inMemory = this.getRun(runId);

    if (inMemory) {
      return inMemory;
    }

    const persisted = await readAgentRunRecord(runId, this._env);

    if (!persisted?.payload) {
      return null;
    }

    return persisted.payload as AgentRunRecord;
  }

  listRuns(limit = 50) {
    return Array.from(this._runs.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, limit);
  }

  async listRunsPersisted(limit = 50): Promise<AgentRunRecord[]> {
    const inMemory = this.listRuns(limit);

    if (inMemory.length >= limit) {
      return inMemory;
    }

    const persisted = await listAgentRunRecords(limit, this._env);
    const mapped = persisted
      .map((item) => item.payload as AgentRunRecord)
      .filter((item): item is AgentRunRecord => Boolean(item?.runId));

    const merged = [...inMemory];

    for (const item of mapped) {
      if (!merged.some((existing) => existing.runId === item.runId)) {
        merged.push(item);
      }
    }

    return merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, limit);
  }

  isCancelled(runId: string) {
    return this._runs.get(runId)?.cancelled === true;
  }

  cancelRun(runId: string) {
    const run = this._runs.get(runId);

    if (!run || isTerminalState(run.state)) {
      return false;
    }

    run.cancelled = true;
    run.state = 'cancelled';
    run.updatedAt = nowIso();
    run.completedAt = run.updatedAt;

    this._persistRun(run);

    for (const step of run.steps) {
      if (step.state === 'running' || step.state === 'pending') {
        step.state = 'cancelled';
        step.endedAt = nowIso();
      }
    }

    return true;
  }

  beginStep(runId: string, stage: AgentStepStage, label: string) {
    const run = this._requireRun(runId);

    if (run.cancelled) {
      throw new Error('Run cancelled');
    }

    const step: AgentRunStep = {
      id: newStepId(),
      stage,
      label,
      state: 'running',
      startedAt: nowIso(),
    };

    run.steps.push(step);
    run.updatedAt = nowIso();
    run.state = stage === 'plan' ? 'planning' : stage === 'execute' ? 'executing' : 'verifying';
    this._persistRun(run);

    return step.id;
  }

  completeStep(runId: string, stepId: string, output?: string) {
    const run = this._requireRun(runId);
    const step = run.steps.find((item) => item.id === stepId);

    if (!step) {
      return;
    }

    step.state = 'completed';
    step.endedAt = nowIso();
    step.output = output;

    if (output) {
      run.outputs.push(output);
    }

    run.updatedAt = nowIso();
    this._persistRun(run);
  }

  failStep(runId: string, stepId: string, errorMessage: string) {
    const run = this._requireRun(runId);
    const step = run.steps.find((item) => item.id === stepId);

    if (!step) {
      return;
    }

    step.state = 'failed';
    step.endedAt = nowIso();
    step.error = errorMessage;
    run.updatedAt = nowIso();
    this._persistRun(run);
  }

  completeRun(runId: string) {
    const run = this._requireRun(runId);

    if (run.cancelled) {
      run.state = 'cancelled';
    } else {
      run.state = 'completed';
    }

    run.updatedAt = nowIso();
    run.completedAt = run.updatedAt;
    this._persistRun(run);

    return run;
  }

  failRun(runId: string, error: unknown, stage?: AgentStepStage) {
    const run = this._requireRun(runId);

    run.state = run.cancelled ? 'cancelled' : 'failed';
    run.error = {
      message: error instanceof Error ? error.message : 'Unknown error',
      stage,
    };
    run.updatedAt = nowIso();
    run.completedAt = run.updatedAt;
    this._persistRun(run);

    return run;
  }

  markTimedOut(runId: string) {
    const run = this._requireRun(runId);
    run.state = 'timed_out';
    run.updatedAt = nowIso();
    run.completedAt = run.updatedAt;
    this._persistRun(run);

    return run;
  }

  async executeRun(runId: string, handlers: ExecuteRunHandlers) {
    const run = this._requireRun(runId);
    run.timeoutMs = handlers.timeoutMs;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        this.markTimedOut(runId);
        reject(new Error('Agent run timed out'));
      }, handlers.timeoutMs);
    });

    const runPromise = (async () => {
      let planStepId: string | undefined;
      let executeStepId: string | undefined;
      let verifyStepId: string | undefined;

      try {
        planStepId = this.beginStep(runId, 'plan', 'Create plan');

        const planItems = handlers.plan ? await handlers.plan(run) : ['Analyze request', 'Execute', 'Verify'];
        this.completeStep(runId, planStepId, JSON.stringify(planItems));

        if (this.isCancelled(runId)) {
          throw new Error('Run cancelled');
        }

        executeStepId = this.beginStep(runId, 'execute', 'Execute plan');

        const executionOutput = await handlers.execute(this._requireRun(runId));
        this.completeStep(runId, executeStepId, executionOutput);

        if (this.isCancelled(runId)) {
          throw new Error('Run cancelled');
        }

        verifyStepId = this.beginStep(runId, 'verify', 'Verify output');

        const verification = handlers.verify
          ? await handlers.verify(this._requireRun(runId))
          : { success: Boolean(executionOutput?.trim()), notes: 'default verification' };

        if (!verification.success) {
          throw new Error(verification.notes || 'Verification failed');
        }

        this.completeStep(runId, verifyStepId, verification.notes || 'verified');
        this.completeRun(runId);
      } catch (error) {
        if (planStepId && !this._isCompletedStep(runId, planStepId)) {
          this.failStep(runId, planStepId, error instanceof Error ? error.message : 'failed');
        }

        if (executeStepId && !this._isCompletedStep(runId, executeStepId)) {
          this.failStep(runId, executeStepId, error instanceof Error ? error.message : 'failed');
        }

        if (verifyStepId && !this._isCompletedStep(runId, verifyStepId)) {
          this.failStep(runId, verifyStepId, error instanceof Error ? error.message : 'failed');
        }

        this.failRun(runId, error);
        throw error;
      }
    })();

    return Promise.race([runPromise, timeoutPromise]);
  }

  resetForTests() {
    this._runs.clear();
  }

  private _isCompletedStep(runId: string, stepId: string) {
    const run = this._requireRun(runId);
    const step = run.steps.find((item) => item.id === stepId);

    return step?.state === 'completed';
  }

  private _requireRun(runId: string) {
    const run = this._runs.get(runId);

    if (!run) {
      logger.error('run not found', runId);
      throw new Error(`Run not found: ${runId}`);
    }

    return run;
  }

  private _persistRun(run: AgentRunRecord) {
    void upsertAgentRunRecord(
      {
        runId: run.runId,
        state: run.state,
        payload: run as unknown as Record<string, any>,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      this._env,
    ).catch((error) => {
      logger.warn('failed to persist agent run', error);
    });
  }
}
