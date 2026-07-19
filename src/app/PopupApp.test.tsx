import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PopupApp } from './PopupApp';

let databaseCounter = 0;

function renderPopup(databaseName = `popup-test-${++databaseCounter}`) {
  return render(<PopupApp databaseName={databaseName} />);
}

describe('PopupApp', () => {
  const closePopup = vi.fn();

  beforeEach(() => {
    vi.spyOn(window, 'close').mockImplementation(closePopup);
  });

  afterEach(() => {
    closePopup.mockReset();
    vi.restoreAllMocks();
  });

  it('opens directly into the shared new-Sticky editor', async () => {
    renderPopup();

    expect(await screen.findByRole('heading', { level: 1, name: 'Sticky mới' })).toBeVisible();
    expect(screen.getByLabelText('Tiêu đề ghi chú')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chụp trang' })).not.toBeInTheDocument();
  });

  it('creates a Sticky with the shared editor and closes the popup', async () => {
    const user = userEvent.setup();
    renderPopup();

    await user.type(await screen.findByLabelText('Tiêu đề ghi chú'), 'Chuẩn bị demo');
    await user.type(screen.getByLabelText('Nội dung ghi chú'), 'Kiểm tra nội dung trình bày');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    expect(closePopup).toHaveBeenCalledOnce();
  });

  it('uses a compact shared-editor header without a back control', async () => {
    renderPopup();

    expect(await screen.findByText('MochiNote')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Quay lại danh sách ghi chú' })).not.toBeInTheDocument();
  });
});
