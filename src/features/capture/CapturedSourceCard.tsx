import { ExternalLink, Globe2 } from 'lucide-react';

import { Surface } from '../../components/ui/Surface';
import { useI18n } from '../../i18n/I18nProvider';
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
  const { t } = useI18n();

  if (!note.source) {
    return null;
  }

  return (
    <Surface className="captured-source-card">
      <span className="captured-source-card__placeholder"><Globe2 aria-hidden="true" size={21} /></span>
      <div>
        <span>{t('source.label')}</span>
        <strong>{note.source.pageTitle}</strong>
        <small>{hostname(note.source.url)}</small>
      </div>
      <a
        aria-label={t('source.open', { title: note.source.pageTitle })}
        href={note.source.url}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink aria-hidden="true" size={17} />
      </a>
    </Surface>
  );
}
