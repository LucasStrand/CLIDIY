const fs = require("fs");
const path = require("path");

const cliPath = path.join(__dirname, "..", "dist", "cli", "index.js");
if (fs.existsSync(cliPath)) {
  let content = fs.readFileSync(cliPath, "utf8");
  if (!content.startsWith("#!")) {
    content = "#!/usr/bin/env node\n" + content;
    fs.writeFileSync(cliPath, content);
  }
}
