import chalk from "chalk";
import ora, { type Ora } from "ora";
import { homedir } from "node:os";
import { getDefaultModel } from "../config/config.js";
import { getModel } from "../models/registry.js";

// Smartteknik brand color
export const BRAND_COLOR = "#feba17";
export const brand = chalk.hex(BRAND_COLOR);

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
function renderLogoBlock(): string {
  const gradientLines = LOGO_LINES.map((line, index) => applyGradient(line, index));
  return ["", ...gradientLines, ""].join("\n");
}

export function displayLogo(): void {
  console.log(renderLogoBlock());
}

function renderTipsBlock(): string {
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
function buildStatusLine(): string {
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
  console.log(chalk.bold("SMASK - Ask LLMs from your terminal"));
  console.log();
  console.log(chalk.bold("Usage:"));
  console.log("  " + brand("smask") + "                    Open interactive menu");
  console.log("  " + brand("smask <question>") + "         Ask a question directly");
  console.log("  " + brand("smask config") + "             Manage configuration");
  console.log();
  console.log(chalk.bold("Interactive Commands:"));
  console.log("  " + brand("/help") + "                    Show help");
  console.log("  " + brand("/settings") + "                Open settings menu");
  console.log("  " + brand("/clear") + "                   Clear the screen");
  console.log("  " + brand("/exit") + "                    Exit SMASK");
  console.log();
  console.log(chalk.bold("Navigation:"));
  console.log("  " + chalk.gray("j/k or ↑/↓") + "               Navigate menu");
  console.log("  " + chalk.gray("Enter") + "                    Select option");
  console.log("  " + chalk.gray("q or Esc") + "                 Go back / Exit");
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




