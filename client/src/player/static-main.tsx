/**
 * Entry point of the published Player Handbook (e.g. GitHub Pages). It contains only the player view and reads a
 * published snapshot file; there is no server and no DM code in this build.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { PlayerApp } from './PlayerApp';
import { staticSource } from './source';
import '../styles/index.css';

const source = staticSource('data/player.json', 'uploads/');

// Keep the handbook on the device for use with no signal (see public/sw.js). Each visit tops up the saved copy.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => reg.active?.postMessage({ type: 'precache' }))
      .catch(() => {
        /* no offline copy; the handbook still works online */
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing: static hosts (GitHub Pages) have no server-side route fallback. */}
    <HashRouter>
      <PlayerApp source={source} base="" />
    </HashRouter>
  </StrictMode>,
);
