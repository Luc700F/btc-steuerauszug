// ─────────────────────────────────────────────────────────────────────────────
// lib/xpub-scanner.js
// Scannt alle Adressen eines xpub/ypub/zpub mit Gap-Limit und aggregiert TXs.
// Nutzt bip32 + bitcoinjs-lib für robuste Adress-Ableitung (keine Prüfsummen-
// Probleme wie bei @swan-bitcoin/xpub-lib).
// ─────────────────────────────────────────────────────────────────────────────

import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import bs58check from "bs58check";
import { detectInputType } from "./xpub-detector.js";

const bip32 = BIP32Factory(ecc);

const GAP_LIMIT = 20;      // Bitcoin-Standard: 20 unbenutzte Adressen → stoppen
const MAX_ADDRESSES = 500; // Sicherheitsgrenze gegen Endlosschleifen
const MEMPOOL_BASE = "https://mempool.space/api";

// xpub Mainnet-Version (0x0488B21E) – für einheitliches bip32-Parsing
const XPUB_VERSION = Buffer.from([0x04, 0x88, 0xb2, 0x1e]);

/**
 * Konvertiert zpub/ypub/xpub → xpub-Format für bip32.
 * Alle Extended-Key-Typen teilen dieselbe BIP32-Struktur, nur die
 * Versions-Bytes unterscheiden sich (Präfix bestimmt Adresstyp).
 */
function convertToXpub(extKey) {
  const raw = Buffer.from(bs58check.decode(extKey));
  return bs58check.encode(Buffer.concat([XPUB_VERSION, raw.slice(4)]));
}

/**
 * Leitet eine Bitcoin-Adresse von einem Chain-Node ab.
 * @param {object} chainNode - bip32 Node (bereits auf change=0|1 abgeleitet)
 * @param {string} type      - "xpub" | "ypub" | "zpub"
 * @param {number} index     - Adress-Index (0, 1, 2, ...)
 * @returns {string|null}
 */
function deriveAddress(chainNode, type, index) {
  try {
    const child   = chainNode.derive(index);
    const pubkey  = Buffer.from(child.publicKey);
    const network = bitcoin.networks.bitcoin;

    if (type === "zpub") {
      // P2WPKH → bc1q...
      return bitcoin.payments.p2wpkh({ pubkey, network }).address ?? null;
    } else if (type === "ypub") {
      // P2SH(P2WPKH) → 3...
      return bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey, network }),
        network,
      }).address ?? null;
    } else {
      // xpub: P2PKH → 1...
      return bitcoin.payments.p2pkh({ pubkey, network }).address ?? null;
    }
  } catch {
    return null;
  }
}

/**
 * Prüft ob eine Bitcoin-Adresse jemals benutzt wurde (mempool.space).
 * @param {string} address
 * @returns {Promise<boolean>}
 */
async function hasTransactions(address) {
  try {
    const res = await fetch(`${MEMPOOL_BASE}/address/${address}`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.chain_stats?.tx_count ?? 0) + (data.mempool_stats?.tx_count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Scannt alle genutzten Adressen eines Extended Public Keys mit Gap-Limit.
 *
 * Strategie:
 * 1. Externe Adressen (change=0): m/0/0, m/0/1, ... bis GAP_LIMIT leere in Folge
 * 2. Change-Adressen (change=1): m/1/0, m/1/1, ... bis GAP_LIMIT leere in Folge
 * 3. Alle genutzten Adressen (mit ≥1 Tx) zurückgeben
 *
 * @param {string} xpub - Extended Public Key (xpub/ypub/zpub)
 * @returns {Promise<{ addresses: string[], inputType: string, xpub: string }>}
 */
export async function scanXpub(xpub) {
  const type = detectInputType(xpub);
  if (!["xpub", "ypub", "zpub"].includes(type)) {
    throw new Error(`Kein gültiger Extended Public Key: ${xpub.substring(0, 10)}...`);
  }

  let rootNode;
  try {
    const xpubConverted = convertToXpub(xpub.trim());
    rootNode = bip32.fromBase58(xpubConverted, bitcoin.networks.bitcoin);
  } catch (e) {
    throw new Error(`Ungültiger Extended Public Key: ${e.message}`);
  }

  const usedAddresses = [];
  let totalScanned = 0;

  for (const change of [0, 1]) {
    const chainNode = rootNode.derive(change);
    let gapCount = 0;
    let index = 0;

    while (gapCount < GAP_LIMIT && index < MAX_ADDRESSES) {
      const address = deriveAddress(chainNode, type, index);

      if (!address) {
        gapCount++;
        index++;
        continue;
      }

      totalScanned++;
      const used = await hasTransactions(address);

      if (used) {
        usedAddresses.push(address);
        gapCount = 0; // Gap-Zähler zurücksetzen
      } else {
        gapCount++;
      }

      index++;

      // Rate-Limit-Puffer: alle 10 Adressen kurz warten
      if (index % 10 === 0) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    console.log(
      `[xPub] ${type} change=${change}: ${index} geprüft, ${usedAddresses.length} total genutzt`
    );
  }

  console.log(
    `[xPub] Scan abgeschlossen: ${totalScanned} Adressen geprüft, ${usedAddresses.length} genutzt`
  );

  return {
    addresses: usedAddresses,
    inputType:  type,
    xpub,
  };
}
