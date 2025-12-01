import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMModel, StreamChunk, ModelProvider } from "./base.js";
import { getGeminiApiKey, isGeminiConfigured } from "../config/config.js";
import { getAccessToken, isLoggedIn } from "../auth/google.js";
import { registerModel } from "./registry.js";

const DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * Gemini model implementation.
 */
class GeminiModel implements LLMModel {
  readonly id = "gemini";
  readonly name = "Gemini";
  readonly provider = "Google";
  
  private modelId: string;
  private client: GoogleGenerativeAI | undefined;

  constructor(modelId: string = DEFAULT_MODEL) {
    this.modelId = modelId;
  }

  /**
   * Check if Gemini is configured with API key or OAuth.
   */
  isConfigured(): boolean {
    return isGeminiConfigured() || isLoggedIn();
  }

  /**
   * Get or create the Gemini client.
   */
  private async getClient(): Promise<GoogleGenerativeAI> {
    if (this.client) {
      return this.client;
    }

    // Try API key first
    const apiKey = getGeminiApiKey();
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
      return this.client;
    }

    // Try OAuth token
    const accessToken = await getAccessToken();
    if (accessToken) {
      // Note: The @google/generative-ai SDK primarily uses API keys
      // For OAuth, we'd need to use a different approach or the REST API directly
      // For now, we'll throw an error suggesting API key usage
      throw new Error(
        "OAuth authentication is not yet fully supported for Gemini API. " +
        "Please use an API key instead. You can get one at https://aistudio.google.com/apikey"
      );
    }

    throw new Error(
      "Gemini is not configured. Please set an API key using the settings menu " +
      "or the GEMINI_API_KEY environment variable."
    );
  }

  /**
   * Send a query to Gemini and get a response.
   */
  async query(prompt: string): Promise<string> {
    const client = await this.getClient();
    const model = client.getGenerativeModel({ model: this.modelId });
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  /**
   * Stream a query response from Gemini.
   */
  async *streamQuery(prompt: string): AsyncGenerator<StreamChunk, void, unknown> {
    const client = await this.getClient();
    const model = client.getGenerativeModel({ model: this.modelId });
    
    const result = await model.generateContentStream(prompt);
    
    for await (const chunk of result.stream) {
      const text = chunk.text();
      yield { text, done: false };
    }
    
    yield { text: "", done: true };
  }

  /**
   * Get a status message for the UI.
   */
  getStatusMessage(): string {
    const apiKey = getGeminiApiKey();
    if (apiKey) {
      return `Using API key (${this.modelId})`;
    }
    
    if (isLoggedIn()) {
      return `Logged in with Google (${this.modelId})`;
    }
    
    return "Not configured";
  }
}

/**
 * Create a new Gemini model instance.
 */
export function createGeminiModel(modelId?: string): GeminiModel {
  return new GeminiModel(modelId);
}

/**
 * Gemini provider metadata.
 */
export const geminiProvider: ModelProvider = {
  id: "gemini",
  name: "Gemini",
  description: "Google's Gemini AI models",
  factory: () => createGeminiModel(),
  requiresAuth: true,
  authType: "both",
};

/**
 * Register Gemini with the model registry.
 */
export function registerGemini(): void {
  registerModel(geminiProvider);
}

// Auto-register when this module is imported
registerGemini();




