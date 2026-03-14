// ─────────────────────────────────────────────────────────────────────────────
// lib/esteuerauszug.js
// Zweck: eCH-0196 v2.2.0 XML generieren (Schweizer Steuerstandard)
// Exports: generateESteuerauszugXML(steuerDaten, kundeDaten) → string
// Namespace: urn:ech:xmlns:eCH-0196:2 | BTC Valorennummer: 3841927
// Unterstützt: BTC (single asset) + ETH/SOL (multi-asset via assets[])
// ─────────────────────────────────────────────────────────────────────────────

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Formatiert einen CHF-Betrag nach DIN 1333 / eCH-0196.
 * >= CHF 100: 2 Dezimalstellen; < CHF 100: 3 Dezimalstellen.
 */
function formatBetrag(value) {
  if (value == null) return "0.00";
  const abs = Math.abs(value);
  const dezimalstellen = abs < 100 ? 3 : 2;
  return Number(value).toFixed(dezimalstellen);
}

/**
 * Generiert XML für eine einzelne <security> (ein Asset).
 */
function generiereSecurityXml(asset, taxYear) {
  const {
    symbol,
    valorennummer,
    endbestand,
    kursStichtag,
    steuerwert,
    positionId = 1,
    fifo = {},
    transaktionen = [],
  } = asset;

  const steuerwertStr = formatBetrag(steuerwert);
  const stichtagDatum = `${taxYear}-12-31`;

  // Anfangsbestand (nur wenn > 0)
  const anfangsbestandAmount = fifo.anfangsbestandAmount ?? 0;
  const anfangsbestandXml =
    anfangsbestandAmount > 0
      ? `
        <stock>
          <referenceDate>${taxYear}-01-01</referenceDate>
          <mutation>false</mutation>
          <name>Anfangsbestand</name>
          <quotationType>piece</quotationType>
          <quantity>${anfangsbestandAmount.toFixed(8)}</quantity>
          <balanceCurrency>CHF</balanceCurrency>
        </stock>`
      : "";

  // Transaktionen im Jahr als stock-Einträge
  const txXml = (transaktionen || [])
    .map(
      (tx) => `
        <stock>
          <referenceDate>${String(tx.date || tx.datum || "").substring(0, 10)}</referenceDate>
          <mutation>true</mutation>
          <name>${escapeXml(
            (tx.type || tx.typ) === "in" || (tx.type || tx.typ) === "eingang"
              ? "BUY / EINGANG"
              : "SELL / AUSGANG"
          )}</name>
          <quotationType>piece</quotationType>
          <quantity>${
            (tx.type || tx.typ) === "in" || (tx.type || tx.typ) === "eingang"
              ? "+"
              : "-"
          }${(tx.amount ?? tx.betrag ?? 0).toFixed(8)}</quantity>
          <balanceCurrency>CHF</balanceCurrency>
          <unitPrice>${(tx.chfKurs ?? (tx.chfZeitpunkt != null && (tx.amount ?? tx.betrag) > 0 ? tx.chfZeitpunkt / (tx.amount ?? tx.betrag) : 0)).toFixed(2)}</unitPrice>
          <value>${formatBetrag(tx.chfWert ?? tx.chfZeitpunkt ?? 0)}</value>
        </stock>`
    )
    .join("");

  const valorAttr = valorennummer ? ` valorNumber="${escapeXml(valorennummer)}"` : "";

  return `
      <security
        positionId="${positionId}"${valorAttr}
        country="CH"
        currency="CHF"
        quotationType="piece"
        securityName="${escapeXml(symbol)}"
        securityType="crypto">

        <taxValue>
          <referenceDate>${stichtagDatum}</referenceDate>
          <quotationType>piece</quotationType>
          <quantity>${(endbestand ?? 0).toFixed(8)}</quantity>
          <balanceCurrency>CHF</balanceCurrency>
          <unitPrice>${(kursStichtag ?? 0).toFixed(2)}</unitPrice>
          <value>${steuerwertStr}</value>
        </taxValue>
${anfangsbestandXml}${txXml}
      </security>`;
}

/**
 * Generiert ein eCH-0196 v2.2.0 konformes XML für einen Steuerauszug.
 *
 * Unterstützt zwei Formate:
 *
 * Format A – Multi-Asset (ETH/SOL/BTC mit assets[]):
 * @param {object} steuerDaten
 * @param {string[]} steuerDaten.wallets
 * @param {number}   steuerDaten.taxYear
 * @param {string}   steuerDaten.canton
 * @param {number}   steuerDaten.totalSteuerwert - Summe aller Asset-Steuerwerte
 * @param {string}   [steuerDaten.stichtagDatum] - Überschreibt 31.12.
 * @param {Array}    steuerDaten.assets - [{symbol, valorennummer, endbestand, kursStichtag, steuerwert, positionId, fifo, transaktionen}]
 *
 * @param {object}   [kundeDaten]
 * @param {string}   [kundeDaten.name]
 * @param {string}   [kundeDaten.strasse]
 * @param {string}   [kundeDaten.plz]
 * @param {string}   [kundeDaten.ort]
 *
 * @returns {string} XML-String
 */
export function generateESteuerauszugXML(steuerDaten, kundeDaten) {
  const {
    wallets,
    taxYear,
    canton,
    totalSteuerwert,
    stichtagDatum,
    assets,
  } = steuerDaten;

  const uuid = generateUUID();
  const creationDate = new Date().toISOString().substring(0, 19);
  const kt = canton || "ZH";
  const wallet = Array.isArray(wallets) ? wallets[0] : wallets || "";
  const depotNr = wallet.substring(0, 50);
  const periodTo = stichtagDatum || `${taxYear}-12-31`;

  // Nur Assets mit Steuerwert > 0 (oder Endbestand > 0) anzeigen
  const aktivAssets = (assets || []).filter(
    (a) => (a.steuerwert ?? 0) > 0 || (a.endbestand ?? 0) > 0
  );

  const totalStr = formatBetrag(totalSteuerwert ?? 0);

  const securitiesXml = aktivAssets
    .map((asset, i) => generiereSecurityXml({ ...asset, positionId: i + 1 }, taxYear))
    .join("\n");

  const clientXml = kundeDaten
    ? `
  <client clientNumber="${escapeXml(depotNr)}">
    ${kundeDaten.name ? `<n>${escapeXml(kundeDaten.name)}</n>` : ""}
    ${kundeDaten.strasse ? `<street>${escapeXml(kundeDaten.strasse)}</street>` : ""}
    ${kundeDaten.plz ? `<swissZipCode>${escapeXml(kundeDaten.plz)}</swissZipCode>` : ""}
    ${kundeDaten.ort ? `<town>${escapeXml(kundeDaten.ort)}</town>` : ""}
  </client>`
    : `<client clientNumber="${escapeXml(depotNr)}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<taxStatementType
  xmlns="urn:ech:xmlns:eCH-0196:2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:ech:xmlns:eCH-0196:2 https://share.ech.ch/xmlns/eCH-0196/2/eCH-0196-2-2.xsd"
  id="${uuid}"
  creationDate="${creationDate}"
  taxPeriod="${taxYear}"
  periodFrom="${taxYear}-01-01"
  periodTo="${periodTo}"
  country="CH"
  canton="${escapeXml(kt)}"
  totalTaxValue="${totalStr}"
  totalGrossRevenueA="0.00"
  totalGrossRevenueB="0.00"
  totalWithHoldingTaxClaim="0.00"
  totalLumpSumTaxCredit="0.00"
  totalNonRecoverableTax="0.00"
  totalAdditionalWithHoldingTaxUSA="0.00"
  totalGrossRevenueIUP="0.00"
  totalGrossRevenueConversion="0.00"
  minorVersion="22">

  <institution>
    <name>btcSteuerauszug.ch</name>
  </institution>
${clientXml}

  <listOfSecurities
    totalTaxValue="${totalStr}"
    totalGrossRevenueA="0.00"
    totalGrossRevenueB="0.00"
    totalWithHoldingTaxClaim="0.00"
    totalLumpSumTaxCredit="0.00"
    totalNonRecoverableTax="0.00"
    totalAdditionalWithHoldingTaxUSA="0.00"
    totalGrossRevenueIUP="0.00"
    totalGrossRevenueConversion="0.00">

    <depot depotNumber="${escapeXml(depotNr)}">
${securitiesXml}
    </depot>
  </listOfSecurities>

</taxStatementType>`;
}
