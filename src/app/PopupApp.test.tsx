import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PopupApp } from './PopupApp';

let databaseCounter = 0;

function renderPopup(props: React.ComponentProps<typeof PopupApp> = {}) {
  databaseCounter += 1;
  return render(
    <PopupApp databaseName={`popup-test-${databaseCounter}`} {...props} />,
  );
}

describe('PopupApp', () => {
  it('renders the reference quick actions and recent notes', () => {
    renderPopup();

    expect(screen.getByRole('button', { name: 'Ghi chú nhanh' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chụp trang' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Đánh dấu' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Thu âm' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Ghi chú gần đây' })).toBeVisible();
  });

  it('creates a quick note and adds it to recent notes', async () => {
    const user = userEvent.setup();
    renderPopup();

    await screen.findByRole('heading', { level: 2, name: 'Kế hoạch tháng 6' });

    await user.click(screen.getByRole('button', { name: 'Ghi chú nhanh' }));
    await user.type(screen.getByLabelText('Ghi chú nhanh'), 'Chuẩn bị demo');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Chuẩn bị demo' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu ghi chú nhanh');
  });

  it('uses popup settings to control recent-note visibility', async () => {
    const user = userEvent.setup();
    renderPopup();

    await user.click(screen.getByRole('button', { name: 'Cài đặt popup' }));
    await user.click(screen.getByRole('checkbox', { name: 'Hiện ghi chú gần đây' }));

    expect(screen.queryByRole('heading', { level: 1, name: 'Ghi chú gần đây' })).not.toBeInTheDocument();
  });

  it('hands off to the side panel from Xem tất cả', async () => {
    const user = userEvent.setup();
    const onOpenAll = vi.fn().mockResolvedValue(true);
    renderPopup({ onOpenAll });

    await user.click(screen.getByRole('button', { name: 'Xem tất cả' }));

    expect(onOpenAll).toHaveBeenCalledOnce();
    expect(await screen.findByRole('status')).toHaveTextContent('Đã mở MochiNote');
  });

  it('loads active-page metadata and captures the visible viewport through the browser adapter', async () => {
    const user = userEvent.setup();
    const capturePage = vi.fn().mockResolvedValue({ noteId: 'note-capture', ok: true });
    const loadActivePage = vi.fn().mockResolvedValue({
      pageTitle: 'Tài liệu MochiNote',
      tabId: 42,
      url: 'https://example.com/mochi',
      windowId: 7,
    });
    renderPopup({ capturePage, loadActivePage });

    expect(await screen.findByText('Tài liệu MochiNote')).toBeVisible();
    expect(screen.getByText('example.com')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Chụp trang' }));

    expect(capturePage).toHaveBeenCalledWith('visible');
    expect(await screen.findByRole('status')).toHaveTextContent('Đã chụp trang hiện tại');
  });

  it('shows selected text and forwards it with a page capture', async () => {
    const user = userEvent.setup();
    const capturePage = vi.fn().mockResolvedValue({ noteId: 'note-selection', ok: true });
    const loadActivePage = vi.fn().mockResolvedValue({
      pageTitle: 'Bài viết có lựa chọn',
      selectedText: 'Đoạn văn cần lưu lại',
      tabId: 42,
      url: 'https://example.com/article',
      windowId: 7,
    });
    renderPopup({ capturePage, loadActivePage });
    expect(await screen.findByText('Đoạn văn cần lưu lại')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Chụp trang' }));
    expect(capturePage).toHaveBeenCalledWith('visible', 'Đoạn văn cần lưu lại');
  });

  it('persists a quick note across popup remounts', async () => {
    const user = userEvent.setup();
    databaseCounter += 1;
    const databaseName = `popup-persistence-${databaseCounter}`;
    const firstRender = render(<PopupApp databaseName={databaseName} />);
    await screen.findByRole('heading', { level: 2, name: 'Kế hoạch tháng 6' });
    await user.click(screen.getByRole('button', { name: 'Ghi chú nhanh' }));
    await user.type(screen.getByLabelText('Ghi chú nhanh'), 'Trang cần đọc lại');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Trang cần đọc lại' })).toBeVisible();

    firstRender.unmount();
    render(<PopupApp databaseName={databaseName} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Trang cần đọc lại' })).toBeVisible();
    });
  });
});
