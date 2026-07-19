import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Attachment } from '../../db/models';
import { AudioNotePanel } from './AudioNotePanel';

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = 'inactive';

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    void stream;
    void options;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['local audio'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function installRecorder(getUserMedia: typeof navigator.mediaDevices.getUserMedia) {
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AudioNotePanel', () => {
  it('records a local audio attachment and stops the microphone stream', async () => {
    const user = userEvent.setup();
    const trackStop = vi.fn();
    const onAdd = vi.fn<(attachment: Attachment) => void>();
    installRecorder(vi.fn(() => Promise.resolve({ getTracks: () => [{ stop: trackStop }] }) as unknown as Promise<MediaStream>));

    render(
      <AudioNotePanel attachments={[]} noteId="note-1" onAdd={onAdd} onRemove={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));
    expect(screen.getByRole('button', { name: /Dừng ghi/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Dừng ghi/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      kind: 'audio',
      mimeType: 'audio/webm;codecs=opus',
      noteId: 'note-1',
    });
    expect(trackStop).toHaveBeenCalledOnce();
  });

  it('explains how to recover from a denied microphone permission', async () => {
    const user = userEvent.setup();
    installRecorder(vi.fn(() => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))));

    render(
      <AudioNotePanel attachments={[]} noteId="note-2" onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('chưa được phép dùng micro');
    expect(screen.getByRole('button', { name: 'Bắt đầu ghi âm' })).toBeEnabled();
  });

  it('renders persisted audio and delegates attachment deletion', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const attachment: Attachment = {
      blob: new Blob(['saved audio'], { type: 'audio/webm' }),
      createdAt: '2026-07-19T01:00:00.000Z',
      id: 'audio-1',
      kind: 'audio',
      mimeType: 'audio/webm',
      noteId: 'note-3',
      size: 11,
      updatedAt: '2026-07-19T01:00:00.000Z',
    };

    render(
      <AudioNotePanel attachments={[attachment]} noteId="note-3" onAdd={vi.fn()} onRemove={onRemove} />,
    );

    expect(screen.getByText('Bản ghi âm')).toBeVisible();
    expect(document.querySelector('audio')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xóa bản ghi âm' }));
    expect(onRemove).toHaveBeenCalledWith(attachment);
  });
});
