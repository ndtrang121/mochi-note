import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Attachment } from '../../db/models';
import { FileAttachmentPanel, MAX_NOTE_ATTACHMENT_BYTES } from './FileAttachmentPanel';

describe('FileAttachmentPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a named local file attachment', () => {
    const onAdd = vi.fn<(attachment: Attachment) => void>();
    render(<FileAttachmentPanel attachments={[]} existingBytes={0} noteId="note-1" onAdd={onAdd} onRemove={vi.fn()} />);
    const file = new File(['project notes'], 'brief.pdf', { type: 'application/pdf' });

    fireEvent.change(screen.getByLabelText('Chọn tệp đính kèm'), { target: { files: [file] } });

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      blob: file,
      fileName: 'brief.pdf',
      kind: 'file',
      mimeType: 'application/pdf',
      noteId: 'note-1',
    }));
  });

  it('rejects executable content and note quota overflow', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<FileAttachmentPanel attachments={[]} existingBytes={0} noteId="note-2" onAdd={onAdd} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Chọn tệp đính kèm'), { target: { files: [new File(['x'], 'unsafe.exe')] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Không hỗ trợ loại tệp');
    expect(onAdd).not.toHaveBeenCalled();

    rerender(<FileAttachmentPanel attachments={[]} existingBytes={MAX_NOTE_ATTACHMENT_BYTES} noteId="note-2" onAdd={onAdd} onRemove={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Chọn tệp đính kèm'), { target: { files: [new File(['x'], 'safe.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('không được vượt quá 32 MB');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('renders download and removal controls for persisted files', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    const onRemove = vi.fn();
    const attachment: Attachment = {
      blob: new Blob(['saved']),
      createdAt: '2026-07-19T01:00:00.000Z',
      fileName: 'saved.txt',
      id: 'file-1',
      kind: 'file',
      mimeType: 'text/plain',
      noteId: 'note-3',
      size: 5,
      updatedAt: '2026-07-19T01:00:00.000Z',
    };
    render(<FileAttachmentPanel attachments={[attachment]} existingBytes={0} noteId="note-3" onAdd={vi.fn()} onRemove={onRemove} />);

    expect(screen.getByRole('link', { name: 'Tải xuống saved.txt' })).toHaveAttribute('download', 'saved.txt');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa saved.txt' }));
    expect(onRemove).toHaveBeenCalledWith(attachment);
  });
});
