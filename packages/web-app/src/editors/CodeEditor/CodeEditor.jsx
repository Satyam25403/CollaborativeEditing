import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';

const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
  go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift',
  kt: 'kotlin', sql: 'sql', sh: 'shell', bash: 'shell',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  css: 'css', scss: 'scss', html: 'html', md: 'markdown'
};

export default function CodeEditor({ document, ydoc, provider }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const bindingRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !ydoc) return;

    const lang = LANG_MAP[(document?.fileType || 'txt').toLowerCase()] || 'plaintext';

    // BUG-H FIX: create editor instance first, then pass the INSTANCE (not ref) to MonacoBinding
    const editor = monaco.editor.create(containerRef.current, {
      value: '',
      language: lang,
      theme: 'vs-dark',
      fontSize: 14,
      minimap: { enabled: false },
      automaticLayout: true,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true
    });
    editorRef.current = editor;

    const ytext = ydoc.getText('content');

    // MonacoBinding takes: (Y.Text, ITextModel, Set<IEditor>, Awareness|null)
    bindingRef.current = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),       // pass the editor INSTANCE, not the ref
      provider?.awareness ?? null
    );

    return () => {
      bindingRef.current?.destroy();
      editorRef.current?.dispose();
    };
  }, [ydoc, provider]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: 500 }}
    />
  );
}
