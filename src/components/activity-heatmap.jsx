import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  ACTIVITY_METRICS,
  ACTIVITY_RANGES,
  buildCalendarColumns,
  formatActivityDate,
  getUserTimeZone,
} from "@/features/activity/activity-model";
import { useActivity } from "@/features/activity/use-activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RANGE_LABELS = { "3m": "3 months", "6m": "6 months", "12m": "12 months", "2y": "2 years", all: "All history" };
const METRIC_LABELS = { commits: "Commits", churn: "Change volume" };
const WEEKDAY_LABELS = ["Sun", "", "Tue", "", "Thu", "", "Sat"];
const LEVEL_CLASSES = ["bg-muted/45", "bg-primary/20", "bg-primary/40", "bg-primary/65", "bg-primary"];

function count(value) {
  return Number(value ?? 0).toLocaleString();
}

function decimal(value) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function authorLabel(author) {
  return author?.name || author?.email || "Unknown author";
}

function bucketTitle(bucket) {
  if (!bucket) return "No activity";
  return `${formatActivityDate(bucket.date)} · ${count(bucket.commits)} commit${bucket.commits === 1 ? "" : "s"} · +${count(bucket.additions)} / -${count(bucket.deletions)} · ${count(bucket.authors)} contributor${bucket.authors === 1 ? "" : "s"}`;
}

function entryTime(entry) {
  const date = new Date(entry?.authoredAt ?? "");
  return Number.isNaN(date.getTime()) ? "Unknown time" : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function Stat({ label, value, detail }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</div>}
    </div>
  );
}

function ActivityControls({ config, data, pathDraft, onChange, onPathDraftChange, onApplyPath }) {
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-border px-5 py-3">
      <label className="flex min-w-32 flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Range
        <select aria-label="Activity range" value={config.range} onChange={(event) => onChange({ range: event.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring">
          {Object.keys(ACTIVITY_RANGES).map((value) => <option key={value} value={value}>{RANGE_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="flex min-w-32 flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Metric
        <select aria-label="Activity metric" value={config.metric} onChange={(event) => onChange({ metric: event.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring">
          {ACTIVITY_METRICS.map((value) => <option key={value} value={value}>{METRIC_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="flex min-w-44 flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Contributor
        <select aria-label="Activity author" value={config.author} onChange={(event) => onChange({ author: event.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal normal-case tracking-normal text-foreground outline-none focus:ring-2 focus:ring-ring">
          <option value="">All contributors</option>
          {(data?.authors ?? []).map((author) => <option key={author.key} value={author.key}>{authorLabel(author)}</option>)}
        </select>
      </label>
      <form onSubmit={onApplyPath} className="flex min-w-56 flex-1 items-end gap-2">
        <label className="min-w-0 flex-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Path prefix
          <Input aria-label="Activity path prefix" value={pathDraft} onChange={onPathDraftChange} placeholder="e.g. src/api" className="mt-1 h-8 text-xs normal-case tracking-normal" />
        </label>
        <Button type="submit" variant="outline" size="sm">Apply</Button>
      </form>
    </div>
  );
}

function ActivityGrid({ buckets, selectedDate, onSelect, compact = false }) {
  const columns = useMemo(() => buildCalendarColumns(buckets), [buckets]);
  const cellSize = compact ? "size-2.5" : "size-3.5";
  return (
    <div className={cn("overflow-x-auto", compact ? "pb-0" : "pb-1")}>
      <div className="min-w-max">
        {!compact && (
          <div className="mb-1 flex gap-1 pl-8 text-[10px] text-muted-foreground">
            {columns.map((column, index) => <span key={`${column.label}-${index}`} className="w-3.5 text-center">{column.label}</span>)}
          </div>
        )}
        <div className="flex gap-1">
          {!compact && <div className="grid grid-rows-7 gap-1 pr-1 text-[10px] leading-3 text-muted-foreground">{WEEKDAY_LABELS.map((label, index) => <span key={index} className="flex h-3.5 items-center">{label}</span>)}</div>}
          <div className="flex gap-1">
            {columns.map((column, columnIndex) => (
              <div key={columnIndex} className="grid grid-rows-7 gap-1">
                {column.days.map((bucket, dayIndex) => bucket ? (
                  <button
                    type="button"
                    key={bucket.date}
                    className={cn(cellSize, "rounded-[3px] transition-shadow hover:ring-2 hover:ring-primary/60", LEVEL_CLASSES[bucket.level] ?? LEVEL_CLASSES[0], selectedDate === bucket.date && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
                    title={bucketTitle(bucket)}
                    aria-label={bucketTitle(bucket)}
                    onClick={() => onSelect?.(bucket.date)}
                  />
                ) : <span key={`${columnIndex}-${dayIndex}`} className={cn(cellSize, "rounded-[3px]")} aria-hidden="true" />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayDetail({ bucket, onOpenCommit }) {
  if (!bucket) return null;
  return (
    <div className="border-t border-border bg-card/30 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{formatActivityDate(bucket.date)}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{bucketTitle(bucket)}</p>
        </div>
        {bucket.entriesTruncated && <Badge variant="warning">Showing first 50 commits</Badge>}
      </div>
      {bucket.entries?.length ? (
        <div className="mt-3 space-y-1">
          {bucket.entries.map((entry) => (
            <div key={entry.hash} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs">
              <code className="shrink-0 font-mono text-primary">{entry.shortHash}</code>
              <span className="min-w-0 flex-1 truncate" title={entry.subject}>{entry.subject || "Untitled commit"}</span>
              <span className="shrink-0 text-muted-foreground">{authorLabel(entry.author)} · {entryTime(entry)}</span>
              <Button variant="outline" size="sm" className="h-7" onClick={() => onOpenCommit?.(entry.hash)}>Open Commit</Button>
            </div>
          ))}
        </div>
      ) : <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No commits were recorded on this day.</div>}
    </div>
  );
}

function ScopeNotice({ scope }) {
  if (!scope?.sourceTruncated && !scope?.rangeTruncated) return null;
  return (
    <div className="border-b border-amber-500/25 bg-amber-500/8 px-5 py-2 text-xs text-amber-400">
      This repository activity report is bounded. {scope.sourceTruncated ? "The analytics source did not include the complete history. " : ""}{scope.rangeTruncated ? "The requested calendar range was capped. " : ""}Metrics describe the analyzed scope only.
    </div>
  );
}

export function ActivityHeatmap({ repoPath, revision, initialConfig = null, compact = false, onOpenCommit, onOpenActivity, onConfigChange }) {
  const [config, setConfig] = useState(() => ({
    range: initialConfig?.range ?? "12m",
    metric: initialConfig?.metric ?? "commits",
    author: initialConfig?.author ?? "",
    pathPrefix: initialConfig?.pathPrefix ?? "",
  }));
  const [pathDraft, setPathDraft] = useState(() => initialConfig?.pathPrefix ?? "");
  const [selectedDate, setSelectedDate] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!initialConfig) return;
    setConfig({
      range: initialConfig.range ?? "12m",
      metric: initialConfig.metric ?? "commits",
      author: initialConfig.author ?? "",
      pathPrefix: initialConfig.pathPrefix ?? "",
    });
    setPathDraft(initialConfig.pathPrefix ?? "");
  }, [initialConfig?.author, initialConfig?.metric, initialConfig?.pathPrefix, initialConfig?.range]);

  const state = useActivity({ repoPath, revision: `${revision ?? ""}:${reloadToken}`, config });
  const data = state.data;
  const selectedBucket = data?.buckets?.find((bucket) => bucket.date === selectedDate) ?? null;
  const stats = data?.stats ?? {};
  const applyConfig = (patch) => {
    const next = { ...config, ...patch };
    setConfig(next);
    setSelectedDate(null);
    onConfigChange?.(next);
  };
  const applyPath = (event) => {
    event.preventDefault();
    applyConfig({ pathPrefix: pathDraft.trim().replace(/\/+$/, "") });
  };

  const header = (
    <CardHeader className={cn(compact ? "px-4 py-3" : "px-5 py-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><CardTitle className={compact ? "text-sm" : "text-base"}>Repository activity</CardTitle></div>
          <CardDescription className="mt-1">Commit history and change volume by local calendar day. This is repository activity, not a productivity score.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {!compact && <Button variant="ghost" size="icon" className="size-8" onClick={() => setReloadToken((value) => value + 1)} title="Refresh activity" aria-label="Refresh activity"><RefreshCw /></Button>}
          {compact && <Button variant="outline" size="sm" onClick={onOpenActivity}>Open Activity</Button>}
        </div>
      </div>
    </CardHeader>
  );

  if (state.loading && !data) {
    return compact ? <Card className="bg-card/70">{header}<CardContent className="flex min-h-28 items-center justify-center gap-2 px-4 pb-4 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading activity…</CardContent></Card> : <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Analyzing repository activity…</div>;
  }

  if (state.error && !data) {
    return compact ? <Card className="bg-card/70">{header}<CardContent className="px-4 pb-4 text-xs text-red-400"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{state.error}</span></div></CardContent></Card> : <div className="flex h-full items-center justify-center p-8"><div className="max-w-lg rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-5 shrink-0" /><div><div className="font-medium">Activity analytics failed</div><div className="mt-1 text-xs">{state.error}</div><Button variant="outline" size="sm" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>Try again</Button></div></div></div></div>;
  }

  const content = (
    <Card className={cn("bg-card/70", !compact && "min-h-full")}>
      {header}
      {!compact && <ActivityControls config={config} data={data} pathDraft={pathDraft} onChange={applyConfig} onPathDraftChange={(event) => setPathDraft(event.target.value)} onApplyPath={applyPath} />}
      <ScopeNotice scope={data?.scope} />
      <CardContent className={cn(compact ? "px-4 pb-4 pt-0" : "px-5 pb-5 pt-4")}>
        <div className={cn("flex flex-wrap gap-2", compact ? "grid grid-cols-3" : "grid gap-2 sm:grid-cols-3 lg:grid-cols-6")}>
          <Stat label="Active days" value={count(stats.activeDays)} />
          <Stat label="Commits" value={count(stats.totalCommits)} />
          <Stat label="Avg / active day" value={decimal(stats.avgCommitsPerActiveDay)} />
          {!compact && <Stat label="Peak day" value={stats.peakDay ? count(stats.peakDay.value) : "—"} detail={stats.peakDay ? formatActivityDate(stats.peakDay.date, { dateStyle: "short" }) : "No activity"} />}
          {!compact && <Stat label="Current streak" value={`${count(stats.currentActiveStreak)} days`} />}
          {!compact && <Stat label="Longest inactive" value={`${count(stats.longestInactiveStreak)} days`} />}
        </div>
        <div className={cn("mt-4", compact ? "rounded-lg border border-border/60 bg-background/30 p-3" : "rounded-xl border border-border/70 bg-background/30 p-4")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{RANGE_LABELS[data?.range] ?? "Activity"} · {METRIC_LABELS[data?.metric] ?? "Commits"} · user-local calendar day ({data?.timeZone ?? getUserTimeZone()})</span>
            <span className="flex items-center gap-1.5"><span>Less</span>{LEVEL_CLASSES.map((className, level) => <span key={level} className={cn("size-3 rounded-[3px]", className)} />)}<span>More</span></span>
          </div>
          {data?.stats?.totalCommits > 0 ? <ActivityGrid buckets={data?.buckets ?? []} selectedDate={selectedDate} onSelect={setSelectedDate} compact={compact} /> : <div className="py-6 text-center text-xs text-muted-foreground">No repository activity was recorded in the selected range.</div>}
        </div>
        {!compact && <DayDetail bucket={selectedBucket} onOpenCommit={onOpenCommit} />}
      </CardContent>
      {state.loading && data && <div className="border-t border-border px-5 py-2 text-[11px] text-muted-foreground">Refreshing activity…</div>}
    </Card>
  );

  return compact ? content : <div className="h-full overflow-auto p-5"><div className="mx-auto min-h-full max-w-[1320px]">{content}</div></div>;
}
