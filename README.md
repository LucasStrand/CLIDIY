# CLIDIY Monorepo

Workspaces for multiple CLI tools.

Packages:

- `packages/teamscli` – Microsoft Teams CLI via Microsoft Graph
- `packages/commits-today` – Summarize today’s git commits
- `packages/folders-to-github` – Add each folder at a location to GitHub as its own repo

## Getting started

```bash
npm install
```

Build all packages:

```bash
npm -w packages/teamscli run build
npm -w packages/commits-today run build
```

See each package README for usage and publishing instructions.
