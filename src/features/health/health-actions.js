const HEALTH_NAVIGATION_VIEWS = new Set(["workspace", "branches", "files", "hotspots", "ownership", "commits"]);
const HEALTH_FILTERS = new Set(["conflicts", "stale", "behind", "gone", "large", "concentrated"]);

export function resolveHealthNavigation(action) {
  const view = action?.payload?.view;
  if (!HEALTH_NAVIGATION_VIEWS.has(view)) return null;
  const filter = action?.payload?.filter;
  return {
    view,
    payload: HEALTH_FILTERS.has(filter) ? { filter } : {},
  };
}
