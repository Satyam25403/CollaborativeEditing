import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import CursorLayer from '../../presence/CursorLayer.jsx';
import './PdfEditor.css';

// BUG-U FIX: use the worker bundled with pdfjs-dist instead of a CDN URL
// This avoids version mismatch between installed package and CDN
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfEditor({ document: doc, ydoc, provider }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const pdfRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [annotations, setAnnotations] = useState([]);
  const [addingNote, setAddingNote] = useState(false);

  const yAnnotations = ydoc ? ydoc.getArray('annotations') : null;

  // Load PDF from server
  useEffect(() => {
    if (!doc?._id) return;
    const url = `/api/files/${doc._id}/download`;

    pdfjsLib.getDocument({ url }).promise.then(pdf => {
      pdfRef.current = pdf;
      setNumPages(pdf.numPages);
      renderPage(pdf, 1);
    }).catch(err => console.error('[PdfEditor] Load error:', err));
  }, [doc?._id]);

  // Re-render when page or scale changes
  useEffect(() => {
    if (pdfRef.current) renderPage(pdfRef.current, currentPage);
  }, [currentPage, scale]);

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
  }, [ydoc]);

  function handleCanvasClick(e) {
    if (!addingNote || !yAnnotations) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const text = prompt('Annotation text:');
    if (!text) return;
    yAnnotations.push([{
      id: crypto.randomUUID(),
      x, y,
      page: currentPage,
      text,
      color: '#FFFF00',
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
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ cursor: addingNote ? 'crosshair' : 'default', display: 'block' }}
        />
        {annotations.filter(a => a.page === currentPage).map(a => (
          <div key={a.id} className="pdf-annotation" style={{ left: a.x, top: a.y, background: a.color }}>
            <strong>{a.author}:</strong> {a.text}
          </div>
        ))}
        <CursorLayer provider={provider} containerRef={containerRef} />
      </div>
    </div>
  );
}
