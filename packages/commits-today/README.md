# commits-today

Summarize your Git commits made today.

## Install

From this package directory:

```bash
npm install
npm run build
npm pack
npm i -g ./commits-today-1.0.0.tgz
```

## Usage

```bash
commits-today --help
```

Examples:

```bash
commits-today
commits-today -C ../some/repo
commits-today -a "Your Name" --since "yesterday"
```

By default, author is taken from your `git config user.email` or `user.name`.
