import { useState } from 'react';
import { Gift, ImagePlus, Plus, Trash2, Undo2 } from 'lucide-react';
import { api, useApi, useAutosave } from '../lib/api';
import { useAppState } from '../lib/store';
import { ask, AutoTextarea, Card, Empty, ErrorBox, Loading, PageHeader, SaveStatus, Segmented } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { NeedCampaign } from './Campaign';

/**
 * Handouts for the active campaign: letters, read-aloud passages, maps and pictures. Write them ahead of time, then
 * give one to the players: it appears on their phones and stays in their handbook under Handouts.
 */
interface Handout {
  id: number;
  title: string;
  body: string;
  image_file: string | null;
  pushed_at: string | null;
}

export function HandoutsPage() {
  const { activeCampaignId } = useAppState();
  const { data, error, reload } = useApi<Handout[]>(activeCampaignId ? `/api/handouts?campaign_id=${activeCampaignId}` : null);
  if (!activeCampaignId) return <NeedCampaign />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const create = async () => {
    await api.post('/api/handouts', { campaign_id: activeCampaignId, title: 'A new handout' });
    reload();
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="Handouts"
        subtitle="Letters, read-aloud, maps and pictures for the players."
        note="Write them ahead of time. Give one to the players and it appears on their phones, and stays in their handbook."
        actions={
          <button className="btn-primary" onClick={create}>
            <Plus size={14} /> New handout
          </button>
        }
      />
      {!data.length && (
        <Empty
          title="No handouts yet."
          action={
            <button className="btn" onClick={create}>
              <Plus size={14} /> Write the first handout
            </button>
          }
        >
          Write a letter, a read-aloud passage or a picture caption, then give it to the players.
        </Empty>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.map((h) => (
          <HandoutCard key={h.id} h={h} onChange={reload} />
        ))}
      </div>
    </div>
  );
}

function HandoutCard({ h: init, onChange }: { h: Handout; onChange: () => void }) {
  const [h, setH] = useState(init);
  const [preview, setPreview] = useState(false);
  const auto = useAutosave((x: Handout) => api.patch(`/api/handouts/${x.id}`, { title: x.title, body: x.body }));
  const set = (p: Partial<Handout>) => {
    const n = { ...h, ...p };
    setH(n);
    auto.schedule(n);
  };
  return (
    <Card className={`space-y-2 ${h.pushed_at ? 'border-gold/50' : ''}`}>
      <div className="flex items-center gap-2">
        <input className="input font-display text-gold flex-1" value={h.title} onChange={(e) => set({ title: e.target.value })} aria-label="Title" />
        <SaveStatus state={auto.state} error={auto.error} />
      </div>
      {h.image_file && <img src={`/api/uploads/${h.image_file}`} alt="" className="max-h-56 rounded-md border border-line" />}
      <Segmented
        size="sm"
        label="Handout view"
        value={preview ? 'preview' : 'write'}
        onChange={(v) => setPreview(v === 'preview')}
        options={[
          { value: 'write', label: 'Write' },
          { value: 'preview', label: 'What players see' },
        ]}
      />
      {preview ? (
        <div className="parchment p-3 font-serif text-[15px]">
          <Markdown text={h.body || '*Nothing written yet.*'} />
        </div>
      ) : (
        <AutoTextarea minRows={4} value={h.body} onChange={(e) => set({ body: e.target.value })} placeholder="The letter, the read-aloud, or a caption for the picture…" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn text-xs cursor-pointer">
          <ImagePlus size={13} /> {h.image_file ? 'Change picture' : 'Add a picture'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const fd = new FormData();
              fd.append('image', f);
              const r = await fetch(`/api/handouts/${h.id}/image`, { method: 'POST', body: fd });
              if (r.ok) setH(await r.json());
            }}
          />
        </label>
        <button
          className={`btn text-xs ${h.pushed_at ? '' : 'border-gold/60 text-gold'}`}
          onClick={async () => {
            setH(await api.post<Handout>(`/api/handouts/${h.id}/push`, { pushed: !h.pushed_at }));
            onChange();
          }}
        >
          {h.pushed_at ? (
            <>
              <Undo2 size={13} /> Take it back
            </>
          ) : (
            <>
              <Gift size={13} /> Give to the players
            </>
          )}
        </button>
        {h.pushed_at && <span className="text-xs text-dim">Given {new Date(h.pushed_at).toLocaleString()}</span>}
        <button
          className="btn-ghost text-xs ml-auto hover:text-danger"
          aria-label="Delete handout"
          onClick={async () => {
            if (!(await ask({ body: `Delete "${h.title}"?`, danger: true, confirmLabel: 'Delete' }))) return;
            await api.del(`/api/handouts/${h.id}`);
            onChange();
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </Card>
  );
}
