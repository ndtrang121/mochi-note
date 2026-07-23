import { X } from 'lucide-react';
import { useId, useState } from 'react';

import { MAX_NOTE_TAGS, normalizeNoteTags } from '../../db/noteTags';
import { useI18n } from '../../i18n/I18nProvider';

interface TagEditorProps {
  onChange: (tags: string[]) => void;
  tags: string[];
}

export function TagEditor({ onChange, tags }: TagEditorProps) {
  const { t } = useI18n();
  const descriptionId = useId();
  const [draft, setDraft] = useState('');
  const atLimit = tags.length >= MAX_NOTE_TAGS;

  function commitDraft() {
    if (!draft.trim()) return;
    onChange(normalizeNoteTags([...tags, ...draft.split(/[,;\n]+/)]));
    setDraft('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((item) => item !== tag));
  }

  return (
    <div className="tag-editor">
      <span>{t('tags.label')}</span>
      <div className="tag-editor__control">
        {tags.map((tag) => (
          <span className="note-tag" key={tag}>
            <span>#{tag}</span>
            <button aria-label={t('tags.remove', { tag })} onClick={() => removeTag(tag)} type="button">
              <X aria-hidden="true" size={12} />
            </button>
          </span>
        ))}
        <input
          aria-describedby={descriptionId}
          aria-label={t('tags.add')}
          disabled={atLimit}
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              commitDraft();
            } else if (event.key === 'Backspace' && !draft && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder={atLimit ? t('tags.limitReached') : t('tags.placeholder')}
          value={draft}
        />
      </div>
      <small id={descriptionId}>{t('tags.help', { count: MAX_NOTE_TAGS })}</small>
    </div>
  );
}
