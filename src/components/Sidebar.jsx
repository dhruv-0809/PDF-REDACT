import { useState } from 'react';

export default function Sidebar({ onScanRegex, onScanAI, onExport, onPreview, isScanning, onFindAndRedact, onReset, isOpen, width }) {
  const [findText, setFindText] = useState('');

  const handleFindSubmit = (e) => {
    e.preventDefault();
    if (!findText.trim()) return;
    onFindAndRedact(findText);
    setFindText('');
  };

  return (
    <aside className={`sidebar liquid-glass ${!isOpen ? 'closed' : ''}`} style={isOpen ? { width: `${width}px` } : {}}>
      <div className="sidebar-scrollable-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.4rem 1rem 0.4rem 0.4rem', borderRadius: '12px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <img src="/logo2.svg" alt="Redact PDF Logo" style={{ height: '36px', width: 'auto', objectFit: 'contain', borderRadius: '8px' }} />
              <span style={{ color: 'white', fontWeight: '600', fontSize: '1.1rem', letterSpacing: '0.5px' }}>Redact PDF</span>
        </div>
        <div className="sidebar-section">
        <h3 className="section-title">Automated Scanners</h3>
        <div className="action-group">
          <button className="btn btn-primary" onClick={onScanRegex} disabled={isScanning}>
            Scan with Regex
          </button>
          <span className="byline">Scans locally using regular expression patterns for emails, phone numbers, and IDs.</span>
        </div>

        <div className="action-group">
          <button className="btn btn-ai" onClick={onScanAI} disabled={isScanning}>
            Scan with AI
          </button>
          <span className="byline">Uses Gemini Cloud to analyze document semantics for names, organizations, and sensitive text.</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="section-title">Redact by Find</h3>
        <form onSubmit={handleFindSubmit} className="find-form">
          <input
            type="text"
            className="input-find"
            placeholder="Type word or phrase..."
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
          />
          <button type="submit" className="btn btn-find" disabled={isScanning || !findText.trim()}>
            Redact All Occurrences
          </button>
        </form>
        <span className="byline">Finds and redacts every match of this text throughout the document.</span>
      </div>
      </div>

      <div className="sidebar-section sidebar-footer">
        <h3 className="section-title">Output Options</h3>
        <div className="output-actions-grid">
          <button className="btn" style={{ color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' }} onClick={onReset} disabled={isScanning}>
            Reset All Redactions
          </button>
          <button className="btn" onClick={onPreview} disabled={isScanning}>
            Preview Redacted
          </button>
          <button className="btn btn-export" onClick={onExport} disabled={isScanning}>
            Export Redacted PDF
          </button>
        </div>
      </div>
    </aside>
  );
}
