// Snapshot interpolation for guests.
// The host stamps each snapshot with its own clock (ts). Guests render the world
// INTERP_DELAY_MS in the past, blending between the two snapshots around that
// moment, so movement stays smooth even when packets arrive unevenly.
export const INTERP_DELAY_MS = 100;       // 2 snapshots at 20 Hz: survives one late packet
const OFFSET_DECAY_MS = 0.5;              // lets the clock estimate follow slow drift
const MAX_BUFFERED = 30;

export class SnapshotBuffer {
  constructor() {
    this.snapshots = [];   // [{ ts, players: Map<id, state>, ents: Map<id, {x, y}> }] ordered by ts
    this.offset = null;    // estimated (hostClock - localClock), ms
  }

  /** ents: optional { id: [x, y] } of movable level objects (crates, blocks). */
  push(ts, players, now = performance.now(), ents = null) {
    if (!Number.isFinite(ts) || !Array.isArray(players)) return;
    // The smallest observed delay gives the best clock-offset estimate; decay
    // slowly so the estimate can move down again if the clocks drift.
    const sample = ts - now;
    this.offset = this.offset === null ? sample : Math.max(sample, this.offset - OFFSET_DECAY_MS);

    const last = this.snapshots[this.snapshots.length - 1];
    if (last && ts <= last.ts) return; // out-of-order / duplicate
    const entMap = new Map(Object.entries(ents ?? {}).map(([id, [x, y]]) => [id, { id, x, y }]));
    this.snapshots.push({ ts, players: new Map(players.map((p) => [p.id, p])), ents: entMap });
    if (this.snapshots.length > MAX_BUFFERED) this.snapshots.shift();
  }

  /** Interpolated player list for the current moment, or null if nothing received yet. */
  sample(now = performance.now()) {
    return this.sampleAll(now)?.players ?? null;
  }

  /** Interpolated { players: [], ents: { id: {x, y} } }, or null if nothing received yet. */
  sampleAll(now = performance.now()) {
    const snaps = this.snapshots;
    if (!snaps.length) return null;
    const renderTs = now + this.offset - INTERP_DELAY_MS;

    // Drop snapshots we no longer need (keep one older than renderTs).
    while (snaps.length > 2 && snaps[1].ts <= renderTs) snaps.shift();

    const [a, b] = snaps;
    if (!b || renderTs <= a.ts) return flatten(a);                        // too early: oldest
    if (renderTs >= b.ts) return flatten(b);                              // starved: hold newest
    const t = (renderTs - a.ts) / (b.ts - a.ts);
    return { players: blend(a.players, b.players, t), ents: Object.fromEntries(blend(a.ents, b.ents, t).map((e) => [e.id, e])) };
  }
}

function flatten(s) {
  return { players: [...s.players.values()], ents: Object.fromEntries(s.ents) };
}

/** Blend positions of items present in both maps; new items appear at their latest position. */
function blend(ma, mb, t) {
  const out = [];
  for (const [id, pb] of mb) {
    const pa = ma.get(id);
    out.push(pa ? { ...pb, x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t } : pb);
  }
  return out;
}
