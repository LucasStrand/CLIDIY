#!/usr/bin/env node
import { Command } from "commander";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { input, confirm } from "@inquirer/prompts";
import chalk from "chalk";
import readline from "node:readline";
import { getConfigPath, getConfiguredHost, updateConfig } from "./config.js";

const MAX_SLOTS = 512;
const HEADER_SIZE = 16;

type ZeroOptions = {
  host?: string;
  start?: number;
  count?: number;
  value?: number;
  timeout?: number;
};

type MenuAction = "zero-all" | "custom" | "settings" | "help" | "exit";
type Choice<T> = { name: string; value: T };

const program = new Command();

program
  .name("dgmwatch")
  .description("Control DALCNET DGM watch DMX controllers from the terminal.")
  .version("0.2.0");

program
  .command("zero")
  .description("Write a constant value (default 0) across a DMX slot range.")
  .option(
    "-H, --host <host>",
    "Device host or base URL (overrides saved config)"
  )
  .option("-s, --start <slot>", "Starting DMX slot (1-512)", parseInteger)
  .option("-c, --count <count>", "Number of slots to write", parseInteger)
  .option(
    "-v, --value <value>",
    "Value written to every slot (0-255)",
    parseInteger
  )
  .option(
    "-t, --timeout <ms>",
    "Abort the request after N milliseconds",
    parseInteger
  )
  .action(async (opts: ZeroOptions) => {
    try {
      await runZero(opts);
    } catch (error) {
      reportError(error);
      process.exitCode = 1;
    }
  });

if (process.argv.length <= 2) {
  runInteractive().catch((error) => {
    reportError(error);
    process.exitCode = 1;
  });
} else {
  program.parseAsync(process.argv).catch((error) => {
    reportError(error);
    process.exit(1);
  });
}

async function runZero(options: ZeroOptions): Promise<void> {
  const startSlot =
    options.start === undefined
      ? 1
      : ensureRange("start", options.start, 1, MAX_SLOTS);
  const count =
    options.count === undefined
      ? MAX_SLOTS - startSlot + 1
      : ensureRange("count", options.count, 1, MAX_SLOTS);
  if (startSlot + count - 1 > MAX_SLOTS) {
    throw new Error("The requested range exceeds the 512-slot DMX universe.");
  }
  const value =
    options.value === undefined
      ? 0
      : ensureRange("value", options.value, 0, 255);
  const timeout =
    options.timeout === undefined
      ? 5000
      : ensureRange("timeout", options.timeout, 100, 60000);
  const host = await resolveHost(options.host, false);

  console.log(
    `Sending ${count} slot(s) starting at ${startSlot} (value ${value}) to ${host} with ${timeout}ms timeout...`
  );
  await writeSlots(host, startSlot - 1, createPayload(count, value), timeout);
  console.log("Done.");
}

function createPayload(count: number, value: number): Uint8Array {
  const data = new Uint8Array(count);
  data.fill(value);
  return data;
}

function ensureRange(
  label: string,
  raw: number,
  min: number,
  max: number
): number {
  if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
    throw new Error(`Option "${label}" must be an integer.`);
  }
  if (raw < min || raw > max) {
    throw new Error(`Option "${label}" must be between ${min} and ${max}.`);
  }
  return raw;
}

function parseInteger(value: string): number {
  if (value.trim() === "") {
    throw new Error("Value cannot be empty.");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Unable to parse "${value}" as a number.`);
  }
  return Math.trunc(parsed);
}

function normalizeBaseUrl(input: string): string {
  let candidate = input.trim();
  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
    candidate = `http://${candidate}`;
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(
      `Invalid host "${input}". Provide a valid hostname or URL.`
    );
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.origin;
}

async function writeSlots(
  host: string,
  startAddress: number,
  values: Uint8Array,
  timeoutMs: number
): Promise<void> {
  if (values.length === 0) {
    throw new Error("No slot values provided.");
  }
  if (values.length > MAX_SLOTS) {
    throw new Error("Cannot write more than 512 slots at once.");
  }

  const payload = buildWritePayload(startAddress, values);
  const endpoint = new URL("dmem.bin", host);
  const isHttps = endpoint.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const body = Buffer.from(payload);
  const options = {
    hostname: endpoint.hostname,
    port: endpoint.port || (isHttps ? 443 : 80),
    path: `${endpoint.pathname}${endpoint.search}`,
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": body.byteLength,
    },
  };

  await new Promise<void>((resolve, reject) => {
    const timeoutError = new Error(
      `Timed out after ${timeoutMs}ms while contacting the device.`
    );
    const req = requestFn(options, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        const statusText = res.statusMessage ?? "";
        res.resume();
        reject(new Error(`Device responded with HTTP ${status} ${statusText}`));
        return;
      }
      res.on("error", reject);
      res.on("end", resolve);
      res.resume();
    });

    const timeoutId = setTimeout(() => {
      req.destroy(timeoutError);
    }, timeoutMs);

    req.on("error", (error) => {
      clearTimeout(timeoutId);
      reject(error === timeoutError ? timeoutError : error);
    });

    req.on("close", () => {
      clearTimeout(timeoutId);
    });

    req.write(body);
    req.end();
  }).catch((error) => {
    throw new Error(
      `Failed to write DMX slots: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  });
}

function buildWritePayload(
  startAddress: number,
  values: Uint8Array
): Uint8Array {
  if (startAddress < 0 || startAddress >= MAX_SLOTS) {
    throw new Error("Start address must be between 0 and 511.");
  }
  if (startAddress + values.length > MAX_SLOTS) {
    throw new Error("Slot range exceeds the DMX universe.");
  }

  const buffer = new ArrayBuffer(HEADER_SIZE + values.length);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint8(0, 68); // 'D'
  view.setUint8(1, 87); // 'W'
  view.setUint8(2, 117); // 'u'
  view.setUint8(3, 0);
  view.setUint16(4, 0, true);
  view.setUint16(6, values.length, true);
  view.setUint32(8, startAddress, true);
  view.setUint32(12, 0, true);
  bytes.set(values, HEADER_SIZE);

  return bytes;
}

async function runInteractive(): Promise<void> {
  console.log(
    chalk.cyanBright(
      "\nDGM watch CLI – quickly zero your DMX slots without opening the web UI.\n"
    )
  );

  let exit = false;
  while (!exit) {
    let host = getConfiguredHost();
    if (!host) {
      const wantsSetup = await confirm({
        message:
          "No device IP has been configured yet. Would you like to set it now?",
        default: true,
      });
      if (!wantsSetup) {
        console.log(
          "Cannot continue without a device host. Run again when you're ready."
        );
        return;
      }
      host = await promptAndSaveHost();
    }

    const action = await selectVim<MenuAction>({
      message: `Device: ${host}`,
      choices: [
        { name: "Reset ALL 512 slots to 0", value: "zero-all" },
        { name: "Send a custom value / slot range…", value: "custom" },
        { name: "Settings (change saved host)", value: "settings" },
        { name: "Command reference", value: "help" },
        { name: "Exit", value: "exit" },
      ],
    });

    switch (action) {
      case "zero-all":
        await runZero({ host });
        break;
      case "custom":
        await handleCustomWrite(host);
        break;
      case "settings":
        await handleSettings();
        break;
      case "help":
        console.log(program.helpInformation());
        break;
      case "exit":
        exit = true;
        break;
    }
  }

  console.log("Goodbye!");
}

async function handleCustomWrite(host: string): Promise<void> {
  const start = await promptNumber("Starting slot (1-512)", 1, 1, MAX_SLOTS);
  const maxCount = MAX_SLOTS - start + 1;
  const count = await promptNumber(
    `Number of slots to write (1-${maxCount})`,
    maxCount,
    1,
    maxCount
  );
  const value = await promptNumber("Value to write (0-255)", 0, 0, 255);

  await runZero({ host, start, count, value });
}

async function handleSettings(): Promise<void> {
  const current = getConfiguredHost();
  if (current) {
    console.log(`Current host: ${current}`);
  } else {
    console.log("No host configured yet.");
  }

  const wantsChange = await confirm({
    message: current ? "Update the saved host?" : "Set the device host now?",
    default: true,
  });

  if (!wantsChange) {
    console.log("Host unchanged.");
    return;
  }

  await promptAndSaveHost(current);
}

async function promptNumber(
  message: string,
  defaultValue: number,
  min: number,
  max: number
): Promise<number> {
  const answer = (await input({
    message,
    default: String(defaultValue),
  })) as string;
  const parsed = parseInteger(answer);
  return ensureRange(message, parsed, min, max);
}

async function promptAndSaveHost(initial?: string): Promise<string> {
  while (true) {
    const answer = (await input({
      message: "Enter the DGM device IP or URL",
      default: initial ?? "",
    })) as string;
    const trimmed = answer.trim();
    if (!trimmed) {
      console.log(chalk.red("Host cannot be empty."));
      continue;
    }
    try {
      const normalized = normalizeBaseUrl(trimmed);
      updateConfig({ host: normalized });
      console.log(`Saved host: ${normalized} (${getConfigPath()})`);
      return normalized;
    } catch (error) {
      reportError(error);
    }
  }
}

async function resolveHost(
  cliHost?: string,
  interactive: boolean = false
): Promise<string> {
  if (cliHost) {
    return normalizeBaseUrl(cliHost);
  }
  const saved = getConfiguredHost();
  if (saved) {
    return saved;
  }
  if (!interactive) {
    throw new Error(
      "No device host configured. Pass --host <ip> once or run plain `dgmwatch` to set it interactively."
    );
  }
  return promptAndSaveHost();
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`\n${message}`));
}

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
    out.push(`${message}\n`);
    for (let i = 0; i < choices.length; i++) {
      const pointer = i === index ? chalk.cyan(">") : " ";
      const choice = choices[i]!;
      const label = i === index ? chalk.cyan(choice.name) : choice.name;
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

    function onKey(str: string, key: any) {
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
