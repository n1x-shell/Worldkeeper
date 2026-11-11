import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, MarkerType, type Edge, type Node } from '@xyflow/react';
import { CANON_STATUSES, ENTITY_TYPE_LABELS, REALMS, REALM_LABELS, RELATIONSHIP_LABELS, RELATIONSHIP_TYPES, type EntityType, type RelationshipType } from '@shared/domain';
import { qs, useApi } from '../lib/api';
import { ErrorBox, Loading, PageHeader } from '../components/ui';
import { EntityPicker } from '../components/EntityPicker';
import type { Relationship } from '../lib/types';

interface GraphData {
  focus: string;
  nodes: { id: string; name: string; type: string; realm: string; canon_status: string; depth: number }[];
  edges: Relationship[];
  truncated: boolean;
}

const REALM_COLOR: Record<string, string> = { aetheris: '#d4a24a', kaelmar: '#5fb38a', ethereal: '#9a7ce0', world: '#6aa6d6' };
const TYPE_GROUPS: Record<string, string[]> = {
  People: ['npc'],
  Groups: ['faction', 'cult', 'family'],
  Places: ['continent', 'realm', 'region', 'settlement', 'landmark', 'building', 'vault', 'ethereal_domain', 'dungeon'],
  'Shards & artifacts': ['shard', 'artifact', 'item', 'vault_key'],
  Deities: ['deity'],
  Events: ['event', 'cosmology'],
};

/** Radial layout: focus in the centre, each depth on its own ring, nodes on a ring grouped by type. */
function layout(d: GraphData): { nodes: Node[]; edges: Edge[] } {
  const rings = new Map<number, GraphData['nodes']>();
  for (const n of d.nodes) rings.set(n.depth, [...(rings.get(n.depth) ?? []), n]);
  const nodes: Node[] = [];
  for (const [depth, list] of rings) {
    list.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const r = depth === 0 ? 0 : Math.max(260 * depth, (list.length * 150) / (2 * Math.PI));
    list.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, list.length) - Math.PI / 2;
      const color = REALM_COLOR[n.realm] ?? '#aaa';
      nodes.push({
        id: n.id,
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        data: {
          label: (
            <div className="text-left">
              <div className="font-medium leading-tight text-[12px]">{n.name}</div>
              <div className="text-[10px] opacity-70">
                {ENTITY_TYPE_LABELS[n.type as EntityType] ?? n.type} · {n.id}
              </div>
            </div>
          ),
        },
        style: {
          background: depth === 0 ? '#3a3020' : '#1d1f25',
          color: '#e4dfd2',
          border: `1.5px solid ${color}`,
          borderRadius: 8,
          width: 170,
          padding: 6,
          boxShadow: depth === 0 ? `0 0 0 3px ${color}55` : undefined,
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
    style: { stroke: e.type === 'references' ? '#555b66' : '#c9a24a', strokeDasharray: e.type === 'references' ? '4 4' : undefined },
    labelStyle: { fill: '#e4dfd2', fontSize: 10 },
    labelBgStyle: { fill: '#18191f' },
    markerEnd: e.directed ? { type: MarkerType.ArrowClosed, color: '#c9a24a' } : undefined,
  }));
  return { nodes, edges };
}

export function GraphPage() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const focus = sp.get('focus') ?? 'CON-301';
  const [depth, setDepth] = useState(1);
  const [refs, setRefs] = useState(true);
  const [group, setGroup] = useState('');
  const [realm, setRealm] = useState('');
  const [canon, setCanon] = useState('');
  const [rel, setRel] = useState('');
  const url = `/api/graph${qs({ focus, depth, refs: refs ? undefined : '0', types: group ? TYPE_GROUPS[group] : undefined, realms: realm, canon, rel })}`;
  const { data, error, loading } = useApi<GraphData>(url);
  const flow = useMemo(() => (data ? layout(data) : null), [data]);

  return (
    <div className="space-y-3">
      <PageHeader title="Relationships" subtitle="A focused neighbourhood around one record. Click a node to recentre; double-click to open its record. Dotted lines are text cross-references; gold lines are structured relationships." />
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
            {REALMS.map((r) => (
              <option key={r} value={r}>
                {REALM_LABELS[r]}
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
        <label className="flex items-center gap-1 text-sm text-dim pb-2">
          <input type="checkbox" checked={refs} onChange={(e) => setRefs(e.target.checked)} /> Text cross-references
        </label>
      </div>
      {error && <ErrorBox error={error} />}
      {data?.truncated && <p className="text-xs text-amber-400">Showing the first {data.nodes.length} records. Narrow the filters for a full view.</p>}
      <div className="panel h-[72vh]">
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
            colorMode="dark"
          >
            <Background gap={24} color="#333" />
            <Controls />
          </ReactFlow>
        ) : null}
      </div>
    </div>
  );
}
