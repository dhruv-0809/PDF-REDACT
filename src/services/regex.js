// =============================================================================
// Regex PII Scanner — Finds PII patterns using Regular Expressions
// =============================================================================
// Supports both Indian and international document formats:
//   - Aadhaar numbers (12 digits, masked formats)
//   - GSTIN (Goods & Services Tax ID)
//   - PAN (Permanent Account Number)
//   - Indian phone numbers (+91)
//   - SRN / Reference IDs (letter + digits)
//   - Dates (DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD)
//   - Long numeric IDs (invoice numbers, account numbers)
//   - Email addresses
//   - US SSN, credit cards, US phone numbers
// =============================================================================

export const PII_PATTERNS = {

  // ===========================================================================
  // Indian Document Patterns
  // ===========================================================================

  // Aadhaar Number: 12 digits, optionally grouped as XXXX XXXX XXXX or XXXX-XXXX-XXXX
  // Starts with [1-9] to handle mock/test Aadhaar numbers in addition to real ones (which start with 2-9)
  AADHAAR: /\b[1-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/gi,

  // Masked Aadhaar: like XXXXXXXX8913, XXXX XXXX 8913, xxxx-xxxx-8913 (supports 4, 8, or 12 Xs)
  AADHAAR_MASKED: /[xX]{4}[\s-]?[xX]{4}[\s-]?\d{4}|[xX]{8,12}[\s-]?\d{4}/gi,

  // GSTIN: 15-char format → 2 digits + 5 letters + 4 digits + 1 letter + 1 alphanum + Z + 1 alphanum
  // Example: 07AAAGU0182Q1ZS
  GSTIN: /\b\d{2}[a-zA-Z]{5}\d{4}[a-zA-Z][a-zA-Z0-9]Z[a-zA-Z0-9]\b/gi,

  // PAN Card: 5 letters + 4 digits + 1 letter (e.g., ABCDE1234F)
  PAN: /\b[a-zA-Z]{5}\d{4}[a-zA-Z]\b/gi,

  // Service Request Number / Reference ID: Alphanumeric reference (must contain both letters and digits, length 3-30)
  // Optionally allows hyphens, underscores, dots, hashes, colons, pluses, or slashes. e.g. S1234, S2245831593810, INV-2026/001, Ref#A9876
  REFERENCE_ID: /\b(?=[a-zA-Z0-9\/\-_#\.:+]*\d)(?=[a-zA-Z0-9\/\-_#\.:+]*[a-zA-Z])[a-zA-Z0-9][a-zA-Z0-9\/\-_#\.:+]{1,28}[a-zA-Z0-9]\b/gi,

  // ===========================================================================
  // Date Patterns (Indian & International)
  // ===========================================================================

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD (with -, / or . separators)
  DATE: /\b\d{2}[-\/. ]\d{2}[-\/. ]\d{4}\b|\b\d{4}[-\/. ]\d{2}[-\/. ]\d{2}\b/gi,

  // Date with time: DD-MM-YYYY HH:MM:SS (supports -, / or . separators)
  DATE_TIME: /\b\d{2}[-\/. ]\d{2}[-\/. ]\d{4}\s+\d{2}:\d{2}:\d{2}\b/gi,

  // ===========================================================================
  // Universal Patterns
  // ===========================================================================

  // Email addresses
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,

  // Currency amounts: e.g. INR 12,500.00, Rs. 500/-, $100.50, ₹5,000, 100 USD (supports Indian comma groupings, trailing hyphen-slash, and broader currency codes)
  CURRENCY: /(?:Rs\.?|INR\.?|USD\.?|EUR\.?|GBP\.?|CAD\.?|AUD\.?|SGD\.?|AED\.?|SAR\.?|₹|\$|€|£|¥|元)\s*\d+(?:[.,]\d+)*(?:\.\d{2})?\b(?:\/-)?|\b\d+(?:[.,]\d+)*(?:\.\d{2})?\b(?:\/-)?\s*(?:Rs\.?|INR\.?|USD\.?|EUR\.?|GBP\.?|CAD\.?|AUD\.?|SGD\.?|AED\.?|SAR\.?|₹|\$|€|£|¥|元)\b/gi,

  // Global Phone number: matches country code, area codes, and standard international formats.
  // Requires at least 7 to 15 digits total, optionally preceded by a country code prefix and separated by spaces/dots/dashes.
  // E.g., +91 98765 43210, +1 (202) 555-0143, +44 20 7946 0958, 9876543210
  PHONE: /(?:^|\s)(?:\+\d{1,3}[\s.-]?)?\(?[1-9]\d{1,4}\)?[\s.-]?\d{3,5}[\s.-]?\d{4}\b|(?:^|\s)(?:\+91[\s.-]?)?[6-9]\d{9}\b|(?:^|\s)(?:\+91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}\b/gi,

  // Long numeric IDs: 6+ total digits, allowing common separators (spaces, dots, hyphens, slashes, commas) between them (invoice numbers, account numbers, etc.)
  NUMERIC_ID: /\b(?=(?:[.,\s\/-]*\d){6,})\d+(?:[.,\s\/-]+\d+)*\b/gi,

  // Credit Card numbers (Visa, MasterCard, Amex, Discover, JCB)
  CREDIT_CARD: /(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})/gi,

  // US Social Security Number
  SSN: /(?!000|666)[0-8][0-9]{2}-(?!00)[0-9]{2}-(?!0000)[0-9]{4}/gi,

  // US ZIP Code
  ZIP_CODE: /\b\d{5}(?:-\d{4})?\b/gi,
};

/**
 * Scan extracted PDF words for PII using regex patterns.
 *
 * @param {Array} words - Word objects from pdfParser.js
 * @returns {Array}     - Redaction objects with bounding boxes
 */
export function findRegexPii(words) {
  // -------------------------------------------------------------------------
  // STEP 1: Build full text + character→word index map
  // -------------------------------------------------------------------------
  let fullText = '';
  const charToWordMap = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    fullText += word.text + ' ';
    for (let j = 0; j <= word.text.length; j++) {
      charToWordMap.push(i);
    }
  }

  // DEBUG: Log the full extracted text so we can see what patterns should match
  console.log('[Regex Scanner] Words count:', words.length);
  console.log('[Regex Scanner] Full text (first 2000 chars):', fullText.substring(0, 2000));
  console.log('[Regex Scanner] Sample words:', words.slice(0, 20).map(w => w.text));

  // -------------------------------------------------------------------------
  // STEP 2: Run longer/more-specific patterns FIRST.
  // We process DATE_TIME before DATE, and AADHAAR before NUMERIC_ID, etc.
  // Track which word indices have already been matched to avoid duplicates.
  // -------------------------------------------------------------------------
  const matchedWordRanges = []; // [{start, end}] — already-matched word ranges
  const results = [];

  // Order matters — run more specific patterns first to prevent shorter
  // patterns from stealing substrings of longer matches.
  const orderedPatternKeys = [
    'GSTIN',           // 15 chars, very specific
    'AADHAAR_MASKED',  // Masked aadhaar
    'AADHAAR',         // 12-digit aadhaar
    'PAN',             // 10-char PAN
    'CREDIT_CARD',     // 13-19 digit credit cards
    'SSN',             // US SSN
    'REFERENCE_ID',    // Alphanumeric references (INV-2026/001, etc.)
    'DATE_TIME',       // Date with time (longer, before DATE)
    'DATE',            // Date only
    'EMAIL',           // Email addresses
    'CURRENCY',        // Currency amounts (INR 12,500, etc.)
    'PHONE',           // Global phone numbers
    'NUMERIC_ID',      // Generic long numbers (last — catches remaining)
    'ZIP_CODE',        // US ZIP (last — 5 digits is very common)
  ];

  for (const type of orderedPatternKeys) {
    const pattern = PII_PATTERNS[type];
    if (!pattern) continue;

    const globalRegex = new RegExp(pattern);
    let match;
    let matchCount = 0;

    while ((match = globalRegex.exec(fullText)) !== null) {
      matchCount++;
      let startCharIndex = match.index;
      let matchedText = match[0];

      // Trim leading whitespace (e.g. from space-prefix matched phone numbers)
      // to align character indices exactly to the word boundary mapping.
      if (matchedText.startsWith(' ') || matchedText.startsWith('\n')) {
        startCharIndex++;
        matchedText = matchedText.substring(1);
      }
      const endCharIndex = startCharIndex + matchedText.length - 1;

      console.log(`[Regex Scanner] ${type} matched: "${matchedText}" at char [${startCharIndex}, ${endCharIndex}]`);

      const startWordIndex = charToWordMap[startCharIndex];
      const endWordIndex = charToWordMap[endCharIndex];

      if (startWordIndex === undefined || endWordIndex === undefined) continue;

      // Skip if this word range already has a redaction (from a more specific pattern)
      const alreadyMatched = matchedWordRanges.some(range =>
        startWordIndex <= range.end && endWordIndex >= range.start
      );
      if (alreadyMatched) continue;

      // Record this range as matched
      matchedWordRanges.push({ start: startWordIndex, end: endWordIndex });

      // Build bounding box from matched words
      const matchedWords = words.slice(startWordIndex, endWordIndex + 1);
      if (matchedWords.length === 0) continue;

      const bbox = computeBoundingBox(matchedWords);
      const pageIdx = matchedWords[0].pageIndex;

      results.push({
        id: `${type}-${pageIdx}-${startWordIndex}-${endWordIndex}`,
        type,
        text: matchedText,
        pageIndex: pageIdx,
        boundingBox: bbox,
        startWordIndex,
        endWordIndex,
      });
    }
  }

  console.log(`[Regex Scanner] Total results: ${results.length}`);
  return results;
}

// =============================================================================
// Helper: Compute union bounding box across multiple words
// =============================================================================
function computeBoundingBox(matchedWords) {
  let minX = matchedWords[0].x;
  let minY = matchedWords[0].y;
  let maxX = matchedWords[0].x + matchedWords[0].width;
  let maxY = matchedWords[0].y + matchedWords[0].height;

  for (let k = 1; k < matchedWords.length; k++) {
    const w = matchedWords[k];
    minX = Math.min(minX, w.x);
    minY = Math.min(minY, w.y);
    maxX = Math.max(maxX, w.x + w.width);
    maxY = Math.max(maxY, w.y + w.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
