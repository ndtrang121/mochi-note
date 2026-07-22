import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RichTextEditor } from './RichTextEditor';

describe('RichTextEditor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs formatting commands against the selected editor content', async () => {
    const user = userEvent.setup();
    const execute = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execute });
    Object.defineProperty(document, 'queryCommandState', {
      configurable: true,
      value: vi.fn(() => false),
    });
    const onChange = vi.fn();
    render(
      <RichTextEditor
        html="Select me"
        onChange={onChange}
        paperClassName="note-editor-paper"
        titleField={<input aria-label="Title" />}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Nội dung ghi chú' });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(editor);

    await user.click(screen.getByRole('button', { name: 'Đậm' }));

    expect(execute).toHaveBeenCalledWith('bold', false, undefined);
    expect(onChange).toHaveBeenCalled();
  });

  it('reports edited rich HTML and its plain-text equivalent', () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        html=""
        onChange={onChange}
        paperClassName="note-editor-paper"
        titleField={<input aria-label="Title" />}
      />,
    );
    const editor = screen.getByRole('textbox', { name: 'Nội dung ghi chú' });
    editor.innerHTML = '<strong>Important</strong><br>Next';
    fireEvent.input(editor);

    expect(onChange).toHaveBeenLastCalledWith(
      '<strong>Important</strong><br>Next',
      'Important\nNext',
    );
  });
});
