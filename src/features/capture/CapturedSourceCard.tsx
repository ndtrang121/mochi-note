import { ExternalLink, Globe2, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Surface } from '../../components/ui/Surface';
import type { Note } from '../../db/models';

interface CapturedSourceCardProps {
  note: Note;
}

function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function CapturedSourceCard({ note }: CapturedSourceCardProps) {
  const { repositories } = useMochiData();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const attachmentId = note.source?.screenshotAttachmentId;

  useEffect(() => {
    if (!attachmentId || !repositories || !URL.createObjectURL) {
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    void repositories.attachments.get(attachmentId).then((attachment) => {
      if (active && attachment) {
        objectUrl = URL.createObjectURL(attachment.blob);
        setPreviewUrl(objectUrl);
      }
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, repositories]);

  if (!note.source) {
    return null;
  }

  return (
    <Surface className="captured-source-card">
      {previewUrl ? (
        <img alt={`Ảnh chụp ${note.source.pageTitle}`} src={previewUrl} />
      ) : (
        <span className="captured-source-card__placeholder">
          {attachmentId
            ? <ImageIcon aria-hidden="true" size={21} />
            : <Globe2 aria-hidden="true" size={21} />}
        </span>
      )}
      <div>
        <span>Nguồn trang</span>
        <strong>{note.source.pageTitle}</strong>
        <small>{hostname(note.source.url)}</small>
      </div>
      <a
        aria-label={`Mở nguồn ${note.source.pageTitle}`}
        href={note.source.url}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink aria-hidden="true" size={17} />
      </a>
    </Surface>
  );
}
