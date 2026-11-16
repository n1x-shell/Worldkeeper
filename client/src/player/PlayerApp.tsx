import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { apiSource, type PlayerSource } from './source';
import { PlayerProvider } from './context';
import { PlayerLayout } from './PlayerLayout';
import { PlayerCalendar, PlayerHandouts, PlayerRegions } from './LivePlay';
import { PlayerBrowse, PlayerEntry, PlayerHome, PlayerQuests, PlayerRealm, PlayerRecaps, PlayerSearch, PlayerStanding, PlayerTreasure } from './PlayerPages';

// Pages that pull in big libraries (the map) or are rarely opened load only when first visited.
const MapExplorer = lazy(() => import('./MapExplorer').then((m) => ({ default: m.MapExplorer })));
const CharacterBuilder = lazy(() => import('./CharacterBuilder').then((m) => ({ default: m.CharacterBuilder })));
const PlayerFactionWeb = lazy(() => import('./WebAndOmens').then((m) => ({ default: m.PlayerFactionWeb })));
const PlayerOmens = lazy(() => import('./WebAndOmens').then((m) => ({ default: m.PlayerOmens })));
const PlayerPrint = lazy(() => import('./PlayerPrint').then((m) => ({ default: m.PlayerPrint })));
const Later = ({ children }: { children: ReactNode }) => <Suspense fallback={<p className="text-dim text-sm">Loading…</p>}>{children}</Suspense>;

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
          <Route
            path="maps"
            element={
              <Later>
                <MapExplorer />
              </Later>
            }
          />
          <Route
            path="maps/:id"
            element={
              <Later>
                <MapExplorer />
              </Later>
            }
          />
          <Route path="quests" element={<PlayerQuests />} />
          <Route path="recaps" element={<PlayerRecaps />} />
          <Route path="standing" element={<PlayerStanding />} />
          <Route path="treasure" element={<PlayerTreasure />} />
          <Route path="handouts" element={<PlayerHandouts />} />
          <Route path="calendar" element={<PlayerCalendar />} />
          <Route path="regions" element={<PlayerRegions />} />
          <Route
            path="factions-web"
            element={
              <Later>
                <PlayerFactionWeb />
              </Later>
            }
          />
          <Route
            path="print"
            element={
              <Later>
                <PlayerPrint />
              </Later>
            }
          />
          <Route
            path="omens"
            element={
              <Later>
                <PlayerOmens />
              </Later>
            }
          />
          <Route
            path="builder"
            element={
              <Later>
                <CharacterBuilder />
              </Later>
            }
          />
          <Route path="journal" element={<Navigate to={`${base}/quests`} replace />} />
          <Route path="*" element={<PlayerHome />} />
        </Route>
      </Routes>
    </PlayerProvider>
  );
}
