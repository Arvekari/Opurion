import type { ProviderInfo } from '~/types/model';

type ProviderEnvKeyMap = Record<string, { baseUrlKey?: string; apiTokenKey?: string }>;

export const CLIENT_PROVIDER_LIST: ProviderInfo[] = [
  { name: 'Anthropic', staticModels: [], getApiKeyLink: 'https://console.anthropic.com/settings/keys' },
  { name: 'Cerebras', staticModels: [], getApiKeyLink: 'https://cloud.cerebras.ai/settings' },
  { name: 'Cohere', staticModels: [], getApiKeyLink: 'https://dashboard.cohere.com/api-keys' },
  { name: 'Deepseek', staticModels: [], getApiKeyLink: 'https://platform.deepseek.com/apiKeys' },
  { name: 'Fireworks', staticModels: [], getApiKeyLink: 'https://fireworks.ai/api-keys' },
  { name: 'Google', staticModels: [], getApiKeyLink: 'https://aistudio.google.com/app/apikey' },
  { name: 'Groq', staticModels: [], getApiKeyLink: 'https://console.groq.com/keys' },
  { name: 'HuggingFace', staticModels: [], getApiKeyLink: 'https://huggingface.co/settings/tokens' },
  { name: 'Hyperbolic', staticModels: [], getApiKeyLink: 'https://app.hyperbolic.xyz/settings' },
  { name: 'Mistral', staticModels: [], getApiKeyLink: 'https://console.mistral.ai/api-keys/' },
  { name: 'Moonshot', staticModels: [], getApiKeyLink: 'https://platform.moonshot.ai/console/api-keys' },
  {
    name: 'Ollama',
    staticModels: [],
    getApiKeyLink: 'https://ollama.com/download',
    labelForGetApiKey: 'Download Ollama',
    icon: 'i-ph:cloud-arrow-down',
  },
  { name: 'OpenAI', staticModels: [], getApiKeyLink: 'https://platform.openai.com/api-keys' },
  { name: 'OpenAILike', staticModels: [] },
  { name: 'OpenRouter', staticModels: [], getApiKeyLink: 'https://openrouter.ai/settings/keys' },
  { name: 'Perplexity', staticModels: [], getApiKeyLink: 'https://www.perplexity.ai/settings/api' },
  { name: 'Together', staticModels: [], getApiKeyLink: 'https://api.together.xyz/settings/api-keys' },
  { name: 'xAI', staticModels: [], getApiKeyLink: 'https://docs.x.ai/docs/quickstart#creating-an-api-key' },
  {
    name: 'LMStudio',
    staticModels: [],
    getApiKeyLink: 'https://lmstudio.ai/',
    labelForGetApiKey: 'Get LMStudio',
    icon: 'i-ph:cloud-arrow-down',
  },
  { name: 'AmazonBedrock', staticModels: [], getApiKeyLink: 'https://console.aws.amazon.com/iam/home' },
  { name: 'Github', staticModels: [], getApiKeyLink: 'https://github.com/settings/personal-access-tokens' },
  { name: 'Z.ai', staticModels: [], getApiKeyLink: 'https://open.bigmodel.cn/usercenter/apikeys' },
];

export const DEFAULT_PROVIDER_NAME = 'Anthropic';

export const CLIENT_DEFAULT_PROVIDER =
  CLIENT_PROVIDER_LIST.find((provider) => provider.name === DEFAULT_PROVIDER_NAME) ?? CLIENT_PROVIDER_LIST[0];

export const providerBaseUrlEnvKeys: ProviderEnvKeyMap = {
  Anthropic: { apiTokenKey: 'ANTHROPIC_API_KEY' },
  Cerebras: { apiTokenKey: 'CEREBRAS_API_KEY' },
  Cohere: { apiTokenKey: 'COHERE_API_KEY' },
  Deepseek: { apiTokenKey: 'DEEPSEEK_API_KEY' },
  Fireworks: { apiTokenKey: 'FIREWORKS_API_KEY' },
  Google: { apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  Groq: { apiTokenKey: 'GROQ_API_KEY' },
  HuggingFace: { apiTokenKey: 'HuggingFace_API_KEY' },
  Hyperbolic: { apiTokenKey: 'HYPERBOLIC_API_KEY' },
  Mistral: { apiTokenKey: 'MISTRAL_API_KEY' },
  Moonshot: { apiTokenKey: 'MOONSHOT_API_KEY' },
  Ollama: { baseUrlKey: 'OLLAMA_API_BASE_URL' },
  OpenAI: { apiTokenKey: 'OPENAI_API_KEY' },
  OpenAILike: { baseUrlKey: 'OPENAI_LIKE_API_BASE_URL', apiTokenKey: 'OPENAI_LIKE_API_KEY' },
  OpenRouter: { apiTokenKey: 'OPEN_ROUTER_API_KEY' },
  Perplexity: { apiTokenKey: 'PERPLEXITY_API_KEY' },
  Together: { baseUrlKey: 'TOGETHER_API_BASE_URL', apiTokenKey: 'TOGETHER_API_KEY' },
  xAI: { apiTokenKey: 'XAI_API_KEY' },
  LMStudio: { baseUrlKey: 'LMSTUDIO_API_BASE_URL' },
  AmazonBedrock: { apiTokenKey: 'AWS_BEDROCK_CONFIG' },
  Github: { apiTokenKey: 'GITHUB_API_KEY' },
  'Z.ai': { baseUrlKey: 'ZAI_BASE_URL', apiTokenKey: 'ZAI_API_KEY' },
};