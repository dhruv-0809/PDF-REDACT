import { pipeline, env } from '@huggingface/transformers';

// Skip local model checks since we are running in a browser
env.allowLocalModels = false;

// We use a singleton pattern for the pipeline to ensure it's only loaded once
class PipelineSingleton {
  static task = 'token-classification';
  // A lightweight NER model fine-tuned on DistilBERT
  static model = 'Xenova/distilbert-base-uncased-finetuned-ner';
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, { progress_callback });
    }
    return this.instance;
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  // Extract words array from the message
  const { words } = event.data;
  
  if (!words || words.length === 0) {
    self.postMessage({ status: 'complete', results: [] });
    return;
  }

  // 1. Reconstruct full text and map character indices back to word indices
  let fullText = '';
  const charToWordMap = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    fullText += word.text + ' ';
    // Map each character of the word (plus the space) back to this word's index
    for (let j = 0; j <= word.text.length; j++) {
      charToWordMap.push(i);
    }
  }

  try {
    // 2. Load the model (this will trigger progress events on first load)
    const classifier = await PipelineSingleton.getInstance((x) => {
      // Send progress updates back to the UI (e.g. downloading model chunks)
      self.postMessage({ status: 'progress', data: x });
    });

    // Notify UI that inference is starting
    self.postMessage({ status: 'inferencing' });

    // 3. Run the NER model over the text
    // aggregation_strategy="simple" groups sub-tokens (like "Dh" and "##ruv") into full words ("Dhruv")
    const entities = await classifier(fullText, { aggregation_strategy: 'simple' });

    // 4. Map the identified entities back to the PDF bounding boxes
    const results = [];
    
    // Map entity groups to our readable types
    const entityTypeMap = {
      'PER': 'Person',
      'ORG': 'Organization',
      'LOC': 'Location',
      'MISC': 'Miscellaneous'
    };

    for (const entity of entities) {
      // entity contains: { entity_group: 'PER', score: 0.99, word: 'dhruv', start: 0, end: 5 }
      const type = entityTypeMap[entity.entity_group] || entity.entity_group;
      
      // We skip low-confidence guesses just to be safe
      if (entity.score < 0.6) continue;

      const startCharIndex = entity.start;
      const endCharIndex = entity.end - 1; // inclusive

      const startWordIndex = charToWordMap[startCharIndex];
      const endWordIndex = charToWordMap[endCharIndex];

      if (startWordIndex !== undefined && endWordIndex !== undefined) {
        const matchedWords = words.slice(startWordIndex, endWordIndex + 1);
        if (matchedWords.length > 0) {
          // Compute a bounding box that encapsulates all words in the entity
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
            id: `AI-${type}-${pageIdx}-${startWordIndex}-${endWordIndex}-${Date.now()}`,
            type: type,
            text: entity.word,
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
    }

    // 5. Send final results back to the main thread
    self.postMessage({ status: 'complete', results });

  } catch (err) {
    console.error("AI Worker Error:", err);
    self.postMessage({ status: 'error', error: err.message });
  }
});
