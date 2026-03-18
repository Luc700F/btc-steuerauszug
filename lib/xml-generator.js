// ─────────────────────────────────────────────────────────────────────────────
// lib/xml-generator.js
// eCH-0196 v2.2.0 XML-Generator
//
// Vereinfachte API für Tests und direkte Nutzung.
// Für vollständige Multi-Asset-Unterstützung → lib/esteuerauszug.js
// ─────────────────────────────────────────────────────────────────────────────

import { getKryptoMeta } from "./krypto-meta";

function escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Generiert ein eCH-0196 v2.2.0 XML für eine einzelne Kryptowährung.
 *
 * @param {Object} data
 * @param {string}   data.blockchain     - 'bitcoin' | 'ethereum' | 'solana'
 * @param {string}   data.walletAddress  - Wallet-Adresse (Depot-/Client-Nummer)
 * @param {string}   data.kanton         - Kantonskürzel, z.B. 'ZH'
 * @param {number}   data.jahr           - Steuerjahr, z.B. 2025
 * @param {string}   [data.kundenName]   - Kundenname (optional)
 * @param {number}   data.endbestand     - Bestand am 31.12.
 * @param {number}   data.steuerwert     - Steuerwert in CHF (endbestand × kurs31Dez)
 * @param {number}   data.kurs31Dez      - Kurs am 31.12. in CHF
 * @param {number}   [data.anfangsbestand] - Bestand am 01.01. (optional, default: 0)
 * @param {Array}    [data.transaktionen] - [{date, type, amount, chfKurs, chfWert}]
 * @returns {string} Vollständiges eCH-0196 v2.2.0 XML
 */
export function generateXML(data) {
  const {
    blockchain,
    walletAddress,
    kanton       = "ZH",
    jahr,
    kundenName,
    endbestand   = 0,
    steuerwert   = 0,
    kurs31Dez    = 0,
    anfangsbestand = 0,
    transaktionen  = [],
  } = data;

  const meta         = getKryptoMeta(blockchain);
  const kt           = (kanton || "ZH").toUpperCase();
  const taxYear      = parseInt(jahr);
  const steuerwertFmt = Number(steuerwert).toFixed(2);
  const now          = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const clientNum    = escapeXml((walletAddress || "").substring(0, 50));

  // Anfangsbestand (01.01.)
  const anfangsXml = anfangsbestand > 0
    ? `
        <stock>
          <referenceDate>${taxYear}-01-01</referenceDate>
          <mutation>false</mutation>
          <name>Anfangsbestand</name>
          <quotationType>piece</quotationType>
          <quantity>${Number(anfangsbestand).toFixed(8)}</quantity>
          <balanceCurrency>CHF</balanceCurrency>
        </stock>`
    : "";

  // Transaktionen
  const txXml = transaktionen.map((tx) => {
    const isIn  = tx.type === "in" || tx.type === "eingang";
    const sign  = isIn ? "+" : "-";
    const name  = isIn ? "BUY / EINGANG" : "SELL / AUSGANG";
    const datum = String(tx.date || tx.datum || "").substring(0, 10);
    return `
        <stock>
          <referenceDate>${datum}</referenceDate>
          <mutation>true</mutation>
          <name>${escapeXml(name)}</name>
          <quotationType>piece</quotationType>
          <quantity>${sign}${Number(tx.amount ?? 0).toFixed(8)}</quantity>
          <balanceCurrency>CHF</balanceCurrency>
          <unitPrice>${Number(tx.chfKurs ?? 0).toFixed(2)}</unitPrice>
          <value>${Number(tx.chfWert ?? 0).toFixed(2)}</value>
        </stock>`;
  }).join("");

  // Steuerwert 31.12.
  const taxValueXml = `
        <taxValue>
          <referenceDate>${taxYear}-12-31</referenceDate>
          <quotationType>piece</quotationType>
          <quantity>${Number(endbestand).toFixed(8)}</quantity>
          <balanceCurrency>CHF</balanceCurrency>
          <unitPrice>${Number(kurs31Dez).toFixed(2)}</unitPrice>
          <value>${steuerwertFmt}</value>
        </taxValue>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<taxStatementType
  xmlns="https://share.ech.ch/xmlns/eCH-0196/2.2/eCH-0196-2-2.xsd"
  id="${uuid()}"
  creationDate="${now}"
  taxPeriod="${taxYear}"
  periodFrom="${taxYear}-01-01"
  periodTo="${taxYear}-12-31"
  country="CH"
  canton="${escapeXml(kt)}"
  totalTaxValue="${steuerwertFmt}"
  totalGrossRevenueA="0"
  totalGrossRevenueB="0"
  totalWithHoldingTaxClaim="0"
  minorVersion="22">

  <institution>
    <name>btcSteuerauszug.ch</name>
  </institution>

  <client clientNumber="${clientNum}"/>

  <listOfSecurities
    totalTaxValue="${steuerwertFmt}"
    totalGrossRevenueA="0"
    totalGrossRevenueB="0"
    totalWithHoldingTaxClaim="0"
    totalLumpSumTaxCredit="0"
    totalNonRecoverableTax="0"
    totalAdditionalWithHoldingTaxUSA="0"
    totalGrossRevenueIUP="0"
    totalGrossRevenueConversion="0">

    <depot depotNumber="${clientNum}">

      <security
        positionId="1"
        valorNumber="${escapeXml(meta.valorNumber)}"
        country="${escapeXml(meta.country)}"
        securityCategory="${escapeXml(meta.securityCategory)}"
        securityName="${escapeXml(meta.securityName)}"
        quotationType="${escapeXml(meta.quotationType)}"
        currency="CHF">${taxValueXml}${anfangsXml}${txXml}
      </security>

    </depot>
  </listOfSecurities>

</taxStatementType>`;
}
