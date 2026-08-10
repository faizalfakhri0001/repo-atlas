import { CircleAlert, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { truncateMiddle } from "@/lib/utils";

export function RepositoryRecovery({ repositoryPath, onLocate, onRemove }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-xl border border-amber-500/25 bg-amber-500/5 p-6 text-center">
        <CircleAlert className="mx-auto size-9 text-amber-400" />
        <h1 className="mt-4 text-xl font-semibold">Repository not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The repository is no longer available at the saved location. Locate it again or remove it from your recent repositories.
        </p>
        <code className="mt-4 block truncate rounded-md bg-background/70 px-3 py-2 text-xs text-foreground" title={repositoryPath}>
          {truncateMiddle(repositoryPath, 52, 18)}
        </code>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onLocate}>
            <FolderOpen /> Locate repository
          </Button>
          <Button variant="outline" onClick={onRemove}>
            <Trash2 /> Remove from Recent
          </Button>
        </div>
      </div>
    </div>
  );
}
