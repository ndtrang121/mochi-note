import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PopupApp } from './PopupApp';
import { seedDatabase } from '../db/seed';

let databaseCounter = 0;
const driveSyncScheduler = vi.fn(() => Promise.resolve());

function renderPopup(databaseName = `popup-test-${++databaseCounter}`) {
  return render(
    <PopupApp
      databaseInitializer={async (database) => { await seedDatabase(database); }}
      databaseName={databaseName}
      driveSyncScheduler={driveSyncScheduler}
    />,
  );
}

describe('PopupApp', () => {
  const closePopup = vi.fn();

  beforeEach(() => {
    driveSyncScheduler.mockClear();
    vi.spyOn(window, 'close').mockImplementation(closePopup);
  });

  afterEach(() => {
    closePopup.mockReset();
    vi.restoreAllMocks();
  });

  it('opens the most recently updated Sticky in the shared editor', async () => {
    renderPopup();

    expect(await screen.findByDisplayValue('Kế hoạch tháng 6')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chụp trang' })).not.toBeInTheDocument();
  });

  it('creates a Sticky with the shared editor and closes the popup', async () => {
    const user = userEvent.setup();
    renderPopup();

    await screen.findByDisplayValue('Kế hoạch tháng 6');
    await user.click(screen.getByRole('button', { name: 'Tạo sticky mới' }));
    await user.type(screen.getByLabelText('Tiêu đề ghi chú'), 'Chuẩn bị demo');
    await user.type(screen.getByLabelText('Nội dung ghi chú'), 'Kiểm tra nội dung trình bày');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    expect(driveSyncScheduler).toHaveBeenCalled();
    expect(Math.max(...driveSyncScheduler.mock.invocationCallOrder)).toBeLessThan(
      closePopup.mock.invocationCallOrder[0],
    );
    expect(closePopup).toHaveBeenCalledOnce();
  });

  it('uses a compact shared-editor header without a back control', async () => {
    renderPopup();

    expect(await screen.findByAltText('MochiNote')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Quay lại danh sách ghi chú' })).not.toBeInTheDocument();
  });

  it('keeps a new draft selected when the previous Sticky finishes autosaving', async () => {
    const user = userEvent.setup();
    renderPopup();

    const title = await screen.findByDisplayValue('Kế hoạch tháng 6');
    await user.type(title, ' đang sửa');
    await user.click(screen.getByRole('button', { name: 'Tạo sticky mới' }));

    await waitFor(() => expect(screen.getByLabelText('Tiêu đề ghi chú')).toHaveValue(''));
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    expect(driveSyncScheduler).toHaveBeenCalled();
    expect(screen.getByText(/l.u c.c b./i)).toBeVisible();
    expect(screen.getByLabelText('Tiêu đề ghi chú')).toHaveValue('');
  });

  it('loads a recent Sticky into the popup editor', async () => {
    const user = userEvent.setup();
    renderPopup();

    await screen.findByDisplayValue('Kế hoạch tháng 6');
    await user.click(screen.getByRole('button', { name: /Ý tưởng nội dung/ }));

    expect(screen.getByLabelText('Tiêu đề ghi chú')).toHaveValue('Ý tưởng nội dung');
  });
});
