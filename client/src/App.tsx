import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from './lib/store';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { EntityList } from './pages/EntityList';
import { EntityPage } from './pages/EntityPage';
import { DocumentsPage, NewEntity, RealmPage, SearchPage, TimelinePage, WorldOverview } from './pages/WorldPages';
import { MysteriesPage } from './pages/Mysteries';
import { AtlasPage } from './pages/Atlas';
import { GraphPage } from './pages/Graph';
import { DominionsPage, EtherealExplorer, ShardsPage, VaultsPage } from './pages/Special';
import {
  ActiveCampaign,
  AdventurePage,
  AdventuresPage,
  ArcsPage,
  CampaignsPage,
  EncountersPage,
  JournalPage,
  PartyPage,
  QuestsPage,
  SessionPage,
  SessionsPage,
} from './pages/Campaign';
import { LiveSession } from './pages/Live';
import { AgendasPage, ConditionsPage, DicePage, DmScreen, NotesPage, NpcRefPage, RulesPage, TablesPage, TrackerPage, WorldEventsPage } from './pages/DmTools';
import { BackupsPage, BrokenPage, HistoryPage, ImportExportPage, ReviewPage, SettingsPage } from './pages/Library';
import { RumoursPage } from './pages/Rumours';
import { PlayerApp } from './player/PlayerApp';
import { PublishPage } from './pages/Publish';

function Page({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/player/*" element={<PlayerApp />} />
        <Route
          element={
            <AppStateProvider>
              <Layout />
            </AppStateProvider>
          }
        >
          <Route index element={<Page><Dashboard /></Page>} />
          <Route path="world" element={<Page><WorldOverview /></Page>} />
          <Route path="atlas" element={<Page><AtlasPage /></Page>} />
          <Route path="atlas/:mapId" element={<Page><AtlasPage /></Page>} />
          <Route path="realm/:realm" element={<Page><RealmPage /></Page>} />
          <Route path="timeline" element={<Page><TimelinePage /></Page>} />
          <Route path="browse/:group" element={<Page><EntityList /></Page>} />
          <Route path="mysteries" element={<Page><MysteriesPage /></Page>} />
          <Route path="graph" element={<Page><GraphPage /></Page>} />
          <Route path="e/:id" element={<Page><EntityPage /></Page>} />
          <Route path="new" element={<Page><NewEntity /></Page>} />
          <Route path="search" element={<Page><SearchPage /></Page>} />
          <Route path="documents" element={<Page><DocumentsPage /></Page>} />
          <Route path="aetheris/shards" element={<Page><ShardsPage /></Page>} />
          <Route path="aetheris/dominions" element={<Page><DominionsPage /></Page>} />
          <Route path="kaelmar/vaults" element={<Page><VaultsPage /></Page>} />
          <Route path="ethereal/explorer" element={<Page><EtherealExplorer /></Page>} />
          <Route path="campaigns" element={<Page><CampaignsPage /></Page>} />
          <Route path="campaign" element={<Page><ActiveCampaign /></Page>} />
          <Route path="campaign/adventures" element={<Page><AdventuresPage /></Page>} />
          <Route path="campaign/arcs" element={<Page><ArcsPage /></Page>} />
          <Route path="campaign/quests" element={<Page><QuestsPage /></Page>} />
          <Route path="campaign/sessions" element={<Page><SessionsPage /></Page>} />
          <Route path="campaign/encounters" element={<Page><EncountersPage /></Page>} />
          <Route path="campaign/party" element={<Page><PartyPage /></Page>} />
          <Route path="campaign/journal" element={<Page><JournalPage /></Page>} />
          <Route path="campaign/live" element={<Page><LiveSession /></Page>} />
          <Route path="adventure/:id" element={<Page><AdventurePage /></Page>} />
          <Route path="session/:id" element={<Page><SessionPage /></Page>} />
          <Route path="dm" element={<Page><DmScreen /></Page>} />
          <Route path="tracker" element={<Page><TrackerPage /></Page>} />
          <Route path="tracker/:encounterId" element={<Page><TrackerPage /></Page>} />
          <Route path="conditions" element={<Page><ConditionsPage /></Page>} />
          <Route path="npc-ref" element={<Page><NpcRefPage /></Page>} />
          <Route path="agendas" element={<Page><AgendasPage /></Page>} />
          <Route path="rumours" element={<Page><RumoursPage /></Page>} />
          <Route path="world-events" element={<Page><WorldEventsPage /></Page>} />
          <Route path="tables" element={<Page><TablesPage /></Page>} />
          <Route path="dice" element={<Page><DicePage /></Page>} />
          <Route path="rules" element={<Page><RulesPage /></Page>} />
          <Route path="notes" element={<Page><NotesPage /></Page>} />
          <Route path="import" element={<Page><ImportExportPage /></Page>} />
          <Route path="review" element={<Page><ReviewPage /></Page>} />
          <Route path="broken" element={<Page><BrokenPage /></Page>} />
          <Route path="history" element={<Page><HistoryPage /></Page>} />
          <Route path="backups" element={<Page><BackupsPage /></Page>} />
          <Route path="settings" element={<Page><SettingsPage /></Page>} />
          <Route path="publish" element={<Page><PublishPage /></Page>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
