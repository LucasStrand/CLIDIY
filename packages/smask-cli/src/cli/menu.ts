import chalk from "chalk";
import readline from "node:readline";
import { input, confirm } from "@inquirer/prompts";
import type { ChatMessage } from "./ui.js";
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
  renderUserMessage,
  renderAssistantMessage,
  buildStatusLine,
  renderLogoBlock,
  renderTipsBlock,
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

// Chat conversation history
let chatHistory: ChatMessage[] = [];

/**
 * Render the full screen with chat history and input box.
 */
function renderChatScreen(
  messages: ChatMessage[],
  inputText: string,
  hasModel: boolean,
  choices: Choice<MainMenuAction>[]
): void {
  // Clear screen completely and reset cursor
  process.stdout.write("\x1B[2J"); // Clear entire screen
  process.stdout.write("\x1B[H");   // Move cursor to top-left (row 1, column 1)
  process.stdout.write("\x1B[3J"); // Clear scrollback buffer (optional, helps with some terminals)
  
  // Build the entire screen content as a single string to avoid partial writes
  const sections: string[] = [];
  
  // Always show logo and tips at the top
  sections.push(renderLogoBlock());
  sections.push(renderTipsBlock());
  
  if (messages.length > 0) {
    // Show chat messages below tips
    sections.push("");
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role === "user") {
        sections.push(renderUserMessage(msg.content));
      } else {
        sections.push(renderAssistantMessage(msg.content));
      }
      if (i < messages.length - 1) {
        sections.push("");
      }
    }
    sections.push("");
  }
  
  // Input box (always at bottom)
  const promptLines = buildPromptBoxLines(inputText.length > 0 ? inputText : undefined);
  sections.push(...promptLines);
  
  // Status bar
  sections.push("");
  sections.push(buildStatusLine());
  sections.push(chalk.gray("  Esc: menu • /clear: new chat • /help: commands"));
  
  // Write everything at once
  process.stdout.write(sections.join("\n"));
}

async function captureChatInput(
  hasModel: boolean,
  choices: Choice<MainMenuAction>[]
): Promise<string | undefined> {
  const hide = "\x1B[?25l";
  const show = "\x1B[?25h";

  let text = "";
  let cursorHidden = false;
  let isInitialRender = true;

  const render = () => {
    if (!cursorHidden) {
      process.stdout.write(hide);
      cursorHidden = true;
    }
    
    // Always do a full re-render to avoid cursor position issues
    // This is more reliable than trying to update in place
    renderChatScreen(chatHistory, text, hasModel, choices);
    
    if (isInitialRender) {
      isInitialRender = false;
      hasShownHomeScreen = true;
      hasActivePromptBox = true;
    }
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
  // Reset chat history on start
  chatHistory = [];
  hasShownHomeScreen = false;
  hasActivePromptBox = false;
  
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
 * Append a user message above the input box.
 */
function appendUserMessage(content: string, hasModel: boolean, choices: Choice<MainMenuAction>[]): void {
  // Calculate how many lines the input area takes (prompt box + status bar + hint)
  const inputAreaLines = 3 + 1 + 1; // prompt box (3 lines) + status bar (1) + hint (1)
  
  // Move cursor up to clear input area
  process.stdout.write(`\x1B[${inputAreaLines}A`);
  process.stdout.write("\x1B[0J"); // Clear from cursor to end
  
  // Render user message
  const userMsg = renderUserMessage(content);
  process.stdout.write(userMsg);
  process.stdout.write("\n\n");
  
  // Re-render input box and status bar below
  const inputBox = buildPromptBoxLines();
  inputBox.forEach((line) => {
    process.stdout.write(line + "\n");
  });
  process.stdout.write("\n");
  process.stdout.write(buildStatusLine() + "\n");
  process.stdout.write(chalk.gray("  Esc: menu • /clear: new chat • /help: commands"));
  
  // Note: After appending messages, the next input render should be a full render
  // This will be handled by the captureChatInput function resetting isInitialRender
}

/**
 * Append an assistant message above the input box.
 */
function appendAssistantMessage(content: string, hasModel: boolean, choices: Choice<MainMenuAction>[]): void {
  // Calculate how many lines the input area takes
  const inputAreaLines = 3 + 1 + 1; // prompt box + status bar + hint
  
  // Move cursor up to clear input area
  process.stdout.write(`\x1B[${inputAreaLines}A`);
  process.stdout.write("\x1B[0J"); // Clear from cursor to end
  
  // Render assistant message
  const assistantMsg = renderAssistantMessage(content);
  process.stdout.write(assistantMsg);
  process.stdout.write("\n\n");
  
  // Re-render input box and status bar below
  const inputBox = buildPromptBoxLines();
  inputBox.forEach((line) => {
    process.stdout.write(line + "\n");
  });
  process.stdout.write("\n");
  process.stdout.write(buildStatusLine() + "\n");
  process.stdout.write(chalk.gray("  Esc: menu • /clear: new chat • /help: commands"));
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

  // Add user message to history
  chatHistory.push({
    role: "user",
    content: normalizedQuestion,
    timestamp: new Date(),
  });

  // Append user message above input box (don't clear screen)
  const hasModel = hasConfiguredModel();
  appendUserMessage(normalizedQuestion, hasModel, choices);

  // Show streaming response above input box
  process.stdout.write("\n");
  process.stdout.write(brand.bold("✦ SMASK"));
  process.stdout.write("\n");
  const terminalWidth = process.stdout.columns || 80;
  const maxBubbleWidth = Math.min(Math.floor(terminalWidth * 0.85), 80);
  const horizontal = maxBubbleWidth - 2;
  const assistantColor = "#feba17"; // BRAND_COLOR
  const assistantBg = "#1a1400";
  process.stdout.write(chalk.hex(assistantColor)(`╭${"─".repeat(horizontal)}╮\n`));
  process.stdout.write(chalk.hex(assistantColor)("│") + chalk.bgHex(assistantBg).hex("#fff4d6")(" "));
  
  let fullResponse = "";
  
  try {
    // Build prompt with conversation context
    const previousMessages = chatHistory.slice(0, -1);
    let prompt = normalizedQuestion;
    if (previousMessages.length > 0) {
      // Include context from previous messages
      const contextParts: string[] = [];
      contextParts.push("Previous conversation:");
      for (const msg of previousMessages) {
        const role = msg.role === "user" ? "User" : "Assistant";
        contextParts.push(`${role}: ${msg.content}`);
      }
      contextParts.push("");
      contextParts.push("Current question:");
      contextParts.push(`User: ${normalizedQuestion}`);
      prompt = contextParts.join("\n");
    }
    
    for await (const chunk of model.streamQuery(prompt)) {
      if (!chunk.done) {
        process.stdout.write(chalk.bgHex(assistantBg).hex("#fff4d6")(chunk.text));
        fullResponse += chunk.text;
      }
    }
    
    // Close the streaming bubble
    process.stdout.write("\n");
    process.stdout.write(chalk.hex(assistantColor)(`╰${"─".repeat(horizontal)}╯\n`));
    
    // Add assistant response to history
    chatHistory.push({
      role: "assistant",
      content: fullResponse,
      timestamp: new Date(),
    });
    
    // Replace the streaming display with the final formatted message
    // Calculate approximate lines for the streaming display
    const streamingContentLines = Math.ceil(fullResponse.length / (maxBubbleWidth - 4)) || 1;
    const streamingLines = 1 + 1 + streamingContentLines + 1; // label + top + content + bottom
    process.stdout.write(`\x1B[${streamingLines}A`);
    process.stdout.write("\x1B[0J");
    appendAssistantMessage(fullResponse, hasModel, choices);
  } catch (error) {
    // Close the streaming bubble on error
    process.stdout.write("\n");
    process.stdout.write(chalk.hex(assistantColor)(`╰${"─".repeat(horizontal)}╯\n`));
    
    const message = error instanceof Error ? error.message : String(error);
    displayError(`Failed to get response: ${message}`);
    
    // Remove the user message if we failed
    chatHistory.pop();
    
    // Re-render input box
    const inputBox = buildPromptBoxLines();
    inputBox.forEach((line) => {
      process.stdout.write(line + "\n");
    });
    process.stdout.write("\n");
    process.stdout.write(buildStatusLine() + "\n");
    process.stdout.write(chalk.gray("  Esc: menu • /clear: new chat • /help: commands"));
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
    case "/new":
      // Clear chat history and return to home screen
      chatHistory = [];
      hasShownHomeScreen = false;
      hasActivePromptBox = false;
      displayHomePreview(hasConfiguredModel());
      hasShownHomeScreen = true;
      hasActivePromptBox = true;
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
