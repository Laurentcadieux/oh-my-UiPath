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

// Built-in defaults for common commands
if (!matched) {
  if (argStr.startsWith('login status') || argStr === 'login status' || argStr.startsWith('login status ')) {
    // Return a non-prod tenant so the guard doesn't block in tests
    if (argStr.includes('--output') && argStr.includes('json')) {
      process.stdout.write(JSON.stringify({ tenant: 'TestTenant', loggedIn: true }));
    } else {
      process.stdout.write('Logged in as test-user on tenant TestTenant\n');
    }
    process.exit(0);
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