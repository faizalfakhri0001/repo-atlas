import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getUserTimeZone } from "./activity-model";

export function useActivity({ repoPath, revision, config }) {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    if (!repoPath) {
      setState({ loading: false, error: null, data: null });
      return () => {
        cancelled = true;
      };
    }
    setState((current) => ({ loading: true, error: null, data: current.data }));
    if (typeof api.activity !== "function") {
      setState({ loading: false, error: "Activity analytics is unavailable in this app build.", data: null });
      return () => {
        cancelled = true;
      };
    }
    api
      .activity({
        repositoryPath: repoPath,
        range: config?.range ?? "12m",
        metric: config?.metric ?? "commits",
        author: config?.author || undefined,
        pathPrefix: config?.pathPrefix || undefined,
        timeZone: getUserTimeZone(),
      })
      .then((response) => {
        if (cancelled) return;
        if (!response?.ok) {
          setState({ loading: false, error: response?.error?.message ?? "Activity analytics failed.", data: null });
          return;
        }
        setState({ loading: false, error: null, data: response.data ?? null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error?.message ?? "Activity analytics failed.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [config?.author, config?.metric, config?.pathPrefix, config?.range, repoPath, revision]);

  return state;
}
