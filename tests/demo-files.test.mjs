import test from "node:test";
import assert from "node:assert/strict";
import { createDemoApi } from "../src/lib/demo.js";

test("demo API lists repository files and reads text, binary, and large previews", async () => {
  const api = createDemoApi();
  const listResponse = await api.listRepositoryFiles({ repositoryPath: "/demo/acme-storefront" });

  assert.equal(listResponse.ok, true);
  assert.ok(listResponse.data.some((file) => file.path === "src/app.jsx" && file.tracked));
  assert.ok(listResponse.data.some((file) => file.path === "notes/todo.md" && !file.tracked));
  assert.equal(listResponse.data.some((file) => file.path.startsWith(".git/")), false);

  const textResponse = await api.readRepositoryFile({ path: "src/app.jsx" });
  assert.equal(textResponse.data.binary, false);
  assert.match(textResponse.data.text, /AppShell/);
  assert.equal(textResponse.data.language, "JavaScript");

  const binaryResponse = await api.readRepositoryFile({ path: "assets/logo.bin" });
  assert.equal(binaryResponse.data.binary, true);
  assert.equal(binaryResponse.data.text, null);

  const largeResponse = await api.readRepositoryFile({ path: "logs/output.txt" });
  assert.equal(largeResponse.data.truncated, true);
  assert.equal(largeResponse.data.size, 2 * 1024 * 1024);
});
