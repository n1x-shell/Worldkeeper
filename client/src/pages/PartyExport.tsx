import { Download, Printer } from 'lucide-react';
import { useApi } from '../lib/api';
import { useAppState } from '../lib/store';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { NeedCampaign } from './Campaign';

/** "What the party knows": a player-safe summary of the campaign to print, save as PDF, or share as Markdown. */
export function PartyExportPage() {
  const { activeCampaignId } = useAppState();
  const { data, error } = useApi<{ title: string; markdown: string }>(activeCampaignId ? `/api/campaigns/${activeCampaignId}/party-export` : null);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <PageHeader
        title="What the Party Knows"
        subtitle="Recaps, quests, standing, treasure, handouts, and the places and people the party knows."
        note="Built only from what players can already see. Print it, save it as a PDF, or share the Markdown file."
        actions={
          <>
            <button className="btn" onClick={() => window.print()}>
              <Printer size={14} /> Print or save as PDF
            </button>
            <a className="btn" href={`/api/campaigns/${activeCampaignId}/party-export.md`}>
              <Download size={14} /> Markdown
            </a>
          </>
        }
      />
      <article className="wk-print panel p-6 max-w-3xl">
        <Markdown text={data.markdown} />
      </article>
    </div>
  );
}
