import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, GRAPH_COLORS } from "../src/lib/git-graph.js";

const commit = (hash, parents = [], refs = []) => ({ hash, parents, refs });

test("linear history stays on a single lane with straight edges", () => {
  const { rows, maxLanes } = buildGraph([commit("c", ["b"]), commit("b", ["a"]), commit("a")]);
  assert.equal(maxLanes, 1);
  assert.deepEqual(
    rows.map((row) => row.lane),
    [0, 0, 0],
  );
  assert.deepEqual(rows[0].edges, []);
  assert.deepEqual(rows[1].edges, [{ from: 0, to: 0, color: rows[0].color }]);
  assert.equal(rows[2].isRoot, true);
  assert.equal(rows.every((row) => row.color === GRAPH_COLORS[0]), true);
});

test("merge commit opens a second lane that converges at the shared parent", () => {
  // m merges f into main: m -> [b, f], f -> [a], b -> [a], a root.
  const { rows, maxLanes } = buildGraph([
    commit("m", ["b", "f"]),
    commit("b", ["a"]),
    commit("f", ["a"]),
    commit("a"),
  ]);
  assert.equal(maxLanes, 2);
  const [m, b, f, a] = rows;
  assert.equal(m.lane, 0);
  assert.equal(m.isMerge, true);
  assert.equal(b.lane, 0);
  // merge link edge from m's node into lane 1
  assert.ok(b.edges.some((edge) => edge.from === 0 && edge.to === 1));
  assert.equal(f.lane, 1);
  // f keeps its own color, distinct from main lane
  assert.notEqual(f.color, m.color);
  assert.equal(a.lane, 0);
  // both lanes converge into a
  assert.ok(a.edges.some((edge) => edge.from === 0 && edge.to === 0));
  assert.ok(a.edges.some((edge) => edge.from === 1 && edge.to === 0));
});

test("merge directly followed by the merged tip draws one connecting edge", () => {
  const { rows } = buildGraph([commit("m", ["b", "f"]), commit("f", ["a"]), commit("b", ["a"]), commit("a")]);
  const f = rows[1];
  assert.equal(f.lane, 1);
  assert.deepEqual(f.edges, [
    { from: 0, to: 0, color: rows[0].color },
    { from: 0, to: 1, color: f.color },
  ]);
});

test("independent branch tips occupy separate lanes", () => {
  const { rows, maxLanes } = buildGraph([
    commit("x", ["a"]),
    commit("y", ["a"]),
    commit("a"),
  ]);
  assert.equal(maxLanes, 2);
  assert.equal(rows[0].lane, 0);
  assert.equal(rows[1].lane, 1);
  assert.equal(rows[2].lane, 0);
  assert.ok(rows[2].edges.some((edge) => edge.from === 1 && edge.to === 0));
});

test("edges always reference lanes inside the reported width", () => {
  // A denser synthetic history with two merges and three tips.
  const history = [
    commit("t3", ["m2"]),
    commit("m2", ["m1", "g2"]),
    commit("g2", ["g1"]),
    commit("m1", ["c", "f2"]),
    commit("g1", ["c"]),
    commit("f2", ["f1"]),
    commit("f1", ["b"]),
    commit("c", ["b"]),
    commit("b", ["a"]),
    commit("a"),
  ];
  const { rows, maxLanes } = buildGraph(history);
  for (const row of rows) {
    assert.ok(row.lane < maxLanes);
    for (const edge of row.edges) {
      assert.ok(edge.from >= 0 && edge.from < maxLanes, `edge.from in range for ${row.commit.hash}`);
      assert.ok(edge.to >= 0 && edge.to < maxLanes, `edge.to in range for ${row.commit.hash}`);
      assert.ok(edge.color, "edge has a color");
    }
  }
  // Every non-first row connects to the previous row somehow (continuous graph).
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].edges.length > 0, `row ${i} has incoming edges`);
  }
});

test("duplicate parents are collapsed", () => {
  const { rows } = buildGraph([commit("m", ["a", "a"]), commit("a")]);
  assert.equal(rows[0].isMerge, false);
  assert.equal(rows[1].edges.length, 1);
});
