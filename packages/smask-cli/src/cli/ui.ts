import chalk from "chalk";
import ora, { type Ora } from "ora";
import { homedir } from "node:os";
import { marked } from "marked";
import type { MarkedOptions } from "marked";
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
  const width = terminalWidth < 30 ? terminalWidth : terminalWidth;
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
 * Strip ANSI codes from a string to get the actual visible length.
 */
function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Get the visible length of a string (ignoring ANSI codes).
 */
function visibleLength(str: string): number {
  return stripAnsiCodes(str).length;
}

/**
 * Render markdown tokens to styled terminal text.
 */
function renderToken(token: any, renderer: any): string {
  switch (token.type) {
    case "heading": {
      const text = renderer(token.tokens || []);
      const level = token.depth;
      const colors = [
        chalk.hex("#ffcc33").bold, // h1 - bright gold
        chalk.hex("#ff9f1c").bold, // h2 - orange gold
        chalk.hex("#feba17").bold, // h3 - brand gold
        chalk.hex("#f77f00"),      // h4 - deep orange
        chalk.hex("#ff6b35"),      // h5 - coral
        chalk.hex("#e85d04"),      // h6 - burnt orange
      ];
      const style = colors[Math.min(level - 1, colors.length - 1)] ?? chalk.bold;
      return style(text) + "\n";
    }
    case "strong": {
      const text = renderer(token.tokens || []);
      // Use bright white for bold text to make it stand out
      return chalk.whiteBright.bold(text);
    }
    case "em": {
      const text = renderer(token.tokens || []);
      return chalk.italic(text);
    }
    case "code": {
      const code = token.text || "";
      const bgColor = "#1e1e1e";
      const textColor = "#d4d4d4";
      const lines = code.split("\n");
      const maxLineLength = Math.max(...lines.map((l: string) => l.length), 0);
      const padding = 2;
      const width = maxLineLength + padding * 2;
      
      const top = chalk.bgHex(bgColor).hex(textColor)(" ".repeat(width));
      const bottom = chalk.bgHex(bgColor).hex(textColor)(" ".repeat(width));
      
      const codeLines = lines.map((line: string) => {
        const padded = line.padEnd(maxLineLength, " ");
        return chalk.bgHex(bgColor).hex(textColor)(`${" ".repeat(padding)}${padded}${" ".repeat(padding)}`);
      });
      
      return "\n" + top + "\n" + codeLines.join("\n") + "\n" + bottom + "\n";
    }
    case "codespan": {
      const code = token.text || "";
      // Use a lighter background for inline code to make it more visible
      return chalk.bgHex("#3a3a3a").hex("#f8f8f2")(` ${code} `);
    }
    case "link": {
      const text = renderer(token.tokens || []);
      const href = token.href || "";
      const linkText = text || href;
      return chalk.hex("#4a9eff").underline(linkText);
    }
    case "list": {
      const items = (token.items || []).map((item: any) => renderToken(item, renderer)).join("");
      return items + "\n";
    }
    case "list_item": {
      const text = renderer(token.tokens || []);
      // Use the brand color for bullet points, matching the second image style
      return chalk.hex(ASSISTANT_COLOR)("  • ") + text + "\n";
    }
    case "blockquote": {
      const text = renderer(token.tokens || []);
      const lines = text.split("\n").filter((l: string) => l.trim());
      // Use a more subtle gray for blockquotes
      return lines.map((line: string) => chalk.hex("#666").italic(`  │ ${line}`)).join("\n") + "\n";
    }
    case "hr": {
      const width = Math.min(getTerminalWidth() - 4, 60);
      return chalk.hex("#555")("─".repeat(width)) + "\n";
    }
    case "paragraph": {
      const text = renderer(token.tokens || []);
      return text + "\n\n";
    }
    case "br": {
      return "\n";
    }
    case "text": {
      // Regular text should use the default message color (which is applied by the bubble)
      // Don't apply any color here - let the bubble styling handle it
      const text = token.text || "";
      // Only apply default color if text doesn't already have ANSI codes
      if (!text.includes("\x1B[")) {
        return text;
      }
      return text;
    }
    case "space": {
      return " ";
    }
    default: {
      // For unknown token types, try to render children
      if (token.tokens && Array.isArray(token.tokens)) {
        return renderer(token.tokens);
      }
      return token.text || "";
    }
  }
}

/**
 * Render markdown to styled terminal text.
 */
function renderMarkdown(markdown: string): string {
  try {
    // Configure marked to parse markdown properly
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    
    // Parse markdown to tokens
    const tokens = marked.lexer(markdown);
    
    // Render tokens recursively
    const renderer = (tokenList: any[]): string => {
      if (!tokenList || tokenList.length === 0) {
        return "";
      }
      return tokenList.map((token) => renderToken(token, renderer)).join("");
    };
    
    const result = renderer(tokens);
    // Remove trailing newlines but preserve structure
    let cleaned = result.trimEnd();
    
    // Post-process to catch any unparsed markdown syntax
    // This handles cases where markdown syntax might not have been tokenized correctly
    // First handle bold (**text**)
    cleaned = cleaned.replace(/\*\*([^*]+?)\*\*/g, (match, text) => {
      // Only replace if it looks like markdown (not already styled with ANSI codes)
      if (!match.includes("\x1B[")) {
        return chalk.whiteBright.bold(text);
      }
      return match;
    });
    
    // Then handle italic (*text*) - but avoid matching **text**
    // We'll match single asterisks that aren't part of double asterisks
    cleaned = cleaned.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, (match, before, text, after) => {
      if (!match.includes("\x1B[")) {
        return (before || "") + chalk.italic(text) + (after || "");
      }
      return match;
    });
    
    return cleaned;
  } catch (error) {
    // If markdown parsing fails, try to clean up common markdown artifacts
    // Remove literal ** markers that weren't parsed
    let cleaned = markdown.replace(/\*\*([^*]+)\*\*/g, (match, text) => {
      return chalk.whiteBright.bold(text);
    });
    // Remove literal * markers for italic (but not if it's part of **)
    cleaned = cleaned.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, (match, before, text, after) => {
      return (before || "") + chalk.italic(text) + (after || "");
    });
    // Remove literal backticks for inline code
    cleaned = cleaned.replace(/`([^`]+)`/g, (match, code) => {
      return chalk.bgHex("#3a3a3a").hex("#f8f8f2")(` ${code} `);
    });
    return cleaned;
  }
}

/**
 * Word wrap text to fit within a given width, handling ANSI codes.
 */
function wordWrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    
    // Split by words, but preserve ANSI codes
    const words: string[] = [];
    let currentWord = "";
    let inAnsi = false;
    
    for (let i = 0; i < paragraph.length; i++) {
      const char = paragraph[i]!;
      currentWord += char;
      
      // Check for ANSI escape sequences
      if (char === "\x1B") {
        inAnsi = true;
      } else if (inAnsi && /[a-zA-Z]/.test(char)) {
        inAnsi = false;
      }
      
      // If we hit a space and we're not in an ANSI sequence, split
      if (char === " " && !inAnsi) {
        if (currentWord.trim()) {
          words.push(currentWord);
        }
        currentWord = "";
      }
    }
    if (currentWord.trim()) {
      words.push(currentWord);
    }
    
    let currentLine = "";
    
    for (const word of words) {
      const wordLength = visibleLength(word);
      const currentLength = visibleLength(currentLine);
      
      if (currentLength === 0) {
        currentLine = word;
      } else if (currentLength + 1 + wordLength <= maxWidth) {
        currentLine += (currentLine.endsWith(" ") ? "" : " ") + word;
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
 * Render an assistant message bubble with markdown support.
 */
export function renderAssistantMessage(content: string): string {
  const terminalWidth = getTerminalWidth();
  const maxBubbleWidth = Math.min(Math.floor(terminalWidth * 0.85), 80);
  const innerWidth = maxBubbleWidth - 4;
  
  // Render markdown to styled text
  const markdownRendered = renderMarkdown(content);
  
  // Split into lines and wrap each paragraph
  const paragraphs = markdownRendered.split("\n\n");
  const allLines: string[] = [];
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      allLines.push("");
      continue;
    }
    
    // Split paragraph into lines (preserving existing line breaks from markdown)
    const paragraphLines = paragraph.split("\n");
    for (const line of paragraphLines) {
      if (line.trim() === "") {
        allLines.push("");
      } else {
        // Wrap long lines
        const wrapped = wordWrap(line, innerWidth);
        allLines.push(...wrapped);
      }
    }
    // Add spacing between paragraphs
    if (paragraphs.indexOf(paragraph) < paragraphs.length - 1) {
      allLines.push("");
    }
  }
  
  // Calculate bubble width based on visible length (ignoring ANSI codes)
  const maxVisibleWidth = Math.max(...allLines.map(l => visibleLength(l)), 10);
  const bubbleWidth = maxVisibleWidth + 4;
  
  const lines: string[] = [];
  const assistantLabel = brand.bold("✦ SMASK");
  lines.push(assistantLabel);
  
  const border = chalk.hex(ASSISTANT_COLOR);
  const horizontal = Math.min(bubbleWidth - 2, maxBubbleWidth - 2);
  
  lines.push(border(`╭${"─".repeat(horizontal)}╮`));
  
  for (const line of allLines) {
    const visibleLen = visibleLength(line);
    const padding = Math.max(0, bubbleWidth - 4 - visibleLen);
    const paddingStr = " ".repeat(padding);
    const styledContent = chalk.bgHex(ASSISTANT_BG).hex("#fff4d6")(` ${line}${paddingStr} `);
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




