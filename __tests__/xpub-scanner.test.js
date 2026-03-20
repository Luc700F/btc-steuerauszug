import { detectInputType } from "../lib/xpub-detector.js";
import { scanXpub } from "../lib/xpub-scanner.js";

// ─── xPub-Detektor Tests ──────────────────────────────────────────────────────

describe("xpub-detector: detectInputType", () => {
  test("zpub wird erkannt", () => {
    const zpub = "zpub6rLtzSoXnXKPXHroRKGCwuRVHjgA5YL6oUkdZnCfbDLdtAKNXb1FX1EmPUYR1uYMRBpngvkdJwxqhLvM46trRy5MRb7oYdSLbb4w5VC4i3z";
    expect(detectInputType(zpub)).toBe("zpub");
  });

  test("xpub wird erkannt", () => {
    const xpub = "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz";
    expect(detectInputType(xpub)).toBe("xpub");
  });

  test("bc1q-Adresse gibt 'address' zurück", () => {
    // BIP173-Testvektor (öffentlich bekannte Beispieladresse)
    expect(detectInputType("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe("address");
  });

  test("bc1p-Adresse (Taproot) gibt 'address' zurück", () => {
    expect(detectInputType("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0")).toBe("address");
  });

  test("Legacy-Adresse (1...) gibt 'address' zurück", () => {
    expect(detectInputType("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfna")).toBe("address");
  });

  test("Leerer String gibt 'unknown' zurück", () => {
    expect(detectInputType("")).toBe("unknown");
  });

  test("null gibt 'unknown' zurück", () => {
    expect(detectInputType(null)).toBe("unknown");
  });

  test("Zufälliger String gibt 'unknown' zurück", () => {
    expect(detectInputType("hallo123")).toBe("unknown");
    expect(detectInputType("not_an_address")).toBe("unknown");
  });
});

// ─── xPub-Scanner: Fehlerbehandlung (offline, kein Netzwerk) ─────────────────

describe("xpub-scanner: scanXpub Fehlerbehandlung", () => {
  test("Wirft bei Bitcoin-Adresse als Input", async () => {
    await expect(
      scanXpub("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")
    ).rejects.toThrow();
  });

  test("Wirft bei leerem String", async () => {
    await expect(scanXpub("")).rejects.toThrow();
  });

  test("Wirft bei zufälligem String", async () => {
    await expect(scanXpub("hallo123")).rejects.toThrow();
  });

  test("Wirft bei ungültigem xpub (zu kurz)", async () => {
    await expect(scanXpub("xpub123")).rejects.toThrow();
  });

  test("Wirft bei Legacy-Adresse (1...)", async () => {
    await expect(
      scanXpub("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfna")
    ).rejects.toThrow();
  });
});

// ─── xPub-Scanner: Adressableitung (offline, via bip32) ──────────────────────

describe("xpub-scanner: Adressableitung (bip32 + bitcoinjs-lib)", () => {
  test("zpub → bc1q Adresse Index 0 korrekt abgeleitet", () => {
    const { BIP32Factory } = require("bip32");
    const ecc     = require("tiny-secp256k1");
    const bitcoin = require("bitcoinjs-lib");
    const bs58check = require("bs58check").default;

    const bip32 = BIP32Factory(ecc);
    const XPUB_V = Buffer.from([0x04, 0x88, 0xb2, 0x1e]);
    const zpub = "zpub6rLtzSoXnXKPXHroRKGCwuRVHjgA5YL6oUkdZnCfbDLdtAKNXb1FX1EmPUYR1uYMRBpngvkdJwxqhLvM46trRy5MRb7oYdSLbb4w5VC4i3z";
    const raw  = Buffer.from(bs58check.decode(zpub));
    const node = bip32.fromBase58(
      bs58check.encode(Buffer.concat([XPUB_V, raw.slice(4)])),
      bitcoin.networks.bitcoin
    );
    const addr = bitcoin.payments.p2wpkh({
      pubkey:  Buffer.from(node.derive(0).derive(0).publicKey),
      network: bitcoin.networks.bitcoin,
    }).address;

    expect(addr).toMatch(/^bc1q/);
    expect(addr).toBe("bc1qvqatyv2xynyanrej2fcutj6w5yugy0gc9jx2nn");
  });

  test("Zwei verschiedene Indizes ergeben zwei verschiedene Adressen", () => {
    const { BIP32Factory } = require("bip32");
    const ecc     = require("tiny-secp256k1");
    const bitcoin = require("bitcoinjs-lib");
    const bs58check = require("bs58check").default;

    const bip32 = BIP32Factory(ecc);
    const XPUB_V = Buffer.from([0x04, 0x88, 0xb2, 0x1e]);
    const zpub = "zpub6rLtzSoXnXKPXHroRKGCwuRVHjgA5YL6oUkdZnCfbDLdtAKNXb1FX1EmPUYR1uYMRBpngvkdJwxqhLvM46trRy5MRb7oYdSLbb4w5VC4i3z";
    const raw  = Buffer.from(bs58check.decode(zpub));
    const node = bip32.fromBase58(
      bs58check.encode(Buffer.concat([XPUB_V, raw.slice(4)])),
      bitcoin.networks.bitcoin
    );
    const mkAddr = (i) => bitcoin.payments.p2wpkh({
      pubkey:  Buffer.from(node.derive(0).derive(i).publicKey),
      network: bitcoin.networks.bitcoin,
    }).address;

    expect(mkAddr(0)).not.toBe(mkAddr(1));
    expect(mkAddr(0)).toMatch(/^bc1q/);
    expect(mkAddr(1)).toMatch(/^bc1q/);
  });

  test("xpub → 1... Legacy-Adresse korrekt abgeleitet", () => {
    const { BIP32Factory } = require("bip32");
    const ecc     = require("tiny-secp256k1");
    const bitcoin = require("bitcoinjs-lib");
    const bs58check = require("bs58check").default;

    const bip32 = BIP32Factory(ecc);
    const XPUB_V = Buffer.from([0x04, 0x88, 0xb2, 0x1e]);
    const xpub = "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz";
    const raw  = Buffer.from(bs58check.decode(xpub));
    const node = bip32.fromBase58(
      bs58check.encode(Buffer.concat([XPUB_V, raw.slice(4)])),
      bitcoin.networks.bitcoin
    );
    const addr = bitcoin.payments.p2pkh({
      pubkey:  Buffer.from(node.derive(0).derive(0).publicKey),
      network: bitcoin.networks.bitcoin,
    }).address;

    expect(addr).toMatch(/^1/);
  });
});

// ─── xpub-scanner: isXpubInput Hilfsfunktion (inline) ────────────────────────

describe("xpub-scanner: isXpubInput Hilfsfunktion", () => {
  function isXpubInput(input) {
    const typ = require("../lib/xpub-detector.js").detectInputType
      ? require("../lib/xpub-detector.js").detectInputType(input)
      : "unknown";
    return ["xpub", "ypub", "zpub"].includes(typ);
  }

  test("zpub → true", () => {
    const zpub = "zpub6rLtzSoXnXKPXHroRKGCwuRVHjgA5YL6oUkdZnCfbDLdtAKNXb1FX1EmPUYR1uYMRBpngvkdJwxqhLvM46trRy5MRb7oYdSLbb4w5VC4i3z";
    expect(isXpubInput(zpub)).toBe(true);
  });

  test("xpub → true", () => {
    const xpub = "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz";
    expect(isXpubInput(xpub)).toBe(true);
  });

  test("bc1q Adresse → false", () => {
    expect(isXpubInput("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe(false);
  });

  test("leer → false", () => {
    expect(isXpubInput("")).toBe(false);
  });

  test("zufälliger String → false", () => {
    expect(isXpubInput("hallo123")).toBe(false);
  });
});

// ─── Integration: TEST_ZPUB (nur lokal, kein CI) ─────────────────────────────

const TEST_ZPUB = process.env.TEST_ZPUB || null;

describe("xpub-scanner: Live-Integration (übersprungen ohne TEST_ZPUB)", () => {
  test("scanXpub liefert Adressen für echten zpub aus .env.local", async () => {
    if (!TEST_ZPUB) {
      console.log("  [SKIP] TEST_ZPUB nicht gesetzt – Integration-Test übersprungen");
      return;
    }

    const result = await scanXpub(TEST_ZPUB);

    expect(typeof result).toBe("object");
    expect(Array.isArray(result.addresses)).toBe(true);
    expect(result.addresses.length).toBeGreaterThan(0);
    expect(result.inputType).toBe("zpub");
    expect(result.xpub).toBe(TEST_ZPUB);

    // Alle Adressen müssen bc1q-Format sein (zpub → P2WPKH)
    for (const addr of result.addresses) {
      expect(addr).toMatch(/^bc1q/);
    }
  }, 120000); // 2 Minuten Timeout für echten Scan
});

// ─── xpub-scanner.js Datei-Checks ─────────────────────────────────────────────

describe("xpub-scanner.js Implementierung", () => {
  test("Verwendet bip32 (nicht @swan-bitcoin/xpub-lib)", () => {
    const fs  = require("fs");
    const src = fs.readFileSync("lib/xpub-scanner.js", "utf8");
    expect(src).toContain("bip32");
    expect(src).not.toContain('from "@swan-bitcoin/xpub-lib"');
  });

  test("GAP_LIMIT ist definiert", () => {
    const fs  = require("fs");
    const src = fs.readFileSync("lib/xpub-scanner.js", "utf8");
    expect(src).toContain("GAP_LIMIT");
  });

  test("Unterstützt zpub, ypub und xpub", () => {
    const fs  = require("fs");
    const src = fs.readFileSync("lib/xpub-scanner.js", "utf8");
    expect(src).toContain("zpub");
    expect(src).toContain("ypub");
    expect(src).toContain("p2wpkh");
    expect(src).toContain("p2sh");
    expect(src).toContain("p2pkh");
  });
});
