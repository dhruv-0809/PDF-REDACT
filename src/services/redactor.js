// =============================================================================
// PDF Redactor — Exports a securely redacted PDF with selectable text
// =============================================================================
// Uses a "Hybrid Image + Invisible Text" approach:
//
//   1. FLATTEN: Render each page as a high-res image using pdfjs-dist,
//      paint black boxes over redacted areas on the canvas, then embed
//      the result as a JPEG in a new pdf-lib document.
//
//   2. TEXT LAYER: Overlay invisible text (opacity: 0) at the original
//      word coordinates for all NON-redacted words. This allows users
//      to select, copy, and search the unredacted text.
//
// WHY THIS APPROACH:
//   - Modifying raw PDF content streams to remove text is extremely fragile
//     due to custom font encodings, hex streams, and subset fonts.
//   - Flattening to an image permanently destroys the redacted text pixels.
//   - The invisible text layer restores selectability for safe text.
//   - This is the same approach used by professional redaction tools.
//
// COORDINATE SYSTEM:
//   - pdfjs-dist canvas: top-left origin (standard HTML canvas)
//   - pdf-lib drawText: bottom-left origin (PDF standard)
//   - Word positions from pdfParser.js use bottom-left origin
//   - Canvas rendering requires conversion: canvasY = pageHeight - pdfY - height
// =============================================================================

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * Generate a securely redacted PDF.
 *
 * @param {ArrayBuffer} fileBuffer  - Original PDF file bytes
 * @param {Array} redactions        - Redaction objects with boundingBox and pageIndex
 * @param {Array} words             - Word objects from pdfParser.js
 * @returns {Promise<Uint8Array>}   - Bytes of the new redacted PDF
 */
export async function redactPdf(fileBuffer, redactions, words = []) {
  // Load the original PDF with pdfjs-dist (for rendering to canvas)
  const uint8Array = new Uint8Array(fileBuffer.slice(0));
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    isEvalSupported: false
  });

  const pdf = await loadingTask.promise;

  // Create a new empty PDF with pdf-lib (for building the output)
  const newPdf = await PDFDocument.create();
  const helveticaFont = await newPdf.embedFont(StandardFonts.Helvetica);

  // -------------------------------------------------------------------------
  // Process each page
  // -------------------------------------------------------------------------
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });          // 2x for crisp images
    const unscaledViewport = page.getViewport({ scale: 1.0 });  // Original dimensions

    // -----------------------------------------------------------------------
    // STEP 1: Render the original page to a canvas at 2x resolution
    // -----------------------------------------------------------------------
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    // -----------------------------------------------------------------------
    // STEP 2: Paint black rectangles over redacted areas on the canvas
    // -----------------------------------------------------------------------
    // This permanently destroys the pixel data under the redaction boxes.
    // The coordinate conversion is: canvasY = (pageHeight - pdfY - height) * scale
    // -----------------------------------------------------------------------
    const pageRedactions = redactions.filter(r => r.pageIndex === i - 1);

    for (const redaction of pageRedactions) {
      const { x, y, width, height } = redaction.boundingBox;

      // Convert from PDF bottom-left to canvas top-left coordinates
      const unscaledHeight = unscaledViewport.height;
      const canvasY = (unscaledHeight - y - height) * viewport.scale;

      context.fillStyle = 'black';
      context.fillRect(
        x * viewport.scale,
        canvasY,
        width * viewport.scale,
        height * viewport.scale
      );
    }

    // -----------------------------------------------------------------------
    // STEP 3: Embed the canvas as a JPEG in the new PDF
    // -----------------------------------------------------------------------
    const imgDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const imgDataBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
    const jpgImage = await newPdf.embedJpg(imgDataBytes);

    // Create page at original dimensions and draw the 2x image scaled down
    const newPage = newPdf.addPage([unscaledViewport.width, unscaledViewport.height]);
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: unscaledViewport.width,
      height: unscaledViewport.height,
    });

    // -----------------------------------------------------------------------
    // STEP 4: Add invisible text layer for non-redacted words
    // -----------------------------------------------------------------------
    // For each word on this page, check if it overlaps any redaction box.
    // If it does NOT overlap, draw it invisibly (opacity: 0) at the original
    // coordinates so the text is selectable and searchable.
    // -----------------------------------------------------------------------
    const pageWords = words.filter(w => w.pageIndex === i - 1);

    for (const word of pageWords) {
      // Check if this word overlaps ANY redaction box (AABB collision)
      const isRedacted = pageRedactions.some(r => (
        word.x < r.boundingBox.x + r.boundingBox.width &&
        word.x + word.width > r.boundingBox.x &&
        word.y < r.boundingBox.y + r.boundingBox.height &&
        word.y + word.height > r.boundingBox.y
      ));

      if (!isRedacted) {
        // Calculate font size so text width matches the original word width
        const textWidthAtSize1 = helveticaFont.widthOfTextAtSize(word.text, 1);
        const exactSize = textWidthAtSize1 > 0
          ? (word.width / textWidthAtSize1)
          : word.height;

        // Draw the text invisibly at the exact original position
        newPage.drawText(word.text, {
          x: word.x,
          y: word.y,
          size: exactSize,
          font: helveticaFont,
          color: rgb(0, 0, 0),
          opacity: 0   // Invisible — only for selection/copy/search
        });
      }
    }
  }

  // Save and return the final PDF bytes
  return await newPdf.save();
}

/**
 * Download a PDF byte array as a file in the browser.
 *
 * @param {Uint8Array} pdfBytes - The PDF file bytes
 * @param {string} filename     - The download filename
 */
export function downloadPdf(pdfBytes, filename = 'redacted.pdf') {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
