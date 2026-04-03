#!/usr/bin/env node
const path = require("path");
const { listStagedSensitiveFiles } = require("./git-guard");

function main() {
  const cwd = path.resolve(__dirname, "..", "..");
  const hit = listStagedSensitiveFiles(cwd);
  if (hit.length === 0) {
    process.stdout.write("pre-commit sensitive file check passed\n");
    process.exit(0);
  }

  process.stderr.write("pre-commit blocked. Sensitive files are staged:\n");
  for (const file of hit) {
    process.stderr.write(` - ${file}\n`);
  }
  process.stderr.write("Please run git restore --staged <file> or git rm --cached <file>.\n");
  process.exit(1);
}

main();
