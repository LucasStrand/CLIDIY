import chalk from "chalk";
import { input } from "@inquirer/prompts";
import readline from "readline";
import { login, logout } from "../auth/msal.js";
import {
  me,
  listTeams,
  listChannels,
  sendChannelMessage,
  listUsers,
  createOrGetOneOnOneChat,
  sendChatMessage,
} from "../graph/client.js";
import { readConfig } from "../util/config.js";

type Choice = { name: string; value: any };

async function selectVim(opts: {
  message: string;
  choices: Choice[];
}): Promise<any> {
  const { message, choices } = opts;
  let index = 0;
  let ggAt: number | null = null;
  const totalLines = () => 1 + choices.length;
  const hide = "\x1B[?25l";
  const show = "\x1B[?25h";
  // Move cursor to top of the menu without touching lines above
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

  return await new Promise((resolve, reject) => {
    function cleanup() {
      process.stdout.write("\n" + show);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener("keypress", onKey);
    }
    function onKey(str: string, key: any) {
      if (key?.name === "return") {
        process.stdout.write(moveToTop() + "\x1B[0J");
        cleanup();
        const ch = choices[index]!;
        return resolve(ch.value);
      }
      if (key?.name === "escape" || str === "q") {
        process.stdout.write(moveToTop() + "\x1B[0J");
        cleanup();
        return reject(new Error("Cancelled"));
      }
      const prev = index;
      if (key?.name === "down" || str === "j")
        index = Math.min(index + 1, choices.length - 1);
      if (key?.name === "up" || str === "k") index = Math.max(index - 1, 0);
      if (str === "G") index = choices.length - 1;
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

export async function runInteractive(): Promise<void> {
  while (true) {
    const cfg = readConfig();
    const isSignedIn = !!cfg.account;
    const choices = [
      ...(isSignedIn ? [] : [{ name: "Login", value: "login" }]),
      { name: "Me", value: "me" },
      { name: "List Teams", value: "teams" },
      { name: "Send Channel Message", value: "sendChannel" },
      { name: "Send 1:1 Message", value: "sendChat" },
      ...(isSignedIn ? [{ name: "Logout", value: "logout" }] : []),
      { name: "Exit", value: "exit" },
    ];
    const choice = await selectVim({ message: "TeamsCLI", choices });

    if (choice === "exit") {
      process.exit(0);
    }
    if (choice === "login") {
      await login()
        .then(() => console.log(chalk.green("Signed in.")))
        .catch((e) => console.error(String(e?.message || e)));
      continue;
    }
    if (choice === "logout") {
      await logout();
      console.log(chalk.green("Signed out."));
      continue;
    }
    if (choice === "me") {
      console.log(await me());
      continue;
    }
    if (choice === "teams") {
      const t = (await listTeams()) as any;
      for (const team of t.value ?? []) {
        console.log(
          `${chalk.cyan(team.displayName)} ${chalk.gray(`(${team.id})`)}`
        );
      }
      continue;
    }
    if (choice === "sendChannel") {
      const t = (await listTeams()) as any;
      if ((t.value ?? []).length === 0) {
        console.log("No teams.");
        continue;
      }
      const teamId = await selectVim({
        message: "Team",
        choices: (t.value ?? []).map((x: any) => ({
          name: x.displayName,
          value: x.id,
        })),
      });
      const c = (await listChannels(teamId as unknown as string)) as any;
      const channelId = await selectVim({
        message: "Channel",
        choices: (c.value ?? []).map((x: any) => ({
          name: x.displayName,
          value: x.id,
        })),
      });
      const message = await input({ message: "Message (HTML allowed)" });
      await sendChannelMessage(
        teamId as unknown as string,
        channelId as unknown as string,
        message as unknown as string
      );
      console.log(chalk.green("Message sent."));
      continue;
    }
    if (choice === "sendChat") {
      const q = await input({ message: "User (UPN or GUID)" });
      const users = (await listUsers(q)) as any;
      if ((users.value ?? []).length === 0) {
        console.log("User not found.");
        continue;
      }
      const userId = await selectVim({
        message: "Select user",
        choices: (users.value ?? []).slice(0, 25).map((u: any) => ({
          name: `${u.displayName} ${
            u.userPrincipalName ? `(${u.userPrincipalName})` : ""
          }`,
          value: u.id,
        })),
      });
      const message = await input({ message: "Message (HTML allowed)" });
      const chat = (await createOrGetOneOnOneChat(
        userId as unknown as string
      )) as any;
      await sendChatMessage(chat.id, message);
      console.log(chalk.green("Message sent."));
      continue;
    }
  }
}
