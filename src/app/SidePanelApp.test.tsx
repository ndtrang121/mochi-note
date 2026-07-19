import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SidePanelApp } from './SidePanelApp';

let databaseCounter = 0;

function renderSidePanel(copyText?: (text: string) => Promise<void>) {
  databaseCounter += 1;
  return render(
    <SidePanelApp
      copyText={copyText}
      databaseName={`side-panel-test-${databaseCounter}`}
    />,
  );
}

describe('SidePanelApp', () => {
  it('renders Tasks as the initial screen and switches tabs', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    expect(screen.getByRole('heading', { level: 1, name: 'Nhiệm vụ hôm nay' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Folders' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Quản lý thư mục' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Folders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens data portability from Tasks and exports a JSON backup', async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mochi-backup');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    renderSidePanel();

    await screen.findByRole('heading', { level: 1, name: 'Nhiệm vụ hôm nay' });
    await user.click(screen.getByRole('button', { name: 'Cài đặt' }));
    expect(screen.getByRole('dialog', { name: 'Sao lưu dữ liệu' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tải file JSON' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Đã tạo bản sao lưu');
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mochi-backup');
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it('updates completion stats when a task is toggled', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    const toggle = await screen.findByRole('button', {
      name: 'Đánh dấu hoàn thành: Cập nhật Design System',
    });
    expect(screen.getByTestId('completed-count')).toHaveTextContent('1 / 5');
    await user.click(toggle);
    expect(screen.getByTestId('completed-count')).toHaveTextContent('2 / 5');
  });

  it('adds a task through the quick-add workflow', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await screen.findByText('Cập nhật Design System');
    await user.click(screen.getByRole('button', { name: 'Thêm nhiệm vụ' }));
    await user.type(screen.getByLabelText('Nhiệm vụ mới'), 'Gửi bản kế hoạch');
    await user.type(screen.getByLabelText('Thời gian'), '14:30');
    await user.selectOptions(screen.getByLabelText('Thư mục nhiệm vụ'), 'folder-work');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(screen.getByText('Gửi bản kế hoạch')).toBeVisible();
    expect(screen.queryByLabelText('Nhiệm vụ mới')).not.toBeInTheDocument();
  });

  it('persists task edit, completion, ordering, date, folder, and delete workflows', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await screen.findByText('Cập nhật Design System');
    await user.click(screen.getByRole('button', { name: 'Thêm nhiệm vụ' }));
    await user.type(screen.getByLabelText('Nhiệm vụ mới'), 'Gửi kế hoạch QA');
    await user.type(screen.getByLabelText('Thời gian'), '15:15');
    await user.selectOptions(screen.getByLabelText('Thư mục nhiệm vụ'), 'folder-personal');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText('Gửi kế hoạch QA')).toBeVisible();
    expect(screen.getByText('15:15')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tùy chọn nhiệm vụ Gửi kế hoạch QA' }));
    await user.click(screen.getByRole('button', { name: 'Sửa Gửi kế hoạch QA' }));
    await user.clear(screen.getByLabelText('Tên nhiệm vụ'));
    await user.type(screen.getByLabelText('Tên nhiệm vụ'), 'Kế hoạch QA đã sửa');
    await user.selectOptions(screen.getByLabelText('Thư mục nhiệm vụ'), 'folder-work');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(screen.getByText('Kế hoạch QA đã sửa')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tùy chọn nhiệm vụ Kế hoạch QA đã sửa' }));
    await user.click(screen.getByRole('button', { name: 'Di chuyển Kế hoạch QA đã sửa lên' }));
    const orderedTasks = screen.getAllByTestId('task-row');
    expect(orderedTasks.at(-2)).toHaveTextContent('Kế hoạch QA đã sửa');

    await user.click(
      screen.getByRole('button', { name: 'Đánh dấu hoàn thành: Kế hoạch QA đã sửa' }),
    );
    expect(
      screen.getByRole('button', { name: 'Đánh dấu chưa hoàn thành: Kế hoạch QA đã sửa' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'T7, ngày 18' }));
    expect(screen.queryByText('Kế hoạch QA đã sửa')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có nhiệm vụ trong ngày này.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'CN, ngày 19' }));
    expect(await screen.findByText('Kế hoạch QA đã sửa')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Folders' }));
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(await screen.findByText('Kế hoạch QA đã sửa')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Tùy chọn nhiệm vụ Kế hoạch QA đã sửa' }));
    await user.click(screen.getByRole('button', { name: 'Xóa Kế hoạch QA đã sửa' }));
    await waitFor(() => {
      expect(screen.queryByText('Kế hoạch QA đã sửa')).not.toBeInTheDocument();
    });
  });

  it('filters repository-backed sticky notes by folder', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await screen.findByRole('heading', { level: 2, name: 'Kế hoạch tháng 6' });
    await user.click(screen.getByRole('button', { name: 'Cá nhân' }));

    expect(screen.getByRole('button', { name: 'Cá nhân' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Ý tưởng nội dung' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Kế hoạch tháng 6' }),
    ).not.toBeInTheDocument();
  });

  it('searches note content without accents and combines folder, color, and favorite filters', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await user.click(screen.getByRole('button', { name: 'Notes' }));
    await screen.findByText('Kế hoạch tháng 6');
    await user.click(screen.getByRole('button', { name: 'Tìm kiếm ghi chú' }));

    await user.type(screen.getByLabelText('Từ khóa tìm kiếm'), 'y tuong');
    expect(screen.getByText('1 ghi chú phù hợp')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Xem kết quả' }));
    expect(screen.getByText('Ý tưởng nội dung')).toBeVisible();
    expect(screen.queryByText('Kế hoạch tháng 6')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lọc ghi chú' }));
    await user.click(screen.getByRole('button', { name: 'Đặt lại' }));
    await user.selectOptions(screen.getByLabelText('Lọc theo thư mục'), 'folder-work');
    await user.selectOptions(screen.getByLabelText('Lọc theo màu'), 'blue');
    await user.click(screen.getByRole('button', { name: 'Yêu thích' }));
    expect(screen.getByText('1 ghi chú phù hợp')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Xem kết quả' }));

    expect(screen.getByText('Meeting với client')).toBeVisible();
    expect(screen.queryByText('Kế hoạch tháng 6')).not.toBeInTheDocument();
  });

  it('creates, updates, and persists a browser-local note reminder', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await user.click(screen.getByRole('button', { name: 'Notes' }));
    await screen.findByText('Kế hoạch tháng 6');
    await user.click(screen.getByRole('button', { name: 'Thêm ghi chú' }));
    await user.type(screen.getByLabelText('Tiêu đề ghi chú'), 'Nhắc lịch phát hành');
    await user.type(screen.getByLabelText('Nội dung ghi chú'), 'Kiểm tra gói extension');
    await user.click(screen.getByLabelText('Bật nhắc nhở'));
    await user.type(screen.getByLabelText('Ngày và giờ nhắc nhở'), '2099-01-02T09:30');
    await user.selectOptions(screen.getByLabelText('Lặp lại nhắc nhở'), 'FREQ=WEEKLY');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    expect(await screen.findByText('Nhắc nhở')).toBeVisible();
    expect(screen.getByText('Hằng tuần')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sửa Nhắc lịch phát hành' }));
    expect(screen.getByLabelText('Bật nhắc nhở')).toBeChecked();
    await user.selectOptions(screen.getByLabelText('Lặp lại nhắc nhở'), 'FREQ=DAILY');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    expect(await screen.findByText('Hằng ngày')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Quay lại danh sách ghi chú' }));
    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    await user.click(await screen.findByRole('button', { name: /Nhắc lịch phát hành/ }));
    expect(await screen.findByText('Hằng ngày')).toBeVisible();
  });

  it('creates, edits, reorders, and deletes folders', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await user.click(screen.getByRole('button', { name: 'Folders' }));
    await screen.findByRole('heading', { level: 2, name: 'Công việc' });
    await user.click(screen.getByRole('button', { name: 'Thêm thư mục' }));
    await user.type(screen.getByLabelText('Tên thư mục'), 'Du lịch');
    await user.selectOptions(screen.getByLabelText('Màu thư mục'), 'blue');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Du lịch' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tùy chọn thư mục Du lịch' }));
    await user.click(screen.getByRole('button', { name: 'Sửa Du lịch' }));
    await user.clear(screen.getByLabelText('Tên thư mục'));
    await user.type(screen.getByLabelText('Tên thư mục'), 'Kỳ nghỉ');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Kỳ nghỉ' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tùy chọn thư mục Kỳ nghỉ' }));
    await user.click(screen.getByRole('button', { name: 'Di chuyển Kỳ nghỉ lên' }));
    const folderCards = screen.getAllByTestId('folder-card');
    expect(folderCards.at(-2)).toHaveTextContent('Kỳ nghỉ');

    await user.click(screen.getByRole('button', { name: 'Tùy chọn thư mục Kỳ nghỉ' }));
    await user.click(screen.getByRole('button', { name: 'Xóa Kỳ nghỉ' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: 'Kỳ nghỉ' })).not.toBeInTheDocument();
    });
  });

  it('supports deeply nested folders and cascade deletion', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await user.click(screen.getByRole('button', { name: 'Folders' }));
    await screen.findByRole('heading', { level: 2, name: 'Công việc' });

    async function addChild(parentName: string, childName: string) {
      await user.click(
        screen.getByRole('button', { name: `Tùy chọn thư mục ${parentName}` }),
      );
      await user.click(
        screen.getByRole('button', { name: `Thêm thư mục con ${parentName}` }),
      );
      await user.type(screen.getByLabelText('Tên thư mục'), childName);
      await user.click(screen.getByRole('button', { name: 'Thêm' }));
      return screen.findByRole('heading', { level: 2, name: childName });
    }

    await addChild('Công việc', 'Dự án A');
    await addChild('Dự án A', 'Giai đoạn 1');
    await addChild('Giai đoạn 1', 'Thiết kế');
    await addChild('Thiết kế', 'Wireframe');

    expect(
      screen.getByRole('heading', { level: 2, name: 'Dự án A' }).closest('[data-testid="folder-card"]'),
    ).toHaveAttribute('data-depth', '1');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Giai đoạn 1' }).closest('[data-testid="folder-card"]'),
    ).toHaveAttribute('data-depth', '2');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Wireframe' }).closest('[data-testid="folder-card"]'),
    ).toHaveAttribute('data-depth', '4');

    await user.click(screen.getByRole('button', { name: 'Tùy chọn thư mục Dự án A' }));
    await user.click(screen.getByRole('button', { name: 'Xóa Dự án A' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: 'Dự án A' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 2, name: 'Wireframe' })).not.toBeInTheDocument();
    });
  });

  it('persists create, favorite, edit, and delete operations on sticky notes', async () => {
    const user = userEvent.setup();
    renderSidePanel();

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await screen.findByRole('heading', { level: 2, name: 'Kế hoạch tháng 6' });
    await user.click(screen.getByRole('button', { name: 'Thêm Sticker' }));
    await user.type(screen.getByLabelText('Tiêu đề Sticker'), 'Danh sách phát hành');
    await user.type(screen.getByLabelText('Nội dung Sticker'), 'Viết changelog\nĐóng gói');
    await user.selectOptions(screen.getByLabelText('Thư mục'), 'folder-work');
    await user.click(screen.getByRole('button', { name: 'Tạo Sticker' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Danh sách phát hành' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Yêu thích Danh sách phát hành' }));
    expect(
      screen.getByRole('button', { name: 'Bỏ yêu thích Danh sách phát hành' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Tùy chọn Danh sách phát hành' }));
    await user.click(screen.getByRole('button', { name: 'Sửa Danh sách phát hành' }));
    await user.clear(screen.getByLabelText('Tiêu đề Sticker'));
    await user.type(screen.getByLabelText('Tiêu đề Sticker'), 'Checklist phát hành');
    await user.click(screen.getByRole('button', { name: 'Lưu Sticker' }));

    await user.click(screen.getByRole('button', { name: 'Tasks' }));
    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Checklist phát hành' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Tùy chọn Checklist phát hành' }));
    await user.click(screen.getByRole('button', { name: 'Xóa Checklist phát hành' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { level: 2, name: 'Checklist phát hành' }),
      ).not.toBeInTheDocument();
    });
  });

  it('creates, formats, persists, copies, edits, and deletes a note', async () => {
    const user = userEvent.setup();
    const copyText = vi.fn((text: string) =>
      text ? Promise.resolve() : Promise.reject(new Error('Missing note text')),
    );
    renderSidePanel(copyText);

    await user.click(screen.getByRole('button', { name: 'Notes' }));
    await screen.findByText('Kế hoạch tháng 6');
    await user.click(screen.getByRole('button', { name: 'Thêm ghi chú' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Ghi chú mới' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tiêu đề ghi chú'), 'Kế hoạch phát hành QA');
    await user.type(screen.getByLabelText('Nội dung ghi chú'), 'Kiểm thử lưu và định dạng');
    await user.click(screen.getByRole('button', { name: 'Đậm' }));
    await user.click(screen.getByRole('button', { name: 'Thêm mục checklist' }));
    await user.type(screen.getByLabelText('Nội dung mục checklist'), 'Viết changelog');
    await user.click(screen.getByRole('button', { name: 'Thêm mục checklist' }));
    const checklistInputs = screen.getAllByLabelText('Nội dung mục checklist');
    await user.type(checklistInputs[1], 'Đóng gói extension');
    await user.selectOptions(screen.getByLabelText('Thư mục'), 'folder-work');
    await user.click(screen.getByRole('button', { name: 'Màu Xanh lam' }));
    await user.click(screen.getByRole('button', { name: 'Họa tiết Chấm bi' }));
    await user.click(screen.getByRole('button', { name: 'Ghim' }));
    await user.click(screen.getByRole('button', { name: 'Yêu thích' }));
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Chi tiết ghi chú' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Kế hoạch phát hành QA' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ghim' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Bỏ yêu thích Kế hoạch phát hành QA' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Viết changelog' }));
    expect(screen.getByRole('button', { name: 'Viết changelog' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Sao chép' }));
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('Viết changelog'));
    expect(screen.getByRole('status')).toHaveTextContent('Đã sao chép ghi chú');

    await user.click(screen.getByRole('button', { name: 'Sửa Kế hoạch phát hành QA' }));
    await user.clear(screen.getByLabelText('Tiêu đề ghi chú'));
    await user.type(screen.getByLabelText('Tiêu đề ghi chú'), 'Checklist phát hành QA');
    await user.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Checklist phát hành QA' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Quay lại danh sách ghi chú' }));
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
    expect(await screen.findByText('Checklist phát hành QA')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Checklist phát hành QA/ }));
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(screen.getByText('Xóa ghi chú này?')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Xóa ghi chú' }));

    await waitFor(() => {
      expect(screen.queryByText('Checklist phát hành QA')).not.toBeInTheDocument();
    });
  });
});
