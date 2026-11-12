import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installAiDevHandle } from '@/ai';
import { ContentValidationError, getContent } from '@/content';
import { ui } from '@/i18n';
import { App } from './App';
import './tokens.css';
import './styles.css';
import './v2.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('找不到 #root');

try {
  getContent();
  installAiDevHandle();
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (error) {
  const message = error instanceof ContentValidationError ? error.message : String(error);
  rootElement.textContent = `${ui.errors.contentInvalid}\n${message}`;
  rootElement.setAttribute('role', 'alert');
  throw error;
}
