import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalApp } from './PortalApp';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <PortalApp />
  </StrictMode>,
);
