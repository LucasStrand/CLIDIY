import chalk from "chalk";
import { input, confirm, select } from "@inquirer/prompts";
import {
  displayLogo,
  displayTips,
  displayError,
  displaySuccess,
  displayHelp,
  displayConfigStatus,
  showThinking,
  formatResponse,
  brand,
} from "./ui.js";
import {
  getDefaultModel,
  setDefaultModel,
  setGeminiApiKey,
  getGeminiApiKey,
  isGeminiConfigured,
  clearGeminiCredentials,
} from "../config/config.js";
import { getModel, getProviders, hasConfiguredModel, clearModelCache } from "../models/registry.js";
// Import to register Gemini
import "../models/gemini.js";

type MainMenuAction = "ask" | "settings" | "help" | "exit";
type SettingsAction = "set-api-key" | "choose-model" | "clear-credentials" | "view-status" | "back";

/**
 * Run the main interactive menu.
 */
export async function runInteractiveMenu(): Promise<void> {
  displayLogo();
  displayTips();

  let exit = false;
  while (!exit) {
    const hasModel = hasConfiguredModel();
    
    const choices = [
      ...(hasModel ? [{ name: "Ask a question", value: "ask" as MainMenuAction }] : []),
      { name: "Settings", value: "settings" as MainMenuAction },
      { name: "Help", value: "help" as MainMenuAction },
      { name: "Exit", value: "exit" as MainMenuAction },
    ];

    try {
      const action = await select({
        message: hasModel ? "What would you like to do?" : "Configure a model to get started:",
        choices,
      });

      switch (action) {
        case "ask":
          await handleAskQuestion();
          break;
        case "settings":
          await handleSettings();
          break;
        case "help":
          displayHelp();
          break;
        case "exit":
          exit = true;
          break;
      }
    } catch {
      // User pressed Ctrl+C or escaped
      exit = true;
    }
  }

  console.log(chalk.gray("\nGoodbye! 👋\n"));
  process.exit(0);
}

/**
 * Handle the "Ask a question" flow.
 */
async function handleAskQuestion(): Promise<void> {
  let question: string;
  try {
    question = await input({
      message: "Your question:",
    });
  } catch {
    // User cancelled
    return;
  }

  if (!question.trim()) {
    displayError("Please enter a question.");
    return;
  }

  // Handle special commands
  if (question.startsWith("/")) {
    await handleCommand(question);
    return;
  }

  const modelId = getDefaultModel() ?? "gemini";
  const model = getModel(modelId);

  if (!model) {
    displayError(`Model "${modelId}" not found. Please configure a model first.`);
    return;
  }

  if (!model.isConfigured()) {
    displayError(`Model "${modelId}" is not configured. Please set an API key.`);
    return;
  }

  const spinner = showThinking("Thinking...");
  
  try {
    // Use streaming for better UX
    spinner.stop();
    console.log();
    
    process.stdout.write(brand("✦ "));
    
    for await (const chunk of model.streamQuery(question)) {
      if (!chunk.done) {
        process.stdout.write(formatResponse(chunk.text));
      }
    }
    
    console.log("\n");
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : String(error);
    displayError(`Failed to get response: ${message}`);
  }
  
  // Reset stdin state after streaming - this helps inquirer work properly
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
  process.stdin.resume();
}

/**
 * Handle slash commands.
 */
async function handleCommand(command: string): Promise<void> {
  const cmd = command.toLowerCase().trim();
  
  switch (cmd) {
    case "/help":
      displayHelp();
      break;
    case "/settings":
      await handleSettings();
      break;
    case "/clear":
      console.clear();
      displayLogo();
      displayTips();
      break;
    case "/exit":
    case "/quit":
      process.exit(0);
    case "/status":
      displayConfigStatus();
      break;
    default:
      displayError(`Unknown command: ${command}`);
      console.log(chalk.gray("Type /help for available commands."));
  }
}

/**
 * Handle the settings menu.
 */
async function handleSettings(): Promise<void> {
  let back = false;
  
  while (!back) {
    const hasApiKey = isGeminiConfigured();
    
    const choices = [
      { name: "Set Gemini API Key", value: "set-api-key" as SettingsAction },
      { name: "Choose default model", value: "choose-model" as SettingsAction },
      ...(hasApiKey
        ? [{ name: "Clear all credentials", value: "clear-credentials" as SettingsAction }]
        : []),
      { name: "View configuration status", value: "view-status" as SettingsAction },
      { name: "← Back", value: "back" as SettingsAction },
    ];

    let action: SettingsAction;
    try {
      action = await select({
        message: "Settings",
        choices,
      });
    } catch {
      // User cancelled
      back = true;
      continue;
    }

    switch (action) {
      case "set-api-key":
        await handleSetApiKey();
        break;
      case "choose-model":
        await handleChooseModel();
        break;
      case "clear-credentials":
        await handleClearCredentials();
        break;
      case "view-status":
        displayConfigStatus();
        break;
      case "back":
        back = true;
        break;
    }
  }
}

/**
 * Handle setting the API key.
 */
async function handleSetApiKey(): Promise<void> {
  const currentKey = getGeminiApiKey();
  const maskedKey = currentKey
    ? `${currentKey.slice(0, 8)}...${currentKey.slice(-4)}`
    : undefined;

  if (maskedKey) {
    console.log(chalk.gray(`\nCurrent API key: ${maskedKey}`));
  }

  try {
    const apiKey = await input({
      message: "Enter your Gemini API key:",
      validate: (value) => {
        if (!value.trim()) {
          return "API key cannot be empty";
        }
        return true;
      },
    });

    setGeminiApiKey(apiKey.trim());
    clearModelCache();
    displaySuccess("API key saved successfully!");
    console.log(chalk.gray("Get your API key at: https://aistudio.google.com/apikey\n"));
  } catch {
    // User cancelled, just return to menu
  }
}

/**
 * Handle choosing the default model.
 */
async function handleChooseModel(): Promise<void> {
  const providers = getProviders();
  
  if (providers.length === 0) {
    displayError("No model providers available.");
    return;
  }

  const currentDefault = getDefaultModel();
  
  const choices = providers.map((p) => ({
    name: p.id === currentDefault
      ? `${p.name} ${chalk.gray("(current default)")}`
      : p.name,
    value: p.id,
  }));

  try {
    const selected = await select({
      message: "Select default model:",
      choices,
    });

    setDefaultModel(selected);
    displaySuccess(`Default model set to: ${selected}`);
  } catch {
    // User cancelled
  }
}

/**
 * Handle clearing all credentials.
 */
async function handleClearCredentials(): Promise<void> {
  try {
    const confirmed = await confirm({
      message: "This will remove all API keys. Continue?",
      default: false,
    });

    if (confirmed) {
      clearGeminiCredentials();
      clearModelCache();
      displaySuccess("All credentials cleared.");
    }
  } catch {
    // User cancelled
  }
}

/**
 * Handle a direct question from command line arguments.
 */
export async function handleDirectQuestion(question: string): Promise<void> {
  const modelId = getDefaultModel() ?? "gemini";
  const model = getModel(modelId);

  if (!model) {
    displayError(`Model "${modelId}" not found. Run "smask" to configure.`);
    process.exit(1);
  }

  if (!model.isConfigured()) {
    displayError(`Model "${modelId}" is not configured.`);
    console.log(chalk.gray("Run \"smask\" to set up your API key.\n"));
    process.exit(1);
  }

  const spinner = showThinking("Thinking...");
  
  try {
    spinner.stop();
    process.stdout.write(brand("\n✦ "));
    
    for await (const chunk of model.streamQuery(question)) {
      if (!chunk.done) {
        process.stdout.write(formatResponse(chunk.text));
      }
    }
    
    console.log("\n");
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : String(error);
    displayError(`Failed to get response: ${message}`);
    process.exit(1);
  }
}
