import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

test("demo mode supports saved view CRUD without repository writes", async () => {
  const demo = createDemoApi();
  const created = await demo.createSavedView({
    name: "Release review",
    viewType: "commits",
    config: { refs: ["main"], search: "release" },
    pinned: true,
  });
  assert.equal(created.ok, true);
  assert.equal(created.data.savedView.name, "Release review");
  assert.equal(created.data.savedViews.length, 1);

  const updated = await demo.updateSavedView({ id: created.data.savedView.id, name: "Release review updated", pinned: false });
  assert.equal(updated.ok, true);
  assert.equal(updated.data.savedView.name, "Release review updated");
  assert.equal(updated.data.savedView.pinned, false);

  const removed = await demo.deleteSavedView({ id: created.data.savedView.id });
  assert.equal(removed.ok, true);
  assert.deepEqual(removed.data.savedViews, []);
});
