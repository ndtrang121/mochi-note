import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { SidePanelApp } from '../../src/app/SidePanelApp';
import '../../src/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing side panel root element.');
}

createRoot(root).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
);
