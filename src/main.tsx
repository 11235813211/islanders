import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { reportClientErrors } from './lib/errors';
import './styles.css';

reportClientErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
