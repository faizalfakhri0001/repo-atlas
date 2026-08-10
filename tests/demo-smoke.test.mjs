import assert from "node:assert/strict";
import test from "node:test";
import { createDemoApi } from "../src/lib/demo.js";

test("demo mode exposes a complete read-only repository workflow", async () => {
  const api = createDemoApi();
  const repositoryPath = await api.openRepository();
  assert.equal(api.platform, "demo");
  assert.equal(repositoryPath, "/demo/acme-storefront");

  const scan = await api.scanRepository({ repositoryPath });
  assert.equal(scan.ok, true);
  assert.equal(scan.data.repository.rootPath, repositoryPath);
  assert.ok(scan.data.commits.length > 0);

  const files = await api.listRepositoryFiles({ repositoryPath });
  assert.equal(files.ok, true);
  assert.ok(files.data.some((file) => file.path === "src/app.jsx"));

  const search = await api.repositorySearch({ query: "type:file auth" });
  assert.equal(search.ok, true);
  assert.ok(search.data.results.some((result) => result.type === "file"));

  const firstCommit = scan.data.commits[0];
  const details = await api.commitDetails({ hash: firstCommit.hash });
  assert.equal(details.ok, true);
  assert.equal(details.data.hash, firstCommit.hash);

  const history = await api.fileHistory({ path: "src/app.jsx", limit: 2 });
  assert.equal(history.ok, true);
  assert.ok(history.data.entries.length > 0);
  const revision = await api.readFileAtRevision({ hash: history.data.entries[0].hash, path: "src/app.jsx" });
  assert.equal(revision.ok, true);
  assert.equal(revision.data.binary, false);

  const binary = await api.readRepositoryFile({ path: "assets/logo.bin" });
  assert.equal(binary.ok, true);
  assert.equal(binary.data.binary, true);
  assert.equal(binary.data.text, null);

  const diff = await api.fileDiff({ path: "src/app.jsx" });
  assert.equal(diff.ok, true);
  assert.equal(diff.data.binary, false);
  assert.match(diff.data.diff, /^diff --git/m);

  const compare = await api.compareRefs({ base: "main", head: "feature/payments" });
  assert.equal(compare.ok, true);
  assert.equal(compare.data.base.ref, "main");
  assert.equal(compare.data.head.ref, "feature/payments");
  assert.ok(compare.data.ahead > 0);

  const branchReport = await api.branchIntelligence({ repositoryPath });
  assert.equal(branchReport.ok, true);
  assert.equal(branchReport.data.defaultBranch, "main");
  assert.equal(branchReport.data.scope.concurrency, 4);
  assert.ok(branchReport.data.branches.some((branch) => branch.name === "feature/payments" && branch.analyzed));

  const preview = await api.cherryPickPreview({ hashes: [firstCommit.hash] });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.commits.length, 1);

  const writeAttempt = await api.cherryPickExecute({ hashes: [firstCommit.hash] });
  assert.equal(writeAttempt.ok, false);
  assert.equal(writeAttempt.error.code, "DEMO_MODE");
});
