import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '~/utils/logger';
import { createStreamCompatibleFetch } from '~/lib/modules/llm/stream-fetch-compat';
import { isModelBelowMinimumSize, MIN_LOCAL_MODEL_SIZE_B } from '~/lib/common/system-prompt-profiles';

interface OllamaModelDetails {
  parent_model: string;
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

export interface OllamaApiResponse {
  models: OllamaModel[];
}

export default class OllamaProvider extends BaseProvider {
  name = 'Ollama';
  getApiKeyLink = 'https://ollama.com/download';
  labelForGetApiKey = 'Download Ollama';
  icon = 'i-ph:cloud-arrow-down';

  config = {
    baseUrlKey: 'OLLAMA_API_BASE_URL',
  };

  staticModels: ModelInfo[] = [];

  getDefaultNumCtx(serverEnv?: Env): number {
    const envRecord = this.convertEnvToRecord(serverEnv);

    return envRecord.DEFAULT_NUM_CTX ? parseInt(envRecord.DEFAULT_NUM_CTX, 10) : 32768;
  }

  private _resolveBaseUrl(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): string {
    let { baseUrl } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'OLLAMA_API_BASE_URL',
      defaultApiTokenKey: '',
    });

    if (!baseUrl) {
      throw new Error('No baseUrl found for Ollama provider');
    }

    baseUrl = this.resolveDockerUrl(baseUrl, serverEnv);

    return baseUrl;
  }

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const baseUrl = this._resolveBaseUrl(apiKeys, settings, serverEnv);

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: this.createTimeoutSignal(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaApiResponse;
      const filteredModels = data.models.filter((model) => {
        const sizeSource = model.details?.parameter_size || model.name;
        return !isModelBelowMinimumSize(sizeSource, MIN_LOCAL_MODEL_SIZE_B);
      });

      const modelsToExpose =
        filteredModels.length === 0 && data.models.length > 0
          ? (() => {
              logger.warn(
                `Ollama size filter removed all ${data.models.length} models; returning unfiltered list as fallback`,
              );
              return data.models;
            })()
          : filteredModels;

      return modelsToExpose
        .map((model: OllamaModel) => ({
          name: model.name,
          label: `${model.name} (${model.details?.parameter_size || 'size-unknown'})`,
          provider: this.name,
          maxTokenAllowed: 8000,
        }));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        logger.warn('Ollama model fetch timed out — is Ollama running?');

        return [];
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        logger.warn(`Ollama not reachable at ${baseUrl} — is Ollama running?`);

        return [];
      }

      logger.error('Error fetching Ollama models:', error);

      return [];
    }
  }

  getModelInstance: (options: {
    model: string;
    serverEnv?: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1 = (options) => {
    const { apiKeys, providerSettings, serverEnv, model } = options;
    const envRecord = this.convertEnvToRecord(serverEnv);

    const baseUrl = this._resolveBaseUrl(apiKeys, providerSettings?.[this.name], envRecord);
    const numCtx = this.getDefaultNumCtx(serverEnv);

    logger.debug('Ollama Base Url used: ', baseUrl);
    logger.debug(`Ollama num_ctx: ${numCtx}`);

    // Wrap base fetch to inject num_ctx into the Ollama request body.
    // Ollama's OpenAI-compat endpoint accepts model options under the "options" key.
    const baseFetch = createStreamCompatibleFetch();
    const ollamaFetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST' && init?.body && typeof init.body === 'string') {
        try {
          const body = JSON.parse(init.body);

          if (!body.options) {
            body.options = {};
          }

          if (!body.options.num_ctx) {
            body.options.num_ctx = numCtx;
          }

          init = { ...init, body: JSON.stringify(body) };
        } catch {
          // Leave body unchanged if JSON parsing fails
        }
      }

      return baseFetch(input, init);
    }) as typeof fetch;

    const ollamaProvider = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: 'ollama',
      name: 'ollama',
      fetch: ollamaFetch,
    });

    return ollamaProvider.chat(model);
  };
}
