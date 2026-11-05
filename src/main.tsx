import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/geist';
import { applyFont, selectedFont } from './lib/fonts';
import './index.css';

applyFont(selectedFont());

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
