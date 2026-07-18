import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ScaffoldSurface } from '../../src/app/ScaffoldSurface';
import '../../src/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing popup root element.');
}

createRoot(root).render(
  <StrictMode>
    <ScaffoldSurface
      title="MochiNote"
      description="Popup ghi chú nhanh đã được kết nối với extension."
    />
  </StrictMode>,
);
