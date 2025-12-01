#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { runInteractiveMenu, handleDirectQuestion } from "./cli/menu.js";
import { displayHelp, displayError, displaySuccess, displayConfigStatus } from "./cli/ui.js";
import {
  setGeminiApiKey,
  setDefaultModel,
  getDefaultModel,
  getGeminiApiKey,
  clearGeminiCredentials,
} from "./config/config.js";
// Import to register Gemini model
import "./models/gemini.js";

const program = new Command();

program
  .name("smask")
  .description("Ask LLMs questions directly from your terminal")
  .version("1.0.0");

// Config command
program
  .command("config")
  .description("Manage configuration")
  .option("-s, --set <key=value>", "Set a configuration value")
  .option("-g, --get <key>", "Get a configuration value")
  .option("--status", "Show configuration status")
  .action(async (opts) => {
    if (opts.status) {
      displayConfigStatus();
      return;
    }

    if (opts.set) {
      const [key, value] = opts.set.split("=");
      if (!key || !value) {
        displayError("Invalid format. Use: smask config --set key=value");
        process.exit(1);
      }

      switch (key.toLowerCase()) {
        case "apikey":
        case "api_key":
        case "gemini_api_key":
          setGeminiApiKey(value);
          displaySuccess("API key saved.");
          break;
        case "model":
        case "default_model":
          setDefaultModel(value);
          displaySuccess(`Default model set to: ${value}`);
          break;
        default:
          displayError(`Unknown configuration key: ${key}`);
          console.log(chalk.gray("Available keys: apikey, model"));
          process.exit(1);
      }
      return;
    }

    if (opts.get) {
      switch (opts.get.toLowerCase()) {
        case "apikey":
        case "api_key":
        case "gemini_api_key": {
          const key = getGeminiApiKey();
          if (key) {
            console.log(`${key.slice(0, 8)}...${key.slice(-4)}`);
          } else {
            console.log(chalk.gray("Not set"));
          }
          break;
        }
        case "model":
        case "default_model":
          console.log(getDefaultModel() ?? chalk.gray("gemini (default)"));
          break;
        default:
          displayError(`Unknown configuration key: ${opts.get}`);
          process.exit(1);
      }
      return;
    }

    // No options: show status
    displayConfigStatus();
  });

// Clear command
program
  .command("clear")
  .description("Clear all stored credentials")
  .action(async () => {
    const { confirm } = await import("@inquirer/prompts");
    const confirmed = await confirm({
      message: "This will remove all API keys. Continue?",
      default: false,
    });

    if (confirmed) {
      clearGeminiCredentials();
      displaySuccess("All credentials cleared.");
    }
  });

// Help command (overrides default)
program
  .command("help")
  .description("Show help information")
  .action(() => {
    displayHelp();
  });

// Ask command (for explicit question asking)
program
  .command("ask <question...>")
  .description("Ask a question to the LLM")
  .action(async (questionParts: string[]) => {
    const question = questionParts.join(" ");
    await handleDirectQuestion(question);
  });

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);

  // No arguments: run interactive menu
  if (args.length === 0) {
    try {
      await runInteractiveMenu();
    } catch (error) {
      if (error instanceof Error && error.message !== "Cancelled") {
        displayError(error.message);
        process.exit(1);
      }
    }
    return;
  }

  // Check if first arg is a command
  const firstArg = args[0];
  const commands = ["config", "clear", "help", "ask"];
  
  if (firstArg && !commands.includes(firstArg) && !firstArg.startsWith("-")) {
    // Treat as a direct question
    const question = args.join(" ");
    await handleDirectQuestion(question);
    return;
  }

  // Parse as commander command
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  displayError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});




