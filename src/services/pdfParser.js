// =============================================================================
// PDF Text Parser — Extracts word positions from a PDF using pdfjs-dist
// =============================================================================
// Reads a PDF file buffer and extracts every text item with its physical
// coordinates (x, y, width, height) and page index. These word objects are
// used by both the Regex scanner and AI NER scanner to locate PII, and by
// the Redactor to build the invisible text layer in exported PDFs.
//
// COORDINATE SYSTEM:
//   pdfjs-dist uses a bottom-left origin (PDF standard):
//     - x: horizontal distance from left edge
//     - y: vertical distance from BOTTOM edge
//     - transform[4] = x, transform[5] = y
//   The PdfViewer component converts these to top-left origin for display.
// =============================================================================

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Point pdfjs-dist to its own worker script for background parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Parse a PDF buffer and extract all text items with their positions.
 *
 * @param {ArrayBuffer} fileBuffer - Raw PDF file bytes
 * @returns {Promise<{words: Array, pageDimensions: Array, numPages: number}>}
 *   - words: array of { text, x, y, width, height, pageIndex }
 *   - pageDimensions: array of { pageIndex, width, height }
 *   - numPages: total page count
 */
export const parsePdf = async (fileBuffer) => {
  const uint8Array = new Uint8Array(fileBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    isEvalSupported: false,  // Disable eval() for CSP compliance
    useWorkerFetch: false,   // Avoid fetch() in the worker context
    disableStream: true,     // Load entire PDF before parsing
    disableFontFace: true,   // Don't load custom fonts (faster parsing)
    verbosity: 0             // Suppress pdfjs console noise
  });

  const pdf = await loadingTask.promise;

  const allWords = [];
  const pageDimensions = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Record page dimensions at 1x scale (used for coordinate mapping)
    const viewport = page.getViewport({ scale: 1.0 });
    pageDimensions.push({
      pageIndex: i - 1,
      width: viewport.width,
      height: viewport.height
    });

    // Extract each text item (may be a word, phrase, or line fragment)
    // We split multi-word text runs into individual space-separated words
    // and estimate their bounding boxes so that redactions can be applied
    // precisely to the specific PII values rather than the entire text run.
    for (const item of textContent.items) {
      const text = item.str;
      if (text.trim().length === 0) continue;

      const length = text.length;
      const charWidth = length > 0 ? (item.width / length) : 0;

      // Match words (non-whitespace character runs)
      const wordRegex = /\S+/g;
      let match;

      while ((match = wordRegex.exec(text)) !== null) {
        const wordText = match[0];
        const startIdx = match.index;
        const wordLength = wordText.length;

        // Estimate physical coordinates for this word
        const wordX = item.transform[4] + startIdx * charWidth;
        const wordWidth = wordLength * charWidth;

        allWords.push({
          text: wordText,                          // The specific word text
          x: wordX,                                // Estimated X position (from left)
          y: item.transform[5],                    // Y position (from bottom)
          width: wordWidth,                        // Estimated word width
          height: item.height || item.transform[3],// Text height (fallback to scale)
          pageIndex: i - 1,                        // Zero-based page index
          originalIndex: allWords.length           // Track original global index
        });
      }
    }
  }

  return {
    words: allWords,
    pageDimensions,
    numPages: pdf.numPages
  };
};
