// ─────────────────────────────────────────────────────────────────────────────
// lib/validate-security.js
// Zweck: Sicherheitsprüfungen für Entwicklung und CI
// Exports: validateSecurity()
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const SENSITIVE_PATTERNS = [
  { pattern: /sk_live_[a-zA-Z0-9]+/, name: "Stripe Live Key (sk_live_)" },
  { pattern: /sk_test_[a-zA-Z0-9]{20,}/, name: "Stripe Test Key (sk_test_)" },
  { pattern: /CG-[a-zA-Z0-9]{20,}/, name: "CoinGecko API Key (CG-)" },
  { pattern: /alcht_[a-zA-Z0-9]+/, name: "Alchemy Key (alcht_)" },
];

const SRC_DIRS = ["app", "lib", "components"];

/**
 * Prüft ob Sicherheitsanforderungen erfüllt sind.
 * Gibt { errors, warnings, ok } zurück.
 */
export function validateSecurity() {
  const errors = [];
  const warnings = [];

  // 1. .env.local in .gitignore?
  try {
    const gitignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8");
    if (!gitignore.includes(".env.local") && !gitignore.includes(".env*")) {
      errors.push(".env.local fehlt in .gitignore – KRITISCH: API-Keys könnten gepusht werden");
    }
  } catch {
    warnings.push(".gitignore nicht lesbar");
  }

  // 2. .env.example vorhanden?
  if (!fs.existsSync(path.join(process.cwd(), ".env.example"))) {
    warnings.push(".env.example fehlt – sollte Platzhalter-Werte enthalten");
  }

  // 3. Keine echten API-Keys in Quellcode
  for (const dir of SRC_DIRS) {
    const dirPath = path.join(process.cwd(), dir);
    scanDir(dirPath, SENSITIVE_PATTERNS, errors);
  }

  return { errors, warnings, ok: errors.length === 0 };
}

function scanDir(dir, patterns, errors) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
      scanDir(full, patterns, errors);
    } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, "utf8");
      for (const { pattern, name } of patterns) {
        if (pattern.test(content)) {
          errors.push(`${name} gefunden in ${path.relative(process.cwd(), full)}`);
        }
      }
    }
  }
}
