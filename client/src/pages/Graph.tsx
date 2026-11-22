import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, MarkerType, type Edge, type Node } from '@xyflow/react';
import { CANON_STATUSES, ENTITY_TYPE_LABELS, RELATIONSHIP_LABELS, RELATIONSHIP_TYPES, type EntityType, type RelationshipType } from '@shared/domain';
import { qs, useApi } from '../lib/api';
import { Card, Check, Empty, ErrorBox, Loading, PageHeader } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import { useAppState } from '../lib/store';
import type { Relationship } from '../lib/types';
import { REALM_COLORS } from '@shared/realms';
import { useRealms } from '../components/realms';

interface GraphData {
  focus: string;
  nodes: { id: string; name: string; type: string; realm: string; canon_status: string; depth: number }[];
  edges: Relationship[];
  truncated: boolean;
}

/** The theme's colours, read from the CSS variables (React Flow draws markers with plain colours, not var()). */
interface Palette {
  /** Realm colours (by palette key) as "r, g, b", so they can take an alpha. */
  realm: Record<string, string>;
  fallback: string;
  panel: string;
  raised: string;
  focusBg: string;
  ink: string;
  line: string;
  edge: string;
  gold: string;
}
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const triplet = (name: string) => v(name).split(/\s+/).join(', ') || '128, 128, 128';
  const rgb = (name: string, alpha?: number) => (alpha == null ? `rgb(${triplet(name)})` : `rgba(${triplet(name)}, ${alpha})`);
  return {
    realm: Object.fromEntries(REALM_COLORS.map((c) => [c, triplet(`--rc-${c}`)])),
    fallback: triplet('--dim'),
    panel: rgb('--panel'),
    raised: rgb('--raised'),
    focusBg: rgb('--gold', 0.18),
    ink: rgb('--ink'),
    line: rgb('--line'),
    edge: rgb('--edge'),
    gold: rgb('--gold'),
  };
}
/** The palette, read again whenever the theme class on <html> changes. */
function usePalette(theme: string): Palette {
  const [p, setP] = useState(readPalette);
  useEffect(() => {
    setP(readPalette());
    const obs = new MutationObserver(() => setP(readPalette()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => obs.disconnect();
  }, [theme]);
  return p;
}
const TYPE_GROUPS: Record<string, string[]> = {
  People: ['npc'],
  Groups: ['faction', 'cult', 'family'],
  Places: ['continent', 'realm', 'region', 'settlement', 'landmark', 'building', 'vault', 'ethereal_domain', 'dungeon'],
  'Shards & artifacts': ['shard', 'artifact', 'item', 'vault_key'],
  Deities: ['deity'],
  Events: ['event', 'cosmology'],
};

/** Radial layout: focus in the centre, each depth on its own ring, nodes on a ring grouped by type. */
function layout(d: GraphData, debug: boolean, pal: Palette, realmColor: (id: string) => string): { nodes: Node[]; edges: Edge[] } {
  const rings = new Map<number, GraphData['nodes']>();
  for (const n of d.nodes) rings.set(n.depth, [...(rings.get(n.depth) ?? []), n]);
  const nodes: Node[] = [];
  for (const [depth, list] of rings) {
    list.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const r = depth === 0 ? 0 : Math.max(260 * depth, (list.length * 150) / (2 * Math.PI));
    list.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, list.length) - Math.PI / 2;
      const tone = pal.realm[realmColor(n.realm)] ?? pal.fallback;
      const color = `rgb(${tone})`;
      nodes.push({
        id: n.id,
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: {
          label: (
            <div className="text-left">
              <div className="font-medium leading-tight text-[12px]">{n.name}</div>
              <div className="text-[10px] opacity-70">
                {ENTITY_TYPE_LABELS[n.type as EntityType] ?? n.type}
                {debug ? ` · ${n.id}` : ''}
              </div>
            </div>
          ),
        },
        style: {
          background: depth === 0 ? `linear-gradient(${pal.focusBg}, ${pal.focusBg}), ${pal.raised}` : pal.panel,
          color: pal.ink,
          border: `1.5px solid ${color}`,
          borderRadius: 8,
          width: 170,
          padding: 6,
          boxShadow: depth === 0 ? `0 0 0 3px rgba(${tone}, 0.33)` : undefined,
        },
      });
    });
  }
  const edges: Edge[] = d.edges.map((e) => ({
    id: String(e.id),
    source: e.source_id,
    target: e.target_id,
    label: e.type === 'references' ? undefined : RELATIONSHIP_LABELS[e.type as RelationshipType] ?? e.type,
    animated: e.origin === 'user',
    style: { stroke: e.type === 'references' ? pal.edge : pal.gold, strokeDasharray: e.type === 'references' ? '4 4' : undefined },
    labelStyle: { fill: pal.ink, fontSize: 10 },
    labelBgStyle: { fill: pal.panel },
    markerEnd: e.directed ? { type: MarkerType.ArrowClosed, color: pal.gold } : undefined,
  }));
  return { nodes, edges };
}

export function GraphPage() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const realms = useRealms();
  // Without a record picked, start from the first world's own record.
  const focus = sp.get('focus') ?? realms.list.find((r) => r.kind === 'world' && r.intro_id)?.intro_id ?? '';
  const [depth, setDepth] = useState(1);
  const [refs, setRefs] = useState(true);
  const [group, setGroup] = useState('');
  const [realm, setRealm] = useState('');
  const [canon, setCanon] = useState('');
  const [rel, setRel] = useState('');
  const [era, setEra] = useState('');
  const { data: eras } = useApi<{ key: string; name: string }[]>('/api/eras');
  const url = `/api/graph${qs({ focus, depth, refs: refs ? undefined : '0', types: group ? TYPE_GROUPS[group] : undefined, realms: realm, canon, rel, eras: era })}`;
  const { data, error, loading } = useApi<GraphData>(focus ? url : null);
  const { debug, theme } = useAppState();
  const pal = usePalette(theme);
  const flow = useMemo(() => (data ? layout(data, debug, pal, (id) => realms.get(id).color) : null), [data, debug, pal, realms]);

  return (
    <div className="space-y-3">
      <PageHeader title="Relationships" subtitle="Click a record to centre on it; double-click to open it." note="Dotted lines are mentions in the text; gold lines are structured relationships." />
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-72">
          <span className="label">Focus</span>
          <EntityPicker value={focus} allowClear={false} onChange={(id) => id && setSp({ focus: id })} />
        </div>
        <label>
          <span className="label">Depth</span>
          <select className="input w-auto" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
            <option value={1}>1 step</option>
            <option value={2}>2 steps</option>
            <option value={3}>3 steps</option>
          </select>
        </label>
        <label>
          <span className="label">Entity type</span>
          <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All</option>
            {Object.keys(TYPE_GROUPS).map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Continent</span>
          <select className="input w-auto" value={realm} onChange={(e) => setRealm(e.target.value)}>
            <option value="">All</option>
            {realms.list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Canon</span>
          <select className="input w-auto" value={canon} onChange={(e) => setCanon(e.target.value)}>
            <option value="">All</option>
            {CANON_STATUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Relationship</span>
          <select className="input w-auto" value={rel} onChange={(e) => setRel(e.target.value)}>
            <option value="">All</option>
            {RELATIONSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {RELATIONSHIP_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Historical era</span>
          <select className="input w-auto" value={era} onChange={(e) => setEra(e.target.value)}>
            <option value="">All</option>
            {eras?.map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <Check checked={refs} onChange={setRefs} className="pb-2 text-dim">
          Include mentions
        </Check>
      </div>
      {error && <ErrorBox error={error} />}
      {data?.truncated && <p className="text-xs text-warn">Showing the first {data.nodes.length} records. Narrow the filters for a full view.</p>}
      <Card flush className="h-[72vh]">
        {loading && !flow ? (
          <Loading />
        ) : flow ? (
          <ReactFlow
            key={url}
            nodes={flow.nodes}
            edges={flow.edges}
            fitView
            minZoom={0.1}
            nodesConnectable={false}
            onNodeClick={(_, n) => n.id !== focus && setSp({ focus: n.id })}
            onNodeDoubleClick={(_, n) => nav(`/e/${encodeURIComponent(n.id)}`)}
            colorMode={theme}
          >
            <Background gap={24} color={pal.line} />
            <Controls />
          </ReactFlow>
        ) : !focus ? (
          <Empty title="Pick a record to start from">Open any record and choose Graph, or add your world's own record first.</Empty>
        ) : null}
      </Card>
    </div>
  );
}
