import { LibraryPicker } from './components/Libraries';
import { lazy, Suspense, type ComponentType } from 'react';
import { RemoteGate } from './components/RemoteAccess';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStateProvider } from './lib/store';
import { Layout } from './components/Layout';
import { ErrorBoundary, Loading } from './components/ui';
import { screenErrorActions } from './components/Help';
import { reportScreenError } from './lib/report';
import { Dashboard } from './pages/Dashboard';

/**
 * Each page loads the first time it opens, so the app's first page stays small (the World Dashboard is in the main
 * bundle, as the page most people open first).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <M,>(load: () => Promise<M>, name: keyof M) => lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType<any> })));
const FactionWebPage = page(() => import('./pages/ReturnAndWeb'), 'FactionWebPage');
const ReturnPage = page(() => import('./pages/ReturnAndWeb'), 'ReturnPage');
const NamesPage = page(() => import('./pages/Names'), 'NamesPage');
const GeneratorsPage = page(() => import('./pages/Generators'), 'GeneratorsPage');
const PlacePlanPage = page(() => import('./pages/PlacePlan'), 'PlacePlanPage');
const StandingPage = page(() => import('./pages/Standing'), 'StandingPage');
const TreasurePage = page(() => import('./pages/Treasure'), 'TreasurePage');
const BooksPage = page(() => import('./pages/Books'), 'BooksPage');
const HandoutsPage = page(() => import('./pages/Handouts'), 'HandoutsPage');
const BastionsPage = page(() => import('./pages/Bastions'), 'BastionsPage');
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage');
const PartyExportPage = page(() => import('./pages/PartyExport'), 'PartyExportPage');
const RegionsPage = page(() => import('./pages/Regions'), 'RegionsPage');
const EntityList = page(() => import('./pages/EntityList'), 'EntityList');
const EntityPage = page(() => import('./pages/EntityPage'), 'EntityPage');
const NewRecord = page(() => import('./pages/NewRecord'), 'NewRecord');
const StartWorld = page(() => import('./pages/StartWorld'), 'StartWorld');
const DocumentsPage = page(() => import('./pages/WorldPages'), 'DocumentsPage');
const RealmPage = page(() => import('./pages/WorldPages'), 'RealmPage');
const SearchPage = page(() => import('./pages/WorldPages'), 'SearchPage');
const TimelinePage = page(() => import('./pages/WorldPages'), 'TimelinePage');
const WorldOverview = page(() => import('./pages/WorldPages'), 'WorldOverview');
const MysteriesPage = page(() => import('./pages/Mysteries'), 'MysteriesPage');
const AtlasExplorer = page(() => import('./pages/AtlasExplorer'), 'AtlasExplorer');
const AtlasPage = page(() => import('./pages/Atlas'), 'AtlasPage');
const GraphPage = page(() => import('./pages/Graph'), 'GraphPage');
const DominionsPage = page(() => import('./pages/Special'), 'DominionsPage');
const EtherealExplorer = page(() => import('./pages/Special'), 'EtherealExplorer');
const ShardsPage = page(() => import('./pages/Special'), 'ShardsPage');
const VaultsPage = page(() => import('./pages/Special'), 'VaultsPage');
const ActiveCampaign = page(() => import('./pages/Campaign'), 'ActiveCampaign');
const AdventurePage = page(() => import('./pages/Campaign'), 'AdventurePage');
const AdventuresPage = page(() => import('./pages/Campaign'), 'AdventuresPage');
const ArcsPage = page(() => import('./pages/Campaign'), 'ArcsPage');
const CampaignsPage = page(() => import('./pages/Campaign'), 'CampaignsPage');
const EncountersPage = page(() => import('./pages/Campaign'), 'EncountersPage');
const JournalPage = page(() => import('./pages/Campaign'), 'JournalPage');
const PartyPage = page(() => import('./pages/Campaign'), 'PartyPage');
const QuestsPage = page(() => import('./pages/Campaign'), 'QuestsPage');
const SessionPage = page(() => import('./pages/Campaign'), 'SessionPage');
const SessionsPage = page(() => import('./pages/Campaign'), 'SessionsPage');
const LiveSession = page(() => import('./pages/Live'), 'LiveSession');
const AgendasPage = page(() => import('./pages/DmTools'), 'AgendasPage');
const ConditionsPage = page(() => import('./pages/DmTools'), 'ConditionsPage');
const DicePage = page(() => import('./pages/DmTools'), 'DicePage');
const DmScreen = page(() => import('./pages/DmTools'), 'DmScreen');
const NotesPage = page(() => import('./pages/DmTools'), 'NotesPage');
const NpcRefPage = page(() => import('./pages/DmTools'), 'NpcRefPage');
const RulesPage = page(() => import('./pages/DmTools'), 'RulesPage');
const TablesPage = page(() => import('./pages/DmTools'), 'TablesPage');
const TrackerPage = page(() => import('./pages/DmTools'), 'TrackerPage');
const WorldEventsPage = page(() => import('./pages/DmTools'), 'WorldEventsPage');
const QuickReferencePage = page(() => import('./pages/QuickReference'), 'QuickReferencePage');
const BackupsPage = page(() => import('./pages/Library'), 'BackupsPage');
const LibrariesPage = page(() => import('./pages/Libraries'), 'LibrariesPage');
const BrokenPage = page(() => import('./pages/Library'), 'BrokenPage');
const ConsistencyPage = page(() => import('./pages/Library'), 'ConsistencyPage');
const HistoryPage = page(() => import('./pages/Library'), 'HistoryPage');
const ImportExportPage = page(() => import('./pages/Library'), 'ImportExportPage');
const OpenQuestionsPage = page(() => import('./pages/Library'), 'OpenQuestionsPage');
const ReviewPage = page(() => import('./pages/Library'), 'ReviewPage');
const TagsPage = page(() => import('./pages/BulkTools'), 'TagsPage');
const FindReplacePage = page(() => import('./pages/BulkTools'), 'FindReplacePage');
const SettingsPage = page(() => import('./pages/Library'), 'SettingsPage');
const RumoursPage = page(() => import('./pages/Rumours'), 'RumoursPage');
const RealmsPage = page(() => import('./pages/Realms'), 'RealmsPage');
const TemplatesPage = page(() => import('./pages/Templates'), 'TemplatesPage');
const WorldbooksPage = page(() => import('./pages/Worldbooks'), 'WorldbooksPage');
const PlayerApp = page(() => import('./player/PlayerApp'), 'PlayerApp');
const CampaignHandbook = page(() => import('./player/CampaignHandbook'), 'CampaignHandbook');
const PlainHandbookGate = page(() => import('./player/CampaignHandbook'), 'PlainHandbookGate');
const PublishPage = page(() => import('./pages/Publish'), 'PublishPage');
const StyleGuidePage = page(() => import('./pages/StyleGuide'), 'StyleGuidePage');
const HelpPage = page(() => import('./pages/Help'), 'HelpPage');

function Page({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary onError={reportScreenError} actions={screenErrorActions}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* A campaign's own handbook address on the table server (each group sees only what it has learned). */}
        <Route
          path="/player/c/:code/*"
          element={
            <Suspense fallback={<Loading />}>
              <CampaignHandbook />
            </Suspense>
          }
        />
        <Route
          path="/player/*"
          element={
            <Suspense fallback={<Loading />}>
              <PlainHandbookGate>
                <PlayerApp />
              </PlainHandbookGate>
            </Suspense>
          }
        />
        <Route
          element={
            <RemoteGate>
              <LibraryPicker>
                <AppStateProvider>
                  <Layout />
                </AppStateProvider>
              </LibraryPicker>
            </RemoteGate>
          }
        >
          <Route
            index
            element={
              <Page>
                <Dashboard />
              </Page>
            }
          />
          <Route
            path="start"
            element={
              <Page>
                <StartWorld />
              </Page>
            }
          />
          <Route
            path="world"
            element={
              <Page>
                <WorldOverview />
              </Page>
            }
          />
          <Route
            path="atlas/explore"
            element={
              <Suspense fallback={<Loading />}>
                <AtlasExplorer />
              </Suspense>
            }
          />
          <Route
            path="atlas/explore/:mapId"
            element={
              <Suspense fallback={<Loading />}>
                <AtlasExplorer />
              </Suspense>
            }
          />
          <Route
            path="atlas"
            element={
              <Page>
                <AtlasPage />
              </Page>
            }
          />
          <Route
            path="atlas/:mapId"
            element={
              <Page>
                <AtlasPage />
              </Page>
            }
          />
          <Route
            path="templates"
            element={
              <Page>
                <TemplatesPage />
              </Page>
            }
          />
          <Route
            path="worldbooks"
            element={
              <Page>
                <WorldbooksPage />
              </Page>
            }
          />
          {/* The page's address before worldbooks (v0.7.1). */}
          <Route path="setting-packs" element={<Navigate to="/worldbooks" replace />} />
          <Route
            path="realms"
            element={
              <Page>
                <RealmsPage />
              </Page>
            }
          />
          <Route
            path="realm/:realm"
            element={
              <Page>
                <RealmPage />
              </Page>
            }
          />
          <Route
            path="timeline"
            element={
              <Page>
                <TimelinePage />
              </Page>
            }
          />
          <Route
            path="browse/:group"
            element={
              <Page>
                <EntityList />
              </Page>
            }
          />
          <Route
            path="mysteries"
            element={
              <Page>
                <MysteriesPage />
              </Page>
            }
          />
          <Route
            path="graph"
            element={
              <Page>
                <GraphPage />
              </Page>
            }
          />
          <Route
            path="e/:id"
            element={
              <Page>
                <EntityPage />
              </Page>
            }
          />
          <Route
            path="e/:id/plan"
            element={
              <Page>
                <PlacePlanPage />
              </Page>
            }
          />
          <Route
            path="new"
            element={
              <Page>
                <NewRecord />
              </Page>
            }
          />
          <Route
            path="search"
            element={
              <Page>
                <SearchPage />
              </Page>
            }
          />
          <Route
            path="documents"
            element={
              <Page>
                <DocumentsPage />
              </Page>
            }
          />
          <Route
            path="aetheris/shards"
            element={
              <Page>
                <ShardsPage />
              </Page>
            }
          />
          <Route
            path="aetheris/dominions"
            element={
              <Page>
                <DominionsPage />
              </Page>
            }
          />
          <Route
            path="kaelmar/vaults"
            element={
              <Page>
                <VaultsPage />
              </Page>
            }
          />
          <Route
            path="ethereal/explorer"
            element={
              <Page>
                <EtherealExplorer />
              </Page>
            }
          />
          <Route
            path="campaigns"
            element={
              <Page>
                <CampaignsPage />
              </Page>
            }
          />
          <Route
            path="campaign"
            element={
              <Page>
                <ActiveCampaign />
              </Page>
            }
          />
          <Route
            path="campaign/adventures"
            element={
              <Page>
                <AdventuresPage />
              </Page>
            }
          />
          <Route
            path="campaign/arcs"
            element={
              <Page>
                <ArcsPage />
              </Page>
            }
          />
          <Route
            path="campaign/quests"
            element={
              <Page>
                <QuestsPage />
              </Page>
            }
          />
          <Route
            path="campaign/standing"
            element={
              <Page>
                <StandingPage />
              </Page>
            }
          />
          <Route
            path="campaign/treasure"
            element={
              <Page>
                <TreasurePage />
              </Page>
            }
          />
          <Route
            path="campaign/handouts"
            element={
              <Page>
                <HandoutsPage />
              </Page>
            }
          />
          <Route
            path="campaign/bastions"
            element={
              <Page>
                <BastionsPage />
              </Page>
            }
          />
          <Route
            path="campaign/calendar"
            element={
              <Page>
                <CalendarPage />
              </Page>
            }
          />
          <Route
            path="campaign/return"
            element={
              <Page>
                <ReturnPage />
              </Page>
            }
          />
          <Route
            path="campaign/faction-web"
            element={
              <Page>
                <FactionWebPage />
              </Page>
            }
          />
          <Route
            path="campaign/party-export"
            element={
              <Page>
                <PartyExportPage />
              </Page>
            }
          />
          <Route
            path="campaign/regions"
            element={
              <Page>
                <RegionsPage />
              </Page>
            }
          />
          <Route
            path="campaign/sessions"
            element={
              <Page>
                <SessionsPage />
              </Page>
            }
          />
          <Route
            path="campaign/encounters"
            element={
              <Page>
                <EncountersPage />
              </Page>
            }
          />
          <Route
            path="campaign/party"
            element={
              <Page>
                <PartyPage />
              </Page>
            }
          />
          <Route
            path="campaign/journal"
            element={
              <Page>
                <JournalPage />
              </Page>
            }
          />
          <Route
            path="campaign/live"
            element={
              <Page>
                <LiveSession />
              </Page>
            }
          />
          <Route
            path="adventure/:id"
            element={
              <Page>
                <AdventurePage />
              </Page>
            }
          />
          <Route
            path="session/:id"
            element={
              <Page>
                <SessionPage />
              </Page>
            }
          />
          <Route
            path="books"
            element={
              <Page>
                <BooksPage />
              </Page>
            }
          />
          <Route
            path="dm"
            element={
              <Page>
                <DmScreen />
              </Page>
            }
          />
          <Route
            path="tracker"
            element={
              <Page>
                <TrackerPage />
              </Page>
            }
          />
          <Route
            path="tracker/:encounterId"
            element={
              <Page>
                <TrackerPage />
              </Page>
            }
          />
          <Route
            path="conditions"
            element={
              <Page>
                <ConditionsPage />
              </Page>
            }
          />
          <Route
            path="npc-ref"
            element={
              <Page>
                <NpcRefPage />
              </Page>
            }
          />
          <Route
            path="names"
            element={
              <Page>
                <NamesPage />
              </Page>
            }
          />
          <Route
            path="generators"
            element={
              <Page>
                <GeneratorsPage />
              </Page>
            }
          />
          <Route
            path="agendas"
            element={
              <Page>
                <AgendasPage />
              </Page>
            }
          />
          <Route
            path="rumours"
            element={
              <Page>
                <RumoursPage />
              </Page>
            }
          />
          <Route
            path="world-events"
            element={
              <Page>
                <WorldEventsPage />
              </Page>
            }
          />
          <Route
            path="tables"
            element={
              <Page>
                <TablesPage />
              </Page>
            }
          />
          <Route
            path="dice"
            element={
              <Page>
                <DicePage />
              </Page>
            }
          />
          <Route
            path="rules"
            element={
              <Page>
                <RulesPage />
              </Page>
            }
          />
          <Route
            path="quick-reference"
            element={
              <Page>
                <QuickReferencePage />
              </Page>
            }
          />
          <Route
            path="notes"
            element={
              <Page>
                <NotesPage />
              </Page>
            }
          />
          <Route
            path="import"
            element={
              <Page>
                <ImportExportPage />
              </Page>
            }
          />
          <Route
            path="review"
            element={
              <Page>
                <ReviewPage />
              </Page>
            }
          />
          <Route
            path="tags"
            element={
              <Page>
                <TagsPage />
              </Page>
            }
          />
          <Route
            path="find-replace"
            element={
              <Page>
                <FindReplacePage />
              </Page>
            }
          />
          <Route
            path="broken"
            element={
              <Page>
                <BrokenPage />
              </Page>
            }
          />
          <Route
            path="consistency"
            element={
              <Page>
                <ConsistencyPage />
              </Page>
            }
          />
          <Route
            path="open-questions"
            element={
              <Page>
                <OpenQuestionsPage />
              </Page>
            }
          />
          <Route
            path="history"
            element={
              <Page>
                <HistoryPage />
              </Page>
            }
          />
          <Route
            path="backups"
            element={
              <Page>
                <BackupsPage />
              </Page>
            }
          />
          <Route
            path="libraries"
            element={
              <Page>
                <LibrariesPage />
              </Page>
            }
          />
          <Route
            path="style-guide"
            element={
              <Page>
                <StyleGuidePage />
              </Page>
            }
          />
          <Route
            path="help"
            element={
              <Page>
                <HelpPage />
              </Page>
            }
          />
          <Route
            path="help/:guide"
            element={
              <Page>
                <HelpPage />
              </Page>
            }
          />
          <Route
            path="settings"
            element={
              <Page>
                <SettingsPage />
              </Page>
            }
          />
          <Route
            path="publish"
            element={
              <Page>
                <PublishPage />
              </Page>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
