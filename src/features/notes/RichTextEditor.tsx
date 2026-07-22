import { Bold, Italic, Link2, List, ListOrdered, Redo2, Undo2, Underline } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, CSSProperties, FormEvent, ReactNode } from 'react';

import { IconButton } from '../../components/ui/IconButton';
import { isHexColor, richTextToPlainText, sanitizeRichTextHtml } from './richText';

const TEXT_COLORS = ['#3c291f', '#c2410c', '#dc2626', '#2563eb', '#15803d', '#7e22ce'];

interface EditorCommandState {
  bold: boolean;
  italic: boolean;
  orderedList: boolean;
  underline: boolean;
  unorderedList: boolean;
}

interface RichTextEditorProps {
  children?: ReactNode;
  html: string;
  onChange: (html: string, plainText: string) => void;
  onDirty?: () => void;
  paperClassName: string;
  paperStyle?: CSSProperties;
  titleField: ReactNode;
}

const EMPTY_COMMAND_STATE: EditorCommandState = {
  bold: false,
  italic: false,
  orderedList: false,
  underline: false,
  unorderedList: false,
};

function commandIsActive(command: string) {
  return typeof document.queryCommandState === 'function'
    ? document.queryCommandState(command)
    : false;
}

export function RichTextEditor({ children, html, onChange, onDirty, paperClassName, paperStyle, titleField }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialHtmlRef = useRef(sanitizeRichTextHtml(html));
  const savedRangeRef = useRef<Range | null>(null);
  const [commands, setCommands] = useState(EMPTY_COMMAND_STATE);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [textColor, setTextColor] = useState('#3c291f');

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtmlRef.current;
  }, []);

  useEffect(() => {
    function refreshCommandState() {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
      setCommands({
        bold: commandIsActive('bold'),
        italic: commandIsActive('italic'),
        orderedList: commandIsActive('insertOrderedList'),
        underline: commandIsActive('underline'),
        unorderedList: commandIsActive('insertUnorderedList'),
      });
    }
    document.addEventListener('selectionchange', refreshCommandState);
    return () => document.removeEventListener('selectionchange', refreshCommandState);
  }, []);

  function captureSelection() {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!editor || !selection?.rangeCount || !selection.anchorNode || !editor.contains(selection.anchorNode)) return;
    savedRangeRef.current = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    const selection = window.getSelection();
    if (!selection || !savedRangeRef.current) return;
    selection.removeAllRanges();
    selection.addRange(savedRangeRef.current);
  }

  function commitEditorValue() {
    const editor = editorRef.current;
    if (!editor) return;
    const sanitizedHtml = sanitizeRichTextHtml(editor.innerHTML);
    onDirty?.();
    onChange(sanitizedHtml, richTextToPlainText(sanitizedHtml));
    captureSelection();
  }

  function executeCommand(command: string, value?: string) {
    restoreSelection();
    editorRef.current?.focus();
    if (typeof document.execCommand !== 'function') return;
    document.execCommand(command, false, value);
    commitEditorValue();
    setCommands({
      bold: commandIsActive('bold'),
      italic: commandIsActive('italic'),
      orderedList: commandIsActive('insertOrderedList'),
      underline: commandIsActive('underline'),
      unorderedList: commandIsActive('insertUnorderedList'),
    });
  }

  function preserveEditorSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    captureSelection();
  }

  function openLinkEditor() {
    captureSelection();
    setTextColorOpen(false);
    setLinkOpen((current) => !current);
  }

  function applyLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = /^https?:\/\//i.test(linkUrl.trim()) ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      executeCommand('createLink', url.href);
      setLinkUrl('');
      setLinkOpen(false);
    } catch {
      // Keep the compact popover open so the user can correct an invalid URL.
    }
  }

  function applyTextColor(color: string) {
    if (!isHexColor(color)) return;
    setTextColor(color);
    executeCommand('foreColor', color);
  }

  function pastePlainText(event: ReactClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    captureSelection();
    executeCommand('insertText', event.clipboardData.getData('text/plain'));
  }

  return (
    <>
      <div className="note-editor-toolbar" aria-label="Định dạng ghi chú" role="toolbar">
        <div className="note-editor-toolbar__group">
          <IconButton aria-label="Đậm" aria-pressed={commands.bold} onClick={() => executeCommand('bold')} onMouseDown={preserveEditorSelection}>
            <Bold aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Nghiêng" aria-pressed={commands.italic} onClick={() => executeCommand('italic')} onMouseDown={preserveEditorSelection}>
            <Italic aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Gạch chân" aria-pressed={commands.underline} onClick={() => executeCommand('underline')} onMouseDown={preserveEditorSelection}>
            <Underline aria-hidden="true" size={18} />
          </IconButton>
        </div>
        <span className="note-editor-toolbar__separator" aria-hidden="true" />
        <div className="note-editor-toolbar__group">
          <IconButton aria-label="Danh sách dấu chấm" aria-pressed={commands.unorderedList} onClick={() => executeCommand('insertUnorderedList')} onMouseDown={preserveEditorSelection}>
            <List aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Danh sách đánh số" aria-pressed={commands.orderedList} onClick={() => executeCommand('insertOrderedList')} onMouseDown={preserveEditorSelection}>
            <ListOrdered aria-hidden="true" size={18} />
          </IconButton>
        </div>
        <span className="note-editor-toolbar__separator" aria-hidden="true" />
        <div className="note-editor-toolbar__group note-editor-toolbar__group--actions">
          <div className="note-editor-toolbar__popover-anchor">
            <IconButton aria-expanded={textColorOpen} aria-label="Màu chữ" onClick={() => { captureSelection(); setLinkOpen(false); setTextColorOpen((current) => !current); }} onMouseDown={preserveEditorSelection}>
              <span className="note-text-color-icon" style={{ '--text-color': textColor } as CSSProperties}>A</span>
            </IconButton>
            {textColorOpen ? (
              <div className="note-text-color-popover" aria-label="Chọn màu chữ">
                {TEXT_COLORS.map((color) => (
                  <button aria-label={`Màu chữ ${color}`} className="note-text-color-swatch" key={color} onClick={() => { applyTextColor(color); setTextColorOpen(false); }} onMouseDown={(event) => event.preventDefault()} style={{ backgroundColor: color }} type="button" />
                ))}
                <label className="note-custom-color-button note-custom-color-button--small" title="Màu chữ tùy ý">
                  <span aria-hidden="true" />
                  <input aria-label="Màu chữ tùy ý" onChange={(event) => applyTextColor(event.target.value)} type="color" value={textColor} />
                </label>
              </div>
            ) : null}
          </div>
          <div className="note-editor-toolbar__popover-anchor">
            <IconButton aria-expanded={linkOpen} aria-label="Thêm liên kết" onClick={openLinkEditor} onMouseDown={preserveEditorSelection}>
              <Link2 aria-hidden="true" size={18} />
            </IconButton>
            {linkOpen ? (
              <form className="note-link-popover" onSubmit={applyLink}>
                <label htmlFor="note-link-url">Liên kết</label>
                <div>
                  <input id="note-link-url" onChange={(event) => setLinkUrl(event.target.value)} inputMode="url" placeholder="https://" type="text" value={linkUrl} />
                  <button type="submit">Gắn</button>
                </div>
              </form>
            ) : null}
          </div>
          <IconButton aria-label="Hoàn tác" onClick={() => executeCommand('undo')} onMouseDown={preserveEditorSelection}>
            <Undo2 aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Làm lại" onClick={() => executeCommand('redo')} onMouseDown={preserveEditorSelection}>
            <Redo2 aria-hidden="true" size={18} />
          </IconButton>
        </div>
      </div>
      <div className={paperClassName} style={paperStyle}>
        {titleField}
        <div
          aria-label="Nội dung ghi chú"
          aria-multiline="true"
          className="note-rich-editor"
          contentEditable
          data-placeholder="Bắt đầu viết..."
          onBlur={(event) => {
            const sanitizedHtml = sanitizeRichTextHtml(event.currentTarget.innerHTML);
            if (event.currentTarget.innerHTML !== sanitizedHtml) event.currentTarget.innerHTML = sanitizedHtml;
          }}
          onFocus={captureSelection}
          onInput={commitEditorValue}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          onPaste={pastePlainText}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
          tabIndex={0}
        />
        {children}
      </div>
    </>
  );
}
