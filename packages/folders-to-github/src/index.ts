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

function isGitRepo(dir: string): boolean {
  return run("git", ["rev-parse", "--is-inside-work-tree"], dir).stdout === "true";
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

type FolderStatus = "created" | "pushed" | "skipped" | "failed";

function pushToGitHub(
  folder: string,
  name: string,
  opts: Options
): { status: FolderStatus; detail: string } {
  const label = chalk.cyan(name);

  if (isEmptyDir(folder)) {
    return { status: "skipped", detail: `${label} ${chalk.gray("(empty folder)")}` };
  }

  // 1. Make sure it's a git repo with at least one commit to push.
  if (!isGitRepo(folder)) {
    const init = run("git", ["init", "-b", "main"], folder);
    if (init.code !== 0) {
      // Older git without -b: init then rename the branch.
      run("git", ["init"], folder);
      run("git", ["checkout", "-b", "main"], folder);
    }
  }

  // Stage and commit any pending changes. This also creates the first commit
  // for a brand-new repo, so a folder is always fully committed before we push.
  run("git", ["add", "-A"], folder);
  const pending = run("git", ["status", "--porcelain"], folder).stdout;
  if (pending) {
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

  // 2. If a remote already exists, just push to it. Otherwise create the repo.
  const existing = getRemoteUrl(folder, opts.remote);
  if (existing) {
    const push = run("git", ["push", "-u", opts.remote, "HEAD"], folder);
    if (push.code !== 0) {
      return { status: "failed", detail: `${label}: push failed — ${push.stderr || push.stdout}` };
    }
    return { status: "pushed", detail: `${label} ${chalk.gray("→ " + existing)}` };
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

      const folders = findFolders(root, opts.includeHidden);
      console.log(
        `Scanning ${chalk.cyan(root)} — found ${chalk.bold(String(folders.length))} folder${
          folders.length === 1 ? "" : "s"
        }${opts.includeHidden ? "" : chalk.gray(" (hidden folders skipped)")}`
      );
      if (folders.length === 0) return;

      for (const name of folders) console.log(`  ${chalk.gray("•")} ${name}`);

      const visibilityLabel = opts.public ? chalk.yellow("public") : chalk.green("private");
      console.log(
        `\nEach folder will be pushed to GitHub as a ${visibilityLabel} repo` +
          (opts.org ? ` under ${chalk.cyan(opts.org)}` : "") +
          ` (remote ${chalk.cyan(opts.remote)}).`
      );

      if (opts.dryRun) {
        console.log(chalk.gray("\nDry run — nothing was changed."));
        return;
      }

      // gh is what actually creates repos; fail early with a clear message.
      if (!commandExists("git")) {
        console.error(chalk.red("git is not installed or not on PATH."));
        process.exitCode = 1;
        return;
      }
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
        pushed: chalk.green("✓ pushed"),
        skipped: chalk.yellow("• skipped"),
        failed: chalk.red("✗ failed"),
      };
      const summary: Record<FolderStatus, number> = { created: 0, pushed: 0, skipped: 0, failed: 0 };

      // Walk the same folders we listed above, one at a time. For each, show its
      // README and ask before creating anything (unless --yes was given).
      for (const name of folders) {
        const folder = path.join(root, name);

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

        const result = pushToGitHub(folder, name, opts);
        summary[result.status]++;
        console.log(`  ${icons[result.status]}  ${result.detail}`);
      }

      console.log(
        `\nDone — ${chalk.green(String(summary.created + summary.pushed))} added, ` +
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
