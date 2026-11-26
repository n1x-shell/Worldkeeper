import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/index.css';
import { watchForErrors } from './lib/report';
import { AppSafetyNet } from './components/Help';

// What goes wrong in the page is written into the app's log on this computer (nothing is sent anywhere else).
watchForErrors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppSafetyNet>
      <App />
    </AppSafetyNet>
  </StrictMode>,
);
