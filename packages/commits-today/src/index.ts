#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "node:child_process";
import path from "node:path";

function runGit(args: string[], cwd?: string): string {
  try {
    const output = execSync(["git", ...args].join(" "), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return output.trim();
  } catch (e: any) {
    const msg = e?.stderr?.toString?.() || e?.message || String(e);
    throw new Error(msg.trim());
  }
}

function ensureInGitRepo(cwd?: string): void {
  const res = runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (res !== "true") throw new Error("Not inside a Git repository");
}

function getGitConfig(key: string, cwd?: string): string | undefined {
  try {
    const v = runGit(["config", key], cwd);
    return v || undefined;
  } catch {
    return undefined;
  }
}

function formatLocalDayStart(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d} 00:00`;
}

function getTodaySinceArg(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return formatLocalDayStart(now);
}

function summarizeCommits(args: {
  since: string;
  author?: string;
  cwd?: string;
}): { count: number; lines: string[] } {
  const gitArgs = [
    "log",
    `--since=\"${args.since}\"`,
    "--date=short",
    "--pretty=format:%h%x09%ad%x09%s",
  ];
  if (args.author) gitArgs.push(`--author=\"${args.author}\"`);
  const out = runGit(gitArgs, args.cwd);
  const lines = out ? out.split(/\r?\n/) : [];
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  return { count: nonEmpty.length, lines: nonEmpty };
}

const program = new Command();
program
  .name("commits-today")
  .description("Show a summary of your commits made today in the current repo")
  .option(
    "-C, --cwd <path>",
    "Repository path (defaults to current working directory)"
  )
  .option(
    "-a, --author <pattern>",
    "Author name/email pattern (defaults to your git config)"
  )
  .option(
    "-s, --since <when>",
    "Since when (git date), defaults to start of local day"
  )
  .option("--raw", "Print raw git log lines without summary header", false)
  .action((opts) => {
    const repoPath = (
      opts.cwd ? path.resolve(String(opts.cwd)) : process.cwd()
    ) as string;
    ensureInGitRepo(repoPath);

    let author: string | undefined = opts.author;
    if (!author) {
      const email = getGitConfig("user.email", repoPath);
      const name = getGitConfig("user.name", repoPath);
      author = email || name || undefined;
    }

    const since: string = opts.since || getTodaySinceArg();
    const result = summarizeCommits({
      since,
      ...(author ? { author } : {}),
      cwd: repoPath,
    });

    if (opts.raw) {
      for (const line of result.lines) console.log(line);
      return;
    }

    const repoLabel = chalk.cyan(path.basename(repoPath));
    const authorLabel = author
      ? chalk.green(author)
      : chalk.yellow("(any author)");
    console.log(
      `${repoLabel}: ${chalk.bold(
        `${result.count}`
      )} commits since ${chalk.magenta(since)} by ${authorLabel}`
    );
    if (result.count === 0) return;
    for (const line of result.lines) {
      const [hash, date, subject] = line.split("\t");
      console.log(` ${chalk.gray(date)} ${chalk.cyan(hash)} ${subject}`);
    }
  });

program.parse(process.argv);
