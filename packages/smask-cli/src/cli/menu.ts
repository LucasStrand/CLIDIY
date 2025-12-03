import chalk from "chalk";
import readline from "node:readline";
import { input, confirm } from "@inquirer/prompts";
import {
  displayHomePreview,
  displayError,
  displaySuccess,
  displayHelp,
  displayConfigStatus,
  showThinking,
  formatResponse,
  brand,
  buildHomeScreenLayout,
  buildPromptBoxLines,
  renderPromptBoxBlock,
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

interface Choice<T> {
  name: string;
  value: T;
}

/**
 * Custom select with vim keybindings (j/k, gg, G, q/Esc).
 */
async function selectVim<T>(opts: {
  message?: string;
  choices: Choice<T>[];
  layout?: (content: string) => string;
  pointer?: { active: string; inactive: string };
  choiceFormatter?: (choice: Choice<T>, isSelected: boolean) => string;
  quickSelects?: { key: string; value: T }[];
  fullScreen?: boolean;
}): Promise<T> {
  const {
    message = "",
    choices,
    layout,
    pointer,
    choiceFormatter,
    quickSelects,
    fullScreen = false,
  } = opts;
  if (choices.length === 0) {
    throw new Error("No choices available.");
  }

  let index = 0;
  let ggAt: number | null = null;
  const hide = "\x1B[?25l"; // Hide cursor
  const show = "\x1B[?25h"; // Show cursor
  const pointerActive = pointer?.active ?? brand("❯");
  const pointerInactive = pointer?.inactive ?? " ";
  const formatChoice =
    choiceFormatter ??
    ((choice: Choice<T>, isSelected: boolean) =>
      isSelected ? brand(choice.name) : choice.name);

  let lastRenderLines = 0;
  const moveToTop = () =>
    lastRenderLines > 0 ? `\x1B[${lastRenderLines}A\x1B[0G` : "";

  const baseRender = (): string => {
    const lines: string[] = [];
    if (message.trim().length > 0) {
      lines.push(chalk.bold(message));
      lines.push("");
    }
    for (let i = 0; i < choices.length; i++) {
      const pointerSymbol = i === index ? pointerActive : pointerInactive;
      const choice = choices[i]!;
      const label = formatChoice(choice, i === index);
      lines.push(`${pointerSymbol} ${label}`);
    }
    return lines.join("\n");
  };

  const render = (): string => {
    const content = baseRender();
    const wrapped = layout ? layout(content) : content;
    lastRenderLines = wrapped.split("\n").length;
    return wrapped;
  };
  const writeFrame = (frame: string, initial: boolean): void => {
    // Always clear and reset cursor position for reliable rendering
    // Use escape sequences for more reliable clearing
    process.stdout.write("\x1B[2J"); // Clear entire screen
    process.stdout.write("\x1B[H");  // Move cursor to top-left (row 1, column 1)
    process.stdout.write(hide + frame);
  };

  const clearFrame = (): void => {
    // Always clear screen and reset cursor position
    process.stdout.write("\x1B[2J"); // Clear entire screen
    process.stdout.write("\x1B[H");  // Move cursor to top-left
  };

  return new Promise<T>((resolve, reject) => {
    // Set up fresh stdin state
    process.stdin.removeAllListeners("keypress");
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    const initialRender = render();
    writeFrame(initialRender, true);

    const cleanup = () => {
      process.stdout.write(show);
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    const onKey = (str: string | undefined, key: readline.Key | undefined) => {
      // Handle Ctrl+C
      if (key?.ctrl && key?.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }
      
      // Handle Enter - select current item
      if (key?.name === "return") {
        clearFrame();
        cleanup();
        resolve(choices[index]!.value);
        return;
      }
      if (str && quickSelects) {
        const quick = quickSelects.find((q) => q.key === str);
        if (quick) {
          clearFrame();
          cleanup();
          resolve(quick.value);
          return;
        }
      }

      
      // Handle Escape or q - cancel
      if (key?.name === "escape" || str === "q") {
        clearFrame();
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }
      
      const prev = index;
      
      // Vim navigation: j = down, k = up
      if (key?.name === "down" || str === "j") {
        index = Math.min(index + 1, choices.length - 1);
      }
      if (key?.name === "up" || str === "k") {
        index = Math.max(index - 1, 0);
      }
      
      // G = go to end
      if (str === "G") {
        index = choices.length - 1;
      }
      
      // gg = go to start (double tap g within 500ms)
      if (str === "g") {
        const now = Date.now();
        if (ggAt && now - ggAt < 500) {
          index = 0;
          ggAt = null;
        } else {
          ggAt = now;
        }
      }
      
      // Re-render if selection changed
      if (prev !== index) {
        const frame = render();
        writeFrame(frame, false);
      }
    };

    process.stdin.on("keypress", onKey);
  });
}

function renderMenuBlock(choices: Choice<MainMenuAction>[], hasModel: boolean): string {
  const lines: string[] = [];
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i]!;
    const label = chalk.gray(choice.name);
    lines.push(`  ${label}`);
  }
  return lines.join("\n");
}

let hasShownHomeScreen = false;
let hasActivePromptBox = false;

async function captureChatInput(
  hasModel: boolean,
  choices: Choice<MainMenuAction>[]
): Promise<string | undefined> {
  const hide = "\x1B[?25l";
  const show = "\x1B[?25h";

  let text = "";
  let cursorHidden = false;

  const render = () => {
    if (!cursorHidden) {
      process.stdout.write(hide);
      cursorHidden = true;
    }
    
    // Always re-render the full home screen to avoid cursor positioning issues
    console.clear();
    const menuBlock = renderMenuBlock(choices, hasModel);
    process.stdout.write(
      buildHomeScreenLayout(menuBlock, hasModel, text.length > 0 ? text : "")
    );
    hasShownHomeScreen = true;
    hasActivePromptBox = true;
  };

  return new Promise<string | undefined>((resolve) => {
    process.stdin.removeAllListeners("keypress");
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const cleanup = () => {
      if (cursorHidden) {
        process.stdout.write(show);
        cursorHidden = false;
      }
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    const submit = () => {
      const value = text;
      // Mark prompt box as inactive so next input creates a new one
      hasActivePromptBox = false;
      cleanup();
      resolve(value);
    };

    const cancel = () => {
      // Mark prompt box as inactive
      hasActivePromptBox = false;
      cleanup();
      resolve(undefined);
    };

    const onKey = (str: string | undefined, key: readline.Key | undefined) => {
      if (key?.ctrl && key?.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }

      if (key?.name === "return") {
        submit();
        return;
      }

      if (key?.name === "escape") {
        cancel();
        return;
      }

      if (key?.name === "backspace") {
        if (text.length > 0) {
          text = text.slice(0, -1);
        }
        render();
        return;
      }

      // Arrow keys exit insert mode and return to menu
      if (key?.name === "up" || key?.name === "down") {
        cancel();
        return;
      }

      if (
        key?.name === "tab" ||
        key?.name === "left" ||
        key?.name === "right"
      ) {
        return;
      }

      if (str) {
        text += str;
        render();
      }
    };

    render();
    process.stdin.on("keypress", onKey);
  });
}

/**
 * Run the main interactive menu.
 */
export async function runInteractiveMenu(): Promise<void> {
  let exit = false;
  while (!exit) {
    const hasModel = hasConfiguredModel();

    const choices: Choice<MainMenuAction>[] = [
      ...(hasModel ? [{ name: "Ask a question", value: "ask" as MainMenuAction }] : []),
      { name: "Settings", value: "settings" },
      { name: "Help", value: "help" },
      { name: "Exit", value: "exit" },
    ];

    try {
      // If model is configured, start directly in insert mode
      if (hasModel) {
        const question = await captureChatInput(hasModel, choices);
        
        if (question === undefined) {
          // User pressed Esc - show menu for navigation
          const action = await selectVim({
            message: "",
            choices,
            layout: (content) => buildHomeScreenLayout(content, hasModel),
            pointer: {
              active: brand("❯"),
              inactive: chalk.gray(" "),
            },
            choiceFormatter: (choice, selected) => chalk.gray(choice.name),
            quickSelects: [{ key: "i", value: "ask" as MainMenuAction }],
            fullScreen: true,
          });

          switch (action) {
            case "ask":
              await handleAskQuestion(choices);
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
        } else {
          // User submitted a question
          await processQuestion(question, choices);
          // Reset home screen state so it renders fresh after showing answer
          hasShownHomeScreen = false;
          hasActivePromptBox = false;
        }
      } else {
        // No model configured - show menu
        const action = await selectVim({
          message: "",
          choices,
          layout: (content) => buildHomeScreenLayout(content, hasModel),
          pointer: {
            active: brand("❯"),
            inactive: chalk.gray(" "),
          },
          choiceFormatter: (choice, selected) => chalk.gray(choice.name),
          fullScreen: true,
        });

        switch (action) {
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
 * Process a submitted question.
 */
async function processQuestion(question: string, choices: Choice<MainMenuAction>[]): Promise<void> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    displayError("Please enter a question.");
    return;
  }

  // Handle special commands
  if (normalizedQuestion.startsWith("/")) {
    // Let the command control what is shown on screen.
    // We don't redraw the home layout here so answers and help text remain visible.
    await handleCommand(normalizedQuestion);
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
    
    for await (const chunk of model.streamQuery(normalizedQuestion)) {
      if (!chunk.done) {
        process.stdout.write(formatResponse(chunk.text));
      }
    }
    
    console.log("\n");
    // Wait for user to press Enter before returning to input
    console.log(chalk.gray("Press Enter to continue..."));
    await waitForEnter();
  } catch (error) {
    spinner.stop();
    const message = error instanceof Error ? error.message : String(error);
    displayError(`Failed to get response: ${message}`);
    console.log(chalk.gray("Press Enter to continue..."));
    await waitForEnter();
  }
}

/**
 * Handle the "Ask a question" flow.
 */
async function handleAskQuestion(choices?: Choice<MainMenuAction>[]): Promise<void> {
  const hasModel = hasConfiguredModel();
  const menuChoices = choices ?? [
    ...(hasModel ? [{ name: "Ask a question", value: "ask" as MainMenuAction }] : []),
    { name: "Settings", value: "settings" },
    { name: "Help", value: "help" },
    { name: "Exit", value: "exit" },
  ];
  const question = await captureChatInput(hasModel, menuChoices);

  if (question === undefined) {
    // User cancelled insert mode - return to menu
    return;
  }

  await processQuestion(question, menuChoices);
}

/**
 * Wait for user to press Enter before continuing.
 */
function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.removeAllListeners("keypress");
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    const onKey = (str: string | undefined, key: readline.Key | undefined) => {
      if (key?.ctrl && key?.name === "c") {
        cleanup();
        process.stdout.write("\n");
        process.exit(0);
      }

      if (key?.name === "return") {
        cleanup();
        resolve();
        return;
      }
    };

    process.stdin.on("keypress", onKey);
  });
}

/**
 * Handle slash commands.
 */
async function handleCommand(command: string): Promise<void> {
  const cmd = command.toLowerCase().trim();
  
  switch (cmd) {
    case "/help":
      displayHelp();
      console.log(chalk.gray("\nPress Enter to continue..."));
      await waitForEnter();
      break;
    case "/settings":
      await handleSettings();
      break;
    case "/clear":
      hasShownHomeScreen = false; // Reset so full screen shows again
      hasActivePromptBox = false; // Reset prompt box state
      displayHomePreview(hasConfiguredModel());
      hasShownHomeScreen = true; // Mark as shown
      hasActivePromptBox = true; // Mark prompt box as active
      break;
    case "/exit":
    case "/quit":
      process.exit(0);
    case "/status":
      displayConfigStatus();
      console.log(chalk.gray("\nPress Enter to continue..."));
      await waitForEnter();
      break;
    default:
      displayError(`Unknown command: ${command}`);
      console.log(chalk.gray("Type /help for available commands."));
      console.log(chalk.gray("\nPress Enter to continue..."));
      await waitForEnter();
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
        ? [{ name: "Clear all credentials", value: "clear-credentials" as SettingsAction }]
        : []),
      { name: "View configuration status", value: "view-status" },
      { name: "← Back", value: "back" },
    ];

    let action: SettingsAction;
    try {
      action = await selectVim({
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
    // User cancelled
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
