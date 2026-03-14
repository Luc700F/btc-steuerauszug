// ─────────────────────────────────────────────────────────────────────────────
// lib/validate.js
// Zweck: Konsistenzprüfung von Steuer-Daten vor PDF/XML-Generierung
// Exports: validateSteuerDaten(steuerDaten)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prüft ob die Steuer-Daten konsistent sind (Steuerwert = Endbestand × Kurs).
 * Wirft einen Error wenn inkonsistent.
 *
 * @param {{
 *   steuerwert: number,
 *   endbestandBTC: number,
 *   kurs3112: number,
 *   totalTaxValue: number,
 * }} steuerDaten
 * @throws {Error} Wenn Steuerwert inkonsistent
 * @returns {true}
 */
export function validateSteuerDaten(steuerDaten) {
  const errors = [];
  const { steuerwert, endbestandBTC, kurs3112, totalTaxValue } = steuerDaten;

  // 1. Steuerwert = Endbestand × Kurs (Toleranz 1 Rappen)
  if (endbestandBTC != null && kurs3112 != null) {
    const berechnet = Math.round(endbestandBTC * kurs3112 * 100) / 100;
    if (Math.abs(berechnet - steuerwert) > 0.01) {
      errors.push(
        `Steuerwert inkonsistent: ${steuerwert} ≠ ${endbestandBTC} × ${kurs3112} = ${berechnet}`
      );
    }
  }

  // 2. XML totalTaxValue = PDF steuerwert
  if (totalTaxValue != null && totalTaxValue !== steuerwert) {
    errors.push(
      `XML totalTaxValue (${totalTaxValue}) ≠ PDF steuerwert (${steuerwert})`
    );
  }

  // 3. Kurs vorhanden
  if (!kurs3112 || kurs3112 <= 0) {
    errors.push("Kein Stichtagskurs verfügbar (kurs3112 <= 0)");
  }

  // 4. Endbestand >= 0
  if (endbestandBTC != null && endbestandBTC < 0) {
    errors.push(`Endbestand negativ: ${endbestandBTC}`);
  }

  if (errors.length > 0) {
    console.error("[validation] Fehler:", errors);
    throw new Error("Steuer-Daten inkonsistent:\n" + errors.join("\n"));
  }

  console.log(
    "[validation] OK – Steuerwert CHF",
    steuerwert,
    "=",
    endbestandBTC?.toFixed(8),
    "×",
    kurs3112
  );
  return true;
}
