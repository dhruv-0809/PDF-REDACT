const PII_PATTERNS = {
  REFERENCE_ID: /\b(?=[a-zA-Z0-9\/\-_]*\d)(?=[a-zA-Z0-9\/\-_]*[a-zA-Z])[a-zA-Z0-9\/\-_]{4,25}\b/gi,
  NUMERIC_ID: /\b\d{6,}\b/gi,
  CURRENCY: /(?:Rs\.?|INR\.?|USD\.?|EUR\.?|GBP\.?|₹|\$|€|£)\s*\d+(?:[.,]\d+)*(?:\.\d{2})?\b(?:\/-)?|\b\d+(?:[.,]\d+)*(?:\.\d{2})?\b(?:\/-)?\s*(?:Rs\.?|INR\.?|USD\.?|EUR\.?|GBP\.?|₹|\$|€|£)\b/gi,
};

const testCases = [
  "S2245831593810",
  "INV-2026/001",
  "S1234",
  "45719958",
  "4571995",
  "123456",
  "Rs. 12,500/-",
  "INR. 0.00",
  "₹5,000/-"
];

console.log("Testing refined regex v3...");
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
