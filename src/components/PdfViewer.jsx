import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function PdfViewer({ fileBuffer, redactions, onRemoveRedaction, words, onAddRedactions }) {
  const [pdf, setPdf] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState('fit');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  useEffect(() => {
    if (!fileBuffer) return;
    
    let isMounted = true;
    const bufferCopy = fileBuffer.slice(0);
    const uint8Array = new Uint8Array(bufferCopy);
    
    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ 
          data: uint8Array,
          isEvalSupported: false 
        });
        const loadedPdf = await loadingTask.promise;
        if (isMounted) {
          setPdf(loadedPdf);
          setCurrentPageIndex(0); // Reset to first page on load
        }
      } catch (err) {
        console.error('Error loading PDF', err);
      }
    };
    
    loadPdf();
    return () => { isMounted = false; };
  }, [fileBuffer]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pdf]);

  // Handle trackpad pinch-to-zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      // Trackpad pinch gestures emit wheel events with ctrlKey = true
      if (e.ctrlKey) {
        e.preventDefault(); // Prevent entire webpage from zooming
        
        const zoomDelta = -e.deltaY * 0.01; // Adjust sensitivity
        
        setZoomLevel(prev => {
          const currentZoom = prev === 'fit' ? 1.5 : prev;
          let newZoom = currentZoom + zoomDelta;
          if (newZoom < 0.5) newZoom = 0.5;
          if (newZoom > 5.0) newZoom = 5.0;
          return newZoom;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleZoomIn = () => setZoomLevel(prev => (prev === 'fit' ? 1.5 : prev) + 0.25);
  const handleZoomOut = () => setZoomLevel(prev => Math.max(0.5, (prev === 'fit' ? 1.5 : prev) - 0.25));
  const handleZoomFit = () => setZoomLevel('fit');

  const handlePrevPage = () => setCurrentPageIndex(p => Math.max(0, p - 1));
  const handleNextPage = () => setCurrentPageIndex(p => pdf ? Math.min(pdf.numPages - 1, p + 1) : p);

  return (
    <div className="pdf-viewer-container" ref={containerRef}>
      {pdf && (
        <div className="viewer-controls">
          <div className="control-bar paging-controls">
            <button className="btn-icon" onClick={handlePrevPage} disabled={currentPageIndex === 0} title="Previous Page">‹</button>
            <div className="page-indicator">
               Page {currentPageIndex + 1} of {pdf.numPages}
            </div>
            <button className="btn-icon" onClick={handleNextPage} disabled={currentPageIndex === pdf.numPages - 1} title="Next Page">›</button>
          </div>
          
          <div className="control-bar zoom-controls">
            <button className="btn-icon" onClick={handleZoomOut} title="Zoom Out">−</button>
            <button className="btn-icon" onClick={handleZoomFit} style={{ fontSize: '0.8rem', width: 'auto', padding: '0 1rem' }} title="Fit to Width">Fit Width</button>
            <button className="btn-icon" onClick={handleZoomIn} title="Zoom In">+</button>
          </div>
        </div>
      )}
      
      {pdf && containerWidth > 0 && (
        <PdfPage 
          key={currentPageIndex}
          pageIndex={currentPageIndex}
          pdf={pdf}
          redactions={redactions.filter(r => r.pageIndex === currentPageIndex)}
          onRemoveRedaction={onRemoveRedaction}
          words={words}
          onAddRedactions={onAddRedactions}
          containerWidth={containerWidth}
          zoomLevel={zoomLevel}
        />
      )}
    </div>
  );
}

function PdfPage({ pageIndex, pdf, redactions, onRemoveRedaction, words, onAddRedactions, containerWidth, zoomLevel }) {
  const canvasRef = useRef(null);
  const [viewport, setViewport] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let renderTask = null;

      const renderPage = async () => {
        try {
          const page = await pdf.getPage(pageIndex + 1);
          if (!isMounted) return;
          
          let scale = 1.0;
          
          if (zoomLevel === 'fit') {
            const unscaledVp = page.getViewport({ scale: 1.0 });
            // Available width is container width minus padding (2rem = 32px)
            const availableWidth = containerWidth - 32;
            scale = availableWidth / unscaledVp.width;
            if (scale > 3) scale = 3; // cap at 3x to avoid memory issues
          } else {
            scale = zoomLevel;
          }
          
          const vp = page.getViewport({ scale });
          setViewport(vp);
          
          const canvas = canvasRef.current;
          if (!canvas) return;
          
          const context = canvas.getContext('2d');
          canvas.height = vp.height;
          canvas.width = vp.width;

          const renderContext = {
            canvasContext: context,
            viewport: vp
          };
          
          renderTask = page.render(renderContext);
          await renderTask.promise;
        } catch (err) {
          if (err.name !== 'RenderingCancelledException') {
            console.error('Render error:', err);
          }
        }
      };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pageIndex, pdf, containerWidth, zoomLevel]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectionText = selection.toString().trim();
    if (selectionText.length === 0) return;

    const selectedSpans = [];
    const container = canvasRef.current.parentElement;
    const wordSpans = container.querySelectorAll('.pdf-word');
    
    wordSpans.forEach(span => {
      if (selection.containsNode(span, true)) {
        selectedSpans.push(span);
      }
    });

    if (selectedSpans.length === 0) return;

    const newRedactions = selectedSpans.map(span => {
      const globalIdx = parseInt(span.getAttribute('data-word-index'), 10);
      const w = words[globalIdx];
      return {
        id: `Manual-${w.pageIndex}-${globalIdx}`,
        type: 'Manual',
        text: w.text,
        pageIndex: w.pageIndex,
        boundingBox: { x: w.x, y: w.y, width: w.width, height: w.height },
        startWordIndex: globalIdx,
        endWordIndex: globalIdx
      };
    });

    if (onAddRedactions && newRedactions.length > 0) {
      onAddRedactions(newRedactions);
    }
    
    selection.removeAllRanges();
  };

  return (
    <div className="pdf-page-wrapper" onMouseUp={handleMouseUp} style={{ width: viewport ? viewport.width : 'auto', height: viewport ? viewport.height : 'auto' }}>
      <canvas ref={canvasRef} />
      
      {/* Invisible text layer for selection */}
      {viewport && words && words.filter(w => w.pageIndex === pageIndex).map((word) => {
        const unscaledViewport = viewport.clone({ scale: 1.0 });
        const unscaledHeight = unscaledViewport.height;
        const unscaledTopLeftY = unscaledHeight - word.y - word.height;
        
        return (
          <span
            key={`word-${word.originalIndex}`}
            className="pdf-word"
            data-word-index={word.originalIndex}
            style={{
              position: 'absolute',
              left: word.x * viewport.scale,
              top: unscaledTopLeftY * viewport.scale,
              width: word.width * viewport.scale,
              height: word.height * viewport.scale,
              fontSize: `${word.height * viewport.scale}px`,
              color: 'transparent',
              userSelect: 'text',
              cursor: 'text',
              lineHeight: 1,
              transformOrigin: 'top left',
              whiteSpace: 'nowrap',
            }}
          >
            {word.text}
          </span>
        );
      })}
      
      {viewport && redactions.map((redaction) => {
        const unscaledViewport = viewport.clone({ scale: 1.0 });
        const unscaledHeight = unscaledViewport.height;
        
        const { x, y, width, height } = redaction.boundingBox;
        
        const unscaledTopLeftY = unscaledHeight - y - height;
        
        const scaledX = x * viewport.scale;
        const scaledY = unscaledTopLeftY * viewport.scale;
        const scaledWidth = width * viewport.scale;
        const scaledHeight = height * viewport.scale;

        return (
          <div
            key={redaction.id}
            className={`redaction-box ${redaction.id.startsWith('AI') ? 'redaction-ai' : 'redaction-regex'}`}
            style={{
              left: scaledX,
              top: scaledY,
              width: scaledWidth,
              height: scaledHeight
            }}
            onClick={() => onRemoveRedaction(redaction.id)}
            title={`Click to remove. Detected: ${redaction.type}`}
          />
        );
      })}
    </div>
  );
}
