// ─────────────────────────────────────────────────────────────────────────────
// lib/code128c.js
// Pure-JS CODE128C Encoder
//
// Kein bwip-js – direkte Bit-Repräsentation für pdf-lib Rectangle-Drawing.
// Encoding: Digits-Paare 00–99, Start-C (Index 105), Prüfziffer mod 103, Stop.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CODE128 bar/space Muster (Index 0–105 + Stop).
 * Jeder Eintrag ist ein 11-Bit-String: '1' = Strich, '0' = Lücke.
 */
const CODE128_PATTERNS = [
  "11011001100", // 0
  "11001101100", // 1
  "11001100110", // 2
  "10010011000", // 3
  "10010001100", // 4
  "10001001100", // 5
  "10011001000", // 6
  "10011000100", // 7
  "10001100100", // 8
  "11001001000", // 9
  "11001000100", // 10
  "11000100100", // 11
  "10110011100", // 12
  "10011011100", // 13
  "10011001110", // 14
  "10111001100", // 15
  "10011101100", // 16
  "10011100110", // 17
  "11001110010", // 18
  "11001011100", // 19
  "11001001110", // 20
  "11011100100", // 21
  "11001110100", // 22
  "11101101110", // 23
  "11101001100", // 24
  "11100101100", // 25
  "11100100110", // 26
  "11101100100", // 27
  "11100110100", // 28
  "11100110010", // 29
  "11011011000", // 30
  "11011000110", // 31
  "11000110110", // 32
  "10100011000", // 33
  "10001011000", // 34
  "10001000110", // 35
  "10110001000", // 36
  "10001101000", // 37
  "10001100010", // 38
  "11010001000", // 39
  "11000101000", // 40
  "11000100010", // 41
  "10110111000", // 42
  "10110001110", // 43
  "10001101110", // 44
  "10111011000", // 45
  "10111000110", // 46
  "10001110110", // 47
  "11101110110", // 48
  "11010001110", // 49
  "11000101110", // 50
  "11011101000", // 51
  "11011100010", // 52
  "11011101110", // 53
  "11101011000", // 54
  "11101000110", // 55
  "11100010110", // 56
  "11101101000", // 57
  "11101100010", // 58
  "11100011010", // 59
  "11101111010", // 60
  "11001000010", // 61
  "11110001010", // 62
  "10100110000", // 63
  "10100001100", // 64
  "10010110000", // 65
  "10010000110", // 66
  "10000101100", // 67
  "10000100110", // 68
  "10110010000", // 69
  "10110000100", // 70
  "10011010000", // 71
  "10011000010", // 72
  "10000110100", // 73
  "10000110010", // 74
  "11000010010", // 75
  "11001010000", // 76
  "11110111010", // 77
  "11000010100", // 78
  "10001111010", // 79
  "10100111100", // 80
  "10010111100", // 81
  "10010011110", // 82
  "10111100100", // 83
  "10011110100", // 84
  "10011110010", // 85
  "11110100100", // 86
  "11110010100", // 87
  "11110010010", // 88
  "11011011110", // 89
  "11011110110", // 90
  "11110110110", // 91
  "10101111000", // 92
  "10100011110", // 93
  "10001011110", // 94
  "10111101000", // 95
  "10111100010", // 96
  "11110101000", // 97
  "11110100010", // 98
  "10111011110", // 99
  "10111101110", // 100
  "11101011110", // 101
  "11110101110", // 102
  "11010000100", // 103 = Start A
  "11010010000", // 104 = Start B
  "11010011100", // 105 = Start C
];

const START_C       = 105;
const STOP_PATTERN  = "1100011101011";

/**
 * Kodiert einen Ziffern-String (gerade Länge!) als CODE128C Bit-String.
 *
 * @param {string} digits - Nur Ziffern, gerade Anzahl (z.B. "038419272025001003")
 * @returns {string} Bit-String mit Quiet-Zones (10 Nullen je Seite)
 * @throws {Error} Wenn Ziffernanzahl ungerade
 */
export function encodeCode128C(digits) {
  if (digits.length % 2 !== 0) {
    throw new Error(
      `CODE128C: Ziffernanzahl muss gerade sein. Erhalten: ${digits.length}`
    );
  }

  const dataValues = [];
  for (let i = 0; i < digits.length; i += 2) {
    dataValues.push(parseInt(digits.substring(i, i + 2), 10));
  }

  // Prüfziffer: (START_C + Σ value[i] × (i+1)) mod 103
  const checksum =
    (START_C + dataValues.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103;

  const QUIET = "0".repeat(10);
  let bits = QUIET;
  bits += CODE128_PATTERNS[START_C];
  for (const v of dataValues) bits += CODE128_PATTERNS[v];
  bits += CODE128_PATTERNS[checksum];
  bits += STOP_PATTERN;
  bits += QUIET;

  return bits;
}

/**
 * Erstellt den 18-stelligen Seitenbarcode-Daten-String.
 *
 * Format: [valorennummer 8-stellig][jahr 4-stellig][seite 3-stellig][total 3-stellig]
 * Beispiel: buildSeitenbarcodeData('3841927', 2025, 1, 3) → '038419272025001003'
 *
 * @param {string|number} valorennummer - ESTV Valorennummer (z.B. '3841927')
 * @param {number}        jahr          - Steuerjahr (z.B. 2025)
 * @param {number}        seite         - Aktuelle Seitennummer (1-basiert)
 * @param {number}        gesamtseiten  - Gesamtanzahl Seiten
 * @returns {string} 18-stelliger Ziffern-String
 */
export function buildSeitenbarcodeData(valorennummer, jahr, seite, gesamtseiten) {
  const vNr = String(valorennummer).padStart(8, "0");
  const jhr = String(jahr);
  const pg  = String(seite).padStart(3, "0");
  const tot = String(gesamtseiten).padStart(3, "0");
  return `${vNr}${jhr}${pg}${tot}`; // 18 Ziffern
}
