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
  assert.equal(scan.data.worktrees[0].main, true);
  const worktreeDetails = await api.worktreeDetails({ repositoryPath, path: scan.data.worktrees[0].path });
  assert.equal(worktreeDetails.ok, true);
  assert.equal(worktreeDetails.data.dirty, true);
  assert.equal(worktreeDetails.data.changes, scan.data.status.files.length);

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

  const health = await api.repositoryHealth({ repositoryPath });
  assert.equal(health.ok, true);
  assert.equal(typeof health.data.score, "number");
  const hotspots = await api.hotspots({ repositoryPath, limit: 5 });
  assert.equal(hotspots.ok, true);
  assert.ok(hotspots.data.files.length > 0);
  const ownership = await api.ownership({ repositoryPath, limit: 5 });
  assert.equal(ownership.ok, true);
  assert.ok(ownership.data.nodes.length > 0);
  const blame = await api.fileBlame({ repositoryPath, path: "src/app.jsx" });
  assert.equal(blame.ok, true);
  assert.ok(blame.data.lines.length > 0);

  const preview = await api.cherryPickPreview({ hashes: [firstCommit.hash] });
  assert.equal(preview.ok, true);
  assert.equal(preview.data.commits.length, 1);

  const writeAttempt = await api.cherryPickExecute({ hashes: [firstCommit.hash] });
  assert.equal(writeAttempt.ok, false);
  assert.equal(writeAttempt.error.code, "DEMO_MODE");

  const stageAttempt = await api.stageFiles({ repositoryPath, paths: ["src/app.jsx"] });
  assert.equal(stageAttempt.ok, false);
  assert.equal(stageAttempt.error.code, "DEMO_MODE");
  const hunkAttempt = await api.stageHunk({ repositoryPath, path: "src/app.jsx", hunkId: "demo-hunk" });
  assert.equal(hunkAttempt.ok, false);
  assert.equal(hunkAttempt.error.code, "DEMO_MODE");
});
