# folders-to-github

Find the folders sitting at a location (the current directory by default, or a
path you give it) and add each one to GitHub as its own repository.

For every folder it finds, the tool will:

1. Initialise a git repo (`git init`) if the folder isn't one already.
2. Stage and commit any pending changes (this also creates the first commit).
3. Create a GitHub repository and push, using the [GitHub CLI](https://cli.github.com).

If a folder already has the target remote configured, it commits any pending
changes and pushes to it.

## Requirements

- [`git`](https://git-scm.com)
- [`gh`](https://cli.github.com), authenticated with `gh auth login`

## Usage

```bash
# Scan the current directory, confirm, then create a private repo per folder
folders-to-github

# Scan a specific path
folders-to-github ~/projects

# See what would happen without touching anything
folders-to-github --dry-run

# Public repos, under an org, no confirmation prompt
folders-to-github ./work --public --org my-org --yes
```

### Options

| Option | Description |
| --- | --- |
| `[path]` | Directory to scan (defaults to the current directory) |
| `-o, --org <org>` | Create the repos under this user/org instead of your account |
| `-r, --remote <name>` | Git remote name to use (default `origin`) |
| `--private` | Create repositories as private (default) |
| `--public` | Create repositories as public |
| `--include-hidden` | Include folders whose names start with a dot |
| `-m, --message <msg>` | Initial commit message (default `Initial commit`) |
| `-n, --dry-run` | List the folders that would be added, then exit |
| `-y, --yes` | Skip the confirmation prompt |

Empty folders, `.git`, and `node_modules` are skipped.

## Build

```bash
npm -w packages/folders-to-github run build
```
