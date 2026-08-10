export const GRAPH_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
  "#a855f7",
];

/**
 * Lays out commits (newest first, children before parents — the order produced
 * by `git log --topo-order` / `--date-order`) into lanes with colored edges.
 *
 * Each row describes the segment ABOVE it: `edges` connect the previous row's
 * centers to this row's center, so a virtualized list only needs a small
 * overscan to render seamless lines.
 *
 * Row shape: { commit, lane, color, edges: [{ from, to, color }], isMerge, isRoot }
 */
export function buildGraph(commits) {
  const lanes = []; // slot: { hash, color, bornRow, linkOnly } | null
  const rows = [];
  let colorCursor = 0;
  let maxLanes = 1;
  let prevNodeLane = 0;
  let pendingLinks = [];

  const takeColor = () => GRAPH_COLORS[colorCursor++ % GRAPH_COLORS.length];

  for (let index = 0; index < commits.length; index++) {
    const commit = commits[index];
    const parents = [...new Set(commit.parents || [])];

    // Phase A — land the node on a lane.
    const waiting = [];
    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j] && lanes[j].hash === commit.hash) waiting.push(j);
    }

    let lane;
    let color;
    if (waiting.length > 0) {
      lane = waiting[0];
      color = lanes[lane].color;
    } else {
      lane = lanes.findIndex((slot) => slot == null);
      if (lane === -1) lane = lanes.length;
      color = takeColor();
      lanes[lane] = { hash: commit.hash, color, bornRow: index, linkOnly: false };
    }

    // Phase B — edges for the segment between the previous row and this row.
    const edges = [];
    if (index > 0) {
      for (let j = 0; j < lanes.length; j++) {
        const slot = lanes[j];
        if (!slot) continue;
        if (slot.bornRow === index) continue; // tip born on this row, nothing above
        if (slot.linkOnly) continue; // handled through pendingLinks below
        const converges = slot.hash === commit.hash;
        edges.push({ from: j, to: converges ? lane : j, color: slot.color });
      }
      for (const link of pendingLinks) {
        const slot = lanes[link.laneIndex];
        const converges = slot != null && slot.hash === commit.hash;
        edges.push({
          from: prevNodeLane,
          to: converges ? lane : link.laneIndex,
          color: link.color,
        });
      }
      for (const slot of lanes) {
        if (slot && slot.linkOnly && slot.bornRow < index) slot.linkOnly = false;
      }
    }

    // Phase C — other lanes waiting for this commit converge here and free up.
    for (const j of waiting) {
      if (j !== lane) lanes[j] = null;
    }

    // Phase D — continue this lane toward the first parent.
    if (parents.length === 0) {
      lanes[lane] = null;
    } else {
      lanes[lane] = { hash: parents[0], color, bornRow: index, linkOnly: false };
    }

    // Phase E — extra parents (merges) link into existing lanes or open new ones.
    pendingLinks = [];
    for (const parent of parents.slice(1)) {
      let existing = -1;
      for (let j = 0; j < lanes.length; j++) {
        if (lanes[j] && lanes[j].hash === parent) {
          existing = j;
          break;
        }
      }
      if (existing >= 0) {
        pendingLinks.push({ laneIndex: existing, color: lanes[existing].color });
      } else {
        let slot = -1;
        for (let j = lane + 1; j < lanes.length; j++) {
          if (lanes[j] == null) {
            slot = j;
            break;
          }
        }
        if (slot === -1) slot = lanes.length;
        const linkColor = takeColor();
        lanes[slot] = { hash: parent, color: linkColor, bornRow: index, linkOnly: true };
        pendingLinks.push({ laneIndex: slot, color: linkColor });
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] == null) lanes.pop();

    const rowWidth = Math.max(
      lane + 1,
      lanes.length,
      ...edges.map((edge) => Math.max(edge.from, edge.to) + 1),
    );
    maxLanes = Math.max(maxLanes, rowWidth);

    rows.push({
      commit,
      lane,
      color,
      edges,
      isMerge: parents.length > 1,
      isRoot: parents.length === 0,
    });
    prevNodeLane = lane;
  }

  return { rows, maxLanes };
}
