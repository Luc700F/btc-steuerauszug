// Stripe Preis-Konfiguration
// Erste Wallet: CHF 2.10, jede weitere: +CHF 1.00

/**
 * Berechnet den Gesamtpreis für N Wallets in CHF.
 * @param {number} walletCount - Anzahl Wallets (min. 1)
 * @returns {number} Preis in CHF (z.B. 2.10, 3.10, 4.10)
 */
export function calculatePrice(walletCount) {
  const count = Math.max(1, walletCount);
  return 2.10 + Math.max(0, count - 1) * 1.00;
}

/**
 * Preis in Rappen (für Stripe unit_amount).
 * @param {number} walletCount
 * @returns {number} Rappen (z.B. 210, 310, 410)
 */
export function calculatePriceRappen(walletCount) {
  return Math.round(calculatePrice(walletCount) * 100);
}
