/**
 * Response chunk for streaming responses.
 */
export interface StreamChunk {
  text: string;
  done: boolean;
}

/**
 * Base interface for all LLM model implementations.
 * This interface ensures consistency across different model providers.
 */
export interface LLMModel {
  /**
   * Unique identifier for this model.
   */
  readonly id: string;

  /**
   * Human-readable name for this model.
   */
  readonly name: string;

  /**
   * Provider name (e.g., "Google", "OpenAI", "Anthropic").
   */
  readonly provider: string;

  /**
   * Check if this model is properly configured and ready to use.
   */
  isConfigured(): boolean;

  /**
   * Send a query to the model and get a response.
   * @param prompt The user's question or prompt
   * @returns The model's response text
   */
  query(prompt: string): Promise<string>;

  /**
   * Send a query to the model and stream the response.
   * @param prompt The user's question or prompt
   * @returns An async generator that yields response chunks
   */
  streamQuery(prompt: string): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * Get the current configuration status message.
   * Useful for displaying in the UI.
   */
  getStatusMessage(): string;
}

/**
 * Options for creating an LLM model instance.
 */
export interface ModelOptions {
  apiKey?: string;
  accessToken?: string;
  modelId?: string;
}

/**
 * Factory function type for creating model instances.
 */
export type ModelFactory = (options?: ModelOptions) => LLMModel;

/**
 * Model provider metadata.
 */
export interface ModelProvider {
  id: string;
  name: string;
  description: string;
  factory: ModelFactory;
  requiresAuth: boolean;
  authType: "api_key" | "oauth" | "both";
}




