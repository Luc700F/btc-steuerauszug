// ─────────────────────────────────────────────────────────────────────────────
// lib/jahres-utils.js
// Zweck: Jahresstatus-Logik für vergangene, laufende und zukünftige Steuerjahre
// Exports: getJahresStatus(taxYear), getSteuerjahre()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gibt den Status und relevante Daten für ein Steuerjahr zurück.
 *
 * @param {number} taxYear - Das Steuerjahr (z.B. 2025)
 * @returns {{
 *   isAbgeschlossen: boolean,
 *   isLaufend: boolean,
 *   stichtagDatum: string,   // "YYYY-MM-DD" – 31.12. oder heute
 *   periodTo: string,        // identisch mit stichtagDatum
 *   hinweis: string|null,    // Hinweis für laufendes Jahr, sonst null
 * }}
 */
export function getJahresStatus(taxYear) {
  const currentYear = new Date().getFullYear();
  const isLaufend = taxYear >= currentYear;
  const today = new Date().toISOString().substring(0, 10);

  return {
    isAbgeschlossen: taxYear < currentYear,
    isLaufend,
    stichtagDatum: isLaufend ? today : `${taxYear}-12-31`,
    periodTo: isLaufend ? today : `${taxYear}-12-31`,
    hinweis: isLaufend
      ? `Laufendes Jahr: Steuerwert basiert auf aktuellem Kurs (${new Date().toLocaleDateString(
          "de-CH"
        )}), nicht auf ESTV-Jahresschlusskurs per 31.12.`
      : null,
  };
}

/**
 * Gibt alle wählbaren Steuerjahre zurück – dynamisch, wächst jedes Jahr.
 * Beginnt mit aktuellem Jahr, endet mit 2013.
 *
 * @returns {number[]} z.B. [2026, 2025, 2024, ..., 2013]
 */
export function getSteuerjahre() {
  const currentYear = new Date().getFullYear();
  return Array.from(
    { length: currentYear - 2013 + 1 },
    (_, i) => currentYear - i
  );
}
