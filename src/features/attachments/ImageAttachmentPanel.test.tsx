import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Attachment } from '../../db/models';
import { ImageAttachmentPanel } from './ImageAttachmentPanel';

describe('ImageAttachmentPanel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates local image attachments from selected files', () => {
    const onAdd = vi.fn<(attachment: Attachment) => void>();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image');
    render(<ImageAttachmentPanel attachments={[]} noteId="note-1" onAdd={onAdd} onRemove={vi.fn()} />);

    const file = new File(['image bytes'], 'sample.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Chọn ảnh đính kèm'), { target: { files: [file] } });

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      blob: file,
      kind: 'image',
      mimeType: 'image/png',
      noteId: 'note-1',
      size: file.size,
    }));
  });

  it('renders persisted images and delegates removal', () => {
    const onRemove = vi.fn();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image');
    const attachment: Attachment = {
      blob: new Blob(['saved image'], { type: 'image/png' }),
      createdAt: '2026-07-19T01:00:00.000Z',
      id: 'image-1',
      kind: 'image',
      mimeType: 'image/png',
      noteId: 'note-2',
      size: 11,
      updatedAt: '2026-07-19T01:00:00.000Z',
    };
    render(<ImageAttachmentPanel attachments={[attachment]} noteId="note-2" onAdd={vi.fn()} onRemove={onRemove} />);

    expect(screen.getByRole('img', { name: 'Ảnh đính kèm ghi chú' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh đính kèm' }));
    expect(onRemove).toHaveBeenCalledWith(attachment);
  });
});
