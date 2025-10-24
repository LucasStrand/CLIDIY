const fs = require("fs");
const path = require("path");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const cliDir = path.join(__dirname, "..", "dist", "cli");
if (fs.existsSync(cliDir)) {
  const files = walk(cliDir).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    let content = fs.readFileSync(file, "utf8");
    if (!content.startsWith("#!")) {
      content = "#!/usr/bin/env node\n" + content;
      fs.writeFileSync(file, content);
    }
    try {
      fs.chmodSync(file, 0o755);
    } catch {}
  }
}
