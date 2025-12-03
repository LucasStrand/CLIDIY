import chalk from "chalk";
import ora, { type Ora } from "ora";
import { homedir } from "node:os";
import { getDefaultModel, isGeminiConfigured } from "../config/config.js";
import { getModel } from "../models/registry.js";

// Smartteknik brand color
export const BRAND_COLOR = "#feba17";
export const brand = chalk.hex(BRAND_COLOR);

// Chat message types
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

// Chat colors
const USER_COLOR = "#4a9eff";
const ASSISTANT_COLOR = BRAND_COLOR;
const USER_BG = "#0d1a2d";
const ASSISTANT_BG = "#1a1400";

/**
 * ASCII art logo for SMASK
 * Styled similar to gemini-cli with gradient colors
 */
const LOGO_LINES = [
  "  ███████╗███╗   ███╗ █████╗ ███████╗██╗  ██╗",
  "  ██╔════╝████╗ ████║██╔══██╗██╔════╝██║ ██╔╝",
  "  ███████╗██╔████╔██║███████║███████╗█████╔╝ ",
  "  ╚════██║██║╚██╔╝██║██╔══██║╚════██║██╔═██╗ ",
  "  ███████║██║ ╚═╝ ██║██║  ██║███████║██║  ██╗",
  "  ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝",
];

/**
 * Color gradient for the logo (Smartteknik brand colors)
 * Main color: #feba17 (golden amber)
 */
const GRADIENT_COLORS = [
  "#feba17", // Smartteknik gold
  "#ffcc33", // Bright gold
  "#ff9f1c", // Orange gold
  "#f77f00", // Deep orange
  "#ff6b35", // Coral orange
  "#e85d04", // Burnt orange
];

const PROMPT_BORDER_COLOR = BRAND_COLOR;
const PROMPT_BACKGROUND_COLOR = "#1a1400";
const PROMPT_TEXT_COLOR = "#fff4d6";

function getTerminalWidth(): number {
  const columns = process.stdout.columns;
  if (!columns || columns <= 0) {
    return 80;
  }
  return columns;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function formatWorkingDirectory(): string {
  const cwd = normalizePath(process.cwd());
  const home = normalizePath(homedir());

  if (cwd === home) {
    return "~";
  }

  if (cwd.startsWith(home)) {
    const suffix = cwd.slice(home.length);
    return suffix ? `~${suffix}` : "~";
  }

  return cwd;
}

function getPromptWidth(): number {
  const terminalWidth = getTerminalWidth();
  const minWidth = Math.min(50, terminalWidth);
  const maxWidth = Math.min(terminalWidth, 90);
  const width = Math.max(minWidth, maxWidth);
  return Math.max(width, 30);
}

/**
 * Apply gradient colors to a line of text.
 */
function applyGradient(text: string, colorIndex: number): string {
  const color = GRADIENT_COLORS[colorIndex % GRADIENT_COLORS.length];
  return chalk.hex(color ?? "#00d4ff")(text);
}

/**
 * Display the SMASK logo with gradient colors.
 */
export function renderLogoBlock(): string {
  const gradientLines = LOGO_LINES.map((line, index) => applyGradient(line, index));
  return ["", ...gradientLines, ""].join("\n");
}

export function displayLogo(): void {
  console.log(renderLogoBlock());
}

export function renderTipsBlock(): string {
  const lines = [
    chalk.gray("Tips for getting started:"),
    chalk.gray("1. Ask questions, explore ideas, or get help with tasks."),
    chalk.gray("2. Be specific for the best results."),
    chalk.gray("3. ") + brand("/help") + chalk.gray(" for more information."),
    "",
  ];
  return lines.join("\n");
}

/**
 * Display tips for getting started.
 */
function truncateText(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength === 1) {
    return value.slice(0, 1);
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

export function buildPromptBoxLines(content?: string): string[] {
  const placeholder = content ?? "Type your message or @path/to/file";
  const terminalWidth = getTerminalWidth();
  const desiredWidth = Math.max(getPromptWidth(), placeholder.length + 8);
  const unclampedWidth = Math.min(desiredWidth, terminalWidth);
  const width = terminalWidth < 30 ? terminalWidth : Math.max(unclampedWidth, 30);
  const innerWidth = Math.max(width - 4, 2);
  const contentWidth = Math.max(innerWidth - 1, 1);
  const placeholderWidth = Math.max(contentWidth - 1, 1);
  const trimmedPlaceholder = truncateText(placeholder, placeholderWidth);
  const paddedContent = ` ${trimmedPlaceholder}`.padEnd(contentWidth, " ");
  const border = chalk.hex(PROMPT_BORDER_COLOR);
  const arrowSegment = chalk
    .bgHex(PROMPT_BACKGROUND_COLOR)
    .hex(BRAND_COLOR)(">");
  const textSegment = chalk
    .bgHex(PROMPT_BACKGROUND_COLOR)
    .hex(PROMPT_TEXT_COLOR)(paddedContent);
  const horizontal = Math.max(width - 2, 2);

  return [
    border(`╭${"─".repeat(horizontal)}╮`),
    border("│ ") + arrowSegment + textSegment + border(" │"),
    border(`╰${"─".repeat(horizontal)}╯`),
  ];
}

/**
 * Display a Gemini-style prompt box with placeholder text.
 */
export function displayPromptBox(placeholder?: string): void {
  buildPromptBoxLines(placeholder).forEach((line) => console.log(line));
  console.log();
}

/**
 * Get a spinner for loading states.
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    color: "yellow",
    spinner: "dots",
  });
}

/**
 * Display a thinking/processing indicator.
 */
export function showThinking(message: string = "Thinking..."): Ora {
  const spinner = createSpinner(message);
  spinner.start();
  return spinner;
}

/**
 * Display the status bar at the bottom.
 */
export function buildStatusLine(): string {
  const parts: string[] = [];

  parts.push(chalk.white(formatWorkingDirectory()));

  const defaultModel = getDefaultModel() ?? "gemini";
  const model = getModel(defaultModel);
  const contextLabel = model?.isConfigured()
    ? chalk.gray("(100% context left)")
    : chalk.gray("(context unavailable)");
  parts.push(`${brand(defaultModel)} ${contextLabel}`);

  return parts.join(chalk.gray("    "));
}

export function displayStatusBar(): void {
  console.log();
  console.log(buildStatusLine());
}

/**
 * Display an error message.
 */
export function displayError(message: string): void {
  console.error(chalk.red(`\n${message}`));
}

/**
 * Display a success message.
 */
export function displaySuccess(message: string): void {
  console.log(chalk.green(`\n${message}`));
}

/**
 * Display an info message.
 */
export function displayInfo(message: string): void {
  console.log(brand(`\n${message}`));
}

/**
 * Display a warning message.
 */
export function displayWarning(message: string): void {
  console.log(chalk.yellow(`\n${message}`));
}

/**
 * Format the AI response with proper styling.
 */
export function formatResponse(text: string): string {
  // Add a marker for AI responses
  return chalk.white(text);
}

/**
 * Display a divider line.
 */
export function displayDivider(): void {
  const width = process.stdout.columns || 80;
  console.log(chalk.gray("─".repeat(width)));
}

/**
 * Display the prompt indicator.
 */
export function displayPrompt(): void {
  process.stdout.write(brand("> "));
}

export function renderPromptBoxBlock(text?: string): string {
  const lines = buildPromptBoxLines(text);
  return ["", ...lines, ""].join("\n");
}

export function renderStatusBarBlock(): string {
  return ["", buildStatusLine()].join("\n");
}

export function displayHomePreview(hasModel: boolean): void {
  console.clear();
  console.log(buildHomeScreenLayout("", hasModel));
}

export function buildHomeScreenLayout(
  _menuBlock: string,
  _hasModel: boolean,
  promptText?: string
): string {
  return [
    renderLogoBlock(),
    renderTipsBlock(),
    renderPromptBoxBlock(promptText),
    renderStatusBarBlock(),
  ].join("\n");
}

/**
 * Display help information.
 */
export function displayHelp(): void {
  console.log();
  console.log(chalk.bold("SMASK - Chat with LLMs from your terminal"));
  console.log();
  console.log(chalk.bold("Usage:"));
  console.log("  " + brand("smask") + "                    Start interactive chat");
  console.log("  " + brand("smask <question>") + "         Ask a question directly");
  console.log("  " + brand("smask config") + "             Manage configuration");
  console.log();
  console.log(chalk.bold("Chat Commands:"));
  console.log("  " + brand("/help") + "                    Show this help");
  console.log("  " + brand("/settings") + "                Open settings menu");
  console.log("  " + brand("/clear") + " or " + brand("/new") + "           Start a new conversation");
  console.log("  " + brand("/status") + "                  Show configuration status");
  console.log("  " + brand("/exit") + "                    Exit SMASK");
  console.log();
  console.log(chalk.bold("Navigation:"));
  console.log("  " + chalk.gray("Enter") + "                    Send message");
  console.log("  " + chalk.gray("Esc") + "                      Open menu");
  console.log("  " + chalk.gray("j/k or ↑/↓") + "               Navigate menu items");
  console.log();
  console.log(chalk.bold("Tips:"));
  console.log("  • Conversations maintain context - ask follow-up questions!");
  console.log("  • Use " + brand("/clear") + " to start fresh when changing topics");
  console.log();
}

/**
 * Display configuration status.
 */
export function displayConfigStatus(): void {
  console.log();
  console.log(chalk.bold("Configuration Status:"));
  console.log();
  
  // Gemini status
  const geminiKey = isGeminiConfigured();
  
  if (geminiKey) {
    console.log(chalk.green("  ✓ ") + "Gemini: " + chalk.green("API key configured"));
  } else {
    console.log(chalk.yellow("  ○ ") + "Gemini: " + chalk.yellow("Not configured"));
    console.log(chalk.gray("      Get your free API key at: https://aistudio.google.com/apikey"));
  }
  
  // Default model
  const defaultModel = getDefaultModel();
  if (defaultModel) {
    console.log(chalk.green("  ✓ ") + "Default model: " + brand(defaultModel));
  } else {
    console.log(chalk.gray("  ○ ") + "Default model: " + chalk.gray("gemini (default)"));
  }
  
  console.log();
}

/**
 * Stream text to the console character by character.
 */
export async function streamText(
  text: string,
  delayMs: number = 10
): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

/**
 * Display a box around text.
 */
export function displayBox(text: string, title?: string): void {
  const lines = text.split("\n");
  const maxLength = Math.max(...lines.map((l) => l.length), title?.length ?? 0);
  const width = maxLength + 4;
  
  const top = title
    ? `╭─ ${chalk.bold(title)} ${"─".repeat(width - title.length - 5)}╮`
    : `╭${"─".repeat(width - 2)}╮`;
  const bottom = `╰${"─".repeat(width - 2)}╯`;
  
  console.log(chalk.gray(top));
  for (const line of lines) {
    const padding = " ".repeat(maxLength - line.length);
    console.log(chalk.gray("│ ") + line + padding + chalk.gray(" │"));
  }
  console.log(chalk.gray(bottom));
}

/**
 * Word wrap text to fit within a given width.
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    
    const words = paragraph.split(" ");
    let currentLine = "";
    
    for (const word of words) {
      if (currentLine.length === 0) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxWidth) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }
  
  return lines;
}

/**
 * Render a user message bubble.
 */
export function renderUserMessage(content: string): string {
  const terminalWidth = getTerminalWidth();
  const maxBubbleWidth = Math.min(Math.floor(terminalWidth * 0.75), 70);
  const innerWidth = maxBubbleWidth - 4;
  
  const wrappedLines = wordWrap(content, innerWidth);
  const bubbleWidth = Math.max(...wrappedLines.map(l => l.length), 10) + 4;
  const indent = Math.max(terminalWidth - bubbleWidth - 2, 0);
  const spacer = " ".repeat(indent);
  
  const lines: string[] = [];
  const userLabel = chalk.hex(USER_COLOR).bold("You");
  lines.push(spacer + userLabel);
  
  const border = chalk.hex(USER_COLOR);
  const horizontal = bubbleWidth - 2;
  
  lines.push(spacer + border(`╭${"─".repeat(horizontal)}╮`));
  
  for (const line of wrappedLines) {
    const padding = " ".repeat(bubbleWidth - 4 - line.length);
    const styledContent = chalk.bgHex(USER_BG).hex("#ffffff")(` ${line}${padding} `);
    lines.push(spacer + border("│") + styledContent + border("│"));
  }
  
  lines.push(spacer + border(`╰${"─".repeat(horizontal)}╯`));
  
  return lines.join("\n");
}

/**
 * Render an assistant message bubble.
 */
export function renderAssistantMessage(content: string): string {
  const terminalWidth = getTerminalWidth();
  const maxBubbleWidth = Math.min(Math.floor(terminalWidth * 0.85), 80);
  const innerWidth = maxBubbleWidth - 4;
  
  const wrappedLines = wordWrap(content, innerWidth);
  const bubbleWidth = Math.max(...wrappedLines.map(l => l.length), 10) + 4;
  
  const lines: string[] = [];
  const assistantLabel = brand.bold("✦ SMASK");
  lines.push(assistantLabel);
  
  const border = chalk.hex(ASSISTANT_COLOR);
  const horizontal = bubbleWidth - 2;
  
  lines.push(border(`╭${"─".repeat(horizontal)}╮`));
  
  for (const line of wrappedLines) {
    const padding = " ".repeat(bubbleWidth - 4 - line.length);
    const styledContent = chalk.bgHex(ASSISTANT_BG).hex("#fff4d6")(` ${line}${padding} `);
    lines.push(border("│") + styledContent + border("│"));
  }
  
  lines.push(border(`╰${"─".repeat(horizontal)}╯`));
  
  return lines.join("\n");
}

/**
 * Render the entire chat history.
 */
export function renderChatHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "";
  }
  
  const renderedMessages = messages.map((msg) => {
    if (msg.role === "user") {
      return renderUserMessage(msg.content);
    } else {
      return renderAssistantMessage(msg.content);
    }
  });
  
  return renderedMessages.join("\n\n");
}

/**
 * Build the chat screen layout with history and input.
 */
export function buildChatScreenLayout(
  messages: ChatMessage[],
  inputText?: string
): string {
  const sections: string[] = [];
  
  // Compact header
  const header = brand("─── SMASK Chat ") + chalk.gray("─".repeat(Math.max(getTerminalWidth() - 16, 10)));
  sections.push(header);
  sections.push("");
  
  // Chat history
  if (messages.length > 0) {
    sections.push(renderChatHistory(messages));
    sections.push("");
  } else {
    // Welcome message for empty chat
    sections.push(chalk.gray("  Start a conversation by typing below..."));
    sections.push("");
  }
  
  // Input prompt
  sections.push(...buildPromptBoxLines(inputText));
  
  // Status bar
  sections.push("");
  sections.push(buildStatusLine());
  sections.push(chalk.gray("  Esc: menu • /clear: new chat • /help: commands"));
  
  return sections.join("\n");
}

/**
 * Display streaming assistant response start.
 */
export function displayStreamingStart(): void {
  console.log();
  console.log(brand.bold("✦ SMASK"));
  const terminalWidth = getTerminalWidth();
  const maxBubbleWidth = Math.min(Math.floor(terminalWidth * 0.85), 80);
  const horizontal = maxBubbleWidth - 2;
  console.log(chalk.hex(ASSISTANT_COLOR)(`╭${"─".repeat(horizontal)}╮`));
  process.stdout.write(chalk.hex(ASSISTANT_COLOR)("│") + chalk.bgHex(ASSISTANT_BG).hex("#fff4d6")(" "));
}

/**
 * Display streaming assistant response chunk.
 */
export function displayStreamingChunk(chunk: string): void {
  process.stdout.write(chalk.bgHex(ASSISTANT_BG).hex("#fff4d6")(chunk));
}

/**
 * Display streaming assistant response end.
 */
export function displayStreamingEnd(): void {
  console.log();
  const terminalWidth = getTerminalWidth();
  const maxBubbleWidth = Math.min(Math.floor(terminalWidth * 0.85), 80);
  const horizontal = maxBubbleWidth - 2;
  console.log(chalk.hex(ASSISTANT_COLOR)(`╰${"─".repeat(horizontal)}╯`));
}




