import { Archive, GitFork, Tags, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeDate, truncateMiddle } from "@/lib/utils";

export function RefsView({ data }) {
  return (
    <div className="h-full overflow-auto p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">Refs and repository metadata</h2>
        <p className="text-sm text-muted-foreground">Tags, stashes, remotes, and contributors.</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ListCard title="Tags" description="Annotated and lightweight tags." icon={Tags} empty="No tags found.">
          {data.tags.map((tag) => (
            <Row key={tag.name} title={tag.name} subtitle={tag.subject || tag.shortHash} meta={formatRelativeDate(tag.date)} badge={tag.shortHash} />
          ))}
        </ListCard>

        <ListCard title="Stashes" description="Local stash references." icon={Archive} empty="No stashes found.">
          {data.stashes.map((stash) => (
            <Row key={`${stash.ref}-${stash.hash}`} title={stash.ref} subtitle={stash.subject} meta={formatRelativeDate(stash.date)} badge={stash.shortHash} />
          ))}
        </ListCard>

        <ListCard title="Remotes" description="Configured fetch and push URLs." icon={GitFork} empty="No remotes configured.">
          {data.remotes.map((remote) => (
            <div key={remote.name} className="rounded-lg border border-border/70 p-3">
              <div className="mb-2 flex items-center justify-between"><span className="font-medium">{remote.name}</span><Badge variant="info">remote</Badge></div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div title={remote.fetchUrl}>fetch · {truncateMiddle(remote.fetchUrl, 42, 18)}</div>
                <div title={remote.pushUrl}>push · {truncateMiddle(remote.pushUrl, 42, 18)}</div>
              </div>
            </div>
          ))}
        </ListCard>

        <ListCard title="Contributors" description="Top authors by reachable commit count." icon={Users} empty="No contributors found.">
          {data.contributors.map((contributor) => (
            <Row key={`${contributor.name}-${contributor.email}`} title={contributor.name} subtitle={contributor.email || "No email"} badge={`${contributor.commits} commits`} />
          ))}
        </ListCard>
      </div>
    </div>
  );
}

function ListCard({ title, description, icon: Icon, empty, children }) {
  const items = Array.isArray(children) ? children : [children].filter(Boolean);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Icon className="size-4 text-primary" />{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="max-h-[420px] space-y-2 overflow-auto">
        {items.length > 0 ? items : <div className="py-8 text-center text-sm text-muted-foreground">{empty}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ title, subtitle, meta, badge }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 p-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      {badge && <Badge variant="muted">{badge}</Badge>}
    </div>
  );
}
