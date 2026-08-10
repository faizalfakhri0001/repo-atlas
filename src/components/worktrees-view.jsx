import { ExternalLink, FolderGit2, GitBranch, LockKeyhole, Unplug } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateMiddle } from "@/lib/utils";

export function WorktreesView({ worktrees }) {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Worktrees</h2>
        <p className="text-sm text-muted-foreground">Every worktree registered by the repository.</p>
      </div>
      {worktrees.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {worktrees.map((worktree) => (
            <Card key={`${worktree.path}-${worktree.head}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <FolderGit2 className="size-4 text-primary" />
                      <span className="truncate">{worktree.path.split(/[\\/]/).pop()}</span>
                    </CardTitle>
                    <CardDescription title={worktree.path}>{truncateMiddle(worktree.path, 46, 20)}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    {worktree.detached && <Badge variant="warning"><Unplug className="size-3" />detached</Badge>}
                    {worktree.locked && <Badge variant="destructive"><LockKeyhole className="size-3" />locked</Badge>}
                    {worktree.prunable && <Badge variant="warning">prunable</Badge>}
                    {worktree.bare && <Badge variant="muted">bare</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <GitBranch className="size-4 text-muted-foreground" />
                  <span className="w-16 text-muted-foreground">Branch</span>
                  <span>{worktree.branch || "Detached HEAD"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="size-4 text-center font-mono text-xs text-muted-foreground">#</span>
                  <span className="w-16 text-muted-foreground">HEAD</span>
                  <code className="text-xs">{worktree.head?.slice(0, 12) || "—"}</code>
                </div>
                {worktree.reason && <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{worktree.reason}</div>}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => api.revealRepository(worktree.path)}
                >
                  <ExternalLink /> Reveal in file manager
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty label="No worktrees found." />
      )}
    </div>
  );
}

function Empty({ label }) {
  return <div className="rounded-xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">{label}</div>;
}
