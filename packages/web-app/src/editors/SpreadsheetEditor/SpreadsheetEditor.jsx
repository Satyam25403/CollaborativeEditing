import React, { useEffect, useState, useCallback } from 'react';
import * as Y from 'yjs';
import './SpreadsheetEditor.css';

const COLS = 10;
const ROWS = 30;

export default function SpreadsheetEditor({ ydoc }) {
  const [cells, setCells] = useState(() => Array.from({ length: ROWS }, () => Array(COLS).fill('')));
  const [selected, setSelected] = useState(null); // {row, col}
  const [editVal, setEditVal] = useState('');

  const yGrid = ydoc ? ydoc.getMap('spreadsheet') : null;

  useEffect(() => {
    if (!yGrid) return;

    const update = () => {
      const grid = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => yGrid.get(`${r}:${c}`) || '')
      );
      setCells(grid);
    };

    yGrid.observe(update);
    update();
    return () => yGrid.unobserve(update);
  }, [yGrid]);

  function selectCell(row, col) {
    setSelected({ row, col });
    setEditVal(cells[row]?.[col] || '');
  }

  function commitEdit(row, col, val) {
    if (!yGrid) return;
    yGrid.set(`${row}:${col}`, val);
  }

  function handleKeyDown(e, row, col) {
    if (e.key === 'Enter') { commitEdit(row, col, editVal); selectCell(Math.min(ROWS - 1, row + 1), col); }
    if (e.key === 'Tab')   { e.preventDefault(); commitEdit(row, col, editVal); selectCell(row, Math.min(COLS - 1, col + 1)); }
    if (e.key === 'Escape'){ setSelected(null); }
  }

  const colLabel = i => String.fromCharCode(65 + i);

  return (
    <div className="sheet-wrap">
      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              <th className="sheet-corner" />
              {Array.from({ length: COLS }, (_, c) => (
                <th key={c} className="sheet-col-header">{colLabel(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, r) => (
              <tr key={r}>
                <td className="sheet-row-header">{r + 1}</td>
                {row.map((val, c) => {
                  const isSelected = selected?.row === r && selected?.col === c;
                  return (
                    <td
                      key={c}
                      className={`sheet-cell ${isSelected ? 'selected' : ''}`}
                      onClick={() => selectCell(r, c)}
                    >
                      {isSelected ? (
                        <input
                          autoFocus
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={() => { commitEdit(r, c, editVal); setSelected(null); }}
                          onKeyDown={e => handleKeyDown(e, r, c)}
                          className="sheet-input"
                        />
                      ) : val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
