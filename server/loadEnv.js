const fs = require('fs');
const path = require('path');

function stripQuotes(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseEnvFile(content) {
  const result = {};
  const lines = String(content).split(/\r?\n/);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    if (raw.startsWith('#')) continue;
    const idx = raw.indexOf('=');
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    const value = stripQuotes(raw.slice(idx + 1));
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseEnvFile(content);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
    return true;
  } catch {
    return false;
  }
}

function loadServerEnv() {
  const envPath = path.join(__dirname, '.env');
  loadEnvFile(envPath);
}

module.exports = {
  loadServerEnv
};

