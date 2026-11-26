import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { reportClientErrors } from './lib/errors';
import './styles.css';
// Christmas tile motion (snow, wind, lights); the active art version's.
import './art/v20/christmas/christmas.css';

reportClientErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
