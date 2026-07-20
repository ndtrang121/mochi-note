import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

// This public key pins the unpacked extension ID; it is not a signing secret.
const STABLE_EXTENSION_PUBLIC_KEY = [
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvUN4aZeu6u0MpoY5luqmxBsAd3wKENH4SpQ8',
  'XoXu68PYB3BOd7Bk5kdocAHCnWlaTVW/sPlgaJDUVUzRqFpSZxZQLeLI6BCIEKIMh/j+bJR213cuqKwxP',
  'Xb1r9rSOMVwzK6qOU7hQKFiptK9MlbY75R/L0hT08nqEG1i0/4/XFAF86uYxc8d7tppe3khoAH+ztGi',
  'cie2lzavqE06Qs0KKH4/sOfwyL9TnlOUfZAoHBtQl7sJs4mINmV/NMuvZtykd51BTu5zF9/fCFqPPFR',
  'eLfjwZBW9NKmiEr8ChYODXRPTZ5bfYMvSR84pyJ3JHF/TMHPaIWHPeISmAhsumg7xmwIDAQAB',
].join('');

export default defineConfig({
  modules: [],
  vite: () => ({
    plugins: [react()],
  }),
  manifest: {
    key: STABLE_EXTENSION_PUBLIC_KEY,
    name: 'MochiNote',
    description: 'Ghi chú và quản lý công việc ngay bên cạnh trang bạn đang xem.',
    version: '0.1.0',
    minimum_chrome_version: '114',
    permissions: [
      'activeTab',
      'alarms',
      'contextMenus',
      'notifications',
      'sidePanel',
      'scripting',
      'storage',
    ],
    icons: {
      16: 'brand/mochi-mascot.png',
      32: 'brand/mochi-mascot.png',
      48: 'brand/mochi-mascot.png',
      128: 'brand/mochi-mascot.png',
    },
    action: {
      default_title: 'Mở MochiNote',
      default_icon: {
        16: 'brand/mochi-mascot.png',
        32: 'brand/mochi-mascot.png',
      },
    },
    commands: {
      'open-quick-capture': {
        description: 'Mở ghi chú nhanh MochiNote',
        suggested_key: {
          default: 'Ctrl+Shift+M',
          mac: 'MacCtrl+Shift+M',
        },
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
