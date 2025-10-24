const fs = require("fs");
const path = require("path");

const entry = path.join(__dirname, "..", "dist", "index.js");
if (fs.existsSync(entry)) {
  let content = fs.readFileSync(entry, "utf8");
  if (!content.startsWith("#!")) {
    content = "#!/usr/bin/env node\n" + content;
    fs.writeFileSync(entry, content);
  }
  try {
    fs.chmodSync(entry, 0o755);
  } catch {}
}
