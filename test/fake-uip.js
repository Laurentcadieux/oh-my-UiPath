#!/usr/bin/env node
/**
 * fake-uip.js — a stand-in for the real `uip` CLI for testing.
 *
 * Reads a script file (path in OMU_UIP_SCRIPT env or ./uip-script.json)
 * that maps argument signatures to {exitCode, stdout, stderr}.
 * Logs every call to ./uip-calls.log for assertion in tests.
 */
const fs = require('fs');
const path = require('path');

const scriptPath = process.env.OMU_UIP_SCRIPT || path.join(process.cwd(), 'uip-script.json');
const logPath = process.env.OMU_UIP_LOG || path.join(process.cwd(), 'uip-calls.log');

const args = process.argv.slice(2);
const argStr = args.join(' ');

// Load script
let script = [];
try {
  script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
} catch (e) {
  // Default: success with empty stdout
  script = [];
}

// Log the call
const logLine = `${new Date().toISOString()} | uip ${argStr}\n`;
try {
  fs.appendFileSync(logPath, logLine);
} catch (_) {
  // ignore
}

// Find a matching script entry
let matched = null;
for (const entry of script) {
  if (entry.match) {
    // Regex match against the full arg string
    if (new RegExp(entry.match).test(argStr)) {
      matched = entry;
      break;
    }
  } else if (entry.args) {
    // Exact args match
    if (JSON.stringify(entry.args) === JSON.stringify(args)) {
      matched = entry;
      break;
    }
  }
}

if (matched) {
  if (matched.stdout) process.stdout.write(matched.stdout);
  if (matched.stderr) process.stderr.write(matched.stderr);
  process.exit(matched.exitCode ?? 0);
} else {
  // Default: success, empty output
  process.exit(0);
}