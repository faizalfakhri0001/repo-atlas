import {
  Archive,
  Boxes,
  CircleDot,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  HardDrive,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate, formatRelativeDate, truncateMiddle } from "@/lib/utils";
import { HealthSummaryCard } from "@/components/health-card";

function MetricCard({ icon: Icon, label, value, detail }) {
  return (
    <Card className="bg-card/70">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {detail && <div className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{detail}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityChart({ commits }) {
  const DAYS = 42;
  const buckets = new Array(DAYS).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const commit of commits) {
    const date = new Date(commit.date);
    if (Number.isNaN(date.getTime())) continue;
    const diff = Math.floor((today.getTime() - date.getTime()) / (24 * 3600 * 1000));
    if (diff >= 0 && diff < DAYS) buckets[DAYS - 1 - diff] += 1;
  }
  const max = Math.max(1, ...buckets);
  const width = 260;
  const height = 44;
  const barWidth = width / DAYS;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-[260px] max-w-full overflow-visible" aria-label="Commits per day, last 6 weeks">
      {buckets.map((count, index) => {
        const barHeight = count === 0 ? 2 : 4 + (count / max) * (height - 8);
        return (
          <rect
            key={index}
            x={index * barWidth + 1}
            y={height - barHeight}
            width={barWidth - 2}
            height={barHeight}
            rx={1.5}
            fill={count === 0 ? "color-mix(in oklab, var(--muted-foreground) 22%, transparent)" : "var(--primary)"}
            opacity={count === 0 ? 0.5 : 0.4 + 0.6 * (count / max)}
          >
            <title>{`${count} commits`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function Overview({ data, onOpenCommit, onOpenHealth }) {
  const localBranches = data.branches.filter((branch) => !branch.remote);
  const remoteBranches = data.branches.filter((branch) => branch.remote);
  const recent = data.commits.slice(0, 8);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={GitCommitHorizontal}
          label="Commits"
          value={data.repository.totalCommits ?? data.commits.length}
          detail={`${data.commits.length} loaded in graph`}
        />
        <MetricCard icon={GitBranch} label="Local branches" value={localBranches.length} detail={`${remoteBranches.length} remote refs`} />
        <MetricCard icon={Workflow} label="Worktrees" value={data.worktrees.length} detail={`${data.submodules.length} submodules`} />
        <MetricCard icon={CircleDot} label="Working changes" value={data.status.files.length} detail={data.repository.dirty ? "Repository is dirty" : "Working tree is clean"} />
      </div>

      <HealthSummaryCard repoPath={data.repository.rootPath} revision={data.scannedAt} onOpenDetails={onOpenHealth} />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest commits reachable from all refs.</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <ActivityChart commits={data.commits} />
                <Badge variant={data.repository.dirty ? "warning" : "success"}>
                  {data.repository.dirty ? "Uncommitted changes" : "Clean"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {recent.map((commit) => (
              <button
                type="button"
                key={commit.hash}
                onClick={() => onOpenCommit?.(commit.hash)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/30"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <GitCommitHorizontal className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{commit.subject}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {commit.author} · {formatRelativeDate(commit.date)}
                  </div>
                </div>
                <code className="shrink-0 text-xs text-muted-foreground">{commit.shortHash}</code>
              </button>
            ))}
            {recent.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No commits found.</p>}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Repository</CardTitle>
              <CardDescription>Local metadata detected during the scan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Branch" value={data.repository.currentBranch || "Detached HEAD"} icon={GitBranch} />
              <InfoRow label="HEAD" value={data.repository.shortHead || "—"} icon={CircleDot} mono />
              <InfoRow label="Upstream" value={data.repository.upstream || "Not configured"} icon={GitFork} />
              <InfoRow label="Git" value={data.repository.gitVersion} icon={HardDrive} />
              <InfoRow label="Scanned" value={formatDate(data.scannedAt)} icon={Archive} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Repository objects</CardTitle>
              <CardDescription>Values reported by git count-objects.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <CompactStat icon={Boxes} label="Loose" value={data.countObjects.count ?? 0} />
              <CompactStat icon={Archive} label="Packed" value={data.countObjects["in-pack"] ?? 0} />
              <CompactStat icon={Users} label="Contributors" value={data.contributors.length} />
              <CompactStat icon={GitFork} label="Remotes" value={data.remotes.length} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon: Icon, mono = false }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate", mono && "font-mono text-xs")} title={String(value)}>
        {truncateMiddle(String(value), 30, 10)}
      </span>
    </div>
  );
}

function CompactStat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <Icon className="mb-2 size-4 text-muted-foreground" />
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
