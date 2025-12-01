import type { LLMModel, ModelProvider, ModelFactory } from "./base.js";

/**
 * Registry for managing available LLM models.
 * Provides a central place to register and retrieve model implementations.
 */
class ModelRegistry {
  private providers: Map<string, ModelProvider> = new Map();
  private instances: Map<string, LLMModel> = new Map();

  /**
   * Register a model provider.
   * @param provider The provider metadata and factory
   */
  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a model instance by provider ID.
   * Creates a new instance if one doesn't exist.
   * @param providerId The provider ID (e.g., "gemini", "openai")
   * @returns The model instance
   */
  getModel(providerId: string): LLMModel | undefined {
    // Return cached instance if available
    const cached = this.instances.get(providerId);
    if (cached) {
      return cached;
    }

    // Create new instance from provider
    const provider = this.providers.get(providerId);
    if (!provider) {
      return undefined;
    }

    const instance = provider.factory();
    this.instances.set(providerId, instance);
    return instance;
  }

  /**
   * Get all registered providers.
   */
  getProviders(): ModelProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get a provider by ID.
   */
  getProvider(providerId: string): ModelProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all configured models (models that are ready to use).
   */
  getConfiguredModels(): LLMModel[] {
    const configured: LLMModel[] = [];
    for (const provider of this.providers.values()) {
      const model = this.getModel(provider.id);
      if (model?.isConfigured()) {
        configured.push(model);
      }
    }
    return configured;
  }

  /**
   * Check if any model is configured and ready to use.
   */
  hasConfiguredModel(): boolean {
    return this.getConfiguredModels().length > 0;
  }

  /**
   * Get the list of provider IDs.
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear cached model instances.
   * Useful when configuration changes.
   */
  clearCache(): void {
    this.instances.clear();
  }
}

// Singleton registry instance
export const registry = new ModelRegistry();

/**
 * Register a model provider with the global registry.
 */
export function registerModel(provider: ModelProvider): void {
  registry.register(provider);
}

/**
 * Get a model by provider ID from the global registry.
 */
export function getModel(providerId: string): LLMModel | undefined {
  return registry.getModel(providerId);
}

/**
 * Get all configured models from the global registry.
 */
export function getConfiguredModels(): LLMModel[] {
  return registry.getConfiguredModels();
}

/**
 * Check if any model is configured in the global registry.
 */
export function hasConfiguredModel(): boolean {
  return registry.hasConfiguredModel();
}

/**
 * Get all registered providers.
 */
export function getProviders(): ModelProvider[] {
  return registry.getProviders();
}

/**
 * Clear the model cache.
 */
export function clearModelCache(): void {
  registry.clearCache();
}




