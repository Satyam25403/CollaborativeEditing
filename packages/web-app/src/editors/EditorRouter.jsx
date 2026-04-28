import React from 'react';
import CodeEditor from './CodeEditor/CodeEditor.jsx';
import RichTextEditor from './RichTextEditor/RichTextEditor.jsx';
import PdfEditor from './PdfEditor/PdfEditor.jsx';
import PptxEditor from './PptxEditor/PptxEditor.jsx';
import SpreadsheetEditor from './SpreadsheetEditor/SpreadsheetEditor.jsx';
import ImageViewer from './ImageViewer/ImageViewer.jsx';

const CODE_EXTS = ['js','jsx','ts','tsx','py','java','c','cpp','cs','go','rs','rb','php','swift','kt','r','sql','sh','bash','json','xml','yaml','yml','toml','css','scss','html'];
const RICH_EXTS = ['txt','md','markdown'];
const IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','svg','bmp'];

function getEditorType(fileType) {
  const ext = (fileType || '').toLowerCase().replace('.', '');
  if (ext === 'pdf')  return 'pdf';
  if (ext === 'pptx' || ext === 'ppt') return 'pptx';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'spreadsheet';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (RICH_EXTS.includes(ext)) return 'richtext';
  if (CODE_EXTS.includes(ext)) return 'code';
  return 'richtext'; // fallback for unknown types
}

export default function EditorRouter({ document, ydoc, provider }) {
  const type = getEditorType(document?.fileType);

  const props = { document, ydoc, provider };

  switch (type) {
    case 'code':        return <CodeEditor {...props} />;
    case 'richtext':    return <RichTextEditor {...props} />;
    case 'pdf':         return <PdfEditor {...props} />;
    case 'pptx':        return <PptxEditor {...props} />;
    case 'spreadsheet': return <SpreadsheetEditor {...props} />;
    case 'image':       return <ImageViewer {...props} />;
    default:            return <RichTextEditor {...props} />;
  }
}
