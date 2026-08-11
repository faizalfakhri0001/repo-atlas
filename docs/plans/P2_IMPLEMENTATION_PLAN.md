# Repo Atlas — P2 Implementation Plan

**Repository:** `faizalfakhri0001/repo-atlas`  
**Scope:** seluruh fitur P2 setelah P0 dan P1 selesai  
**Target:** memperkuat Repo Atlas sebagai repository history workspace, productivity layer, dan safe multi-worktree Git tool tanpa kehilangan prinsip offline-first, explainability, explicit IPC, dan safe-write boundaries.

---

# 1. Fitur P2

P2 mencakup:

1. **P2-01 — Reflog Timeline**
2. **P2-02 — Worktree Manager**
3. **P2-03 — Repository Activity Heatmap**
4. **P2-04 — Saved Views / Saved Filters**
5. **P2-05 — Commit Bookmarks & Local Notes**

P2 dibangun di atas kemampuan P0/P1:

```text
P0
├── Command Palette
├── Multi Repository Workspace
├── File Explorer
├── File History
├── Split Diff
└── Global Search

P1
├── Repository Health
├── Branch Intelligence
├── Hotspots
├── Contributor Ownership
├── Git Blame
├── Auto Refresh
└── Safe Stage / Unstage
```

---

# 2. Product Direction Setelah P2

Setelah P2, Repo Atlas harus dapat membantu user menjawab:

```text
Apa yang terjadi pada HEAD sebelum branch berubah?
Commit yang hilang ada di mana?
Kapan reset/rebase/checkout terakhir terjadi?
Bagaimana aktivitas repository sepanjang waktu?
Bagaimana cara menyimpan kombinasi filter yang sering dipakai?
Bagaimana cara menandai commit penting secara lokal?
Bagaimana cara membuat dan mengelola worktree tanpa terminal?
```

Target positioning:

```text
Visual Git history workspace
+
Repository intelligence
+
Personal repository workspace
+
Safe local Git operations
```

---

# 3. Prinsip Arsitektur P2

Semua P2 mengikuti aturan:

```text
offline-first
local-only metadata
explicit IPC
bounded Git execution
no arbitrary shell
no arbitrary Git command input
read-only by default
safe-write only for Worktree Manager
preview before destructive operation
repository-scoped persistence
cross-platform paths
explainable data
```

Tidak boleh menambahkan:

```text
runGit(commandString)
runShell(...)
executeScript(...)
filesystem:any-read
filesystem:any-write
```

---

# 4. Shared Foundation P2

P2 membutuhkan tiga fondasi bersama:

```text
Local Repository Metadata Store
Saved Navigation Model
Safe Worktree Operations Layer
```

---

# 5. Local Repository Metadata Store

## 5.1 Tujuan

Menyimpan data lokal yang bukan bagian Git repository:

```text
saved views
bookmarks
notes
UI preferences per repository
```

Data ini tidak boleh dimasukkan ke working tree repository.

Jangan membuat:

```text
.repo-atlas/
```

di repository secara default.

Gunakan application data directory Electron.

---

# 6. Storage Location

Gunakan:

```js
app.getPath("userData")
```

Target:

```text
<userData>/repo-atlas/
├── repositories/
│   ├── <repository-id>.json
│   └── ...
└── settings.json
```

Repository metadata:

```text
repositories/<repository-id>.json
```

---

# 7. Repository ID

Jangan menggunakan nama repository saja.

Buat deterministic ID dari canonical common Git directory:

```text
SHA-256(normalized canonical commonGitDir)
```

Untuk repository biasa:

```text
commonGitDir ≈ .git
```

Untuk linked worktree:

```text
commonGitDir sama untuk seluruh worktree
```

Windows normalization:

```text
drive-letter case normalized
path separators normalized
realpath when possible
```

---

# 8. Metadata Schema

```ts
RepositoryLocalMetadata = {
  version: 2,

  repository: {
    id: string,
    commonGitDir: string,
    lastKnownName: string
  },

  savedViews: SavedView[],
  bookmarks: CommitBookmark[],
  notes: LocalNote[],

  preferences: {
    heatmap?: object,
    reflog?: object,
    worktree?: object
  },

  updatedAt: string
}
```

---

# 9. Atomic Persistence

Jangan overwrite langsung.

Flow:

```text
serialize
↓
write temporary file
↓
close/fsync
↓
rename temp → target
```

Tujuan:

```text
mengurangi risiko file metadata korup ketika app crash
```

P2 recommended:

```text
retain one last valid backup
```

---

# 10. Metadata Validation

Load file:

```text
parse JSON
validate version
validate field types
drop malformed optional entries
```

Jangan crash app jika metadata corrupted.

UI:

```text
Local Repo Atlas metadata could not be fully loaded.
```

Actions:

```text
Retry
Reset local metadata
```

Tidak menyentuh Git repository.

---

# 11. Metadata IPC

Gunakan granular IPC:

```text
saved-view:list
saved-view:create
saved-view:update
saved-view:delete

bookmark:list
bookmark:create
bookmark:update
bookmark:delete

note:list
note:create
note:update
note:delete
```

Renderer tidak mendapat arbitrary filesystem writer.

---

# 12. P2-01 — Reflog Timeline

## 12.1 Tujuan

Membuat `git reflog` mudah dipahami secara visual.

Use cases:

```text
menemukan commit sebelum reset
melihat checkout terakhir
memahami rebase
melihat branch tip sebelumnya
recover commit yang tidak lagi reachable
```

---

# 13. Reflog Scope

P2 baseline:

```text
HEAD reflog
local branch reflog
```

Default view:

```text
HEAD
```

Selector:

```text
HEAD
main
develop
feature/payment
```

---

# 14. Git Command

Preferred:

```bash
git log -g \
  --date=iso-strict \
  --format=<structured-format> \
  -n <limit> \
  --skip=<skip> \
  <ref>
```

Alternative:

```bash
git reflog show
```

jika output/compatibility lebih sesuai.

---

# 15. Reflog Entry Model

```ts
ReflogEntry = {
  index: number,

  hash: string,
  shortHash: string,

  selector: string,
  refName: string,

  date: string,

  actor: {
    name: string,
    email: string
  },

  rawMessage: string,

  action: ReflogAction,
  detail: string,

  reachable: boolean | null
}
```

Action:

```ts
ReflogAction =
  | "commit"
  | "checkout"
  | "reset"
  | "rebase"
  | "merge"
  | "pull"
  | "cherry-pick"
  | "revert"
  | "branch"
  | "amend"
  | "other"
```

---

# 16. Reflog Action Parser

Examples:

```text
commit: Add feature
commit (amend): Fix typo
checkout: moving from main to develop
reset: moving to HEAD~1
rebase (start): checkout main
rebase (pick): ...
merge feature/x: Merge made by...
```

Pure function:

```text
parseReflogAction(subject)
```

Fallback:

```text
other
```

Jangan terlalu agresif melakukan inference.

---

# 17. Reachability

Jangan hitung untuk seluruh list karena mahal.

Default:

```text
reachable = null
```

Saat entry dipilih:

```text
commit:reachability
```

Backend dapat mengecek:

```bash
git branch --contains <hash>
git tag --contains <hash>
```

Response:

```ts
{
  branches: string[],
  tags: string[],
  reachableFromAnyKnownRef: boolean
}
```

---

# 18. Reflog Timeline UI

Navigation:

```text
History
  Commits
  Reflog
```

Layout:

```text
HEAD Reflog

[ HEAD ▼ ] [ All actions ▼ ] [ Search ]

Today
│
● 20:14  checkout
│         main → feature/payment
│         2ac19e2
│
● 19:51  commit
│         Add payment validation
│         a7310be
│
● 18:10  reset
│         moving to HEAD~1
│         c0192aa
```

---

# 19. Timeline Grouping

Group:

```text
Today
Yesterday
Aug 8, 2026
Older
```

---

# 20. Reflog Filters

```text
All
Commit
Checkout
Reset
Rebase
Merge
Cherry-pick
```

Search loaded entries by:

```text
hash
message
actor
action
```

---

# 21. Reflog Detail Panel

```text
Reflog Entry

Action
checkout

Time
Aug 10, 2026 20:14

Commit
2ac19e2

Message
checkout: moving from main to feature/payment

Reachability
Reachable from feature/payment

[ View Commit ]
[ Compare with Previous ]
[ Copy Hash ]
```

---

# 22. Compare with Previous

Jika selected entry dan entry sebelumnya tersedia:

```text
base = previous.hash
head = selected.hash
```

Open existing Compare view.

No new diff implementation.

---

# 23. Recovery Boundary

P2 tidak langsung menyediakan:

```text
reset
hard reset
restore branch
checkout detached recovery
```

Baseline hanya:

```text
View Commit
Compare
Copy Hash
```

Ini mempertahankan safety.

---

# 24. Reflog Pagination

Default:

```text
200
```

Max:

```text
1000 per request
```

UI:

```text
Load more
```

---

# 25. Reflog IPC

```text
reflog:list
commit:reachability
```

Payload:

```ts
{
  repositoryPath: string,
  ref?: string,
  limit?: number,
  skip?: number
}
```

---

# 26. Reflog Validation

Allow:

```text
HEAD
known local branch
refs/heads/*
```

Ref tetap melalui safe ref validation.

---

# 27. Auto Refresh Integration

P1 watcher event:

```text
HEAD
refs
```

Behavior:

```text
active reflog → refresh first page
inactive reflog → mark stale
```

Preserve selected entry jika masih tersedia.

---

# 28. Reflog Acceptance Criteria

- HEAD reflog loads.
- Local branch reflog loads.
- Pagination works.
- Actions classified.
- Unknown action visible.
- Filter/search works.
- Detail panel works.
- View Commit works.
- Compare Previous works.
- Reachability on demand works.
- No recovery write operation.
- Large reflog bounded.
- Auto refresh integration works.

---

# 29. Reflog Testing

Unit:

```text
action parser
structured output parser
date grouping
filtering
pagination
```

Integration fixture:

```text
commit
checkout
amend
reset
rebase
merge
cherry-pick
```

---

# 30. P2-02 — Worktree Manager

## 30.1 Tujuan

Mengembangkan Worktrees dari read-only listing menjadi safe manager.

Actions:

```text
create worktree
open worktree
reveal worktree
compare
remove clean worktree
prune stale metadata
```

---

# 31. Worktree Model

```ts
WorktreeInfo = {
  path: string,

  head: string,
  shortHead: string,

  branch: string | null,

  bare: boolean,
  detached: boolean,

  locked: boolean,
  lockReason: string | null,

  prunable: boolean,
  pruneReason: string | null,

  main: boolean,

  exists: boolean,

  dirty?: boolean,
  changes?: number
}
```

---

# 32. Worktree Details

Selected worktree status:

```bash
git -C <known-worktree-path> status --porcelain=v2 --branch
```

Renderer tidak boleh mengirim arbitrary external path.

Backend verifies selected path against current:

```bash
git worktree list --porcelain
```

---

# 33. Worktree UI

```text
Worktrees

Main
repo-atlas
~/Projects/repo-atlas
main
Clean

Additional
repo-atlas-payment
~/Worktrees/repo-atlas-payment
feature/payment
3 changes

[ Create Worktree ]
```

---

# 34. Create Modes

P2:

```text
Existing local branch
New branch from start point
Detached at commit
```

Remote branch creation tidak wajib P2 awal.

---

# 35. Existing Branch Command

```bash
git worktree add -- <path> <branch>
```

Validation:

```text
Safe Write enabled
no blocking repository operation
local branch resolves
branch not already checked out elsewhere
target path valid
target path does not exist
```

---

# 36. New Branch Command

```bash
git worktree add -b <newBranch> -- <path> <startPoint>
```

Validate branch name using:

```bash
git check-ref-format --branch <branch>
```

Resolve start point safely.

---

# 37. Detached Worktree

```bash
git worktree add --detach -- <path> <commit>
```

Commit resolved to verified hash first.

---

# 38. Worktree Location UX

Use native picker.

IPC:

```text
dialog:choose-worktree-location
```

Recommended flow:

```text
Choose Parent Folder
↓
Repo Atlas suggests target directory
↓
user confirms
```

Avoid arbitrary free-form absolute path as primary interaction.

---

# 39. Suggested Path

Repository:

```text
/Users/a/Projects/repo-atlas
```

Branch:

```text
feature/payment
```

Suggestion:

```text
/Users/a/Projects/repo-atlas-payment
```

Sanitize branch segment for filename only.

---

# 40. Target Directory Rule

P2 safest:

```text
target must not already exist
```

No support existing empty folder initially.

---

# 41. Create Preview

IPC:

```text
worktree:create-preview
```

Response:

```ts
{
  allowed: boolean,

  operation: {
    mode: string,
    branch?: string,
    startPoint?: string,
    targetPath: string
  },

  warnings: string[],
  blockingReasons: string[]
}
```

Execution:

```text
worktree:create
```

Backend revalidates.

---

# 42. Remove Worktree

Command:

```bash
git worktree remove -- <path>
```

P2 does not use:

```text
--force
```

Block if:

```text
main
dirty
locked
unknown
```

---

# 43. Remove Preview

IPC:

```text
worktree:remove-preview
```

Response:

```ts
{
  allowed,
  main,
  dirty,
  changes,
  locked,
  warnings,
  blockingReasons
}
```

---

# 44. Main Worktree Guard

Always:

```text
MAIN_WORKTREE_CANNOT_BE_REMOVED
```

---

# 45. Dirty Worktree Guard

No forced delete.

UI:

```text
This worktree contains uncommitted changes and cannot be removed safely.
```

---

# 46. Locked Worktree Guard

P2:

```text
locked worktree cannot be removed
```

Unlock operation later.

---

# 47. Prune

Preview:

```bash
git worktree prune --dry-run --verbose
```

Execute:

```bash
git worktree prune
```

IPC:

```text
worktree:prune-preview
worktree:prune
```

Confirmation required.

---

# 48. Worktree Session Identity

Critical P2 change.

Need separate:

```ts
RepositoryIdentity = {
  commonGitDir: string,
  repositoryId: string
}

WorktreeIdentity = {
  worktreeRoot: string,
  gitDir: string,
  commonGitDir: string,
  sessionId: string
}
```

UI session key:

```text
canonical worktreeRoot
```

Shared local metadata key:

```text
commonGitDir-derived repositoryId
```

---

# 49. Resolve Common Git Directory

Add:

```bash
git rev-parse --git-common-dir
```

Snapshot:

```ts
repository: {
  rootPath,
  gitDir,
  commonGitDir,
  isLinkedWorktree,
  ...
}
```

---

# 50. Multi-Worktree Sessions

Main worktree and linked worktree may be open together:

```text
[ repo-atlas/main ]
[ repo-atlas/feature-payment ]
```

Each keeps independent:

```text
active view
branch
workspace
selection
```

Shared:

```text
saved views
bookmarks
notes
repository analytics cache where valid
```

---

# 51. Worktree Actions

Read actions:

```text
Open in Repo Atlas
Reveal in File Manager
Compare with Current
Compare with Default
Copy Path
```

---

# 52. Auto Refresh Integration

P1 watcher must watch common worktree metadata.

After create/remove/prune:

```text
refresh worktree list
```

Use operation transaction buffering.

---

# 53. Worktree IPC

```text
worktree:list
worktree:details

dialog:choose-worktree-location

worktree:create-preview
worktree:create

worktree:remove-preview
worktree:remove

worktree:prune-preview
worktree:prune
```

---

# 54. Worktree Acceptance Criteria

- Worktrees list enhanced.
- Dirty status on demand.
- Existing branch create works.
- New branch create works.
- Detached create works.
- Branch already checked out blocked.
- Target exists blocked.
- Main removal blocked.
- Dirty removal blocked.
- Locked removal blocked.
- Prune preview works.
- Worktree opens as separate Repo Atlas session.
- Shared metadata works across linked worktrees.
- No force operation.
- Safe Write enforced backend.

---

# 55. Worktree Testing

Git fixtures:

```text
main
additional
detached
dirty
locked
prunable
branch-already-used
```

Cross-platform:

```text
spaces
unicode
Windows drive
slash branch name
```

---

# 56. P2-03 — Repository Activity Heatmap

## 56.1 Tujuan

Visualisasi aktivitas repository sepanjang waktu.

Questions:

```text
kapan repository aktif?
kapan churn tinggi?
berapa hari aktif?
siapa contributor aktif pada periode tertentu?
```

Tidak digunakan sebagai productivity score.

---

# 57. Metrics

P2 baseline:

```text
Commit Count
Change Volume
```

Change volume:

```text
additions + deletions
```

Reuse P1 analytics engine.

---

# 58. Range

Options:

```text
3 months
6 months
12 months
2 years
All analyzed history
```

Default:

```text
12 months
```

---

# 59. Bucket Model

```ts
ActivityBucket = {
  date: string,
  commits: number,
  additions: number,
  deletions: number,
  churn: number,
  authors: number
}
```

---

# 60. Data Source

Repository-wide:

```text
P1 analytics index
```

Path-filtered:

```text
on-demand bounded Git query
```

---

# 61. Activity IPC

```text
analytics:activity
```

Payload:

```ts
{
  repositoryPath: string,
  range: "3m" | "6m" | "12m" | "2y" | "all",
  metric: "commits" | "churn",
  author?: string,
  pathPrefix?: string
}
```

---

# 62. Path Activity Query

Use:

```bash
git log \
  --date=iso-strict \
  --format=<structured> \
  --numstat \
  --since=<date> \
  -- <path>
```

Path validated.

Cache per:

```text
repository + path + range
```

---

# 63. Heatmap UI

Overview compact:

```text
Activity — last 12 months
```

Full view:

```text
Insights
  Activity
```

Layout:

```text
[ 12 months ▼ ] [ Commits ▼ ] [ All contributors ▼ ]

       Aug Sep Oct ... Jul Aug
Mon    ░ ░ ▒ █
Tue    ▒ ▓ ░ ░
Wed    ...
```

---

# 64. Scale

Use quantile buckets over nonzero days.

Levels:

```text
0
low
medium
high
very high
```

Avoid outlier-distorted linear scale.

---

# 65. Tooltip

```text
August 4, 2026

12 commits
+742 / -183
4 contributors
```

---

# 66. Day Detail

Click day:

```text
Aug 4, 2026

12 commits

a73bcee Add payment retries
John · 10:42

c19f0a1 Fix tests
Faizal · 09:14
```

Action:

```text
Open Commit
```

---

# 67. Commit Range IPC

Add:

```text
commits:list-range
```

Payload:

```ts
{
  repositoryPath,
  from,
  to,
  limit
}
```

Bounded result.

---

# 68. Author Filter

Uses P1 normalized contributor identity.

```text
All contributors
Faizal
Sarah
John
```

---

# 69. Path Filter

Use:

```text
src/
src/api/
electron/
```

Could be selected from P0 File Explorer.

---

# 70. Activity Stats

Derived:

```text
activeDays
totalCommits
avgCommitsPerActiveDay
peakDay
currentActiveStreak
longestActiveStreak
longestInactiveStreak
```

Label as repository activity only.

---

# 71. Timezone Policy

Heatmap groups by:

```text
user-local calendar day
```

using authored timestamp converted to user's current local timezone.

Document behavior.

---

# 72. Saved View Integration

Heatmap state is saveable:

```text
Activity: src/api — 12 months
```

Store:

```ts
{
  range,
  metric,
  author?,
  pathPrefix?
}
```

---

# 73. Heatmap Acceptance Criteria

- 12-month heatmap works.
- Commit metric works.
- Churn works.
- Quantile scale stable.
- Tooltip works.
- Day detail works.
- Author filter works.
- Path filter works.
- Analytics scope shown if truncated.
- Timezone rule consistent.
- No productivity framing.

---

# 74. Heatmap Testing

Unit:

```text
bucket aggregation
timezone normalization
quantiles
streak calculation
empty periods
```

Integration:

```text
commits across timezone boundaries
multi-author
high churn day
inactive period
```

---

# 75. P2-04 — Saved Views / Saved Filters

## 75.1 Tujuan

Menyimpan kombinasi filter/query yang sering digunakan.

Examples:

```text
My Backend Commits
Stale Branches
API Hotspots
My Activity
Payment Reflog
```

---

# 76. SavedView Model

```ts
SavedView = {
  id: string,

  name: string,

  viewType:
    | "commits"
    | "files"
    | "branches"
    | "compare"
    | "hotspots"
    | "ownership"
    | "activity"
    | "reflog"
    | "search",

  configVersion: number,

  config: object,

  pinned: boolean,

  createdAt: string,
  updatedAt: string,
  lastOpenedAt: string | null
}
```

---

# 77. Design Rule

Jangan menyimpan arbitrary React state.

Saved view hanya menyimpan:

```text
semantic query/filter configuration
```

Tidak:

```text
DOM state
component internals
scrollTop
random selections
```

---

# 78. Commit Saved View

```ts
{
  refs?: string[],
  order?: "topo" | "date",
  search?: string,
  author?: string,
  path?: string,
  dateRange?: {
    from?: string,
    to?: string
  }
}
```

---

# 79. Files Saved View

```ts
{
  pathPrefix?: string,
  filter?: string,
  extension?: string,
  status?: string,
  showOwnership?: boolean
}
```

---

# 80. Branches Saved View

```ts
{
  status?: string[],
  sort?: string,
  direction?: "asc" | "desc",
  localOnly?: boolean
}
```

---

# 81. Hotspots Saved View

```ts
{
  pathPrefix?: string,
  extension?: string,
  includeGenerated?: boolean,
  sort?: string
}
```

---

# 82. Ownership Saved View

```ts
{
  path?: string,
  period?: "all" | "12m",
  contributor?: string
}
```

---

# 83. Activity Saved View

```ts
{
  range: string,
  metric: string,
  author?: string,
  pathPrefix?: string
}
```

---

# 84. Reflog Saved View

```ts
{
  ref: string,
  actions?: string[],
  search?: string
}
```

---

# 85. Search Saved View

```ts
{
  query: string,
  types?: string[]
}
```

---

# 86. Save UX

View toolbar:

```text
[ Save View ]
```

If current config corresponds to a saved view:

```text
Backend Activity
```

Modified:

```text
Backend Activity *
```

Actions:

```text
Save Changes
Save As New
Revert
```

---

# 87. Create Dialog

```text
Save View

Name
[ Backend Activity ]

[✓] Pin to sidebar

[ Cancel ] [ Save ]
```

Name:

```text
1..80 chars
```

Duplicate names allowed.

---

# 88. Sidebar

Dynamic section:

```text
Saved Views

★ Backend Commits
★ Stale Branches
  API Hotspots
```

Pinned only shown by default.

---

# 89. Saved View Manager

```text
Saved Views

Name             Type       Updated
Backend Commits  Commits    Today
API Hotspots     Hotspots   Yesterday
```

Actions:

```text
Open
Rename
Pin/Unpin
Duplicate
Delete
```

---

# 90. Compatibility Validation

Opening saved view:

```text
validate config
validate referenced branch/tag/path
```

Missing branch:

```text
Saved view contains unavailable references.

Missing:
feature/old

[ Open Without Missing Filters ]
[ Edit View ]
```

---

# 91. Schema Migration

Each view:

```text
configVersion
```

Migrator:

```text
migrateSavedView(view)
```

If impossible:

```text
needsRepair
```

---

# 92. Repository Scope

P2:

```text
saved views are repository-specific
```

Linked worktrees share saved views through common repository identity.

Semantic current branch state can use:

```text
branchMode: "current"
```

rather than storing concrete branch if desired.

---

# 93. Command Palette

Add:

```text
Open Saved View: ...
Save Current View
Manage Saved Views
```

---

# 94. Saved View IPC

```text
saved-view:list
saved-view:create
saved-view:update
saved-view:delete
```

---

# 95. Saved View Acceptance Criteria

- Save current configuration.
- Persists restart.
- Opens correct view.
- Missing ref handled.
- Pin appears sidebar.
- Rename works.
- Duplicate works.
- Delete works.
- Versioned schema.
- Corrupt config doesn't crash app.
- Shared across linked worktrees.

---

# 96. Saved View Testing

Unit:

```text
validators
migration
config equality
missing refs
```

Component:

```text
save
update
rename
pin
duplicate
delete
```

E2E:

```text
save filter
restart
open saved view
verify config
```

---

# 97. P2-05 — Commit Bookmarks & Local Notes

## 97.1 Tujuan

Menandai commit penting dan menyimpan konteks pribadi secara lokal.

Examples:

```text
Production release
Bug introduced here
Refactor starts here
Needs review
Important baseline
```

No Git mutation.

---

# 98. Why Local Metadata, Not Git Notes

`git notes` creates Git refs and can be shared/pushed.

P2 requirement:

```text
local-only
```

Use Repo Atlas application metadata store.

---

# 99. Bookmark Model

```ts
CommitBookmark = {
  id: string,
  commitHash: string,

  label: string | null,
  category: string | null,

  createdAt: string,
  updatedAt: string
}
```

---

# 100. Note Model

```ts
LocalNote = {
  id: string,

  targetType: "commit",
  targetId: string,

  title?: string,
  body: string,

  createdAt: string,
  updatedAt: string
}
```

P2 target only:

```text
commit
```

Future can extend to:

```text
file
branch
repository
```

---

# 101. Commit Graph Integration

Bookmarked commit:

```text
★
```

Context menu:

```text
Add Bookmark
Remove Bookmark
Add/Edit Local Note
```

---

# 102. Commit Details Integration

Header:

```text
a73bcee

[ ☆ Bookmark ]
```

When bookmarked:

```text
[ ★ Bookmarked ]
```

Section:

```text
Local Note

This commit introduced the payment retry logic.

Stored only in Repo Atlas on this device.

[ Edit ]
```

---

# 103. Bookmark Dialog

```text
Bookmark Commit

Label
[ Production release ]

Category
[ Release ]

[ Cancel ] [ Bookmark ]
```

Limits:

```text
label <= 120
category <= 60
```

---

# 104. Note Editor

Plain text textarea.

Limit:

```text
10,000 chars
```

No Markdown rendering in P2 baseline.

---

# 105. Bookmarks View

Navigation:

```text
History
  Commits
  Reflog
  Bookmarks
```

Layout:

```text
Bookmarked Commits

★ a73bcee Production release
  Add payment retry
  Aug 10, 2026

★ 19bc020 Regression introduced
  Refactor auth service
  Jul 29, 2026
```

Tabs:

```text
[ Bookmarks ] [ Notes ]
```

---

# 106. Orphaned Bookmark

History rewrite may remove commit hash.

Metadata remains.

UI:

```text
Commit is no longer available in this repository.

[ Keep Local Record ]
[ Delete Bookmark ]
[ Copy Hash ]
```

Do not silently migrate.

---

# 107. Rebase Semantics

Do not automatically map old bookmarked hashes to rewritten commits.

Potential later:

```text
patch-id similarity
message match
```

not P2.

---

# 108. Search Integration

P0 Global Search adds:

```text
Bookmarks
Local Notes
Saved Views
```

Search bookmark by:

```text
hash
label
category
```

Search note by:

```text
title
body
hash
```

Snippet max:

```text
120 chars
```

---

# 109. Reflog Integration

Bookmarked reflog hash displays:

```text
★
```

---

# 110. File History Integration

Bookmarked history commit displays:

```text
★
```

---

# 111. Privacy Rules

Notes:

```text
local only
no telemetry
no remote sync
no Git write
```

Never include note body in generic application logs.

---

# 112. Bookmark IPC

```text
bookmark:list
bookmark:create
bookmark:update
bookmark:delete
```

Creation requires commit currently resolves.

Loading old bookmark tolerates missing commit.

---

# 113. Note IPC

```text
note:list
note:create
note:update
note:delete
```

---

# 114. Bookmark Acceptance Criteria

- Bookmark commit.
- Optional label/category.
- Indicator in graph.
- Indicator in detail.
- Persists restart.
- Local note persists.
- Bookmarks view works.
- Search works.
- Orphan handled.
- Reflog/File History indicators work.
- No Git mutation.

---

# 115. Bookmark Testing

Unit:

```text
metadata validation
limits
orphan logic
```

Component:

```text
toggle bookmark
edit note
list
orphan state
```

E2E:

```text
bookmark
note
restart
verify
```

---

# 116. Shared Navigation After P2

```text
Overview

Explore
  Files

History
  Commits
  Reflog
  Bookmarks

Changes
  Workspace
  Compare

Repository
  Branches
  Worktrees
  Submodules
  Refs & Metadata

Insights
  Health
  Activity
  Hotspots
  Ownership

Saved Views
  ★ Backend Commits
  ★ Stale Branches
```

---

# 117. App Shell Refactor

Sidebar should no longer use one flat hardcoded array.

Model:

```ts
NavGroup = {
  id: string,
  label?: string,
  items: NavItem[]
}
```

Saved views become dynamic `NavItem`.

---

# 118. Renderer Metadata State

```ts
LocalMetadataState = {
  loading: boolean,
  error: AppError | null,

  savedViews: SavedView[],
  bookmarks: CommitBookmark[],
  notes: LocalNote[],

  bookmarkByHash: Map<string, CommitBookmark>
}
```

Load once per common repository identity.

---

# 119. Linked Worktree Sharing

Shared:

```text
Saved Views
Bookmarks
Notes
```

Per worktree session:

```text
active branch
active view
filters when not explicitly saved
workspace
selection
scroll
```

---

# 120. Metadata Migration

If P0/P1 persisted path-scoped metadata:

1. resolve commonGitDir;
2. compute new ID;
3. load old metadata;
4. merge;
5. write v2;
6. backup old;
7. mark migration complete.

---

# 121. P2 Command Palette Additions

```text
Open Reflog
Open Bookmarks
Open Activity
Create Worktree
Open Worktree
Prune Worktrees
Save Current View
Manage Saved Views
Bookmark Current Commit
Edit Current Commit Note
```

---

# 122. P2 Global Search Additions

Types:

```text
Bookmark
Local Note
Saved View
```

Reflog global search is optional and not required.

---

# 123. P2 Auto Refresh Integration

## Reflog

HEAD/refs changes:

```text
refresh or mark stale
```

## Worktrees

Common Git worktree metadata changes:

```text
refresh list
```

## Activity

Reuse P1 analytics invalidation.

## Saved Views / Notes

No Git watcher dependency.

---

# 124. Operation Transactions

Worktree writes integrate P1 watcher transaction system:

```text
begin transaction
↓
execute worktree command
↓
buffer watcher events
↓
refresh relevant data once
↓
end transaction
```

---

# 125. P2 IPC Summary

```text
reflog:list
commit:reachability

worktree:list
worktree:details
dialog:choose-worktree-location
worktree:create-preview
worktree:create
worktree:remove-preview
worktree:remove
worktree:prune-preview
worktree:prune

analytics:activity
commits:list-range

saved-view:list
saved-view:create
saved-view:update
saved-view:delete

bookmark:list
bookmark:create
bookmark:update
bookmark:delete

note:list
note:create
note:update
note:delete
```

---

# 126. New Error Codes

```text
REFLOG_FAILED
REFLOG_REF_UNAVAILABLE

WORKTREE_TARGET_EXISTS
WORKTREE_BRANCH_ALREADY_CHECKED_OUT
WORKTREE_CREATE_BLOCKED
WORKTREE_CREATE_FAILED
WORKTREE_REMOVE_BLOCKED
WORKTREE_REMOVE_FAILED
WORKTREE_DIRTY
WORKTREE_LOCKED
MAIN_WORKTREE_CANNOT_BE_REMOVED
WORKTREE_PRUNE_FAILED

METADATA_READ_FAILED
METADATA_WRITE_FAILED
METADATA_CORRUPTED
METADATA_MIGRATION_FAILED

SAVED_VIEW_INVALID
SAVED_VIEW_NOT_FOUND

BOOKMARK_NOT_FOUND
NOTE_NOT_FOUND
COMMIT_NOT_FOUND
ORPHANED_BOOKMARK
```

---

# 127. Security Checklist P2

## Reflog

- [x] explicit ref validation;
- [x] bounded pagination;
- [x] no reset/recovery write.

## Worktrees

- [ ] Safe Write enforced in backend;
- [ ] native path picker;
- [ ] target validation;
- [ ] Git branch validation;
- [ ] no `--force`;
- [ ] main removal blocked;
- [ ] dirty removal blocked;
- [ ] locked removal blocked;
- [ ] prune preview required.

## Activity

- [ ] bounded analytics;
- [ ] path filter validated.

## Saved Views

- [ ] schema validation;
- [ ] versioning;
- [ ] no arbitrary serialized executable state.

## Notes

- [ ] length limits;
- [ ] local-only;
- [ ] no HTML execution;
- [ ] no log leakage.

---

# 128. Performance Budgets

## Reflog

```text
200 initial
1000 max/request
```

## Activity

Renderer payload:

```text
~365–730 daily buckets
```

## Saved Views

Expected:

```text
< 1000
```

## Bookmarks

Efficient up to thousands; use `Map` by hash.

## Worktrees

Detail status lazy.

---

# 129. Why No Database Yet

P2 local data remains small:

```text
saved views
bookmarks
notes
preferences
```

JSON storage remains preferable:

```text
simple
cross-platform
debuggable
no native dependency
easy backup/migration
```

Database can be reconsidered for P3 code/symbol indexing.

---

# 130. P2 Demo Mode

Support:

```text
synthetic reflog
synthetic heatmap
synthetic worktrees
saved views
bookmarks
notes
```

Worktree writes in browser demo:

```text
disabled
```

Do not fake real disk mutation.

---

# 131. Browser Demo Local Persistence

Optional:

```text
localStorage
```

Key:

```text
repo-atlas-demo-metadata-v1
```

Electron production still uses main-process metadata files.

---

# 132. Accessibility

## Reflog

```text
↑ / ↓
Enter
Esc
```

## Heatmap

Each cell:

```text
aria-label="August 10, 2026: 7 commits"
```

## Saved Views

Core actions must not exist only in context menu.

## Bookmark

Star has accessible text.

---

# 133. Documentation

Update:

```text
README.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
```

Add:

```text
docs/LOCAL_METADATA.md
docs/WORKTREE_OPERATIONS.md
```

---

# 134. LOCAL_METADATA.md

Document:

```text
storage location
data stored
local-only nature
linked-worktree sharing
reset procedure
migration
privacy
```

---

# 135. WORKTREE_OPERATIONS.md

Document:

```text
create modes
remove guards
prune
Safe Write
no force operations
```

---

# 136. Test Architecture

Reuse:

```text
node:test
Vitest
React Testing Library
Playwright Electron
Git fixture builder
```

Add:

```text
metadata fixture helper
```

---

# 137. Metadata Fixture Helper

```text
tests/helpers/metadata-fixture.cjs
```

Supports:

```text
temporary userData
v1 metadata
v2 metadata
corrupt JSON
backup recovery
```

---

# 138. Implementation Sequence

## Stage P2-0 — Repository Identity & Metadata

- [x] Add `git rev-parse --git-common-dir`.
- [x] Extend snapshot.
- [x] Worktree-aware session identity.
- [x] Common repository identity.
- [x] Metadata store.
- [x] Atomic write.
- [x] Backup.
- [x] Schema validation.
- [x] v1→v2 migration.
- [x] Tests.

Exit:

```text
main + linked worktree can coexist as separate sessions and share repository metadata
```

---

## Stage P2-1 — Reflog Backend

- [x] Reflog command.
- [x] Parser.
- [x] Action classifier.
- [x] Pagination.
- [x] Ref validation.
- [x] Reachability.
- [x] Tests.

---

## Stage P2-2 — Reflog UI

- [x] Timeline.
- [x] Grouping.
- [x] Filter.
- [x] Search.
- [x] Detail.
- [x] Compare previous.
- [x] View commit.
- [x] Bookmark indicator.
- [x] Auto refresh.
- [ ] E2E.

The bookmark indicator is conditional on bookmark metadata supplied to the view; bookmark persistence and editing remain part of the later bookmarks work. E2E coverage is intentionally skipped for this implementation.

---

## Stage P2-3 — Saved Views

- [ ] Model.
- [ ] Schema per view.
- [ ] Validation.
- [ ] Persistence.
- [ ] Save.
- [ ] Save As.
- [ ] Update.
- [ ] Revert.
- [ ] Rename.
- [ ] Duplicate.
- [ ] Pin.
- [ ] Delete.
- [ ] Sidebar.
- [ ] Command Palette.
- [ ] Tests.

---

## Stage P2-4 — Activity Heatmap

- [ ] Activity backend.
- [ ] Daily bucket.
- [ ] Timezone normalization.
- [ ] Quantile scale.
- [ ] Compact Overview.
- [ ] Full view.
- [ ] Tooltip.
- [ ] Day detail.
- [ ] Author filter.
- [ ] Path filter.
- [ ] Saved View support.
- [ ] Tests.

---

## Stage P2-5 — Bookmarks / Notes Foundation

- [ ] Bookmark model.
- [ ] Note model.
- [ ] Persistence.
- [ ] Graph integration.
- [ ] Commit detail integration.
- [ ] File History indicator.
- [ ] Reflog indicator.
- [ ] Tests.

---

## Stage P2-6 — Bookmarks Explorer

- [ ] Bookmarks page.
- [ ] Notes tab.
- [ ] Search.
- [ ] Orphan handling.
- [ ] Global Search integration.
- [ ] Command Palette integration.
- [ ] E2E.

---

## Stage P2-7 — Worktree Read Manager

- [ ] Enhanced list.
- [ ] Details.
- [ ] Dirty status.
- [ ] Reveal.
- [ ] Open as Repo Atlas session.
- [ ] Compare.
- [ ] Auto refresh.
- [ ] Tests.

---

## Stage P2-8 — Worktree Create

- [ ] Native location picker.
- [ ] Suggested path.
- [ ] Existing branch preview.
- [ ] New branch preview.
- [ ] Detached preview.
- [ ] Execution.
- [ ] Watcher transaction.
- [ ] UI.
- [ ] Tests.

---

## Stage P2-9 — Worktree Remove / Prune

- [ ] Remove preview.
- [ ] Main guard.
- [ ] Dirty guard.
- [ ] Lock guard.
- [ ] Remove.
- [ ] Prune dry-run.
- [ ] Prune.
- [ ] Confirmation.
- [ ] Tests.

---

## Stage P2-10 — Hardening

- [ ] huge reflog;
- [ ] 2-year heatmap;
- [ ] multi-author timezone;
- [ ] corrupted metadata;
- [ ] migration;
- [ ] orphan bookmarks;
- [ ] missing saved-view refs;
- [ ] multiple linked worktrees;
- [ ] dirty worktree;
- [ ] locked worktree;
- [ ] prunable worktree;
- [ ] spaces/unicode paths;
- [ ] Windows paths;
- [ ] multi-repository;
- [ ] regression P0/P1;
- [ ] regression cherry-pick;
- [ ] regression stage/unstage.

---

# 139. Suggested PR Breakdown

```text
PR-01  Common Git repository identity and worktree-aware sessions
PR-02  Local metadata store and migration
PR-03  Reflog backend
PR-04  Reflog timeline UI
PR-05  Reflog detail and reachability
PR-06  Saved View schemas and persistence
PR-07  Saved Views UI and sidebar
PR-08  Activity aggregation backend
PR-09  Activity Heatmap UI
PR-10  Activity filters and Saved Views
PR-11  Commit bookmarks persistence
PR-12  Commit bookmark UI integrations
PR-13  Local notes
PR-14  Bookmarks/Notes explorer
PR-15  Worktree manager read layer
PR-16  Worktree create preview/backend
PR-17  Worktree create UI
PR-18  Worktree remove/prune backend
PR-19  Worktree remove/prune UI
PR-20  Command Palette and Global Search integration
PR-21  P2 E2E and cross-platform hardening
```

---

# 140. Dependency Graph

```text
Repository Identity
       │
       ├──────── Metadata Store
       │              ├── Saved Views
       │              └── Bookmarks / Notes
       │
       └──────── Worktree Manager

P1 Analytics
       │
       └──────── Activity Heatmap

Commit/Compare
       │
       └──────── Reflog Timeline

Saved Views
       │
       └──────── Activity configurations
```

---

# 141. Definition of Done P2

## Functional

- [ ] loading;
- [ ] empty state;
- [ ] error;
- [ ] keyboard;
- [ ] mouse;
- [ ] multi-repository;
- [ ] multi-worktree.

## Persistence

- [ ] restart-safe;
- [ ] schema versioned;
- [ ] atomic;
- [ ] corruption recovery.

## Git

- [ ] explicit commands;
- [ ] bounded;
- [ ] validated;
- [ ] no shell strings.

## Write Safety

- [ ] preview;
- [ ] backend revalidation;
- [ ] Safe Write;
- [ ] no force operations.

## Tests

- [ ] unit;
- [ ] Git integration;
- [ ] component;
- [ ] E2E.

---

# 142. UX Rules

## Reflog

Use human-readable actions.

## Worktrees

Before write, show:

```text
branch
target
dirty state
operation consequence
```

## Activity

Never equate commit count with developer performance.

## Saved Views

Save semantic configuration.

## Notes

Always label:

```text
Stored locally by Repo Atlas
```

---

# 143. Settings P2

```text
History

Reflog initial entries
200

Activity
Default range
12 months

Saved Views
Show pinned section
On

Worktrees
Default parent directory
Not set

Repository Operations
Safe Write
Enabled
```

---

# 144. Reflog Lifetime Notice

UI should explain:

```text
Reflog is local Git history and entries may expire according to Git configuration.
```

---

# 145. Bookmark Lifetime

Bookmarks remain local records even if underlying commit disappears.

This is intentional.

---

# 146. Saved View Missing References

Status:

```text
Needs attention
```

Example:

```text
Backend Commits
Missing branch: feature/backend-old
```

Action:

```text
Edit View
```

---

# 147. Worktree External Deletion

If directory deleted outside Repo Atlas:

```text
prunable=true
```

UI:

```text
Missing worktree directory
Prunable metadata
```

Action:

```text
Preview Prune
```

---

# 148. Failure Recovery

## Metadata write failure

Do not report success.

Keep unsaved editor state for retry.

## Worktree create failure

Refresh worktree list and inspect target.

Do not auto-delete arbitrary target directory.

## Worktree remove failure

Refresh and preserve UI selection.

---

# 149. No Telemetry

P2 must not introduce telemetry.

`analytics` in P2 means local repository analysis only.

---

# 150. Final Completion Checklist

## Foundation

- [x] commonGitDir identity
- [x] worktree session identity
- [x] metadata store
- [x] atomic persistence
- [x] backup
- [x] migration
- [x] corruption handling

## Reflog

- [x] HEAD
- [x] local branch
- [x] pagination
- [x] classification
- [ ] filters
- [ ] search
- [ ] details
- [ ] compare
- [x] reachability
- [ ] bookmark indicator
- [ ] auto refresh

## Worktrees

- [ ] enhanced list
- [ ] dirty detail
- [ ] open session
- [ ] reveal
- [ ] compare
- [ ] create preview
- [ ] existing branch
- [ ] new branch
- [ ] detached
- [ ] target validation
- [ ] duplicate branch guard
- [ ] remove preview
- [ ] dirty guard
- [ ] lock guard
- [ ] main guard
- [ ] prune preview
- [ ] prune

## Activity

- [ ] daily buckets
- [ ] range
- [ ] commit metric
- [ ] churn
- [ ] quantile
- [ ] tooltip
- [ ] day detail
- [ ] author
- [ ] path
- [ ] saved view

## Saved Views

- [ ] schema
- [ ] migration
- [ ] save
- [ ] update
- [ ] save as
- [ ] revert
- [ ] rename
- [ ] duplicate
- [ ] pin
- [ ] delete
- [ ] repair missing refs
- [ ] sidebar
- [ ] palette

## Bookmarks / Notes

- [ ] bookmark
- [ ] label/category
- [ ] note
- [ ] graph
- [ ] commit detail
- [ ] file history
- [ ] reflog
- [ ] bookmarks explorer
- [ ] search
- [ ] orphan handling
- [ ] privacy notice

## Quality

- [ ] unit
- [ ] integration
- [ ] component
- [ ] E2E
- [ ] macOS
- [ ] Windows
- [ ] Linux
- [ ] demo
- [ ] multi-worktree
- [ ] multi-repository
- [ ] P0 regression
- [ ] P1 regression

---

# 151. Expected Architecture Setelah P2

```text
                           Repo Atlas App Shell
                                  │
                  ┌───────────────┼─────────────────┐
                  │               │                 │
                  ▼               ▼                 ▼
           Worktree Sessions  Saved Views      Local Metadata
                  │               │                 │
                  │               └────────┬────────┘
                  │                        │
                  ▼                        ▼
         Repository / Git Data        Bookmarks / Notes
                  │
        ┌─────────┼──────────────┐
        │         │              │
        ▼         ▼              ▼
     Reflog    Activity       Worktrees
        │         │              │
        ▼         ▼              ▼
     History    Insights      Safe Write
        │                         │
        └──────────────┬──────────┘
                       ▼
                 Explicit IPC
                       │
                       ▼
                  Electron Main
                       │
        ┌──────────────┼────────────────┐
        │              │                │
        ▼              ▼                ▼
     Git CLI       App Metadata     Native Dialogs
```

---

# 152. Hasil Akhir P2

Setelah P2:

```text
P0 — Explore
Files
History
Diff
Search
Multi Repository

P1 — Understand
Health
Hotspots
Ownership
Blame
Branch Intelligence
Live Workspace

P2 — Work & Remember
Reflog Timeline
Worktree Manager
Activity Heatmap
Saved Views
Bookmarks & Notes
```

P2 memungkinkan workflow jangka panjang:

```text
buka banyak worktree
↓
pantau history
↓
simpan filter penting
↓
tandai commit penting
↓
catat konteks lokal
↓
lihat pola aktivitas
↓
recover understanding melalui reflog
```

Prinsip akhirnya tetap:

```text
Every Git write operation is explicit.
Every repository insight is explainable.
Every personal annotation stays local.
Every workflow remains understandable without the terminal.
```
