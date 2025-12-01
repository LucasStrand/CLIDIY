import readline from "node:readline";
import chalk from "chalk";
import { input, confirm } from "@inquirer/prompts";
import {
  displayLogo,
  displayTips,
  displayStatusBar,
  displayError,
  displaySuccess,
  displayHelp,
  displayConfigStatus,
  showThinking,
  formatResponse,
  brand,
  BRAND_COLOR,
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

type Choice<T> = { name: string; value: T };

type MainMenuAction =
  | "ask"
  | "settings"
  | "help"
  | "exit";

type SettingsAction =
  | "set-api-key"
  | "choose-model"
  | "clear-credentials"
  | "view-status"
  | "back";

/**
 * Vim-style select menu with keyboard navigation.
 */
async function selectVim<T>(opts: {
  message: string;
  choices: Choice<T>[];
}): Promise<T> {
  const { message, choices } = opts;
  if (choices.length === 0) {
    throw new Error("No choices available.");
  }

  let index = 0;
  let ggAt: number | null = null;
  const totalLines = () => 1 + choices.length;
  const hide = "\x1B[?25l";
  const show = "\x1B[?25h";
  const moveToTop = () => `\x1B[${Math.max(0, totalLines() - 1)}A\x1B[0G`;
  
  const render = () => {
    const out: string[] = [];
    out.push(`${chalk.bold(message)}\n`);
    for (let i = 0; i < choices.length; i++) {
      const pointer = i === index ? brand("❯") : " ";
      const choice = choices[i]!;
      const label = i === index ? brand(choice.name) : choice.name;
      out.push(`${pointer} ${label}`);
      if (i < choices.length - 1) out.push("\n");
    }
    return out.join("");
  };

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdout.write(hide + render());

  return await new Promise<T>((resolve, reject) => {
    function cleanup() {
      process.stdout.write("\n" + show);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKey);
    }

    function onKey(str: string, key: readline.Key) {
      if (key?.name === "return") {
        process.stdout.write(moveToTop() + "\x1B[0J");
        cleanup();
        resolve(choices[index]!.value);
        return;
      }
      if (key?.name === "escape" || str === "q") {
        process.stdout.write(moveToTop() + "\x1B[0J");
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }
      if (key?.ctrl && key?.name === "c") {
        cleanup();
        process.exit(0);
      }
      
      const prev = index;
      if (key?.name === "down" || str === "j") {
        index = Math.min(index + 1, choices.length - 1);
      }
      if (key?.name === "up" || str === "k") {
        index = Math.max(index - 1, 0);
      }
      if (str === "G") {
        index = choices.length - 1;
      }
      if (str === "g") {
        const now = Date.now();
        if (ggAt && now - ggAt < 500) {
          index = 0;
          ggAt = null;
        } else {
          ggAt = now;
        }
      }
      if (prev !== index) {
        process.stdout.write(moveToTop() + "\x1B[0J" + render());
      }
    }

    process.stdin.on("keypress", onKey);
  });
}

/**
 * Run the main interactive menu.
 */
export async function runInteractiveMenu(): Promise<void> {
  displayLogo();
  displayTips();

  let exit = false;
  while (!exit) {
    const hasModel = hasConfiguredModel();
    
    const choices: Choice<MainMenuAction>[] = [
      ...(hasModel ? [{ name: "Ask a question", value: "ask" as const }] : []),
      { name: "Settings", value: "settings" as const },
      { name: "Help", value: "help" as const },
      { name: "Exit", value: "exit" as const },
    ];

    try {
      const action = await selectVim<MainMenuAction>({
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
    } catch (error) {
      if (error instanceof Error && error.message === "Cancelled") {
        exit = true;
      } else {
        throw error;
      }
    }
  }

  console.log(chalk.gray("\nGoodbye! 👋\n"));
  process.exit(0);
}

/**
 * Handle the "Ask a question" flow.
 */
async function handleAskQuestion(): Promise<void> {
  const question = await input({
    message: "Your question:",
  });

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
    let response = "";
    spinner.stop();
    console.log();
    
    process.stdout.write(brand("✦ "));
    
    for await (const chunk of model.streamQuery(question)) {
      if (!chunk.done) {
        process.stdout.write(formatResponse(chunk.text));
        response += chunk.text;
      }
    }
    
    console.log("\n");
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : String(error);
    displayError(`Failed to get response: ${message}`);
  }
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
    
    const choices: Choice<SettingsAction>[] = [
      { name: "Set Gemini API Key", value: "set-api-key" },
      { name: "Choose default model", value: "choose-model" },
      ...(hasApiKey
        ? [{ name: "Clear all credentials", value: "clear-credentials" as const }]
        : []),
      { name: "View configuration status", value: "view-status" },
      { name: "← Back", value: "back" },
    ];

    try {
      const action = await selectVim<SettingsAction>({
        message: "Settings",
        choices,
      });

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
    } catch (error) {
      if (error instanceof Error && error.message === "Cancelled") {
        back = true;
      } else {
        throw error;
      }
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
  
  const choices: Choice<string>[] = providers.map((p) => ({
    name: p.id === currentDefault
      ? `${p.name} ${chalk.gray("(current default)")}`
      : p.name,
    value: p.id,
  }));

  try {
    const selected = await selectVim({
      message: "Select default model:",
      choices,
    });

    setDefaultModel(selected);
    displaySuccess(`Default model set to: ${selected}`);
  } catch (error) {
    if (!(error instanceof Error && error.message === "Cancelled")) {
      throw error;
    }
  }
}

/**
 * Handle clearing all credentials.
 */
async function handleClearCredentials(): Promise<void> {
  const confirmed = await confirm({
    message: "This will remove all API keys. Continue?",
    default: false,
  });

  if (confirmed) {
    clearGeminiCredentials();
    clearModelCache();
    displaySuccess("All credentials cleared.");
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
    console.log(chalk.gray("Run \"smask\" to set up your API key or login.\n"));
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




