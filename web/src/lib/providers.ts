// Shared provider catalog for provider-key management — one source of truth
// for both the Developer Portal (per-team BYOK keys) and the Admin Console
// (platform-wide keys). Keep in sync with SUPPORTED_PROVIDERS in
// backend/app/services/team_provider_keys.py.

export interface ProviderOption {
  id: string
  label: string
  envVar: string
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'openrouter', label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY' },
  { id: 'gemini', label: 'Gemini', envVar: 'GEMINI_API_KEY' },
  { id: 'groq', label: 'Groq', envVar: 'GROQ_API_KEY' },
  { id: 'nvidia', label: 'NVIDIA', envVar: 'NVIDIA_API_KEY' },
  { id: 'mistral', label: 'Mistral', envVar: 'MISTRAL_API_KEY' },
  { id: 'openai', label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'huggingface', label: 'HuggingFace', envVar: 'HUGGINGFACE_API_KEY' },
  { id: 'huggingface_inference', label: 'HuggingFace Inference', envVar: 'HUGGINGFACE_API_KEY' },
  { id: 'cohere', label: 'Cohere', envVar: 'COHERE_API_KEY' },
  { id: 'voyage', label: 'Voyage AI', envVar: 'VOYAGE_API_KEY' },
]
