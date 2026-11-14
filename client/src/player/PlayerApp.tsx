import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { apiSource, type PlayerSource } from './source';
import { PlayerProvider } from './context';
import { PlayerLayout } from './PlayerLayout';
import { PlayerBrowse, PlayerEntry, PlayerHome, PlayerQuests, PlayerRealm, PlayerRecaps, PlayerSearch } from './PlayerPages';
import { MapExplorer } from './MapExplorer';

/**
 * PLAYER VIEW. It only reads from a PlayerSource: the live player API or a published snapshot, both of which
 * contain nothing but the server's player-safe projection. It never imports DM components or DM API routes.
 *
 * `base` is the route prefix: '/player' inside the app, '' in the static handbook.
 */
export function PlayerApp({ source = apiSource, base = '/player' }: { source?: PlayerSource; base?: string }) {
  const [info, setInfo] = useState<{ appName: string; publishedAt?: string }>({ appName: 'The Worldkeeper' });
  useEffect(() => {
    void source.info().then((i) => {
      setInfo(i);
      document.title = `${i.appName} · Player Handbook`;
    });
  }, [source]);
  return (
    <PlayerProvider source={source} base={base}>
      <Routes>
        <Route element={<PlayerLayout appName={info.appName} publishedAt={info.publishedAt} />}>
          <Route index element={<PlayerHome />} />
          <Route path="browse/:group" element={<PlayerBrowse />} />
          <Route path="realm/:realm" element={<PlayerRealm />} />
          <Route path="e/:id" element={<PlayerEntry />} />
          <Route path="search" element={<PlayerSearch />} />
          <Route path="maps" element={<MapExplorer />} />
          <Route path="maps/:id" element={<MapExplorer />} />
          <Route path="quests" element={<PlayerQuests />} />
          <Route path="recaps" element={<PlayerRecaps />} />
          <Route path="journal" element={<Navigate to={`${base}/quests`} replace />} />
          <Route path="*" element={<PlayerHome />} />
        </Route>
      </Routes>
    </PlayerProvider>
  );
}
