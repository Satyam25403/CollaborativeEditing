import React, { useRef, useState, useEffect } from 'react';
import CursorLayer from '../../presence/CursorLayer.jsx';
import './ImageViewer.css';

export default function ImageViewer({ document: doc, ydoc, provider }) {
  const containerRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);
  const [addingPin, setAddingPin] = useState(false);

  const yAnnotations = ydoc ? ydoc.getArray('img_annotations') : null;
  const imgUrl = doc?._id ? `/api/files/${doc._id}/download` : null;

  useEffect(() => {
    if (!yAnnotations) return;
    const update = () => setAnnotations(yAnnotations.toArray());
    yAnnotations.observe(update);
    update();
    return () => yAnnotations.unobserve(update);
  }, [yAnnotations]);

  function handleClick(e) {
    if (!addingPin || !yAnnotations) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width * 100).toFixed(2);
    const yPct = ((e.clientY - rect.top) / rect.height * 100).toFixed(2);
    const text = prompt('Add a note:');
    if (!text) return;
    yAnnotations.push([{
      id: crypto.randomUUID(),
      xPct, yPct, text,
      author: provider?.awareness?.getLocalState()?.user?.name || 'You',
      color: '#6366f1'
    }]);
    setAddingPin(false);
  }

  return (
    <div className="img-viewer">
      <div className="img-toolbar">
        <button
          onClick={() => setAddingPin(v => !v)}
          style={{ background: addingPin ? '#6366f1' : undefined }}
        >
          {addingPin ? '📌 Click image to pin' : '+ Add Pin'}
        </button>
      </div>
      <div
        ref={containerRef}
        className="img-canvas"
        onClick={handleClick}
        style={{ cursor: addingPin ? 'crosshair' : 'default', position: 'relative' }}
      >
        {imgUrl && <img src={imgUrl} alt={doc?.name} style={{ maxWidth: '100%', display: 'block' }} />}

        {annotations.map(a => (
          <div
            key={a.id}
            className="img-pin"
            style={{ left: `${a.xPct}%`, top: `${a.yPct}%` }}
            title={`${a.author}: ${a.text}`}
          >
            📌
            <div className="img-pin-label">{a.author}: {a.text}</div>
          </div>
        ))}

        <CursorLayer provider={provider} containerRef={containerRef} />
      </div>
    </div>
  );
}
