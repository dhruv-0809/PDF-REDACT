export default function PreviewModal({ url, onClose }) {
  if (!url) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content glass" style={{ width: '80%', height: '80%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Redacted Preview</h2>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
        <iframe src={url} style={{ flex: 1, border: 'none', borderRadius: '8px' }} title="Redacted PDF Preview" />
      </div>
    </div>
  );
}
