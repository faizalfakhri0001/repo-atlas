import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Flame, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BAND_VARIANTS = { High: "destructive", Medium: "warning", Low: "muted" };
const EXTENSION_FILTERS = [
  ["all", "All types"],
  ["js", ".js"],
  ["jsx", ".jsx"],
  ["ts", ".ts"],
  ["tsx", ".tsx"],
  ["css", ".css"],
  ["md", ".md"],
  ["json", ".json"],
];

function fileExtension(filePath) {
  const name = filePath.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function metricValue(value) {
  return Number(value ?? 0).toLocaleString();
}

function HotspotScore({ file }) {
  const score = Math.round(Number(file.hotspotScore ?? 0) * 100);
  return (
    <div className="min-w-28">
      <div className="flex items-center gap-2">
        <Badge variant={BAND_VARIANTS[file.hotspotBand] ?? "muted"}>{file.hotspotBand ?? "Low"}</Badge>
        <span className="text-xs font-medium tabular-nums">{score}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/60" title={`Hotspot score ${score}%`}>
        <div className="h-full rounded-full bg-primary/80" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

function HotspotDetail({ file, onOpenFileHistory }) {
  if (!file) return null;
  const contributors = file.topContributors?.length ? file.topContributors : file.authors ?? [];
  return (
    <aside className="border-t border-border bg-card/30 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-primary">{file.path}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Hotspot percentile {Math.round(Number(file.hotspotPercentile ?? 0) * 100)}%</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenFileHistory?.(file.path)}>
          Open File History
        </Button>
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Commits</div><div className="mt-1 font-medium tabular-nums">{metricValue(file.commitCount)}</div></div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Historical churn</div><div className="mt-1 font-medium tabular-nums">{metricValue(file.churn)}</div></div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Ownership concentration</div><div className="mt-1 font-medium tabular-nums">{Math.round(Number(file.ownershipConcentration ?? 0) * 100)}%</div></div>
        <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2"><div className="text-muted-foreground">Last changed</div><div className="mt-1 font-medium">{file.lastChangedAt ? formatRelativeDate(file.lastChangedAt) : "—"}</div></div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Activity over time</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{metricValue(file.commitCount)} commits changed this path; the score weights frequency, churn, and recency.</p>
        </section>
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Top contributors</h3>
          <div className="mt-2 space-y-1.5">
            {contributors.slice(0, 5).map((author) => <div key={author.key ?? author.email ?? author.name} className="flex justify-between gap-3 text-xs"><span className="truncate">{author.name || author.email || "Unknown"}</span><span className="shrink-0 tabular-nums text-muted-foreground">{author.ownershipScore == null ? `${metricValue(author.commits)} commits` : `${Math.round(author.ownershipScore * 100)}% share`}</span></div>)}
            {contributors.length === 0 && <div className="text-xs text-muted-foreground">No contributor identity recorded.</div>}
          </div>
        </section>
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recent commits</h3>
          <div className="mt-2 space-y-1.5">
            {(file.recentCommits ?? []).slice(0, 5).map((commit) => <div key={commit.hash} className="flex gap-2 text-xs"><code className="shrink-0 text-muted-foreground">{commit.shortHash}</code><span className="min-w-0 truncate" title={commit.subject}>{commit.subject || "Untitled commit"}</span></div>)}
            {(file.recentCommits ?? []).length === 0 && <div className="text-xs text-muted-foreground">No commit details in the current scope.</div>}
          </div>
        </section>
      </div>
    </aside>
  );
}

export function HotspotsView({ repoPath, onOpenFileHistory, initialFilter = null, initialConfig = null }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [includeGenerated, setIncludeGenerated] = useState(() => Boolean(initialConfig?.includeGenerated));
  const [pathPrefixDraft, setPathPrefixDraft] = useState(() => initialConfig?.pathPrefix ?? "");
  const [pathPrefix, setPathPrefix] = useState(() => initialConfig?.pathPrefix ?? "");
  const [query, setQuery] = useState("");
  const [extension, setExtension] = useState(() => initialConfig?.extension ?? "all");
  const [concentrationOnly, setConcentrationOnly] = useState(initialFilter === "concentrated");
  const [selectedPath, setSelectedPath] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setConcentrationOnly(initialFilter === "concentrated");
  }, [initialFilter]);

  useEffect(() => {
    if (!initialConfig) return;
    setIncludeGenerated(Boolean(initialConfig.includeGenerated));
    setPathPrefixDraft(initialConfig.pathPrefix ?? "");
    setPathPrefix(initialConfig.pathPrefix ?? "");
    setExtension(initialConfig.extension ?? "all");
  }, [initialConfig]);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: null, data: null });
    api
      .hotspots({ repositoryPath: repoPath, limit: 100, includeGenerated, pathPrefix })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error?.message ?? "Failed to load hotspots.", data: null });
          return;
        }
        setState({ loading: false, error: null, data: response.data ?? null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Failed to load hotspots.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [includeGenerated, pathPrefix, reloadToken, repoPath]);

  const files = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (state.data?.files ?? []).filter((file) => {
      if (normalizedQuery && !file.path.toLowerCase().includes(normalizedQuery)) return false;
      if (extension !== "all" && fileExtension(file.path) !== extension) return false;
      if (concentrationOnly && Number(file.ownershipConcentration) < 0.8) return false;
      return true;
    });
  }, [concentrationOnly, extension, query, state.data?.files]);

  const applyPathPrefix = (event) => {
    event.preventDefault();
    setPathPrefix(pathPrefixDraft.trim().replace(/\/+$/, ""));
  };

  if (state.loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" /> Analyzing file hotspots…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-lg items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="font-medium">Hotspot analysis failed</div>
            <div className="mt-1 text-xs">{state.error}</div>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>
              <RefreshCw /> Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const scope = state.data?.scope ?? {};
  const filters = state.data?.filters ?? {};
  const selectedFile = files.find((file) => file.path === selectedPath) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Flame className="size-4 text-orange-400" />
            <h2 className="text-sm font-semibold">Hotspots</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Files with the highest combination of change frequency, churn, and recent activity.</p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setReloadToken((value) => value + 1)} title="Refresh hotspots" aria-label="Refresh hotspots">
          <RefreshCw />
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <form onSubmit={applyPathPrefix} className="flex min-w-56 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={pathPrefixDraft} onChange={(event) => setPathPrefixDraft(event.target.value)} placeholder="Path prefix, e.g. src" aria-label="Hotspot path prefix" className="h-8 pl-8 text-xs" />
          </div>
          <Button type="submit" variant="outline" size="sm">Apply</Button>
        </form>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter returned files…" aria-label="Filter returned hotspots" className="h-8 pl-8 text-xs" />
        </div>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 text-xs text-muted-foreground">
          <select value={extension} onChange={(event) => setExtension(event.target.value)} aria-label="Filter hotspots by extension" className="bg-transparent text-foreground outline-none">
            {EXTENSION_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background/70 px-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeGenerated} onChange={(event) => setIncludeGenerated(event.target.checked)} aria-label="Include generated and lock files" />
          Include generated
        </label>
        {concentrationOnly && <Badge variant="warning">Concentrated ownership</Badge>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card/30 px-5 py-2 text-[11px] text-muted-foreground">
        <span>{metricValue(files.length)} shown</span>
        <span>·</span>
        <span>{metricValue(scope.eligibleFiles ?? 0)} eligible files</span>
        <span>·</span>
        <span>{metricValue(scope.processedCommits ?? 0)} commits analyzed</span>
        {filters.excludedGeneratedFiles > 0 && <Badge variant="muted">{metricValue(filters.excludedGeneratedFiles)} generated excluded</Badge>}
        {scope.truncated && <Badge variant="warning">Bounded analysis{scope.sourceTruncated ? " · history truncated" : ""}</Badge>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {files.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            <div>
              <Flame className="mx-auto mb-3 size-7 opacity-40" />
              No hotspot files match the current filters.
            </div>
          </div>
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-background/95 text-[11px] text-muted-foreground backdrop-blur">
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 font-medium">File</th>
                <th className="px-3 py-2.5 font-medium">Hotspot</th>
                <th className="px-3 py-2.5 font-medium">Primary contributor</th>
                <th className="px-3 py-2.5 font-medium text-right">Commits</th>
                <th className="px-3 py-2.5 font-medium text-right">Churn</th>
                <th className="px-3 py-2.5 font-medium text-right">Authors</th>
                <th className="px-5 py-2.5 font-medium text-right">Last change</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.path} className={cn("border-b border-border/60 hover:bg-accent/30", selectedPath === file.path && "bg-primary/5")} onClick={() => setSelectedPath(file.path)}>
                  <td className="max-w-[420px] px-5 py-3">
                    <button type="button" className="block max-w-full truncate text-left font-mono text-[11px] text-primary hover:underline" onClick={() => { setSelectedPath(file.path); onOpenFileHistory?.(file.path); }} title="Open File History">
                      {file.path}
                    </button>
                    <div className="mt-1 text-[10px] text-muted-foreground">{metricValue(file.additions)} additions · {metricValue(file.deletions)} deletions</div>
                  </td>
                  <td className="px-3 py-3"><HotspotScore file={file} /></td>
                  <td className="max-w-36 px-3 py-3"><div className="truncate">{file.primaryContributor?.name || "—"}</div><div className="text-[10px] text-muted-foreground">ownership {Math.round(Number(file.ownershipConcentration ?? 0) * 100)}%</div></td>
                  <td className="px-3 py-3 text-right tabular-nums">{metricValue(file.commitCount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{metricValue(file.churn)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{metricValue(file.authorCount)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground" title={file.lastChangedAt ? formatDate(file.lastChangedAt) : "No known change date"}>
                    {file.lastChangedAt ? formatRelativeDate(file.lastChangedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <HotspotDetail file={selectedFile} onOpenFileHistory={onOpenFileHistory} />
      </div>
    </div>
  );
}
