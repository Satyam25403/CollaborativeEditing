import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import CursorLayer from '../../presence/CursorLayer.jsx';
import './PdfEditor.css';

// Point pdf.js worker at the CDN build
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs';

export default function PdfEditor({ document: doc, ydoc, provider }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [annotations, setAnnotations] = useState([]);
  const [addingNote, setAddingNote] = useState(false);

  // Yjs shared array of annotation objects
  const yAnnotations = ydoc ? ydoc.getArray('annotations') : null;

  // Load PDF from server
  useEffect(() => {
    if (!doc?.filePath && !doc?._id) return;
    const url = `/api/files/${doc._id}/download`;

    pdfjsLib.getDocument(url).promise.then(pdf => {
      setNumPages(pdf.numPages);
      renderPage(pdf, currentPage);
    });
  }, [doc]);

  async function renderPage(pdf, pageNum) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  }

  // Subscribe to Yjs annotation changes
  useEffect(() => {
    if (!yAnnotations) return;
    const update = () => setAnnotations(yAnnotations.toArray());
    yAnnotations.observe(update);
    update();
    return () => yAnnotations.unobserve(update);
  }, [yAnnotations]);

  function handleCanvasClick(e) {
    if (!addingNote || !yAnnotations) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const text = prompt('Annotation text:');
    if (!text) return;
    yAnnotations.push([{
      id: crypto.randomUUID(),
      x, y, page: currentPage,
      text, color: '#FFFF00',
      author: provider?.awareness?.getLocalState()?.user?.name || 'You',
      createdAt: Date.now()
    }]);
    setAddingNote(false);
  }

  return (
    <div className="pdf-editor">
      <div className="pdf-toolbar">
        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}>← Prev</button>
        <span>Page {currentPage} / {numPages}</span>
        <button onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}>Next →</button>
        <button onClick={() => setScale(s => +(s + 0.2).toFixed(1))}>Zoom +</button>
        <button onClick={() => setScale(s => Math.max(0.4, +(s - 0.2).toFixed(1)))}>Zoom -</button>
        <button
          onClick={() => setAddingNote(v => !v)}
          style={{ background: addingNote ? '#6366f1' : undefined }}
        >
          {addingNote ? '✏️ Click to place note' : '+ Add Note'}
        </button>
      </div>

      <div className="pdf-canvas-wrap" ref={containerRef} style={{ position: 'relative' }}>
        <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ cursor: addingNote ? 'crosshair' : 'default' }} />

        {/* Annotation stickies */}
        {annotations.filter(a => a.page === currentPage).map(a => (
          <div key={a.id} className="pdf-annotation" style={{ left: a.x, top: a.y, background: a.color }}>
            <strong>{a.author}:</strong> {a.text}
          </div>
        ))}

        {/* Remote cursors */}
        <CursorLayer provider={provider} containerRef={containerRef} />
      </div>
    </div>
  );
}
