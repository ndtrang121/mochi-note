import { X } from 'lucide-react';
import { useId, useState } from 'react';

import { MAX_NOTE_TAGS, normalizeNoteTags } from '../../db/noteTags';

interface TagEditorProps {
  onChange: (tags: string[]) => void;
  tags: string[];
}

export function TagEditor({ onChange, tags }: TagEditorProps) {
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
      <span>Thẻ</span>
      <div className="tag-editor__control">
        {tags.map((tag) => (
          <span className="note-tag" key={tag}>
            <span>#{tag}</span>
            <button aria-label={`Xóa thẻ ${tag}`} onClick={() => removeTag(tag)} type="button">
              <X aria-hidden="true" size={12} />
            </button>
          </span>
        ))}
        <input
          aria-describedby={descriptionId}
          aria-label="Thêm thẻ"
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
          placeholder={atLimit ? 'Đã đủ 8 thẻ' : 'Thêm thẻ...'}
          value={draft}
        />
      </div>
      <small id={descriptionId}>Nhấn Enter hoặc dấu phẩy để thêm; tối đa {MAX_NOTE_TAGS} thẻ.</small>
    </div>
  );
}
