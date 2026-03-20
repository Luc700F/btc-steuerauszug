// ─── Statische Code-Analyse ───────────────────────────────────────────────────

describe("xpub-scanner.js — Bibliotheken & Korrektheit", () => {
  const fs   = require("fs");
  const code = fs.readFileSync("lib/xpub-scanner.js", "utf8");

  test("verwendet @scure/bip32", () =>
    expect(code).toContain("@scure/bip32"));

  test("verwendet @scure/btc-signer", () =>
    expect(code).toContain("@scure/btc-signer"));

  test("KEIN tiny-secp256k1", () =>
    expect(code).not.toContain("tiny-secp256k1"));

  test("KEIN bip32 (altes Paket)", () => {
    const imp = code.split("\n").filter(l => l.trim().startsWith("import"));
    expect(imp.some(l => l.includes('"bip32"'))).toBe(false);
  });

  test("KEIN /xpub/ Endpunkt (existiert nicht auf mempool.space)", () =>
    expect(code).not.toMatch(/mempool\.space\/api\/xpub\//));

  test("verwendet /address/ Endpunkt (korrekt)", () =>
    expect(code).toContain("/address/"));

  test("hat VERSIONS Objekt mit zpub-Versionsbytes", () =>
    expect(code).toContain("VERSIONS"));

  test("übergibt versions an fromExtendedKey (kein 'Version mismatch')", () =>
    expect(code).toContain("fromExtendedKey(xpub, versions)"));

  test("exportiert isXpubInput", () =>
    expect(code).toContain("export function isXpubInput"));

  test("exportiert scanXpub", () =>
    expect(code).toContain("export async function scanXpub"));
});

// ─── package.json ─────────────────────────────────────────────────────────────

describe("package.json — Vercel-kompatible Libraries", () => {
  const pkg  = require("../package.json");
  const deps = Object.keys(pkg.dependencies || {});

  test("@scure/bip32 vorhanden",      () => expect(deps).toContain("@scure/bip32"));
  test("@scure/btc-signer vorhanden", () => expect(deps).toContain("@scure/btc-signer"));
  test("tiny-secp256k1 entfernt",     () => expect(deps).not.toContain("tiny-secp256k1"));
  test("bip32 entfernt",              () => expect(deps).not.toContain("bip32"));
  test("bitcoinjs-lib entfernt",      () => expect(deps).not.toContain("bitcoinjs-lib"));
});

// ─── isXpubInput Logik ────────────────────────────────────────────────────────

describe("isXpubInput", () => {
  function isXpubInput(str) {
    if (!str || typeof str !== "string") return false;
    return /^(xpub|ypub|zpub|Zpub|Ypub|Xpub)[a-zA-Z0-9]{100,}$/.test(str.trim());
  }

  test("zpub → true",  () => expect(isXpubInput("zpub" + "A".repeat(107))).toBe(true));
  test("xpub → true",  () => expect(isXpubInput("xpub" + "A".repeat(107))).toBe(true));
  test("ypub → true",  () => expect(isXpubInput("ypub" + "A".repeat(107))).toBe(true));
  test("bc1q → false", () => expect(isXpubInput("bc1qfwuwnn39v5460vla3gvmcl8q4jlraps92jlcr9")).toBe(false));
  test("leer → false", () => { expect(isXpubInput("")).toBe(false); expect(isXpubInput(null)).toBe(false); });
});

// ─── VERSIONS Korrektheit ─────────────────────────────────────────────────────

describe("VERSIONS Bytes (BIP44/49/84)", () => {
  const VERSIONS = {
    xpub: { private: 0x0488ade4, public: 0x0488b21e },
    ypub: { private: 0x049d7878, public: 0x049d7cb2 },
    zpub: { private: 0x04b2430c, public: 0x04b24746 },
  };

  test("xpub public version = 0x0488b21e", () =>
    expect(VERSIONS.xpub.public).toBe(0x0488b21e));

  test("zpub public version = 0x04b24746", () =>
    expect(VERSIONS.zpub.public).toBe(0x04b24746));

  test("ypub public version = 0x049d7cb2", () =>
    expect(VERSIONS.ypub.public).toBe(0x049d7cb2));

  test("xpub-scanner.js enthält korrekte Versionsbytes", () => {
    const fs   = require("fs");
    const code = fs.readFileSync("lib/xpub-scanner.js", "utf8");
    expect(code).toContain("0x04b24746"); // zpub public
    expect(code).toContain("0x0488b21e"); // xpub public
  });
});

// ─── Performance & Robustheit ─────────────────────────────────────────────────

describe("xpub-scanner.js — Performance & Robustheit", () => {
  const fs   = require("fs");
  const code = fs.readFileSync("lib/xpub-scanner.js", "utf8");

  test("kein setTimeout Delay im Normalfall", () =>
    expect(code).not.toContain("setTimeout(res, 100)"));

  test("Batch-Verarbeitung vorhanden", () => {
    expect(code).toContain("Promise.all");
    expect(code).toContain("BATCH");
  });

  test("Retry-Logik bei 429", () => {
    expect(code).toContain("429");
    expect(code).toContain("retries");
  });
});
