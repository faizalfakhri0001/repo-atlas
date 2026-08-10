import test from "node:test";
import assert from "node:assert/strict";
import { createDemoApi } from "../src/lib/demo.js";

test("demo API provides paginated file history entries", async () => {
  const api = createDemoApi();
  const response = await api.fileHistory({ path: "src/app.jsx", limit: 2, skip: 0 });

  assert.equal(response.ok, true);
  assert.equal(response.data.currentPath, "src/app.jsx");
  assert.equal(response.data.entries.length, 2);
  assert.equal(response.data.entries[0].path, "src/app.jsx");
  assert.equal(typeof response.data.entries[0].hash, "string");
  assert.equal(response.data.hasMore, true);
});

test("demo API provides file content at a selected revision", async () => {
  const api = createDemoApi();
  const history = await api.fileHistory({ path: "src/app.jsx", limit: 1 });
  const response = await api.readFileAtRevision({ hash: history.data.entries[0].hash, path: "src/app.jsx" });

  assert.equal(response.ok, true);
  assert.equal(response.data.path, "src/app.jsx");
  assert.equal(response.data.binary, false);
  assert.match(response.data.text, /Demo content|AppShell|export const ready/);
});

test("demo API rejects incomplete revision requests", async () => {
  const api = createDemoApi();
  const response = await api.readFileAtRevision({ path: "src/app.jsx" });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INVALID_ARGUMENT");
});
