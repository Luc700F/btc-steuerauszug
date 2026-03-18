// ─────────────────────────────────────────────────────────────────────────────
// lib/xml-validator.js
// eCH-0196 v2.2.0 XML-Validator
//
// Prüft strukturelle Korrektheit des generierten XML.
// Wirft Error mit Beschreibung wenn Validierung fehlschlägt.
// ─────────────────────────────────────────────────────────────────────────────

import { getKryptoMeta } from "./krypto-meta";

/**
 * Validiert ein eCH-0196 v2.2.0 XML auf strukturelle Korrektheit.
 *
 * Prüft:
 * - XML-Deklaration vorhanden
 * - Namespace korrekt
 * - totalTaxValue stimmt mit data.steuerwert überein
 * - valorNumber stimmt mit blockchain überein
 * - taxPeriod stimmt mit data.jahr überein
 * - canton stimmt mit data.kanton überein
 * - Anzahl Transaktionen korrekt
 *
 * @param {string} xmlString - Generiertes eCH-0196 v2.2.0 XML
 * @param {Object} data      - Originaldaten (blockchain, steuerwert, kanton, jahr, transaktionen)
 * @throws {Error} Wenn XML strukturell inkorrekt
 * @returns {true} Wenn valide
 */
export function validateXML(xmlString, data = {}) {
  if (!xmlString || typeof xmlString !== "string") {
    throw new Error("XML ist leer oder kein String");
  }

  const xml = xmlString;

  // ── Pflichtfelder ──────────────────────────────────────────────────────────
  if (!xml.includes('<?xml version="1.0"')) {
    throw new Error("Fehlende XML-Deklaration (<?xml version=\"1.0\")");
  }

  if (!xml.includes("taxStatementType")) {
    throw new Error("Fehlendes Root-Element <taxStatementType>");
  }

  if (!xml.includes("eCH-0196")) {
    throw new Error("Fehlender eCH-0196 Namespace");
  }

  if (!xml.includes('minorVersion="22"')) {
    throw new Error('Fehlende minorVersion="22" (eCH-0196 v2.2.0)');
  }

  // ── Valorennummer ──────────────────────────────────────────────────────────
  if (data.blockchain) {
    const meta = getKryptoMeta(data.blockchain);
    if (!xml.includes(`valorNumber="${meta.valorNumber}"`)) {
      throw new Error(
        `Falsche valorNumber für ${data.blockchain}: erwartet "${meta.valorNumber}"`
      );
    }
  }

  // ── Steuerwert ─────────────────────────────────────────────────────────────
  if (data.steuerwert !== undefined && data.steuerwert !== null) {
    const expected = Number(data.steuerwert).toFixed(2);
    if (!xml.includes(`totalTaxValue="${expected}"`)) {
      throw new Error(
        `totalTaxValue "${expected}" nicht im XML gefunden`
      );
    }
  }

  // ── Steuerjahr ─────────────────────────────────────────────────────────────
  if (data.jahr !== undefined) {
    const year = parseInt(data.jahr);
    if (!xml.includes(`taxPeriod="${year}"`)) {
      throw new Error(`taxPeriod="${year}" nicht im XML gefunden`);
    }
  }

  // ── Kanton ─────────────────────────────────────────────────────────────────
  if (data.kanton) {
    const kt = data.kanton.toUpperCase();
    if (!xml.includes(`canton="${kt}"`)) {
      throw new Error(`canton="${kt}" nicht im XML gefunden`);
    }
  }

  // ── Transaktionen ──────────────────────────────────────────────────────────
  if (Array.isArray(data.transaktionen) && data.transaktionen.length > 0) {
    const stockCount = (xml.match(/<stock>/g) || []).length;
    // Anfangsbestand zählt als 1 extra stock wenn > 0
    const expectedMin = data.transaktionen.length;
    if (stockCount < expectedMin) {
      throw new Error(
        `Zu wenige <stock>-Einträge: ${stockCount} gefunden, mind. ${expectedMin} erwartet`
      );
    }
  }

  return true;
}
