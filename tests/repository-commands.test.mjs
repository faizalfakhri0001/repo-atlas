import test from "node:test";
import assert from "node:assert/strict";
import { createRepositoryCommands } from "../src/features/command-palette/repository-commands.js";
import { isCommandEnabled, isCommandVisible } from "../src/features/command-palette/command-registry.js";

const sessions = [
  { id: "/workspace/atlas", name: "repo-atlas", path: "/workspace/atlas" },
  { id: "/workspace/api", name: "backend-api", path: "/workspace/api" },
];

test("repository commands cover open, refresh, reveal, close, and switching sessions", () => {
  const commands = createRepositoryCommands({ sessions, recentRepositories: [{ path: "/workspace/other", name: "other-app" }] });
  assert.deepEqual(commands.slice(0, 4).map((command) => command.id), [
    "repository.open",
    "repository.refresh",
    "repository.reveal",
    "repository.close",
  ]);
  assert.equal(commands.some((command) => command.id === "repository.switch./workspace/api"), true);
  assert.equal(commands.some((command) => command.id === "repository.recent./workspace/other"), true);
});

test("repository commands execute only through the supplied context", () => {
  const commands = createRepositoryCommands({ sessions });
  const calls = [];
  const context = {
    activeSession: sessions[0],
    activeRepository: { rootPath: "/workspace/atlas" },
    openRepository: () => calls.push("open"),
    refreshRepository: () => calls.push("refresh"),
    revealRepository: (path) => calls.push(`reveal:${path}`),
    closeRepository: (id) => calls.push(`close:${id}`),
    switchRepository: (id) => calls.push(`switch:${id}`),
    isDemo: false,
  };

  const byId = (id) => commands.find((command) => command.id === id);
  assert.equal(isCommandEnabled(byId("repository.refresh"), context), true);
  byId("repository.open").run(context);
  byId("repository.refresh").run(context);
  byId("repository.reveal").run(context);
  byId("repository.close").run(context);
  byId("repository.switch./workspace/api").run(context);
  assert.deepEqual(calls, ["open", "refresh", "reveal:/workspace/atlas", "close:/workspace/atlas", "switch:/workspace/api"]);
});

test("reveal is hidden in demo mode and recent entries already open are omitted", () => {
  const commands = createRepositoryCommands({
    sessions: [sessions[0]],
    recentRepositories: [{ path: "/workspace/atlas", name: "repo-atlas" }, { path: "/workspace/other", name: "other-app" }],
  });
  const reveal = commands.find((command) => command.id === "repository.reveal");
  assert.equal(isCommandVisible(reveal, { isDemo: true }), false);
  assert.equal(commands.some((command) => command.id === "repository.recent./workspace/atlas"), false);
  assert.equal(commands.some((command) => command.id === "repository.recent./workspace/other"), true);
});
