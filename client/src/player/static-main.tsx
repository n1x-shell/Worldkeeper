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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing: static hosts (GitHub Pages) have no server-side route fallback. */}
    <HashRouter>
      <PlayerApp source={source} base="" />
    </HashRouter>
  </StrictMode>,
);
