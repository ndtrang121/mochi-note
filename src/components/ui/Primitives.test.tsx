import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { Brand } from './Brand';
import { Button } from './Button';
import { Chip } from './Chip';
import { ColorSwatch } from './ColorSwatch';
import { IconButton } from './IconButton';

describe('MochiNote UI primitives', () => {
  it('uses the horizontal logo and keeps the compact mascot decorative', () => {
    const { rerender } = render(<Brand />);

    expect(screen.getByRole('img', { name: 'MochiNote' })).toHaveAttribute('src', '/brand/full_logo_h.png');
    rerender(<Brand compact />);
    expect(screen.getByRole('presentation')).toHaveAttribute('src', '/brand/mochi-mascot.png');
  });

  it('uses safe button defaults and handles interaction', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={onClick}>Lưu</Button>);
    const button = screen.getByRole('button', { name: 'Lưu' });

    expect(button).toHaveAttribute('type', 'button');
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('exposes icon-only controls with an accessible name', () => {
    render(
      <IconButton aria-label="Cài đặt">
        <Settings aria-hidden="true" />
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: 'Cài đặt' })).toBeVisible();
  });

  it('announces selected chips and color swatches', () => {
    render(
      <>
        <Chip selected>Tất cả</Chip>
        <ColorSwatch color="#fff4c9" label="Vàng kem" selected />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Vàng kem' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
