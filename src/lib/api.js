import { createDemoApi } from "@/lib/demo";

const bridge = typeof window !== "undefined" ? window.repoAtlas : null;

/** True when running outside Electron (plain browser) — a sample repository is served instead. */
export const isDemo = !bridge;

export const api = bridge ?? createDemoApi();
