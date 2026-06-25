import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set in .env!");
  process.exit(1);
}

async function listModels() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Error: ${response.status} - ${errText}`);
      return;
    }
    const data = await response.json();
    console.log("Supported Models:");
    data.models.forEach(m => {
      console.log(`- Name: ${m.name}, DisplayName: ${m.displayName}, SupportedMethods: ${m.supportedGenerationMethods}`);
    });
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

listModels();
