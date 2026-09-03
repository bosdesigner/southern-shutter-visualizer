// lib/env.js — minimal .env loader (no dotenv dependency). Only fills variables that are not already set,
// so Render's environment always wins. Skipped entirely in production.
const fs = require('fs');
const path = require('path');
if (process.env.NODE_ENV !== 'production') {
  const file = path.join(__dirname, '..', '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
module.exports = {};
