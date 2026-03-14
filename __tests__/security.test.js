// ─────────────────────────────────────────────────────────────────────────────
// __tests__/security.test.js
// Zweck: Sicherstellen dass keine API Keys oder Credentials im Source-Code landen
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Hilfsfunktion: alle .js/.jsx Quelldateien rekursiv sammeln
function sammleDateien(verzeichnis, ergebnis = []) {
  const AUSSCHLIESSEN = ["node_modules", ".next", ".git", "coverage"];
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    if (AUSSCHLIESSEN.includes(eintrag.name)) continue;
    const vollpfad = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) {
      sammleDateien(vollpfad, ergebnis);
    } else if (/\.(js|jsx|ts|tsx)$/.test(eintrag.name) && !eintrag.name.endsWith(".test.js")) {
      ergebnis.push(vollpfad);
    }
  }
  return ergebnis;
}

const WURZEL = path.resolve(process.cwd());
const quelldateien = sammleDateien(WURZEL);

// Muster die NIEMALS im committed Code stehen dürfen
const VERBOTENE_MUSTER = [
  { muster: /sk_live_[a-zA-Z0-9]{20,}/, beschreibung: "Stripe Live Secret Key" },
  { muster: /sk_test_[a-zA-Z0-9]{20,}/, beschreibung: "Stripe Test Secret Key" },
  { muster: /pk_live_[a-zA-Z0-9]{20,}/, beschreibung: "Stripe Live Public Key" },
  { muster: /ALCHEMY_API_KEY\s*=\s*["'][a-zA-Z0-9_-]{10,}/, beschreibung: "Alchemy Key hardcodiert" },
  { muster: /CG-[a-zA-Z0-9]{20,}/, beschreibung: "CoinGecko API Key" },
];

describe("Security – keine API Keys im Source-Code", () => {
  quelldateien.forEach((datei) => {
    const relativPfad = path.relative(WURZEL, datei);
    test(`Keine Keys in ${relativPfad}`, () => {
      const inhalt = fs.readFileSync(datei, "utf8");
      for (const { muster, beschreibung } of VERBOTENE_MUSTER) {
        expect(inhalt).not.toMatch(muster);
      }
    });
  });
});

describe("Security – .env Konfiguration", () => {
  test(".env.local ist in .gitignore eingetragen", () => {
    const gitignore = fs.readFileSync(path.join(WURZEL, ".gitignore"), "utf8");
    // .env* oder .env.local muss vorhanden sein
    expect(gitignore.includes(".env*") || gitignore.includes(".env.local")).toBe(true);
  });

  test(".env.local ist NICHT in Git getrackt", () => {
    let tracked = "";
    try {
      tracked = execSync("git ls-files .env.local", { encoding: "utf8", cwd: WURZEL });
    } catch {
      // git nicht verfügbar → überspringen
    }
    expect(tracked.trim()).toBe("");
  });

  test(".env.example existiert als Vorlage", () => {
    const hatExample =
      fs.existsSync(path.join(WURZEL, ".env.example")) ||
      fs.existsSync(path.join(WURZEL, ".env.local.example"));
    expect(hatExample).toBe(true);
  });
});
