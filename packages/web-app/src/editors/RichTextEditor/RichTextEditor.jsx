import React, { useEffect, useRef } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import useAuthStore from '../../store/authStore.js';
import './RichTextEditor.css';

export default function RichTextEditor({ ydoc, provider }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    if (!containerRef.current || !ydoc) return;

    editorRef.current = new Editor({
      element: containerRef.current,
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider,
          user: {
            name: user?.name || 'Anonymous',
            color: user?.avatarColor || '#6366f1'
          }
        })
      ]
    });

    return () => editorRef.current?.destroy();
  }, [ydoc, provider]);

  return <div ref={containerRef} className="rich-editor" />;
}
