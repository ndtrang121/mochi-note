import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ScaffoldSurface } from '../../src/app/ScaffoldSurface';
import '../../src/styles/scaffold.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing side panel root element.');
}

createRoot(root).render(
  <StrictMode>
    <ScaffoldSurface
      eyebrow="Side panel"
      title="MochiNote"
      description="Không gian ghi chú chính đã sẵn sàng để xây dựng theo thiết kế tham chiếu."
    />
  </StrictMode>,
);
