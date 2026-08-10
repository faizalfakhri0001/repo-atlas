import { Boxes, GitCommitHorizontal, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { truncateMiddle } from "@/lib/utils";

const stateVariant = {
  clean: "success",
  modified: "warning",
  conflict: "destructive",
  "not-initialized": "muted",
  unknown: "muted",
};

export function SubmodulesView({ submodules }) {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Submodules</h2>
        <p className="text-sm text-muted-foreground">Configuration and local checkout state from .gitmodules.</p>
      </div>
      {submodules.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {submodules.map((submodule) => (
            <Card key={`${submodule.path}-${submodule.hash}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      <Boxes className="size-4 text-primary" />
                      <span className="truncate">{submodule.name}</span>
                    </CardTitle>
                    <CardDescription>{submodule.path}</CardDescription>
                  </div>
                  <Badge variant={stateVariant[submodule.state] || "muted"}>{submodule.state}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="w-14 shrink-0 text-muted-foreground">URL</span>
                  <span className="truncate" title={submodule.url}>{truncateMiddle(submodule.url || "Not configured", 40, 18)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" />
                  <span className="w-14 shrink-0 text-muted-foreground">Commit</span>
                  <code className="text-xs">{submodule.shortHash || "Not checked out"}</code>
                </div>
                {submodule.description && <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{submodule.description}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">No submodules configured.</div>
      )}
    </div>
  );
}
