import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large words arrays

const PORT = process.env.PORT || 5001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/api/scan-ai', async (req, res) => {
  const { words } = req.body;
  if (!words || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ error: 'No words provided' });
  }

  // 1. Reconstruct fullText and charToWordMap (same as regex.js)
  let fullText = '';
  const charToWordMap = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    fullText += word.text + ' ';
    for (let j = 0; j <= word.text.length; j++) {
      charToWordMap.push(i);
    }
  }

  if (!GEMINI_API_KEY) {
    console.warn('[Server] GEMINI_API_KEY not set. Falling back to empty results.');
    return res.status(200).json({ 
      results: [],
      warning: 'GEMINI_API_KEY environment variable is not set on the backend. Please add it to a .env file to enable state-of-the-art AI scanning.' 
    });
  }

  try {
    const prompt = `You are a PII (Personally Identifiable Information) detector.
Identify all instances of PII in the text below.
Types of PII to find:
- Person (names of people)
- Organization (companies, institutions, banks, etc.)
- Location (addresses, cities, states, countries)
- Aadhaar (Indian Aadhaar numbers or masked Aadhaar numbers)
- GSTIN (Indian GST numbers)
- PAN (Indian PAN card numbers)
- Phone (phone numbers)
- Email (email addresses)
- Currency (monetary values like INR 10,000, Rs. 500, $100)
- Date (dates, dates with time)

CRITICAL: Only extract the actual sensitive PII values (e.g. the name itself, the actual number, the actual email, the monetary value). NEVER extract field labels, headers, or metadata (for example, do NOT extract the words "Aadhaar", "PAN", "Phone", "Email", "Name", "Address", "Invoice No" themselves).

Respond ONLY with a JSON array of objects, where each object has 'text' and 'type' keys.
Do not include markdown code block formatting or any other text.
Example response:
[{"text": "Dhruv Sharma", "type": "Person"}, {"text": "07AAAGU0182Q1ZS", "type": "GSTIN"}]

Text to scan:
${fullText}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!geminiText) {
      return res.json({ results: [] });
    }

    const extracted = JSON.parse(geminiText.trim());
    const results = [];

    // Locate each extracted PII entity in the word map
    for (const item of extracted) {
      const searchText = item.text.trim();
      if (!searchText) continue;

      let index = 0;
      while ((index = fullText.toLowerCase().indexOf(searchText.toLowerCase(), index)) !== -1) {
        const startCharIndex = index;
        const endCharIndex = index + searchText.length - 1;

        const startWordIndex = charToWordMap[startCharIndex];
        const endWordIndex = charToWordMap[endCharIndex];

        if (startWordIndex !== undefined && endWordIndex !== undefined) {
          const matchedWords = words.slice(startWordIndex, endWordIndex + 1);
          if (matchedWords.length > 0) {
            // Compute bounding box
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

            const pageIdx = matchedWords[0].pageIndex;
            results.push({
              id: `AI-${item.type}-${pageIdx}-${startWordIndex}-${endWordIndex}`,
              type: item.type,
              text: searchText,
              pageIndex: pageIdx,
              boundingBox: {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY
              },
              startWordIndex,
              endWordIndex
            });
          }
        }
        
        index += searchText.length; // move past this match to find others
      }
    }

    res.json({ results });

  } catch (error) {
    console.error('[Server] Scan error:', error);
    res.status(500).json({ error: error.message || 'Error communicating with AI backend' });
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Backend running on port ${PORT}`);
});
