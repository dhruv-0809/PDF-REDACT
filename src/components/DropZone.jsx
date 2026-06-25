import { useState } from 'react';

export default function DropZone({ onFileSelect }) {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Please drop a valid PDF file.');
      }
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type === 'application/pdf') {
        onFileSelect(file);
      } else {
        alert('Please drop a valid PDF file.');
      }
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <img src="/logo2.svg" alt="Redact PDF Logo" style={{ height: '60px', width: 'auto', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '3.5rem', margin: 0, fontWeight: '800', background: 'linear-gradient(135deg, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-1px' }}>
            Redact PDF
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>Secure & intelligent document redaction using Local Regex and Cloud AI.</p>
      </div>
      
      <label 
        className={`dropzone liquid-glass ${isDragActive ? 'active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="dropzone-icon">📄</div>
        <h2>Drop your PDF here</h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>or click to browse</p>
        <input 
          type="file" 
          accept="application/pdf" 
          style={{ display: 'none' }} 
          onChange={handleChange}
        />
      </label>
    </div>
  );
}
