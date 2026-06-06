#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run an executable without a shell so folder names can never be interpreted
 * as shell syntax. Returns the exit code and trimmed output instead of throwing.
 */
function run(cmd: string, args: string[], cwd?: string): RunResult {
  // On Windows, CreateProcess appends `.exe` when no extension is given, so
  // `git`/`gh` resolve without a shell. We deliberately avoid `shell: true` so
  // folder names are passed as literal args and never interpreted as syntax.
  const exe = process.platform === "win32" ? `${cmd}.exe` : cmd;
  const res = spawnSync(exe, args, {
    cwd,
    encoding: "utf8",
  });
  if (res.error) {
    return { code: 1, stdout: "", stderr: res.error.message };
  }
  return {
    code: res.status ?? 1,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}

function commandExists(cmd: string): boolean {
  return run(cmd, ["--version"]).code === 0;
}

/** Compare two filesystem paths, case-insensitively on Windows. */
function samePath(a: string, b: string): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}

/**
 * True only when `dir` is the ROOT of its own git repo. `git rev-parse` walks
 * upward, so a plain folder sitting inside another repo would otherwise look
 * like a repo — we compare the toplevel to `dir` to avoid that.
 */
function isOwnGitRoot(dir: string): boolean {
  const res = run("git", ["rev-parse", "--show-toplevel"], dir);
  return res.code === 0 && res.stdout ? samePath(res.stdout, dir) : false;
}

function hasCommits(dir: string): boolean {
  return run("git", ["rev-parse", "--verify", "HEAD"], dir).code === 0;
}

function getRemoteUrl(dir: string, remote: string): string | undefined {
  const res = run("git", ["remote", "get-url", remote], dir);
  return res.code === 0 && res.stdout ? res.stdout : undefined;
}

/** Immediate subdirectories of `root`, sorted, with optional hidden filtering. */
function findFolders(root: string, includeHidden: boolean): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => name !== ".git" && name !== "node_modules")
    .filter((name) => includeHidden || !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b));
}

/** True if the directory contains anything worth committing. */
function isEmptyDir(dir: string): boolean {
  return fs.readdirSync(dir).length === 0;
}

/** First lines of a folder's README, if it has one, so the user can eyeball it. */
function readReadmePreview(dir: string, maxLines = 15): string | undefined {
  const candidates = ["README.md", "Readme.md", "readme.md", "README", "README.txt", "readme.txt"];
  for (const name of candidates) {
    const file = path.join(dir, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      const preview = lines.slice(0, maxLines).join("\n");
      return lines.length > maxLines ? `${preview}\n…` : preview;
    }
  }
  return undefined;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} ${chalk.gray("[y/N]")} `)).trim();
    return /^y(es)?$/i.test(answer);
  } finally {
    rl.close();
  }
}

interface Options {
  path?: string;
  org?: string;
  remote: string;
  private?: boolean;
  public?: boolean;
  includeHidden: boolean;
  message: string;
  dryRun: boolean;
  yes: boolean;
}

type FolderStatus = "created" | "skipped" | "failed";

type PlanAction = "create" | "on-github" | "empty";

interface PlannedFolder {
  name: string;
  folder: string;
  action: PlanAction;
  /** Existing remote URL, when the folder is already on GitHub. */
  remoteUrl?: string;
}

/**
 * Decide what to do with a folder WITHOUT changing anything. A folder that is
 * already its own git repo with the target remote is treated as already on
 * GitHub and left completely alone.
 */
function planFolder(folder: string, name: string, opts: Options): PlannedFolder {
  if (isEmptyDir(folder)) return { name, folder, action: "empty" };
  if (isOwnGitRoot(folder)) {
    const remoteUrl = getRemoteUrl(folder, opts.remote);
    if (remoteUrl) return { name, folder, action: "on-github", remoteUrl };
  }
  return { name, folder, action: "create" };
}

/**
 * Create a brand-new GitHub repo for a folder and push it. Only ever called for
 * folders planned as "create" — it never touches a folder already on GitHub.
 */
function createRepo(
  folder: string,
  name: string,
  opts: Options
): { status: FolderStatus; detail: string } {
  const label = chalk.cyan(name);

  // Make it a git repo if it isn't one already.
  if (!isOwnGitRoot(folder)) {
    const init = run("git", ["init", "-b", "main"], folder);
    if (init.code !== 0) {
      // Older git without -b: init then rename the branch.
      run("git", ["init"], folder);
      run("git", ["checkout", "-b", "main"], folder);
    }
  }

  // Stage and commit so there's something to push.
  run("git", ["add", "-A"], folder);
  if (run("git", ["status", "--porcelain"], folder).stdout) {
    const commit = run("git", ["commit", "-m", opts.message], folder);
    if (commit.code !== 0 && !hasCommits(folder)) {
      return {
        status: "failed",
        detail: `${label}: could not create commit — ${commit.stderr || commit.stdout}`,
      };
    }
  }
  if (!hasCommits(folder)) {
    return { status: "skipped", detail: `${label} ${chalk.gray("(nothing to commit)")}` };
  }

  const repoName = opts.org ? `${opts.org}/${name}` : name;
  const visibility = opts.public ? "--public" : "--private";
  const create = run("gh", [
    "repo",
    "create",
    repoName,
    visibility,
    "--source",
    folder,
    "--remote",
    opts.remote,
    "--push",
  ]);
  if (create.code !== 0) {
    return { status: "failed", detail: `${label}: ${create.stderr || create.stdout}` };
  }
  const url = getRemoteUrl(folder, opts.remote);
  return { status: "created", detail: `${label} ${chalk.gray("→ " + (url ?? repoName))}` };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("folders-to-github")
    .description(
      "Find folders at a location (or the current directory) and add each one to GitHub as its own repository."
    )
    .argument("[path]", "Directory to scan for folders (defaults to current directory)")
    .option("-o, --org <org>", "Create the repos under this GitHub user/org instead of your account")
    .option("-r, --remote <name>", "Git remote name to use", "origin")
    .option("--private", "Create repositories as private (default)")
    .option("--public", "Create repositories as public")
    .option("--include-hidden", "Include folders whose names start with a dot", false)
    .option("-m, --message <msg>", "Commit message for the initial commit", "Initial commit")
    .option("-n, --dry-run", "List the folders that would be added, then exit", false)
    .option("-y, --yes", "Skip the per-folder confirmation prompts and add them all", false)
    .action(async (pathArg: string | undefined, raw: Record<string, unknown>) => {
      const opts: Options = {
        ...(pathArg !== undefined ? { path: pathArg } : {}),
        ...(typeof raw.org === "string" ? { org: raw.org } : {}),
        remote: String(raw.remote),
        ...(raw.private ? { private: true } : {}),
        ...(raw.public ? { public: true } : {}),
        includeHidden: Boolean(raw.includeHidden),
        message: String(raw.message),
        dryRun: Boolean(raw.dryRun),
        yes: Boolean(raw.yes),
      };

      if (opts.public && opts.private) {
        console.error(chalk.red("Choose either --public or --private, not both."));
        process.exitCode = 1;
        return;
      }

      const root = path.resolve(opts.path ?? process.cwd());
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        console.error(chalk.red(`Not a directory: ${root}`));
        process.exitCode = 1;
        return;
      }

      // Planning calls git, so make sure it exists first.
      if (!commandExists("git")) {
        console.error(chalk.red("git is not installed or not on PATH."));
        process.exitCode = 1;
        return;
      }

      const folders = findFolders(root, opts.includeHidden);
      console.log(
        `Scanning ${chalk.cyan(root)} — found ${chalk.bold(String(folders.length))} folder${
          folders.length === 1 ? "" : "s"
        }${opts.includeHidden ? "" : chalk.gray(" (hidden folders skipped)")}`
      );
      if (folders.length === 0) return;

      // Work out what would happen to each folder before changing anything.
      const plans = folders.map((name) => planFolder(path.join(root, name), name, opts));
      const toCreate = plans.filter((p) => p.action === "create");

      for (const p of plans) {
        if (p.action === "create") {
          console.log(`  ${chalk.green("+")} ${p.name} ${chalk.gray("(will be added)")}`);
        } else if (p.action === "on-github") {
          console.log(
            `  ${chalk.gray("•")} ${chalk.gray(p.name)} ${chalk.gray("— already on GitHub, left alone")}`
          );
        } else {
          console.log(`  ${chalk.gray("•")} ${chalk.gray(p.name)} ${chalk.gray("— empty, skipped")}`);
        }
      }

      const onGitHub = plans.filter((p) => p.action === "on-github").length;
      const empty = plans.filter((p) => p.action === "empty").length;
      const visibilityLabel = opts.public ? chalk.yellow("public") : chalk.green("private");
      console.log(
        `\n${chalk.bold(String(toCreate.length))} folder${toCreate.length === 1 ? "" : "s"} would be added as ` +
          `${visibilityLabel} repo${toCreate.length === 1 ? "" : "s"}` +
          (opts.org ? ` under ${chalk.cyan(opts.org)}` : "") +
          (onGitHub ? `; ${onGitHub} already on GitHub` : "") +
          (empty ? `; ${empty} empty` : "") +
          "."
      );

      if (opts.dryRun) {
        console.log(chalk.gray("\nDry run — nothing was changed."));
        return;
      }

      if (toCreate.length === 0) {
        console.log(chalk.gray("\nNothing new to add."));
        return;
      }

      // gh is only needed once we actually have repos to create.
      if (!commandExists("gh")) {
        console.error(
          chalk.red("The GitHub CLI (gh) is required. Install it from https://cli.github.com and run `gh auth login`.")
        );
        process.exitCode = 1;
        return;
      }
      if (run("gh", ["auth", "status"]).code !== 0) {
        console.error(chalk.red("You are not logged in to GitHub. Run `gh auth login` first."));
        process.exitCode = 1;
        return;
      }

      const icons: Record<FolderStatus, string> = {
        created: chalk.green("✓ created"),
        skipped: chalk.yellow("• skipped"),
        failed: chalk.red("✗ failed"),
      };
      const summary: Record<FolderStatus, number> = { created: 0, skipped: 0, failed: 0 };

      // Only the folders that aren't already on GitHub. One at a time, show the
      // README and ask before creating anything (unless --yes was given).
      for (const { name, folder } of toCreate) {
        if (!opts.yes) {
          console.log(`\n${chalk.bold(name)} ${chalk.gray(folder)}`);
          const readme = readReadmePreview(folder);
          if (readme) {
            console.log(chalk.gray("  ┌─ README"));
            for (const line of readme.split("\n")) console.log(chalk.gray("  │ ") + line);
            console.log(chalk.gray("  └─"));
          } else {
            console.log(chalk.gray("  (no README found)"));
          }
          const ok = await confirm(`  Create a repo and add ${chalk.cyan(name)} to GitHub?`);
          if (!ok) {
            summary.skipped++;
            console.log(`  ${icons.skipped}  ${chalk.cyan(name)} ${chalk.gray("(declined)")}`);
            continue;
          }
        }

        const result = createRepo(folder, name, opts);
        summary[result.status]++;
        console.log(`  ${icons[result.status]}  ${result.detail}`);
      }

      console.log(
        `\nDone — ${chalk.green(String(summary.created))} added, ` +
          `${chalk.yellow(String(summary.skipped))} skipped, ${chalk.red(String(summary.failed))} failed.`
      );
      if (summary.failed > 0) process.exitCode = 1;
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red(err?.message ?? String(err)));
  process.exitCode = 1;
});
