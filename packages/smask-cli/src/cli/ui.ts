import chalk from "chalk";
import ora, { type Ora } from "ora";
import { getDefaultModel, isGeminiConfigured } from "../config/config.js";
import { isLoggedIn } from "../auth/google.js";
import { getModel, hasConfiguredModel } from "../models/registry.js";

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
export function displayLogo(): void {
  console.log();
  LOGO_LINES.forEach((line, index) => {
    console.log(applyGradient(line, index));
  });
  console.log();
}

/**
 * Display tips for getting started.
 */
export function displayTips(): void {
  console.log(chalk.gray("Tips for getting started:"));
  console.log(chalk.gray("1. Ask questions, explore ideas, or get help with tasks."));
  console.log(chalk.gray("2. Be specific for the best results."));
  console.log(chalk.gray("3. ") + brand("/help") + chalk.gray(" for more information."));
  console.log();
}

/**
 * Display the welcome screen with logo and tips.
 */
export function displayWelcome(): void {
  console.clear();
  displayLogo();
  displayTips();
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
export function displayStatusBar(): void {
  const parts: string[] = [];

  // Current model
  const defaultModel = getDefaultModel() ?? "gemini";
  const model = getModel(defaultModel);
  
  if (model) {
    parts.push(chalk.gray(`~/code/smask-cli`));
    
    // Auth status
    if (isGeminiConfigured()) {
      parts.push(chalk.green("api key set"));
    } else if (isLoggedIn()) {
      parts.push(chalk.green("logged in"));
    } else {
      parts.push(chalk.yellow("no api key") + chalk.gray(" (see /docs)"));
    }
    
    // Model name
    parts.push(brand(`${defaultModel}`) + chalk.gray(" (99% context left)"));
  } else {
    parts.push(chalk.yellow("No model configured"));
  }

  console.log();
  console.log(parts.join("          "));
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
  console.log("  " + brand("smask login") + "              Login with Google OAuth");
  console.log("  " + brand("smask logout") + "             Logout and clear tokens");
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
  const googleAuth = isLoggedIn();
  
  if (geminiKey) {
    console.log(chalk.green("  ✓ ") + "Gemini: " + chalk.green("API key configured"));
  } else if (googleAuth) {
    console.log(chalk.green("  ✓ ") + "Gemini: " + chalk.green("Logged in with Google"));
  } else {
    console.log(chalk.yellow("  ○ ") + "Gemini: " + chalk.yellow("Not configured"));
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




