import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: [],
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    name: 'MochiNote',
    description: 'Ghi chú và quản lý công việc ngay bên cạnh trang bạn đang xem.',
    version: '0.1.0',
    minimum_chrome_version: '114',
    permissions: ['sidePanel', 'storage'],
    action: {
      default_title: 'Mở MochiNote',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
