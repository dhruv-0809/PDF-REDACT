const PII_PATTERNS = {
  // Alphanumeric reference (length 4-25, contains both letters and digits)
  REFERENCE_ID: /\b(?=[a-zA-Z0-9\/\-_]*\d)(?=[a-zA-Z0-9\/\-_]*[a-zA-Z])[a-zA-Z0-9\/\-_]{4,25}\b/gi,
  
  // Long numeric sequences (6+ digits)
  NUMERIC_ID: /\b\d{6,}\b/gi,
  
  // Currency amounts (supports trailing /- and dot on codes)
  CURRENCY: /(?:Rs\.?|INR\.?|USD\.?|EUR\.?|GBP\.?|₹|\$|€|£)\s*\d+(?:[.,]\d+)*(?:\.\d{2})?(?:\/-)?\b|\b\d+(?:[.,]\d+)*(?:\.\d{2})?(?:\/-)?\s*(?:Rs\.?|INR\.?|USD\.?|EUR\.?|GBP\.?|₹|\$|€|£)\b/gi,
};

const testCases = [
  "S2245831593810",
  "INV-2026/001",
  "S1234", // Alphanumeric length 5 - SHOULD match now
  "45719958", // Numeric 8 digits - should match NUMERIC_ID
  "4571995", // Numeric 7 digits - SHOULD match NUMERIC_ID now
  "123456", // Numeric 6 digits - SHOULD match NUMERIC_ID now
  "12345", // Numeric 5 digits - should NOT match
  "Rs. 12,500/-", // SHOULD match with trailing /-
  "INR. 0.00", // SHOULD match with dot on code
  "₹5,000/-" // SHOULD match with symbol and trailing /-
];

console.log("Testing refined regex v2...");
for (const type in PII_PATTERNS) {
  const pattern = PII_PATTERNS[type];
  testCases.forEach(tc => {
    pattern.lastIndex = 0;
    const match = pattern.exec(tc);
    if (match) {
      console.log(`- [${type}] "${tc}" matched "${match[0]}"`);
    }
  });
}
