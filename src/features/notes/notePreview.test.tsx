import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotePreviewContent } from './NotesScreen';

describe('NotePreviewContent', () => {
  it('preserves rich list formatting and checklist state from note detail', () => {
    const { container } = render(
      <NotePreviewContent
        bodyHtml="<ol><li>First idea</li><li>Second idea</li></ol>"
        checklist={[
          { checked: false, id: 'todo', text: 'Todo item' },
          { checked: true, id: 'done', text: 'Done item' },
        ]}
      />,
    );

    expect(container.querySelector('.sticky-card__body ol')).toBeInTheDocument();
    expect(screen.getByText('First idea')).toBeInTheDocument();
    expect(screen.getByText('Todo item').closest('[role="listitem"]')).toHaveAttribute('data-checked', 'false');
    expect(screen.getByText('Done item').closest('[role="listitem"]')).toHaveAttribute('data-checked', 'true');
  });
});
