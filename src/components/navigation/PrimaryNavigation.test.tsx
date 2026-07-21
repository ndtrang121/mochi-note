import { SlidersHorizontal } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BottomNavigation } from './BottomNavigation';
import { PrimaryHeaderActions } from './PrimaryHeaderActions';
import { IconButton } from '../ui/IconButton';

describe('Primary navigation chrome', () => {
  it('places Sticky before Tasks and Folders', () => {
    render(<BottomNavigation activeTab="tasks" onTabChange={vi.fn()} />);

    const navigation = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(
      screen.getAllByRole('button')
        .filter((button) => navigation.contains(button))
        .map((button) => button.getAttribute('data-tab')),
    ).toEqual(['sticky', 'tasks', 'folders']);
  });

  it('keeps header actions ordered and sized as screen action, sync, then settings', () => {
    render(
      <PrimaryHeaderActions
        className="preview-header__actions"
        onOpenSettings={vi.fn()}
        syncAction={(
          <IconButton aria-label="Đồng bộ">
            <SlidersHorizontal aria-hidden="true" size={18} />
          </IconButton>
        )}
      >
        <IconButton aria-label="Lọc">
          <SlidersHorizontal aria-hidden="true" size={18} />
        </IconButton>
      </PrimaryHeaderActions>,
    );

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Lọc',
      'Đồng bộ',
      'Cài đặt',
    ]);
    expect(document.querySelectorAll('.ui-icon-button')).toHaveLength(3);
    for (const icon of document.querySelectorAll('.ui-icon-button > svg')) {
      expect(icon).toHaveAttribute('width', '18');
      expect(icon).toHaveAttribute('height', '18');
    }
  });
});
