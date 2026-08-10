import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, GitCompareArrows, GitGraph, Search } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { AuthorAvatar } from "@/components/author-avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function UpstreamCell({ branch }) {
  if (branch.remote) return <span className="text-muted-foreground/60">—</span>;
  if (!branch.upstream) return <span className="text-muted-foreground/60">no upstream</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="truncate text-muted-foreground">{branch.upstream}</span>
      {branch.gone ? (
        <Badge variant="destructive">gone</Badge>
      ) : (
        <>
          {branch.ahead > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-500">
              <ArrowUp className="size-3" />
              {branch.ahead}
            </span>
          )}
          {branch.behind > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-500">
              <ArrowDown className="size-3" />
              {branch.behind}
            </span>
          )}
          {branch.ahead === 0 && branch.behind === 0 && <span className="text-[11px] text-muted-foreground/60">in sync</span>}
        </>
      )}
    </span>
  );
}

export function BranchesView({ branches, currentBranch, onShowInGraph, onCompareWithCurrent }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("local");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = branches;
    if (scope === "local") list = list.filter((branch) => !branch.remote);
    if (scope === "remote") list = list.filter((branch) => branch.remote);
    if (normalized) {
      list = list.filter((branch) =>
        [branch.name, branch.upstream, branch.author, branch.subject, branch.hash].join(" ").toLowerCase().includes(normalized),
      );
    }
    return [...list].sort((a, b) => Number(b.current) - Number(a.current));
  }, [branches, query, scope]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="mr-auto">
          <h2 className="text-sm font-semibold leading-tight">Branches</h2>
          <p className="text-[11px] text-muted-foreground">Local branches and remote-tracking refs.</p>
        </div>
        <Tabs value={scope} onValueChange={setScope}>
          <TabsList>
            <TabsTrigger value="local">Local {branches.filter((b) => !b.remote).length}</TabsTrigger>
            <TabsTrigger value="remote">Remote {branches.filter((b) => b.remote).length}</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter branches" className="h-8 pl-8 text-xs" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-card text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Branch</th>
                <th className="px-4 py-2.5 font-medium">Latest commit</th>
                <th className="px-4 py-2.5 font-medium">Upstream</th>
                <th className="px-4 py-2.5 font-medium">Author</th>
                <th className="px-4 py-2.5 text-right font-medium">Updated</th>
                <th className="w-24 px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((branch) => (
                <tr
                  key={branch.ref}
                  className={cn("group border-b border-border/60 last:border-0 hover:bg-accent/25", branch.current && "bg-primary/[0.05]")}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <GitBranch className={cn("size-4", branch.current ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("font-medium", branch.current && "text-primary")}>{branch.name}</span>
                      {branch.current && <Badge variant="success">current</Badge>}
                      {branch.remote && <Badge variant="info">remote</Badge>}
                    </div>
                  </td>
                  <td className="max-w-md px-4 py-2.5">
                    <div className="truncate text-[13px]">{branch.subject || "—"}</div>
                    <code className="font-mono text-[11px] text-muted-foreground">{branch.shortHash}</code>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <UpstreamCell branch={branch} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      {branch.author && <AuthorAvatar name={branch.author} size={18} />}
                      {branch.author || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{formatRelativeDate(branch.date)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onShowInGraph(branch.name)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <GitGraph className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Show in commit graph</TooltipContent>
                      </Tooltip>
                      {!branch.current && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onCompareWithCurrent(branch.name)}
                              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <GitCompareArrows className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Compare with {currentBranch} (PR simulation)</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">No branches match the filter.</div>}
        </div>
      </div>
    </div>
  );
}
