import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

test("demo search returns synthetic results for every repository category", async () => {
  const api = createDemoApi();
  const files = await api.repositorySearch({ query: "type:file auth" });
  const refs = await api.repositorySearch({ query: "type:branch feature" });
  const commits = await api.repositorySearch({ query: "type:commit session" });
  const authors = await api.repositorySearch({ query: "type:author aisyah" });

  assert.ok(files.data.results.some((result) => result.type === "file"));
  assert.ok(refs.data.results.some((result) => result.type === "branch"));
  assert.ok(commits.data.results.some((result) => result.type === "commit"));
  assert.ok(authors.data.results.some((result) => result.type === "author"));
});
