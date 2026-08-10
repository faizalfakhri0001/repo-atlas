export { DiffView } from "@/features/diff/diff-view";
export { CopyButton, DiffStat, FilePathLabel, FileStatusBadge } from "@/features/diff/diff-ui";
export { parseUnifiedDiff, countDiffLines, limitDiffHunks } from "@/features/diff/diff-parser";
export { alignSplitHunk, alignSplitDiff } from "@/features/diff/split-aligner";
export { DiffMeta, UnifiedDiff } from "@/features/diff/unified-diff";
export { SplitDiff } from "@/features/diff/split-diff";
export { DiffToolbar } from "@/features/diff/diff-toolbar";
export { languageForPath, languageMap } from "@/features/diff/language-map";
export { SyntaxLine } from "@/features/diff/syntax-line";
export {
  DEFAULT_DIFF_PREFERENCES,
  DIFF_PREFERENCES_KEY,
  loadDiffPreferences,
  normalizeDiffPreferences,
  saveDiffPreferences,
} from "@/features/diff/diff-preferences";
