import { OpenAIProvider } from "./providers/openai-provider"
import { OllamaProvider } from "./providers/ollama-provider"
import { DeterministicProvider } from "./providers/deterministic-provider"
import type { StandardizerProvider } from "./provider"

export function getActiveProvider(): StandardizerProvider {
  const name = process.env.STANDARDIZER_PROVIDER ?? "openai"
  switch (name) {
    case "openai":
      return new OpenAIProvider()
    case "ollama":
      return new OllamaProvider()
    case "deterministic":
      return new DeterministicProvider()
    default:
      throw new Error(`Unknown STANDARDIZER_PROVIDER: ${name}`)
  }
}

export function getShadowProvider(): StandardizerProvider | null {
  const name = process.env.STANDARDIZER_SHADOW_PROVIDER
  if (!name) return null
  if (name === (process.env.STANDARDIZER_PROVIDER ?? "openai")) return null

  switch (name) {
    case "openai":
      return new OpenAIProvider()
    case "ollama":
      return new OllamaProvider()
    default:
      throw new Error(`Unknown STANDARDIZER_SHADOW_PROVIDER: ${name}`)
  }
}
