type PromptMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelClass = 'small' | 'standard' | 'large';

export type PromptProfile = {
  modelClass: ModelClass;
  maxContextChars: number;
  maxInstructionChars: number;
};

const PROFILES: Record<ModelClass, PromptProfile> = {
  small: {
    modelClass: 'small',
    maxContextChars: 5000,
    maxInstructionChars: 1200,
  },
  standard: {
    modelClass: 'standard',
    maxContextChars: 12000,
    maxInstructionChars: 3000,
  },
  large: {
    modelClass: 'large',
    maxContextChars: 24000,
    maxInstructionChars: 6000,
  },
};

export function detectModelClass(modelName: string, modelMeta?: { maxTokenAllowed?: number }): ModelClass {
  const normalizedName = modelName.toLowerCase();

  if (
    normalizedName.includes('mini') ||
    normalizedName.includes('small') ||
    normalizedName.includes('8b') ||
    (modelMeta?.maxTokenAllowed !== undefined && modelMeta.maxTokenAllowed <= 8192)
  ) {
    return 'small';
  }

  if (modelMeta?.maxTokenAllowed !== undefined && modelMeta.maxTokenAllowed > 65536) {
    return 'large';
  }

  return 'standard';
}

export function compactInstructions(input: string): string {
  return input
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, list) => !(line.length === 0 && list[index - 1]?.length === 0))
    .join('\n')
    .trim();
}

function pruneMessages(messages: PromptMessage[], maxChars: number): { messages: PromptMessage[]; wasPruned: boolean } {
  const kept: PromptMessage[] = [];
  let total = 0;

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    const size = message.content.length;

    if (total + size > maxChars && kept.length > 0) {
      continue;
    }

    kept.unshift(message);
    total += size;

    if (total >= maxChars) {
      break;
    }
  }

  const wasPruned = kept.length < messages.length;

  return { messages: kept, wasPruned };
}

export function applyPromptPolicy(input: {
  system: string;
  messages: PromptMessage[];
  modelName: string;
  modelMeta?: { maxTokenAllowed?: number };
}) {
  const modelClass = detectModelClass(input.modelName, input.modelMeta);
  const profile = PROFILES[modelClass];

  const compactSystem = compactInstructions(input.system).slice(0, profile.maxInstructionChars);
  const compactMessages = input.messages.map((message) => ({
    ...message,
    content: compactInstructions(message.content),
  }));

  const pruned = pruneMessages(compactMessages, profile.maxContextChars);

  return {
    system: compactSystem,
    messages: pruned.messages,
    profile,
    diagnostics: {
      wasPruned: pruned.wasPruned,
      selectedProfile: modelClass,
    },
  };
}
