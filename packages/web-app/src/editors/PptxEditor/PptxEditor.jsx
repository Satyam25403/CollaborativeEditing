import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import CursorLayer from '../../presence/CursorLayer.jsx';
import './PptxEditor.css';

export default function PptxEditor({ ydoc, provider }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [slides, setSlides] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editingText, setEditingText] = useState(null); // { slideId, elementId }

  // Yjs shared structure: ySlides is a Y.Array of Y.Maps
  const ySlides = ydoc ? ydoc.getArray('slides') : null;

  useEffect(() => {
    if (!ySlides) return;

    // Seed with one blank slide if empty
    if (ySlides.length === 0) {
      const slide = new Y.Map();
      slide.set('id', crypto.randomUUID());
      slide.set('bg', '#1e1e2e');
      slide.set('elements', new Y.Array());
      ySlides.push([slide]);
    }

    const update = () => {
      const arr = ySlides.toArray().map(s => ({
        id: s.get('id'),
        bg: s.get('bg') || '#1e1e2e',
        elements: (s.get('elements') || new Y.Array()).toArray()
      }));
      setSlides(arr);
    };

    ySlides.observeDeep(update);
    update();
    update();
    return () => ySlides.unobserveDeep(update);
  }, [ydoc]);

  // Render active slide to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || slides.length === 0) return;
    const slide = slides[activeIdx];
    if (!slide) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = slide.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw elements
    for (const el of slide.elements) {
      if (el.type === 'text') {
        ctx.fillStyle = el.color || '#ffffff';
        ctx.font = `${el.bold ? 'bold ' : ''}${el.fontSize || 24}px sans-serif`;
        ctx.fillText(el.content || '', el.x || 80, el.y || 120);
      } else if (el.type === 'rect') {
        ctx.fillStyle = el.fill || '#6366f1';
        ctx.fillRect(el.x, el.y, el.w || 200, el.h || 100);
      }
    }
  }, [slides, activeIdx]);

  function addTextElement() {
    if (!ySlides || slides.length === 0) return;
    const ySlide = ySlides.get(activeIdx);
    const elements = ySlide.get('elements');
    const el = new Y.Map();
    el.set('id', crypto.randomUUID());
    el.set('type', 'text');
    el.set('content', 'Click to edit');
    el.set('x', 80); el.set('y', 120);
    el.set('fontSize', 28);
    el.set('color', '#ffffff');
    elements.push([el]);
  }

  function addSlide() {
    if (!ySlides) return;
    const slide = new Y.Map();
    slide.set('id', crypto.randomUUID());
    slide.set('bg', '#1e1e2e');
    slide.set('elements', new Y.Array());
    ySlides.push([slide]);
    setActiveIdx(ySlides.length - 1);
  }

  function changeBg(color) {
    if (!ySlides) return;
    ySlides.get(activeIdx)?.set('bg', color);
  }

  return (
    <div className="pptx-editor">
      {/* Slide thumbnails */}
      <div className="pptx-sidebar">
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`pptx-thumb ${i === activeIdx ? 'active' : ''}`}
            onClick={() => setActiveIdx(i)}
            style={{ background: s.bg }}
          >
            <span>{i + 1}</span>
          </div>
        ))}
        <button className="pptx-add-slide" onClick={addSlide}>+ Slide</button>
      </div>

      {/* Main canvas area */}
      <div className="pptx-main">
        <div className="pptx-toolbar">
          <button onClick={addTextElement}>+ Text</button>
          <label style={{ fontSize: 13, color: '#94a3b8' }}>
            BG:
            <input type="color" defaultValue="#1e1e2e" onChange={e => changeBg(e.target.value)}
              style={{ marginLeft: 6, padding: 2, height: 28, border: 'none', background: 'none', cursor: 'pointer' }} />
          </label>
        </div>

        <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
          <canvas
            ref={canvasRef}
            width={960} height={540}
            style={{ display: 'block', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          />
          <CursorLayer provider={provider} containerRef={containerRef} />
        </div>
      </div>
    </div>
  );
}
