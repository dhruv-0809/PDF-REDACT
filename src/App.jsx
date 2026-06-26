// =============================================================================
// App.jsx — Main Application Component for the PDF Redactor
// =============================================================================
// Orchestrates the entire redaction workflow:
//   1. User drops/selects a PDF → text is extracted via pdfParser
//   2. User clicks "Scan with Regex" → regex.js finds PII patterns
//   3. User clicks "Scan with AI"   → ai.worker.js runs NER in a Web Worker
//   4. Redaction boxes appear on the PDF viewer (click to remove)
//   5. User clicks "Preview" or "Export" → redactor.js generates the output
// =============================================================================

import { useState, useEffect } from 'react';
import DropZone from './components/DropZone';
import PdfViewer from './components/PdfViewer';
import Sidebar from './components/Sidebar';
import { findRegexPii } from './services/regex';
import { redactPdf, downloadPdf } from './services/redactor';
import { parsePdf } from './services/pdfParser';
import PreviewModal from './components/PreviewModal';

// Deduplicate and merge new redactions into existing list
// to prevent multiple selection of the same content.
const mergeRedactions = (existingList, newResults) => {
  const merged = [...existingList];
  for (const r of newResults) {
    const isDuplicate = merged.some(existing => {
      // 1. Exact ID match (covers identical matches from subsequent scans)
      if (existing.id === r.id) return true;
      
      // Check if they are on the same page
      if (existing.pageIndex !== r.pageIndex) return false;
      
      // 2. Overlapping word indices (covers same word ranges matched by different scans/patterns)
      if (existing.startWordIndex !== undefined && existing.endWordIndex !== undefined &&
          r.startWordIndex !== undefined && r.endWordIndex !== undefined) {
        return r.startWordIndex <= existing.endWordIndex && r.endWordIndex >= existing.startWordIndex;
      }
      
      // 3. Overlapping bounding boxes (fallback)
      if (existing.boundingBox && r.boundingBox) {
        const a = r.boundingBox;
        const b = existing.boundingBox;
        return a.x < b.x + b.width && a.x + a.width > b.x &&
               a.y < b.y + b.height && a.y + a.height > b.y;
      }
      
      return false;
    });
    
    if (!isDuplicate) {
      merged.push(r);
    }
  }
  return merged;
};

export default function App() {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [file, setFile] = useState(null);           // The selected File object
  const [fileBuffer, setFileBuffer] = useState(null); // Raw ArrayBuffer of the PDF
  const [words, setWords] = useState([]);            // Extracted word objects from pdfParser
  const [redactions, setRedactions] = useState([]);  // Active redaction boxes (regex + AI)
  const [previewUrl, setPreviewUrl] = useState(null); // Blob URL for the preview modal
  const [showCloudWarning, setShowCloudWarning] = useState(false); // Controls the AI warning modal
  const [showResetWarning, setShowResetWarning] = useState(false); // Controls the reset warning modal
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 900); // Toggle for sidebar visibility
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 250) newWidth = 250;
      if (newWidth > window.innerWidth * 0.5) newWidth = window.innerWidth * 0.5;
      setSidebarWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const [isScanning, setIsScanning] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  // Handler: File Selection — extract text from the PDF
  // -------------------------------------------------------------------------
  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    setWords([]);
    setRedactions([]);

    const buffer = await selectedFile.arrayBuffer();
    setFileBuffer(buffer);

    setIsScanning(true);
    setLoadingStatus('Extracting text from PDF...');

    try {
      const bufferCopy = buffer.slice(0); // Clone to avoid detached buffer issues
      const res = await parsePdf(bufferCopy);
      setWords(res.words || []);
    } catch (err) {
      console.error('PDF parse failed:', err);
      const message = err?.message || String(err || '');

      // Show user-friendly error messages for common failure modes
      const friendlyMessage = /content security policy|csp|unsafe-eval|eval|javascript/i.test(message)
        ? 'This PDF could not be parsed because embedded JavaScript is blocked by the browser security policy. Please try a different PDF.'
        : /timed out/i.test(message)
          ? 'The PDF is taking too long to parse. Please try a smaller or text-based PDF.'
          : /invalid pdf|not a valid|cannot parse/i.test(message)
            ? 'This file could not be parsed as a PDF. Please try a different file.'
            : `Error parsing PDF text: ${message || 'Unknown error'}`;
      alert(friendlyMessage);
    } finally {
      setIsScanning(false);
      setLoadingStatus('');
    }
  };

  // -------------------------------------------------------------------------
  // Handler: Regex Scan — find PII using pattern matching
  // -------------------------------------------------------------------------
  const handleScanRegex = () => {
    if (words.length === 0) return;
    setIsScanning(true);
    setLoadingStatus('Scanning with Regex...');

    // Use setTimeout to let the loading overlay render before blocking
    setTimeout(() => {
      const results = findRegexPii(words);

      // Merge results with existing redactions using custom deduplication logic
      setRedactions((prev) => mergeRedactions(prev, results));

      setIsScanning(false);
      setLoadingStatus('');
    }, 100);
  };

  // -------------------------------------------------------------------------
  // Handler: AI Scan — run Gemini model on Express backend
  // -------------------------------------------------------------------------
  const handleScanAI = () => {
    if (words.length === 0) return;
    setShowCloudWarning(true);
  };

  const confirmScanAI = async () => {
    setShowCloudWarning(false);
    setIsScanning(true);
    setLoadingStatus('Scanning with Gemini AI...');

    try {
      const response = await fetch('http://localhost:5001/api/scan-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ words })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const res = await response.json();
      
      if (res.warning) {
        alert(res.warning);
      }

      if (res.results && res.results.length > 0) {
        // Merge AI results with existing redactions using custom deduplication logic
        setRedactions((prev) => mergeRedactions(prev, res.results));
      } else if (!res.warning) {
        alert('Gemini scan completed. No additional PII detected.');
      }
    } catch (err) {
      console.error(err);
      alert('Error running Gemini AI scan: ' + err.message);
    } finally {
      setIsScanning(false);
      setLoadingStatus('');
    }
  };

  // -------------------------------------------------------------------------
  // Handler: Remove a single redaction box (click to dismiss)
  // -------------------------------------------------------------------------
  const handleRemoveRedaction = (id) => {
    setRedactions((prev) => prev.filter(r => r.id !== id));
  };

  // -------------------------------------------------------------------------
  // Handler: Reset all redactions
  // -------------------------------------------------------------------------
  const handleResetRedactions = () => {
    setShowResetWarning(true);
  };

  const confirmResetRedactions = () => {
    setRedactions([]);
    setShowResetWarning(false);
  };

  // -------------------------------------------------------------------------
  // Handler: Add manual redactions (from text selection)
  // -------------------------------------------------------------------------
  const handleAddRedactions = (newReds) => {
    setRedactions((prev) => mergeRedactions(prev, newReds));
  };

  // -------------------------------------------------------------------------
  // Handler: Redact by Find
  // -------------------------------------------------------------------------
  const handleFindAndRedact = (searchText) => {
    if (!searchText || words.length === 0) return;
    
    setIsScanning(true);
    setLoadingStatus(`Finding "${searchText}"...`);

    setTimeout(() => {
      const lowerSearch = searchText.toLowerCase();
      const searchLen = searchText.length;
      const newRedactions = [];
      
      let fullText = '';
      const textToWordIndex = [];
      
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        for (let j = 0; j < w.text.length; j++) {
          textToWordIndex.push(i);
        }
        fullText += w.text;
        if (i < words.length - 1) {
          fullText += ' ';
          textToWordIndex.push(-1);
        }
      }

      const lowerFullText = fullText.toLowerCase();
      let matchIdx = lowerFullText.indexOf(lowerSearch);
      
      while (matchIdx !== -1) {
        let startWordIdx = -1;
        for (let k = matchIdx; k < matchIdx + searchLen; k++) {
          if (textToWordIndex[k] !== -1) {
            startWordIdx = textToWordIndex[k];
            break;
          }
        }
        
        let endWordIdx = -1;
        for (let k = matchIdx + searchLen - 1; k >= matchIdx; k--) {
          if (textToWordIndex[k] !== -1) {
            endWordIdx = textToWordIndex[k];
            break;
          }
        }
        
        if (startWordIdx !== -1 && endWordIdx !== -1) {
          for (let i = startWordIdx; i <= endWordIdx; i++) {
            const w = words[i];
            newRedactions.push({
              id: `Find-${Date.now()}-${w.pageIndex}-${i}`,
              type: 'Find',
              text: w.text,
              pageIndex: w.pageIndex,
              boundingBox: { x: w.x, y: w.y, width: w.width, height: w.height },
              startWordIndex: i,
              endWordIndex: i
            });
          }
        }
        
        matchIdx = lowerFullText.indexOf(lowerSearch, matchIdx + searchLen);
      }

      setRedactions((prev) => mergeRedactions(prev, newRedactions));
      setIsScanning(false);
      setLoadingStatus('');
    }, 100);
  };

  // -------------------------------------------------------------------------
  // Handler: Export — generate and download the redacted PDF
  // -------------------------------------------------------------------------
  const handleExport = async () => {
    if (!fileBuffer) return;
    setIsScanning(true);
    setLoadingStatus('Exporting redacted PDF...');

    try {
      const bufferCopy = fileBuffer.slice(0);
      const pdfBytes = await redactPdf(bufferCopy, redactions, words);
      downloadPdf(pdfBytes, `redacted_${file.name}`);
    } catch (err) {
      console.error(err);
      alert('Error exporting PDF: ' + err.message);
    } finally {
      setIsScanning(false);
      setLoadingStatus('');
    }
  };

  // -------------------------------------------------------------------------
  // Handler: Preview — generate redacted PDF and show in a modal
  // -------------------------------------------------------------------------
  const handlePreview = async () => {
    if (!fileBuffer) return;
    setIsScanning(true);
    setLoadingStatus('Generating preview...');

    try {
      const bufferCopy = fileBuffer.slice(0);
      const pdfBytes = await redactPdf(bufferCopy, redactions, words);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error(err);
      alert('Error generating preview: ' + err.message);
    } finally {
      setIsScanning(false);
      setLoadingStatus('');
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <>
      {!file ? (
        <DropZone onFileSelect={handleFileSelect} />
      ) : (
        <div className="workspace">
          {/* Logo & Menu Toggle Header */}
          <div style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', zIndex: 200, display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.4rem 1rem 0.4rem 0.4rem', borderRadius: '12px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Redact PDF Logo" style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '8px' }} />
              <span style={{ color: 'white', fontWeight: '600', fontSize: '1.1rem', letterSpacing: '0.5px' }}>Redact PDF</span>
            </div>
            <button 
              className="sidebar-toggle" 
              style={{ position: 'relative', top: 'auto', left: 'auto' }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? '✕ Hide Menu' : '☰ Show Menu'}
            </button>
          </div>
          
          <div style={{ display: 'flex', position: 'relative', flexShrink: 0 }}>
            <Sidebar
              isOpen={isSidebarOpen}
              width={sidebarWidth}
              onScanRegex={handleScanRegex}
              onScanAI={handleScanAI}
              onExport={handleExport}
              onPreview={handlePreview}
              isScanning={isScanning}
              onFindAndRedact={handleFindAndRedact}
              onReset={handleResetRedactions}
            />
            {isSidebarOpen && (
              <div 
                className="sidebar-resizer" 
                onMouseDown={() => setIsResizing(true)} 
              />
            )}
          </div>
          <PdfViewer
            fileBuffer={fileBuffer}
            redactions={redactions}
            onRemoveRedaction={handleRemoveRedaction}
            words={words}
            onAddRedactions={handleAddRedactions}
          />
        </div>
      )}

      {/* Loading overlay — shown during any async operation */}
      {isScanning && (
        <div className="loading-overlay">
          <div className="loader"></div>
          <div className="progress-text">{loadingStatus}</div>
        </div>
      )}

      {/* Cloud Warning Modal */}
      {showCloudWarning && (
        <div className="modal-backdrop">
          <div className="warning-modal-content">
            <div className="warning-icon">⚠️</div>
            <h3 className="warning-title">Cloud Analysis Warning</h3>
            <p className="warning-text">
              This action will securely transmit the extracted text from your document to the Gemini Cloud API for semantic analysis.
              <br /><br />
              Do you wish to proceed?
            </p>
            <div className="warning-actions">
              <button className="btn btn-highlight" onClick={() => setShowCloudWarning(false)}>
                Go Back (Cancel)
              </button>
              <button className="btn btn-danger" onClick={confirmScanAI}>
                Proceed to Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Warning Modal */}
      {showResetWarning && (
        <div className="modal-backdrop">
          <div className="warning-modal-content">
            <div className="warning-icon" style={{ color: '#f59e0b' }}>⚠️</div>
            <h3 className="warning-title">Reset All Redactions</h3>
            <p className="warning-text">
              Are you sure you want to clear all redactions? This action cannot be undone.
            </p>
            <div className="warning-actions">
              <button className="btn btn-highlight" onClick={() => setShowResetWarning(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmResetRedactions} style={{ background: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#fcd34d' }}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal — shows the redacted PDF in an iframe */}
      <PreviewModal url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </>
  );
}
