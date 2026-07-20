import { Mic, Square, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type { Attachment } from '../../db/models';
import { createStableId } from '../../db/stableId';

const MAX_RECORDING_MS = 10 * 60 * 1000;

interface AudioNotePanelProps {
  attachments: Attachment[];
  noteId: string;
  onAdd: (attachment: Attachment) => void;
  onRemove: (attachment: Attachment) => void;
}

interface AudioAttachmentRowProps {
  attachment: Attachment;
  onRemove?: (attachment: Attachment) => void;
}

interface AudioAttachmentListProps {
  attachments: Attachment[];
  onRemove?: (attachment: Attachment) => void;
}

type RecorderStatus = 'idle' | 'permission' | 'recording' | 'saving';

function createAttachmentId() {
  return createStableId('attachment-audio');
}

function chooseAudioMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function recorderErrorMessage(error: unknown) {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return 'MochiNote chưa được phép dùng micro. Hãy cho phép Microphone trong cài đặt trang rồi thử lại.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Không tìm thấy micro trên thiết bị này.';
  }
  return 'Không thể bắt đầu ghi âm. Hãy kiểm tra micro và thử lại.';
}

function AudioAttachmentRow({ attachment, onRemove }: AudioAttachmentRowProps) {
  const [objectUrl] = useState<string | null>(() =>
    URL.createObjectURL ? URL.createObjectURL(attachment.blob) : null,
  );

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return (
    <div className="audio-attachment-row">
      <span className="audio-attachment-row__icon" aria-hidden="true">
        <Volume2 size={17} />
      </span>
      <div>
        <strong>Bản ghi âm</strong>
        <small>{formatSize(attachment.size)} · {new Date(attachment.createdAt).toLocaleString('vi-VN')}</small>
        <audio aria-label="Phát bản ghi âm" controls preload="metadata" src={objectUrl ?? undefined}>
          <track kind="captions" label="Không có lời thoại" srcLang="vi" src="data:text/vtt,WEBVTT" />
        </audio>
      </div>
      {onRemove ? (
        <IconButton aria-label="Xóa bản ghi âm" onClick={() => onRemove(attachment)}>
          <Trash2 aria-hidden="true" size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}

export function AudioAttachmentList({ attachments, onRemove }: AudioAttachmentListProps) {
  return (
    <div className="audio-attachment-list" aria-label="Bản ghi âm đính kèm">
      {attachments.map((attachment) => (
        <AudioAttachmentRow attachment={attachment} key={attachment.id} onRemove={onRemove} />
      ))}
    </div>
  );
}

export function AudioNotePanel({ attachments, noteId, onAdd, onRemove }: AudioNotePanelProps) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);

  function clearTimers() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (maxDurationRef.current) clearTimeout(maxDurationRef.current);
    intervalRef.current = null;
    maxDurationRef.current = null;
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopRecording() {
    clearTimers();
    setElapsedMs(Date.now() - startedAtRef.current);
    setStatus('saving');
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseStream();
  }

  useEffect(() => () => {
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.stop();
    }
    releaseStream();
  }, []);

  async function startRecording() {
    setErrorMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMessage('Trình duyệt này không hỗ trợ ghi âm từ side panel.');
      return;
    }

    setStatus('permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = chooseAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        clearTimers();
        releaseStream();
        setStatus('idle');
        setErrorMessage('Quá trình ghi âm bị gián đoạn. Hãy thử lại.');
      };
      recorder.onstop = () => {
        const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: resolvedMimeType });
        recorderRef.current = null;
        chunksRef.current = [];
        setStatus('idle');
        if (blob.size === 0) {
          setErrorMessage('Bản ghi không có dữ liệu. Hãy thử ghi lại.');
          return;
        }
        const now = new Date().toISOString();
        onAdd({
          blob,
          createdAt: now,
          id: createAttachmentId(),
          kind: 'audio',
          mimeType: resolvedMimeType,
          noteId,
          size: blob.size,
          updatedAt: now,
        });
      };

      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus('recording');
      recorder.start(1000);
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 500);
      maxDurationRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (error) {
      clearTimers();
      releaseStream();
      setStatus('idle');
      setErrorMessage(recorderErrorMessage(error));
    }
  }

  return (
    <Surface className="audio-note-panel">
      <div className="audio-note-panel__heading">
        <span aria-hidden="true"><Mic size={18} /></span>
        <div>
          <strong>Ghi chú bằng giọng nói</strong>
          <small>Lưu cục bộ trong ghi chú này · tối đa 10 phút</small>
        </div>
      </div>
      {status === 'recording' ? (
        <button className="audio-record-button audio-record-button--active" onClick={stopRecording} type="button">
          <Square aria-hidden="true" fill="currentColor" size={16} />
          Dừng ghi · {formatDuration(elapsedMs)}
        </button>
      ) : (
        <button className="audio-record-button" disabled={status !== 'idle'} onClick={() => void startRecording()} type="button">
          <Mic aria-hidden="true" size={17} />
          {status === 'permission' ? 'Đang xin quyền micro…' : status === 'saving' ? 'Đang hoàn tất…' : 'Bắt đầu ghi âm'}
        </button>
      )}
      {errorMessage ? <p className="audio-note-panel__error" role="alert">{errorMessage}</p> : null}
      {attachments.length > 0 ? (
        <AudioAttachmentList attachments={attachments} onRemove={onRemove} />
      ) : (
        <p className="audio-note-panel__empty">Chưa có bản ghi âm.</p>
      )}
    </Surface>
  );
}
