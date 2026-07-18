import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PopupApp } from '../../src/app/PopupApp';
import '../../src/styles/index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing popup root element.');
}

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
