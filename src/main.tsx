import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/manrope';
import './index.css';

// Clear the old live font preview on hot reload; all typography now comes from CSS.
document.documentElement.style.removeProperty('--ui-font');

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
