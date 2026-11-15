/**
 * Map exploration: fog of war and the party's trail reach players only while the active campaign has a live session.
 * The records below are SYNTHETIC TEST DATA.
 */
import { describe, expect, it } from "vitest";
import { tempContext } from "./helpers";
import { buildPlan, commitPlan } from "../server/src/import/importer";
import type { SourceFile } from "../server/src/import/scan";
import {
  campaigns,
  sessions,
  setActiveCampaign,
} from "../server/src/repo/campaigns";
import { maps, markers, shapes } from "../server/src/repo/maps";
import { updateEntity } from "../server/src/repo/entities";
import {
  clearTrail,
  explorationFor,
  setDiscovered,
  travel,
} from "../server/src/repo/exploration";
import { playerMaps } from "../server/src/player/projection";

const rec = (id: string, name: string, category: string): SourceFile => ({
  path: `Lib/${id}.md`,
  content: `ID: ${id}\nName: ${name}\nAlternate names: None\nCategory: ${category}\nParent: None\nContinent or realm: Aetheris\nCanon status: CANON\nSource: Test\nTags: realm/aetheris, vis/gm\n\n# ${name}\n\nA place.\n`,
});

function setup() {
  const ctx = tempContext();
  const files = [
    rec("SET-001", "Test Town", "Settlement"),
    rec("SET-002", "Far Keep", "Settlement"),
    rec("SET-003", "Secret Den", "Settlement"),
  ];
  commitPlan(ctx.db, files, buildPlan(ctx.db, files, "test"));
  for (const id of ["SET-001", "SET-002"])
    updateEntity(ctx.db, id, {
      revealed: true,
      player_summary: "A place.",
      revealed_sections: [],
      reason: "test",
    });
  const map = maps.create(ctx.db, {
    name: "The World",
    kind: "image",
    width: 100,
    height: 100,
    player_visible: true,
  }) as { id: number };
  markers.create(ctx.db, {
    map_id: map.id,
    entity_id: "SET-001",
    label: "Test Town",
    x: 10,
    y: 10,
    hidden: false,
  });
  markers.create(ctx.db, {
    map_id: map.id,
    entity_id: "SET-002",
    label: "Far Keep",
    x: 80,
    y: 80,
    hidden: false,
  });
  markers.create(ctx.db, {
    map_id: map.id,
    entity_id: "SET-003",
    label: "Secret Den",
    x: 50,
    y: 50,
    hidden: false,
  });
  const c = campaigns.create(ctx.db, {
    title: "Test Campaign",
    starting_location_id: "SET-001",
  }) as { id: number };
  setActiveCampaign(ctx.db, c.id);
  return { ctx, mapId: map.id, campaignId: c.id };
}

describe("map exploration", () => {
  it("shows players nothing until the active campaign has a live session", () => {
    const { ctx, mapId, campaignId } = setup();
    travel(ctx.db, campaignId, mapId, { entity_id: "SET-002" });
    expect(playerMaps(ctx.db)[0].exploration).toBeNull();
    const s = sessions.create(ctx.db, {
      campaign_id: campaignId,
      number: 1,
      title: "One",
    }) as { id: number };
    sessions.update(ctx.db, s.id, { status: "live" });
    const ex = playerMaps(ctx.db)[0].exploration!;
    expect(ex.discovered.sort()).toEqual(["SET-001", "SET-002"]); // the starting place, and where the party went
    expect(ex.trail.map((t) => t.label)).toEqual(["Far Keep"]);
  });

  it("logs travel to the live session, and never shows players an unrevealed place", () => {
    const { ctx, mapId, campaignId } = setup();
    const s = sessions.create(ctx.db, {
      campaign_id: campaignId,
      number: 1,
      title: "One",
    }) as { id: number };
    sessions.update(ctx.db, s.id, { status: "live" });
    travel(ctx.db, campaignId, mapId, { entity_id: "SET-003" });
    const log = ctx.db
      .prepare(`SELECT kind, text FROM session_log WHERE session_id = ?`)
      .all(s.id);
    expect(log).toEqual([
      { kind: "travel", text: "The party travelled to Secret Den." },
    ]);
    expect(explorationFor(ctx.db, campaignId, mapId).discovered).toContain(
      "SET-003",
    );
    const ex = playerMaps(ctx.db)[0].exploration!;
    expect(ex.discovered).not.toContain("SET-003");
    expect(JSON.stringify(ex)).not.toContain("Secret Den");
  });

  it("lets the GM undiscover a place and clear the trail", () => {
    const { ctx, mapId, campaignId } = setup();
    setDiscovered(ctx.db, campaignId, mapId, "SET-002", true);
    expect(
      setDiscovered(ctx.db, campaignId, mapId, "SET-002", false).discovered,
    ).toEqual(["SET-001"]);
    travel(ctx.db, campaignId, mapId, { x: 30, y: 40, label: "A campsite" });
    expect(explorationFor(ctx.db, campaignId, mapId).trail).toHaveLength(1);
    expect(clearTrail(ctx.db, campaignId, mapId).trail).toHaveLength(0);
  });

  it("shows a region outline to players only once its region is revealed", () => {
    const { ctx, mapId } = setup();
    const pts: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    shapes.create(ctx.db, {
      map_id: mapId,
      kind: "region",
      label: "Secret Den",
      color: "#ffffff",
      entity_id: "SET-003",
      points: pts,
      hidden: false,
    });
    shapes.create(ctx.db, {
      map_id: mapId,
      kind: "region",
      label: "Test Town",
      color: "#ffffff",
      entity_id: "SET-001",
      points: pts,
      hidden: false,
    });
    const seen = () => playerMaps(ctx.db)[0].shapes.map((s) => s.label);
    expect(seen()).toEqual(["Test Town"]);
    updateEntity(ctx.db, "SET-003", {
      revealed: true,
      player_summary: "A den.",
      revealed_sections: [],
      reason: "test",
    });
    expect(seen().sort()).toEqual(["Secret Den", "Test Town"]);
  });
});
