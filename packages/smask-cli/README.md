# SMASK CLI

Ask LLMs questions directly from your terminal.

```
  ███████╗███╗   ███╗ █████╗ ███████╗██╗  ██╗
  ██╔════╝████╗ ████║██╔══██╗██╔════╝██║ ██╔╝
  ███████╗██╔████╔██║███████║███████╗█████╔╝
  ╚════██║██║╚██╔╝██║██╔══██║╚════██║██╔═██╗
  ███████║██║ ╚═╝ ██║██║  ██║███████║██║  ██╗
  ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

## Features

- **Direct Questions**: Ask questions directly from the command line
- **Interactive Menu**: Full TUI with vim-style navigation
- **Multiple Model Support**: Modular architecture for easy expansion
- **Gemini Integration**: Works with Google's Gemini AI models
- **OAuth & API Key**: Flexible authentication options
- **Streaming Responses**: See answers as they're generated

## Installation

```bash
npm install -g smask-cli
```

Or install locally:

```bash
npm install smask-cli
```

## Quick Start

### 1. Get a Gemini API Key

Visit [Google AI Studio](https://aistudio.google.com/apikey) to get your free API key.

### 2. Set Up Your API Key

```bash
smask config --set apikey=YOUR_API_KEY
```

Or set the environment variable:

```bash
export GEMINI_API_KEY=YOUR_API_KEY
```

### 3. Ask Questions!

```bash
smask "What is the meaning of life?"
```

## Usage

### Direct Questions

```bash
# Ask a question directly
smask What is TypeScript?

# Quotes are optional
smask "How do I create a React component?"
```

### Interactive Mode

```bash
# Open the interactive menu
smask
```

Navigate with:

- `j` / `↓` - Move down
- `k` / `↑` - Move up
- `Enter` - Select
- `q` / `Esc` - Go back / Exit

### Commands

```bash
# Show help
smask help

# Configure settings
smask config --status           # View current config
smask config --set apikey=xxx   # Set API key
smask config --set model=gemini # Set default model
smask config --get apikey       # Get current API key

# Authentication
smask login                     # Login with Google OAuth
smask logout                    # Logout

# Clear all credentials
smask clear
```

### Interactive Commands

While in interactive mode, you can use these commands:

- `/help` - Show help
- `/settings` - Open settings menu
- `/clear` - Clear the screen
- `/status` - Show configuration status
- `/exit` - Exit SMASK

## Configuration

Configuration is stored in `~/.smask/config.json`.

### Environment Variables

- `GEMINI_API_KEY` - Gemini API key
- `GOOGLE_CLIENT_ID` - Custom OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Custom OAuth client secret
- `SMASK_CONFIG_DIR` - Custom config directory

## Architecture

SMASK uses a modular architecture that makes it easy to add new LLM providers:

```
src/
├── index.ts          # CLI entry point
├── cli/
│   ├── menu.ts       # Interactive menu
│   └── ui.ts         # UI components
├── models/
│   ├── base.ts       # Model interface
│   ├── gemini.ts     # Gemini implementation
│   └── registry.ts   # Model registry
├── auth/
│   ├── google.ts     # Google OAuth
│   └── token.ts      # Token management
└── config/
    └── config.ts     # Configuration management
```

### Adding New Models

To add support for a new LLM provider:

1. Create a new file in `src/models/` implementing `LLMModel`
2. Create a `ModelProvider` with a factory function
3. Register the provider with `registerModel()`

Example:

```typescript
import { LLMModel, ModelProvider, registerModel } from "./base.js";

class MyModel implements LLMModel {
  readonly id = "mymodel";
  readonly name = "My Model";
  readonly provider = "My Provider";

  isConfigured(): boolean {
    // Check if model is configured
  }

  async query(prompt: string): Promise<string> {
    // Implementation
  }

  async *streamQuery(prompt: string): AsyncGenerator<StreamChunk> {
    // Streaming implementation
  }

  getStatusMessage(): string {
    return "Status";
  }
}

registerModel({
  id: "mymodel",
  name: "My Model",
  description: "Description",
  factory: () => new MyModel(),
  requiresAuth: true,
  authType: "api_key",
});
```

## Development

```bash
# Clone the repository
git clone https://github.com/your-username/smask-cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start

# Or use ts-node for development
npm run dev
```

## License

MIT
