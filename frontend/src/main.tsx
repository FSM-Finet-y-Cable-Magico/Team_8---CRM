import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PublicSignaturePage } from './features/contracts/PublicSignaturePage';
const Root = window.location.pathname === '/firmar' ? PublicSignaturePage : App;
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
