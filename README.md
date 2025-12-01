# CLIDIY Monorepo

Workspaces for multiple CLI tools.

Packages:

- `packages/smask-cli` – Ask LLMs questions directly from your terminal
- `packages/teamscli` – Microsoft Teams CLI via Microsoft Graph
- `packages/commits-today` – Summarize today's git commits
- `packages/dgmwatch-cli` – Control DALCNET DGM watch DMX controllers

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
