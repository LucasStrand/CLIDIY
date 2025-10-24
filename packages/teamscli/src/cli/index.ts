#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { login, logout } from "../auth/msal.js";
import { readConfig, writeConfig, getSetting } from "../util/config.js";
import {
  me,
  listTeams,
  listChannels,
  listChats,
  sendChannelMessage,
  sendChatMessage,
  createOrGetOneOnOneChat,
  listUsers,
  getUserByIdOrUpn,
  resolveTeamId,
  resolveChannelId,
} from "../graph/client.js";
import { runInteractive } from "./tui.js";

const program = new Command();
program
  .name("teamscli")
  .description("CLI for Microsoft Teams messaging via Microsoft Graph")
  .version("0.1.0");

program
  .command("config")
  .description("Get or set configuration")
  .option("--set <key=value...>", "Set key=value pairs (clientId, tenantId)")
  .action((opts) => {
    const cfg = readConfig();
    if (opts.set) {
      for (const kv of opts.set as string[]) {
        const [k, v] = kv.split("=");
        if (!k || !v) throw new Error(`Invalid pair: ${kv}`);
        if (k !== "clientId" && k !== "tenantId")
          throw new Error(`Unknown key: ${k}`);
        (cfg as any)[k] = v;
      }
      writeConfig(cfg);
      console.log(chalk.green("Saved config."));
    } else {
      console.log({
        clientId: getSetting("clientId") ?? null,
        tenantId: getSetting("tenantId") ?? null,
        persisted: cfg,
      });
    }
  });

program
  .command("login")
  .description("Sign-in using device code flow")
  .action(async () => {
    const spinner = ora("Signing in...").start();
    try {
      await login();
      spinner.succeed("Signed in.");
    } catch (e: any) {
      spinner.fail(e.message ?? String(e));
      const tenant = getSetting("tenantId") ?? "organizations";
      const clientId = getSetting("clientId") ?? "(unset)";
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("invalid_client")) {
        console.error(
          "\nHint: invalid_client usually means the app registration is not enabled for public client flows (device code)."
        );
        console.error(
          'In Azure Portal → App registrations → your app → Authentication → Advanced settings, enable "Allow public client flows".'
        );
        console.error(
          "Also verify the correct tenant and client ID are configured:"
        );
        console.error(`  TEAMSCLI_TENANT_ID=${tenant}`);
        console.error(`  TEAMSCLI_CLIENT_ID=${clientId}`);
      }
      process.exitCode = 1;
    }
  });

program
  .command("logout")
  .description("Sign-out and clear cached tokens")
  .action(async () => {
    await logout();
    console.log(chalk.green("Signed out."));
  });

program
  .command("me")
  .description("Show current user")
  .action(async () => {
    const m = await me();
    console.log(m);
  });

program
  .command("teams")
  .description("List joined teams")
  .action(async () => {
    const data: any = await listTeams();
    for (const t of (data as any).value ?? []) {
      console.log(`${chalk.cyan(t.displayName)} ${chalk.gray(`(${t.id})`)}`);
    }
  });

program
  .command("channels")
  .description("List channels for a team")
  .requiredOption("-t, --team <team>", "Team ID or name (exact or partial)")
  .action(async (opts) => {
    const teamId = await resolveTeamId(opts.team);
    const data: any = await listChannels(teamId);
    for (const c of (data as any).value ?? []) {
      console.log(`${chalk.cyan(c.displayName)} ${chalk.gray(`(${c.id})`)}`);
    }
  });

program
  .command("chats")
  .description("List chats")
  .action(async () => {
    const data: any = await listChats();
    for (const c of (data as any).value ?? []) {
      console.log(`${chalk.cyan(c.topic ?? c.id)} ${chalk.gray(`(${c.id})`)}`);
    }
  });

program
  .command("users")
  .description("List users or search by display name/email")
  .option("-q, --query <text>", "Search text")
  .action(async (opts) => {
    const data: any = await listUsers(opts.query);
    for (const u of (data as any).value ?? []) {
      console.log(
        `${chalk.cyan(u.displayName)} ${chalk.gray(
          `${u.userPrincipalName} (${u.id})`
        )}`
      );
    }
  });

program
  .command("send:channel")
  .description("Send a message to a channel")
  .requiredOption("-t, --team <team>", "Team ID or name (exact or partial)")
  .requiredOption(
    "-c, --channel <channel>",
    "Channel ID or name (exact or partial)"
  )
  .requiredOption("-m, --message <text>", "Message text (HTML allowed)")
  .action(async (opts) => {
    const teamId = await resolveTeamId(opts.team);
    const channelId = await resolveChannelId(teamId, opts.channel);
    const res: any = await sendChannelMessage(teamId, channelId, opts.message);
    console.log(chalk.green("Message sent."), (res as any)?.id ?? "");
  });

program
  .command("send:chat")
  .description("Send a message to a 1:1 chat")
  .option("--chat-id <chatId>", "Existing chat ID")
  .option(
    "--user <userIdOrUpn>",
    "User ID or UPN to create one-on-one chat with"
  )
  .requiredOption("-m, --message <text>", "Message text (HTML allowed)")
  .action(async (opts) => {
    let chatId: string | undefined = opts.chatId;
    if (!chatId) {
      if (!opts.user) throw new Error("Provide --chat-id or --user");
      const user: any = await getUserByIdOrUpn(opts.user);
      const chat: any = await createOrGetOneOnOneChat(user.id);
      chatId = chat.id as string;
    }
    const res: any = await sendChatMessage(chatId!, opts.message);
    console.log(chalk.green("Message sent."), (res as any)?.id ?? "");
  });

if (process.argv.length <= 2) {
  // No args: start interactive TUI
  runInteractive().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
} else {
  program.parseAsync(process.argv);
}
