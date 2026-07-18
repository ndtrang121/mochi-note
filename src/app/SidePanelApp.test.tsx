import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SidePanelApp } from './SidePanelApp';

describe('SidePanelApp', () => {
  it('renders Tasks as the initial screen and switches tabs', async () => {
    const user = userEvent.setup();
    render(<SidePanelApp />);

    expect(screen.getByRole('heading', { level: 1, name: 'Nhiệm vụ hôm nay' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Folders' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Quản lý thư mục' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Folders' })).toHaveAttribute('aria-current', 'page');
  });

  it('updates completion stats when a task is toggled', async () => {
    const user = userEvent.setup();
    render(<SidePanelApp />);

    expect(screen.getByTestId('completed-count')).toHaveTextContent('12 / 16');
    await user.click(
      screen.getByRole('button', {
        name: 'Đánh dấu hoàn thành: Cập nhật Design System',
      }),
    );
    expect(screen.getByTestId('completed-count')).toHaveTextContent('13 / 16');
  });

  it('adds a task through the quick-add workflow', async () => {
    const user = userEvent.setup();
    render(<SidePanelApp />);

    await user.click(screen.getByRole('button', { name: 'Thêm nhiệm vụ' }));
    await user.type(screen.getByLabelText('Nhiệm vụ mới'), 'Gửi bản kế hoạch');
    await user.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(screen.getByText('Gửi bản kế hoạch')).toBeVisible();
    expect(screen.queryByLabelText('Nhiệm vụ mới')).not.toBeInTheDocument();
  });

  it('keeps sticky filters as a controlled selected state', async () => {
    const user = userEvent.setup();
    render(<SidePanelApp />);

    await user.click(screen.getByRole('button', { name: 'Sticky' }));
    await user.click(screen.getByRole('button', { name: 'Cá nhân' }));

    expect(screen.getByRole('button', { name: 'Cá nhân' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Ý tưởng nội dung' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2, name: 'Kế hoạch tháng 6' })).not.toBeInTheDocument();
  });
});
