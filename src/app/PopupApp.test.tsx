import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openMochiDatabase } from '../db/database';
import { createSeedFixtures, seedDatabase } from '../db/seed';
import { PopupApp } from './PopupApp';

let databaseCounter = 0;

function renderPopup(databaseName = `popup-test-${++databaseCounter}`) {
  return render(<PopupApp databaseInitializer={seedDatabase} databaseName={databaseName} />);
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

  it('opens the most recently updated Sticky in the shared editor', async () => {
    renderPopup();

    expect(await screen.findByDisplayValue('Kế hoạch tháng 6')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chụp trang' })).not.toBeInTheDocument();
  });

  it('resumes the latest Sticky when data arrives after an initially empty account cache', async () => {
    const databaseName = `popup-late-data-${++databaseCounter}`;
    const emptyInitializer = () => Promise.resolve(undefined);
    const view = render(
      <PopupApp databaseInitializer={emptyInitializer} databaseName={databaseName} />,
    );

    await waitFor(() => expect(document.querySelector('#note-title')).toBeInstanceOf(HTMLInputElement));
    expect(document.querySelector('#note-title')).toHaveValue('');

    const seedExistingDatabase = async (database: Awaited<ReturnType<typeof openMochiDatabase>>) => {
      const fixtures = createSeedFixtures();
      await Promise.all([
        ...fixtures.folders.map((folder) => database.put('folders', folder)),
        ...fixtures.notes.map((note) => database.put('notes', note)),
        ...fixtures.reminders.map((reminder) => database.put('reminders', reminder)),
        ...fixtures.tasks.map((task) => database.put('tasks', task)),
      ]);
    };
    view.rerender(<PopupApp databaseInitializer={seedExistingDatabase} databaseName={databaseName} />);

    await waitFor(() => expect(document.querySelector('#note-title')).not.toHaveValue(''));
  });
  it('creates a Sticky with the shared editor and closes the popup', async () => {
    const user = userEvent.setup();
    renderPopup();

    await screen.findByDisplayValue('Kế hoạch tháng 6');
    await user.click(screen.getByRole('button', { name: 'Tạo sticky mới' }));
    await user.type(screen.getByLabelText('Tiêu đề ghi chú'), 'Chuẩn bị demo');
    await user.type(screen.getByLabelText('Nội dung ghi chú'), 'Kiểm tra nội dung trình bày');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    await waitFor(() => expect(closePopup).toHaveBeenCalledOnce());
  });

  it('uses a compact shared-editor header without a back control', async () => {
    renderPopup();

    expect(await screen.findByAltText('MochiNote')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Quay lại danh sách ghi chú' })).not.toBeInTheDocument();
  });

  it('autosaves one settled edit only once', async () => {
    const user = userEvent.setup();
    const databaseName = `popup-autosave-once-${++databaseCounter}`;
    renderPopup(databaseName);

    const title = await screen.findByDisplayValue('Kế hoạch tháng 6');
    await user.type(title, ' mới');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toHaveAttribute('title', 'Đã lưu');
    }, { timeout: 2_000 });

    const database = await openMochiDatabase(databaseName);
    const firstSaved = await database.get('notes', 'note-month-plan');
    await new Promise((resolve) => window.setTimeout(resolve, 1_300));
    const afterSettling = await database.get('notes', 'note-month-plan');
    database.close();

    expect(firstSaved?.updatedAt).toBeTruthy();
    expect(afterSettling?.updatedAt).toBe(firstSaved?.updatedAt);
  });

  it('keeps a new draft selected when the previous Sticky finishes autosaving', async () => {
    const user = userEvent.setup();
    renderPopup();

    const title = await screen.findByDisplayValue('Kế hoạch tháng 6');
    await user.type(title, ' đang sửa');
    await user.click(screen.getByRole('button', { name: 'Tạo sticky mới' }));

    await waitFor(() => expect(screen.getByLabelText('Tiêu đề ghi chú')).toHaveValue(''));
    await new Promise((resolve) => window.setTimeout(resolve, 700));
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
