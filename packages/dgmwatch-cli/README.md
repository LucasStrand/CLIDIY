# dgmwatch-cli

Control DALCNET DGM watch DMX devices from the terminal. The CLI mirrors the
web UI’s `dmem.bin` writes so you can zero whole universes or tweak ranges
without dragging sliders, and it remembers the IP you configure on first run.

## Install & build

```bash
npm install
npm run build -w packages/dgmwatch-cli
```

Or publish/install the package globally and simply run `dgmwatch`.

## First run

The tool does **not** ship with a baked-in IP. Launch it once and it will ask if
you want to set the device address. The value you provide is stored in
`~/.dgmwatch/config.json` so every future command can reuse it. You can re-run
the Settings option at any time to change it.

## Usage

```
dgmwatch            # interactive menu (reset all, custom range, settings, help)
dgmwatch zero ...   # direct command for scripts/automation
```

### `dgmwatch`

- Reset all 512 slots to 0
- Send a custom range/value
- Settings (change stored device host)
- Command reference (Commander help)
- Navigate with arrow keys or Vim bindings (`j/k`, `gg`, `G`, `q` to cancel)

If no host has been saved yet, the menu prompts you to add one before you can
run DMX commands.

### `dgmwatch zero`

```
dgmwatch zero [options]

Options:
  -H, --host <host>     Device host or base URL (overrides saved config)
  -s, --start <slot>    Starting DMX slot (1-512). Default: 1
  -c, --count <count>   Number of slots to write. Default: fill until 512
  -v, --value <value>   Value written into each slot (0-255). Default: 0
  -t, --timeout <ms>    Abort if the device does not answer in time. Default: 5000
```

If neither `--host` nor a saved host exist the command will abort and tell you
to set one (run `dgmwatch` without arguments or re-run with `--host` once).

