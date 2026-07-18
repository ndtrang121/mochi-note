import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PopupApp } from './PopupApp';

describe('PopupApp', () => {
  it('renders the reference quick actions and recent notes', () => {
    render(<PopupApp />);

    expect(screen.getByRole('button', { name: 'Ghi chú nhanh' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chụp trang' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đánh dấu' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thu âm' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Ghi chú gần đây' })).toBeVisible();
  });

  it('creates a quick note and adds it to recent notes', async () => {
    const user = userEvent.setup();
    render(<PopupApp />);

    await user.click(screen.getByRole('button', { name: 'Ghi chú nhanh' }));
    await user.type(screen.getByLabelText('Ghi chú nhanh'), 'Chuẩn bị demo');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Chuẩn bị demo' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu ghi chú nhanh');
  });

  it('uses popup settings to control recent-note visibility', async () => {
    const user = userEvent.setup();
    render(<PopupApp />);

    await user.click(screen.getByRole('button', { name: 'Cài đặt popup' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hiện ghi chú gần đây' }));

    expect(screen.queryByRole('heading', { level: 1, name: 'Ghi chú gần đây' })).not.toBeInTheDocument();
  });

  it('hands off to the side panel from Xem tất cả', async () => {
    const user = userEvent.setup();
    const onOpenAll = vi.fn().mockResolvedValue(true);
    render(<PopupApp onOpenAll={onOpenAll} />);

    await user.click(screen.getByRole('button', { name: 'Xem tất cả' }));

    expect(onOpenAll).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Đã mở MochiNote');
  });

  it('shows selected-state feedback for browser actions awaiting integration', async () => {
    const user = userEvent.setup();
    render(<PopupApp />);

    await user.click(screen.getByRole('button', { name: 'Chụp trang' }));

    expect(screen.getByRole('button', { name: 'Chụp trang' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đã chọn Chụp trang');
  });
});
