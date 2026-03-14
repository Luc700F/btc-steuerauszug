// ─────────────────────────────────────────────────────────────────────────────
// lib/eth-utils.js
// Zweck: Ethereum-Transaktionsbetrag für eine bestimmte Adresse berechnen
// Export: calcAmountForEthAddress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet den Netto-ETH-Betrag einer Transaktion für eine bestimmte Adresse.
 * Positiv = Eingang, Negativ = Ausgang, 0 = Transaktion nicht relevant.
 *
 * @param {Object} tx - Alchemy / Etherscan Transaktion { from, to, value }
 * @param {string} address - Ethereum-Adresse (0x..., case-insensitive)
 * @returns {number} Netto-ETH (positiv = Eingang, negativ = Ausgang)
 */
export function calcAmountForEthAddress(tx, address) {
  const addr = address.toLowerCase();
  const to   = (tx.to   || "").toLowerCase();
  const from = (tx.from || "").toLowerCase();
  const val  = Math.abs(parseInt(tx.value || "0")) / 1e18;

  if (val === 0) return 0;         // Explizit 0 (nicht -0)
  if (to   === addr) return  val;  // Eingang
  if (from === addr) return -val;  // Ausgang
  return 0;                         // Fremde Transaktion
}
