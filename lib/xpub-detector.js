// ─────────────────────────────────────────────────────────────────────────────
// lib/xpub-detector.js
// Erkennt ob ein User-Input eine Bitcoin-Adresse oder ein Extended Public Key ist.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Erkennt den Typ des eingegebenen Strings.
 * @param {string} input - Roheingabe des Users
 * @returns {'address' | 'xpub' | 'ypub' | 'zpub' | 'unknown'}
 */
export function detectInputType(input) {
  if (!input || typeof input !== "string") return "unknown";
  const s = input.trim();

  // Single Bitcoin-Adressen
  if (/^bc1q[a-z0-9]{6,87}$/i.test(s)) return "address"; // Native SegWit bech32
  if (/^bc1p[a-z0-9]{6,87}$/i.test(s)) return "address"; // Taproot (read-only)
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(s)) return "address"; // Legacy / P2SH

  // Extended Public Keys (Base58, 111 Zeichen nach Prefix)
  if (/^xpub[a-zA-Z0-9]{100,120}$/.test(s)) return "xpub"; // BIP44 Legacy
  if (/^ypub[a-zA-Z0-9]{100,120}$/.test(s)) return "ypub"; // BIP49 Nested SegWit
  if (/^zpub[a-zA-Z0-9]{100,120}$/.test(s)) return "zpub"; // BIP84 Native SegWit

  return "unknown";
}
