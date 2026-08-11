const REFRESH_PLANS = Object.freeze({
  worktree: Object.freeze({ parts: Object.freeze(["status", "worktrees"]), invalidates: Object.freeze([]) }),
  index: Object.freeze({ parts: Object.freeze(["status"]), invalidates: Object.freeze([]) }),
  head: Object.freeze({ parts: Object.freeze(["head"]), invalidates: Object.freeze(["blame-head", "search-commits"]) }),
  refs: Object.freeze({ parts: Object.freeze(["refs"]), invalidates: Object.freeze(["analytics", "branch-intelligence", "health"]) }),
  "operation-state": Object.freeze({ parts: Object.freeze(["status", "state"]), invalidates: Object.freeze([]) }),
});

export function getRepositoryRefreshPlan(kind) {
  const plan = REFRESH_PLANS[kind] ?? REFRESH_PLANS.worktree;
  return { parts: [...plan.parts], invalidates: [...plan.invalidates] };
}

export function mergeRepositoryRefreshPlans(plans = []) {
  const parts = [...new Set(plans.flatMap((plan) => plan?.parts ?? []))];
  const invalidates = [...new Set(plans.flatMap((plan) => plan?.invalidates ?? []))];
  return { parts, invalidates };
}

export const REPOSITORY_REFRESH_KINDS = Object.freeze(Object.keys(REFRESH_PLANS));
