import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class OpenAIProvider extends BaseProvider {
  name = 'OpenAI';
  getApiKeyLink = 'https://platform.openai.com/api-keys';

  config = {
    apiTokenKey: 'OPENAI_API_KEY',
  };

  private _isCompletionOnlyModel(modelName: string): boolean {
    const normalized = modelName.toLowerCase();

    return normalized.endsWith('-instruct') || normalized.startsWith('text-');
  }

  private _isResponsesModel(modelName: string): boolean {
    const normalized = modelName.toLowerCase();
    return normalized.includes('codex');
  }

  staticModels: ModelInfo[] = [
    /*
     * Essential fallback models - only the most stable/reliable ones
     * GPT-4o: 128k context, 4k standard output (64k with long output mode)
     */
    { name: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 4096 },

    // GPT-4o Mini: 128k context, cost-effective alternative
    {
      name: 'gpt-4o-mini',
      label: 'GPT-4o Mini',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 4096,
    },

    // GPT-3.5-turbo: 16k context, fast and cost-effective
    {
      name: 'gpt-3.5-turbo',
      label: 'GPT-3.5 Turbo',
      provider: 'OpenAI',
      maxTokenAllowed: 16000,
      maxCompletionTokens: 4096,
    },

    // o1-preview: 128k context, 32k output limit (reasoning model)
    {
      name: 'o1-preview',
      label: 'o1-preview',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 32000,
    },

    // o1-mini: 128k context, 65k output limit (reasoning model)
    { name: 'o1-mini', label: 'o1-mini', provider: 'OpenAI', maxTokenAllowed: 128000, maxCompletionTokens: 65000 },

    // Codex family (coding-specialized)
    {
      name: 'gpt-5-codex',
      label: 'GPT-5 Codex',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'gpt-5.1-codex',
      label: 'GPT-5.1 Codex',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'gpt-5.2-codex',
      label: 'GPT-5.2 Codex',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 64000,
    },
    {
      name: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      provider: 'OpenAI',
      maxTokenAllowed: 128000,
      maxCompletionTokens: 64000,
    },
  ];

  private _getNumberFromModelMeta(model: any, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = model?.[key];

      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    return undefined;
  }

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    if (!apiKey) {
      throw `Missing Api Key configuration for ${this.name} provider`;
    }

    const response = await fetch(`https://api.openai.com/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const res = (await response.json()) as any;
    const staticModelIds = this.staticModels.map((m) => m.name);

    const data = res.data.filter(
      (model: any) =>
        model.object === 'model' &&
        (model.id.startsWith('gpt-') ||
          model.id.startsWith('o') ||
          model.id.startsWith('chatgpt-') ||
          model.id.startsWith('codex') ||
          model.id.includes('-codex')) &&
        !staticModelIds.includes(model.id),
    );

    return data.map((m: any) => {
      const contextFromMeta = this._getNumberFromModelMeta(m, [
        'context_window',
        'context_length',
        'input_token_limit',
        'max_input_tokens',
      ]);

      let contextWindow = contextFromMeta ?? 32000;

      if (!contextFromMeta && m.id?.includes('gpt-4o')) {
        contextWindow = 128000; // GPT-4o has 128k context
      } else if (!contextFromMeta && (m.id?.includes('gpt-4-turbo') || m.id?.includes('gpt-4-1106'))) {
        contextWindow = 128000; // GPT-4 Turbo has 128k context
      } else if (!contextFromMeta && m.id?.includes('gpt-4')) {
        contextWindow = 8192; // Standard GPT-4 has 8k context
      } else if (!contextFromMeta && m.id?.includes('gpt-3.5-turbo')) {
        contextWindow = 16385; // GPT-3.5-turbo has 16k context
      } else if (!contextFromMeta && m.id?.includes('codex')) {
        contextWindow = 128000;
      }

      const completionFromMeta = this._getNumberFromModelMeta(m, [
        'max_output_tokens',
        'output_token_limit',
        'completion_token_limit',
      ]);

      let maxCompletionTokens = completionFromMeta ?? 4096;

      if (!completionFromMeta && m.id?.startsWith('o1-preview')) {
        maxCompletionTokens = 32000; // o1-preview: 32K output limit
      } else if (!completionFromMeta && m.id?.startsWith('o1-mini')) {
        maxCompletionTokens = 65000; // o1-mini: 65K output limit
      } else if (!completionFromMeta && m.id?.startsWith('o1')) {
        maxCompletionTokens = 32000; // Other o1 models: 32K limit
      } else if (!completionFromMeta && (m.id?.includes('o3') || m.id?.includes('o4'))) {
        maxCompletionTokens = 100000; // o3/o4 models: 100K output limit
      } else if (!completionFromMeta && m.id?.includes('gpt-4o')) {
        maxCompletionTokens = 4096; // GPT-4o standard: 4K (64K with long output mode)
      } else if (!completionFromMeta && m.id?.includes('gpt-4')) {
        maxCompletionTokens = 8192; // Standard GPT-4: 8K output limit
      } else if (!completionFromMeta && m.id?.includes('gpt-3.5-turbo')) {
        maxCompletionTokens = 4096; // GPT-3.5-turbo: 4K output limit
      } else if (!completionFromMeta && m.id?.includes('codex')) {
        maxCompletionTokens = 64000;
      }

      return {
        name: m.id,
        label: `${m.id} (${Math.floor(contextWindow / 1000)}k context)`,
        provider: this.name,
        maxTokenAllowed: Math.min(contextWindow, 128000), // Cap at 128k for safety
        maxCompletionTokens,
      };
    });
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'OPENAI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      apiKey,
    });

    if (this._isResponsesModel(model)) {
      const responsesFactory = (openai as any).responses;

      if (typeof responsesFactory === 'function') {
        return responsesFactory(model);
      }
    }

    if (this._isCompletionOnlyModel(model)) {
      const completionFactory = (openai as any).completion;

      if (typeof completionFactory === 'function') {
        return completionFactory(model);
      }
    }

    return openai(model);
  }
}
