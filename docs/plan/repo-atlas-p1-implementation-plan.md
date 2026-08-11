# Repo Atlas — P1 Implementation Plan

**Repository:** `faizalfakhri0001/repo-atlas`
**Scope:** seluruh fitur P1 setelah fondasi P0 selesai
**Target:** mengubah Repo Atlas dari repository explorer menjadi repository intelligence workspace yang tetap offline-first, explainable, aman, dan performant.

---

# 1. Fitur P1

P1 mencakup:

1. **P1-01 — Repository Health Dashboard**
2. **P1-02 — Branch Intelligence & Divergence Visualization**
3. **P1-03 — Code Hotspot Analysis**
4. **P1-04 — Contributor Ownership**
5. **P1-05 — Visual Git Blame**
6. **P1-06 — Automatic Repository Refresh**
7. **P1-07 — Visual Stage / Unstage**

P1 bergantung pada beberapa kemampuan P0:

```text
P0 Multi Repository Session
P0 File Explorer
P0 File History
P0 Split Diff Viewer
P0 Global Search
P0 Secure repository-relative path validation
P0 UI/Electron testing foundation
```

---

# 2. Product Direction Setelah P1

Setelah P1, Repo Atlas tidak hanya menjawab:

```text
Apa isi repository ini?
Apa history-nya?
Apa yang berubah?
```

tetapi juga:

```text
Bagian mana yang paling sering berubah?
Bagian mana yang memiliki ownership tinggi pada satu orang?
Branch mana yang sudah terlalu jauh tertinggal?
Branch mana yang stale?
File mana yang berisiko karena churn tinggi?
Siapa contributor utama pada file ini?
Siapa yang terakhir mengubah baris ini?
Apa kondisi repository secara keseluruhan?
Apakah perubahan di disk sudah otomatis terdeteksi?
Bisakah perubahan di-stage tanpa terminal?
```

Target positioning:

```text
Visual repository exploration
+
Git history
+
Repository intelligence
+
Safe local workflow
```

---

# 3. Prinsip Arsitektur P1

P1 wajib mempertahankan prinsip:

```text
offline-first
explicit IPC
no generic shell
no generic Git command executor
bounded computation
lazy analytics
explainable metrics
read-only by default
write operations explicitly controlled
```

Tidak boleh membuat API:

```text
repository:run-command
repository:run-git
filesystem:read-anything
workspace:apply-patch-from-renderer
```

Stage/unstage harus menjadi operasi spesifik.

---

# 4. P1 Foundation — Repository Analytics Engine

Empat fitur P1 berbagi data historis yang sama:

```text
Repository Health
Branch Intelligence
Hotspot Analysis
Contributor Ownership
```

Jangan membuat masing-masing fitur menjalankan:

```text
git log
```

secara independen untuk setiap file.

Buat shared analytics layer.

---

# 5. Target Backend Structure

Tambahkan:

```text
electron/
└── git/
    ├── core.cjs
    ├── repository.cjs
    ├── commits.cjs
    ├── files.cjs
    ├── file-history.cjs
    ├── compare.cjs
    ├── search.cjs
    │
    ├── analytics/
    │   ├── index.cjs
    │   ├── parser.cjs
    │   ├── cache.cjs
    │   ├── health.cjs
    │   ├── branches.cjs
    │   ├── hotspots.cjs
    │   └── ownership.cjs
    │
    ├── blame.cjs
    └── workspace-operations.cjs
```

---

# 6. Analytics Index

## 6.1 Tujuan

Membangun representasi historis repository yang dapat digunakan ulang.

Model:

```ts
RepositoryAnalyticsIndex = {
  repositoryKey: string,
  head: string,
  generatedAt: string,

  scope: {
    maxCommits: number,
    processedCommits: number,
    truncated: boolean
  },

  files: Map<string, FileAnalytics>,
  authors: Map<string, AuthorAnalytics>,
  commits: AnalyticsCommitSummary[],

  totals: {
    commits: number,
    files: number,
    additions: number,
    deletions: number
  }
}
```

---

## 6.2 FileAnalytics

```ts
FileAnalytics = {
  path: string,

  commits: number,

  additions: number,
  deletions: number,
  churn: number,

  firstSeenAt: string | null,
  lastChangedAt: string | null,

  authors: Map<string, {
    name: string,
    email: string,
    commits: number,
    additions: number,
    deletions: number,
    churn: number,
    lastChangedAt: string
  }>
}
```

`churn`:

```text
additions + deletions
```

Jangan menggunakan churn sebagai "complexity".

Label harus tetap:

```text
change volume
churn
historical activity
```

---

## 6.3 Author Identity

Gunakan email sebagai identity utama:

```text
normalizedEmail = email.trim().toLowerCase()
```

Fallback jika email kosong:

```text
name.trim().toLowerCase()
```

Model:

```ts
AuthorKey = `email:${normalizedEmail}`
```

atau:

```ts
AuthorKey = `name:${normalizedName}`
```

Nama contributor dapat berubah antar commit.

Simpan:

```ts
aliases: Set<string>
```

---

# 7. Analytics Git Command Strategy

## 7.1 Hindari Buffer Besar

Current Git service menggunakan `execFile()` dengan bounded buffer.

Analytics history dapat jauh lebih besar.

Gunakan streaming:

```js
spawn("git", args, {
  cwd,
  shell: false,
  windowsHide: true
})
```

`spawn()` tetap aman selama:

```text
executable fixed = git
arguments = validated array
shell = false
```

Tidak ada command string.

---

## 7.2 Command

Direkomendasikan:

```bash
git log \
  --all \
  --date=iso-strict \
  --format=<record-marker + metadata> \
  --numstat \
  -M \
  --no-ext-diff
```

Tambahkan:

```text
--max-count=<limit>
```

Default analytics scope:

```text
10,000 commits
```

Maximum:

```text
50,000 commits
```

Untuk repository sangat besar, index diberi:

```text
truncated = true
```

UI harus menyatakan:

```text
Based on the most recent 10,000 commits
```

Jangan menampilkan hasil sebagai exact whole-history jika scan dibatasi.

---

## 7.3 Concurrency

Hanya satu analytics index build per repository.

State:

```text
idle
building
ready
error
stale
```

Jika dua view meminta index:

```text
Hotspots
Ownership
```

keduanya menunggu Promise yang sama.

---

# 8. Analytics Cache

Cache in-memory per repository session.

Key minimum:

```text
repository root
HEAD hash
refs fingerprint
scope
```

`HEAD` saja tidak cukup karena branch lain dapat berubah.

Refs fingerprint dapat dibangun dari:

```bash
git for-each-ref --format="%(refname)%00%(objectname)"
```

Hash hasil output menjadi:

```text
refsFingerprint
```

Cache key:

```text
rootPath + head + refsFingerprint + maxCommits
```

---

# 9. Analytics Invalidation

Invalidate ketika:

```text
manual refresh
HEAD changes
refs change
stage/unstage tidak perlu invalidate history analytics
commit dibuat
branch checkout
cherry-pick selesai
merge/rebase selesai
repository auto-refresh mendeteksi ref mutation
```

Workspace-only file edits tidak perlu rebuild historical analytics.

---

# 10. Analytics IPC

Tambahkan:

```text
analytics:summary
analytics:hotspots
analytics:ownership
branches:intelligence
repository:health
```

Renderer tidak perlu menerima seluruh raw analytics index.

Backend mengembalikan data yang dibutuhkan view.

Ini menjaga payload tetap bounded.

---

# 11. P1-01 — Repository Health Dashboard

## 11.1 Tujuan

Mengubah Overview menjadi dashboard yang menunjukkan kondisi repository secara actionable.

Health bukan security audit dan bukan "code quality truth".

Health adalah ringkasan sinyal Git/repository.

---

# 12. Health Philosophy

Hindari skor opaque.

Jika menggunakan score:

```text
82 / 100
```

harus selalu dapat dijelaskan.

User dapat melihat:

```text
-5  3 stale branches
-4  default branch behind upstream
-3  2 very large tracked files
```

Lebih penting:

```text
signal + explanation
```

daripada angka.

---

# 13. Health Categories

P1 menggunakan lima kategori:

```text
Working Tree
Branch Hygiene
Repository Size
History / Activity
Ownership
```

Optional kemudian:

```text
Signatures
Hooks
LFS
Shallow clone
Sparse checkout
```

Tidak harus masuk skor awal jika datanya belum stabil.

---

# 14. Health Model

```ts
RepositoryHealth = {
  score: number,

  grade: "healthy" | "attention" | "warning",

  generatedAt: string,

  signals: HealthSignal[],

  categories: {
    workingTree: CategoryHealth,
    branches: CategoryHealth,
    repository: CategoryHealth,
    activity: CategoryHealth,
    ownership: CategoryHealth
  }
}
```

Signal:

```ts
HealthSignal = {
  id: string,
  severity: "info" | "low" | "medium" | "high",
  category: string,
  title: string,
  description: string,
  metric?: number | string,
  action?: {
    type: string,
    payload: object
  }
}
```

---

# 15. Health Score

Gunakan additive penalty agar explainable.

Start:

```text
100
```

Clamp:

```text
0..100
```

Contoh baseline:

## Working Tree

```text
dirty working tree:
  informational
  tidak perlu penalty tinggi

conflicted files:
  -8 sampai -20 tergantung jumlah
```

## Branch Hygiene

```text
stale local branch:
  -1 per branch
  max -10

local branch >100 commits behind default:
  -3 per branch
  max -12

gone upstream:
  -2 per branch
  max -8
```

## Repository

```text
very large tracked files:
  -2 per file
  max -10

repository object size unusually large:
  advisory only pada P1
```

## Activity

```text
Tidak ada commit 180+ hari:
  advisory
```

## Ownership

```text
high ownership concentration pada high-churn files:
  -2 per hotspot
  max -10
```

Jangan penalize:

```text
small team
single contributor
old repository
```

tanpa context.

---

# 16. Threshold Config

Centralize:

```text
src/features/health/health-thresholds.js
```

atau backend config:

```js
HEALTH_THRESHOLDS = {
  staleBranchDays: 90,
  veryStaleBranchDays: 180,

  branchBehindWarning: 50,
  branchBehindHigh: 100,

  largeFileBytes: 20 * 1024 * 1024,
  veryLargeFileBytes: 100 * 1024 * 1024,

  ownershipConcentration: 0.80
}
```

Threshold harus mudah diubah.

---

# 17. Health UI

Overview:

```text
Repository Health

82 / 100    Attention

Working Tree     Healthy
Branches         3 issues
Repository       1 issue
Activity         Healthy
Ownership        2 issues
```

Signal cards:

```text
HIGH
2 conflicted files

Resolve conflicts before continuing repository operations.

[ Open Workspace ]
```

```text
MEDIUM
3 stale local branches

No commits in the last 90 days.

[ View Branches ]
```

---

# 18. Health Detail View

Tambahkan:

```text
Overview → View Health Details
```

Layout:

```text
Health Score
Categories
Signals
Repository facts
```

Filter:

```text
All
High
Medium
Low
Info
```

---

# 19. Health Action Navigation

Health tidak menjalankan write action langsung.

Signal:

```text
3 stale branches
```

action:

```text
Open Branches with stale filter
```

Signal:

```text
2 conflict files
```

action:

```text
Open Workspace conflicts
```

Signal:

```text
large tracked files
```

action:

```text
Open Files filtered large
```

---

# 20. Health IPC

```text
repository:health
```

Payload:

```ts
{
  repositoryPath: string
}
```

Backend boleh memanggil shared:

```text
branch intelligence
analytics summary
repository file metadata
repository status
```

Response harus bounded.

---

# 21. Health Loading

Overview tidak boleh menunggu analytics index sebelum muncul.

Render:

```text
basic repository overview
```

lebih dahulu.

Kemudian:

```text
Health analysis…
```

Async health card.

---

# 22. Health Acceptance Criteria

- Health overview tidak memblok startup.
- Setiap penalty memiliki explanation.
- Score deterministic untuk input yang sama.
- Health dapat bekerja dengan analytics truncated.
- UI menyatakan analytics scope jika truncated.
- Signal dapat dinavigasikan ke view relevan.
- Tidak ada klaim "secure" / "unsafe" hanya berdasarkan Git metadata.
- Empty/new repository tidak dianggap buruk.
- Health bekerja offline.
- Health cache invalidation benar.

---

# 23. Health Testing

Unit:

```text
score calculation
penalty caps
severity
empty repo
clean repo
dirty repo
stale branches
ownership concentration
truncated analytics
```

Component:

```text
loading health
score
signal list
action navigation
filter severity
```

Integration:

temporary repositories untuk berbagai kondisi.

---

# 24. P1-02 — Branch Intelligence & Divergence Visualization

## 24.1 Tujuan

Meningkatkan Branches dari daftar metadata menjadi alat memahami:

```text
branch lifecycle
divergence
staleness
merge status
upstream status
distance from default branch
```

---

# 25. Branch Intelligence Model

```ts
BranchIntelligence = {
  name: string,
  ref: string,
  hash: string,

  current: boolean,
  remote: boolean,

  upstream: string | null,

  aheadOfUpstream: number,
  behindUpstream: number,
  goneUpstream: boolean,

  defaultBranch: string,

  aheadOfDefault: number,
  behindDefault: number,

  mergeBase: string | null,

  mergedIntoDefault: boolean,

  lastCommitAt: string | null,
  ageDays: number | null,

  status:
    | "current"
    | "healthy"
    | "ahead"
    | "behind"
    | "diverged"
    | "stale"
    | "merged"
    | "gone"
}
```

---

# 26. Default Branch

Existing repository scan sudah mendeteksi default branch.

Fallback:

```text
remote default branch
current branch
main
master
```

Tetapi result harus diberi:

```text
defaultBranchSource
```

Jika tidak yakin, UI tidak perlu melakukan stale-vs-default analysis yang misleading.

---

# 27. Git Commands Per Branch

Untuk local branch terhadap default:

```bash
git rev-list --left-right --count <default>...<branch>
```

Merge base:

```bash
git merge-base <default> <branch>
```

Merged:

```bash
git merge-base --is-ancestor <branch> <default>
```

Last commit:

branch metadata sekarang sudah memiliki date.

Tidak perlu command tambahan.

---

# 28. Performance Branch Intelligence

Jangan parallel unlimited.

Gunakan concurrency:

```text
4
```

atau:

```text
min(4, CPU count)
```

Cap branch analysis:

```text
500 local branches
```

Jika lebih:

```text
analyze current + recently active first
```

UI:

```text
Showing intelligence for the 500 most recently active local branches.
```

---

# 29. Branch Status Rules

Order priority:

```text
current
gone
merged
stale
diverged
behind
ahead
healthy
```

Stale baseline:

```text
90 days
```

Very stale:

```text
180 days
```

Merged branch yang lama:

```text
status = merged
```

bukan stale.

---

# 30. Branch Divergence Visualization

View baru dalam Branches:

```text
[ List ] [ Divergence ]
```

Diagram:

```text
main
│
├──────── feature/auth
│         +17 / -3
│
├── feature/payment
│   +4 / -21
│
└──────────── legacy-report
              merged
```

P1 tidak perlu graph layout kompleks seperti commit graph.

Gunakan rows dengan horizontal bars.

---

# 31. Divergence Row

Contoh:

```text
feature/payment

Behind main     21
Ahead main       4

█████████████████████ ← behind
████ → ahead
```

Gunakan independent scales agar branch extreme tidak membuat branch lain tak terbaca.

Tooltip:

```text
Merge base
Last activity
Upstream
```

---

# 32. Branch Filters

```text
All
Current
Ahead
Behind
Diverged
Stale
Merged
Gone
Remote
```

Sort:

```text
Name
Last activity
Ahead
Behind
Status
```

---

# 33. Branch Context Actions

Read-only P1:

```text
Show in Graph
Compare with Default
Compare with Current
Open commits
```

Write action branch delete bukan P1.

---

# 34. Branch Health Integration

Branch intelligence menjadi source untuk Repository Health.

Health tidak menghitung branch logic sendiri.

Shared module:

```text
analytics/branches.cjs
```

---

# 35. Branch IPC

```text
branches:intelligence
```

Payload:

```ts
{
  repositoryPath: string,
  defaultBranch?: string
}
```

Response:

```text
default branch
analysis scope
branches[]
```

---

# 36. Branch Acceptance Criteria

- Ahead/behind vs default branch benar.
- Ahead/behind upstream existing behavior tetap benar.
- Merged branch terdeteksi.
- Stale branch terdeteksi.
- Gone upstream terdeteksi.
- Current branch jelas.
- 100+ branch tidak membekukan renderer.
- Analysis memiliki bounded concurrency.
- Branch filter/sort bekerja.
- Health menggunakan source data yang sama.
- No write operations.

---

# 37. Branch Testing

Temporary Git graph:

```text
main
feature-a ahead
feature-b behind
feature-c diverged
feature-d merged
feature-e stale
```

Verifikasi counts dan status.

---

# 38. P1-03 — Code Hotspot Analysis

## 38.1 Tujuan

Menemukan file yang secara historis paling sering berubah.

Hotspot bukan berarti "bad code".

Hotspot berarti:

```text
high change frequency
+
high change volume
+
recent activity
```

Optional risk signal:

```text
ownership concentration
```

---

# 39. Hotspot Metrics

Per file:

```text
commitCount
churn
authorCount
lastChangedAt
fileSize
```

Derived:

```text
commitFrequencyScore
churnScore
recencyScore
ownershipScore
```

---

# 40. Robust Normalization

Jangan memakai raw value langsung.

Gunakan percentile rank.

Untuk setiap metric:

```text
score = percentile(file.metric among repository files)
```

Range:

```text
0..1
```

Ini lebih stabil antar repository kecil/besar.

---

# 41. Hotspot Score

Baseline:

```text
hotspot =
  0.45 * commitFrequencyPercentile
+ 0.35 * churnPercentile
+ 0.20 * recencyScore
```

Optional:

```text
risk =
  hotspot
  * ownershipConcentrationModifier
```

Tetapi UI harus memisahkan:

```text
Hotspot Score
Ownership Concentration
```

Jangan membuat magic risk score tanpa explanation.

---

# 42. Recency Score

Contoh exponential decay:

```text
ageDays = days since last change

recency = exp(-ageDays / 180)
```

Sehingga perubahan baru memiliki bobot lebih tinggi.

Alternative simple buckets boleh digunakan.

Pastikan deterministic.

---

# 43. Generated Files Exclusion

Hotspot dapat bias oleh:

```text
package-lock.json
yarn.lock
generated code
snapshots
vendor
dist
```

P1 perlu default exclusion.

Config:

```text
lock files
dist/
build/
vendor/
coverage/
*.min.js
```

User dapat:

```text
Include generated/lock files
```

Jangan hard-delete data.

Hanya filter presentation/scoring.

---

# 44. Hotspot View

Nav:

```text
Insights
  Hotspots
```

Layout:

```text
Repository Hotspots

File                        Commits   Churn   Authors   Last change
src/App.jsx                    87      9.2k       8       today
electron/git-service.cjs       71     12.1k       4       2 days
...
```

Visual score:

```text
High
Medium
Low
```

Tetapi sertakan angka dasar.

---

# 45. Hotspot Detail

Klik file:

```text
src/App.jsx

Hotspot percentile      96
Commits                  87
Historical churn       9,240
Contributors              8
Last changed           Today
```

Sections:

```text
Activity over time
Top contributors
Recent commits
File history
```

Reuse P0 File History.

---

# 46. Hotspot Time Buckets

Analytics index dapat membuat:

```text
monthly change buckets
```

Optional P1 detail:

```text
last 12 months
```

Data:

```ts
activity: [
  { month: "2026-01", commits: 4, churn: 130 },
  ...
]
```

Tidak wajib disimpan untuk semua file jika memory mahal.

Bisa dihitung on-demand dari file history.

---

# 47. Hotspot Filters

```text
All files
Source files
Tests
Config
Docs
```

Atau extension filter.

P0 language mapping dapat dipakai.

Minimum:

```text
path filter
extension
exclude generated
```

---

# 48. Hotspot IPC

```text
analytics:hotspots
```

Payload:

```ts
{
  repositoryPath: string,
  limit?: number,
  includeGenerated?: boolean,
  pathPrefix?: string
}
```

Default limit:

```text
100
```

Max:

```text
1000
```

---

# 49. Hotspot Acceptance Criteria

- Hotspot menggunakan shared analytics index.
- Score explainable.
- Raw metrics selalu tersedia.
- Lock/generated files dapat dikecualikan.
- User dapat membuka File History dari hotspot.
- Large repository tetap bounded.
- Analytics scope ditampilkan jika truncated.
- Empty repository ditangani.
- Deleted historical paths tidak menyebabkan crash.

---

# 50. Hotspot Testing

Unit:

```text
percentile normalization
recency
score
generated file filter
sorting
```

Integration:

repo dengan file:

```text
frequently changed
rarely changed
high churn
old changes
```

---

# 51. P1-04 — Contributor Ownership

## 51.1 Tujuan

Menampilkan siapa yang paling banyak berkontribusi pada:

```text
file
directory
repository
```

Ownership adalah historical contribution proxy.

Bukan legal ownership dan bukan mandatory code-owner.

---

# 52. Ownership Metrics

Per contributor:

```text
commitShare
churnShare
recentActivity
```

Primary metric:

```text
contribution share
```

Rekomendasi:

```text
contributionUnits =
  commits_weight + churn_weight
```

Tetapi agar transparan, P1 sebaiknya tampilkan dua metrik terpisah:

```text
Commit share
Change-volume share
```

Primary owner dapat ditentukan oleh weighted score.

---

# 53. Ownership Score

Baseline:

```text
normalizedCommitShare = commitsByAuthor / totalFileCommits
normalizedChurnShare = authorChurn / totalFileChurn

ownershipScore =
  0.4 * normalizedCommitShare
+ 0.6 * normalizedChurnShare
```

Jika churn = 0:

```text
fallback commitShare
```

Tampilkan:

```text
Primary contributor
```

lebih baik daripada label "Owner" mutlak.

---

# 54. Recent Ownership

Historical ownership dapat misleading untuk file yang berpindah tim.

Tambahkan:

```text
All-time
Last 12 months
Last 90 days
```

P1 minimum:

```text
All-time
Last 12 months
```

Untuk performance, analytics index dapat menyimpan timestamp commit dan aggregasi rolling hanya ketika diminta.

---

# 55. Ownership Concentration

Metric:

```text
top1Share
top2Share
```

Label:

```text
Distributed
Moderately concentrated
Highly concentrated
```

Baseline:

```text
top1 >= 80% -> highly concentrated
top1 >= 60% -> moderately concentrated
else distributed
```

Jangan label "bus factor" tanpa methodology yang lebih kuat.

---

# 56. Ownership View

```text
Insights
  Ownership
```

Directory tree:

```text
src/
  components/      Faizal 62%
  lib/             Sarah  48%
electron/          Faizal 81%
tests/             John   55%
```

---

# 57. Directory Aggregation

Jangan menjalankan Git per directory.

Gunakan file analytics index.

Untuk directory:

```text
sum file contributor statistics
```

Contoh:

```text
src/components/a.jsx
src/components/b.jsx
```

Aggregate:

```text
src/components
```

O(n * depth) dapat dilakukan sekali.

---

# 58. Ownership Tree Model

```ts
OwnershipNode = {
  path: string,
  type: "file" | "directory",

  totalCommits: number,
  totalChurn: number,

  primaryContributor: ContributorSummary | null,

  topContributors: ContributorSummary[],

  concentration: number
}
```

---

# 59. Contributor Detail

Klik contributor:

```text
Faizal Fakhri

Commits       421
Files touched  87
Change volume 31k
Last activity Today
```

Top areas:

```text
electron/          48%
src/components/    33%
tests/             19%
```

Recent commits dapat menggunakan existing commit navigation.

---

# 60. Ownership File Integration

P0 File Explorer row dapat menampilkan optional ownership badge:

```text
App.jsx        Faizal
```

Jangan tampilkan default jika membuat tree terlalu padat.

Tambahkan toggle:

```text
Show ownership
```

---

# 61. Ownership + Health

Health signal hanya untuk:

```text
high hotspot
+
high ownership concentration
```

Contoh:

```text
High-activity file relies heavily on one contributor.
```

Jangan penalize file stabil dengan satu contributor.

---

# 62. Ownership IPC

```text
analytics:ownership
```

Payload:

```ts
{
  repositoryPath: string,
  path?: string,
  period?: "all" | "12m"
}
```

Response bounded.

Untuk tree besar:

```text
return directory summary first
```

Detail file on-demand.

---

# 63. Ownership Acceptance Criteria

- File primary contributor dapat dihitung.
- Directory aggregation benar.
- All-time dan recent mode tidak dicampur.
- Alias email/name tidak menyebabkan double contributor secara berlebihan.
- Raw commit/churn shares terlihat.
- Ownership concentration explainable.
- Hotspot + ownership integration bekerja.
- No network identity lookup.
- No Gravatar requirement.
- Offline tetap penuh.

---

# 64. Ownership Testing

Unit:

```text
author normalization
weighted ownership
directory aggregation
concentration
period filtering
```

Integration:

repo dengan multiple authors dan path areas.

---

# 65. P1-05 — Visual Git Blame

## 65.1 Tujuan

Menampilkan asal setiap baris secara visual tanpa terminal.

Entry:

```text
File Explorer → Blame
File Preview → Blame
```

---

# 66. Git Command

Gunakan:

```bash
git blame \
  --line-porcelain \
  --date=iso-strict \
  <revision> \
  -- <path>
```

Default revision:

```text
HEAD
```

Untuk working tree blame dapat menjadi fase berikutnya.

P1 baseline:

```text
HEAD only
```

dan:

```text
specific commit revision
```

---

# 67. IPC

```text
file:blame
```

Payload:

```ts
{
  repositoryPath: string,
  path: string,
  revision?: string
}
```

Revision:

```text
commit hash atau HEAD-resolved hash
```

Jangan menerima arbitrary revision tanpa validation.

Backend resolve commit dahulu.

---

# 68. Blame Model

```ts
BlameFile = {
  path: string,
  revision: string,
  lines: BlameLine[],
  authors: BlameAuthor[]
}
```

Line:

```ts
BlameLine = {
  lineNumber: number,
  content: string,

  commitHash: string,
  shortHash: string,

  author: {
    name: string,
    email: string
  },

  authorTime: string,

  summary: string,

  previous?: {
    hash: string,
    path: string
  },

  boundary: boolean
}
```

---

# 69. Porcelain Parser

Parser harus pure function:

```text
parseBlamePorcelain(raw)
```

Test:

```text
multiple lines same commit
boundary commit
previous path
unicode author
empty line
tabs
```

---

# 70. Blame UI

```text
Author       Age        Commit     Code
────────────────────────────────────────────────────────
Faizal       2h         a73bcee    function loadRepo() {
Faizal       2h         a73bcee      ...
Sarah        4mo        b712acc      return result
```

Grouping visual:

Baris commit sama yang berurutan:

```text
author metadata hanya ditampilkan pada baris pertama
```

agar tidak terlalu ramai.

---

# 71. Blame Heatmap

Heatmap dapat menggunakan recency.

Bucket:

```text
< 7 days
< 30 days
< 90 days
< 1 year
>= 1 year
```

Tetapi jangan bergantung pada warna saja.

Tooltip menampilkan absolute date.

---

# 72. Blame Interaction

Klik gutter:

```text
open commit details
```

Context:

```text
View commit
View file at commit
View previous revision
Copy commit hash
Copy line
```

`View previous revision` hanya jika porcelain memiliki previous metadata.

---

# 73. Blame + File History

Header:

```text
[ Preview ] [ History ] [ Blame ]
```

Ketiganya menjadi mode file.

State:

```text
selected file
selected revision
selected line
```

---

# 74. Large File Blame

Blame bisa mahal.

Guard:

```text
max file size default: 2 MB
max lines default: 50,000
timeout: 30 sec
```

Jika melebihi:

```text
Blame is disabled for very large files.
```

Boleh ada explicit:

```text
Run anyway
```

kemudian, bukan P1 wajib.

---

# 75. Binary

Binary:

```text
Blame unavailable for binary files.
```

---

# 76. Blame Cache

Cache:

```text
repository + revision + path
```

LRU:

```text
10 files/session
```

Invalidate:

```text
revision changes
repository refresh jika HEAD berubah
```

Working-tree modifications tidak mengubah HEAD blame.

UI dapat menunjukkan:

```text
Blame is based on HEAD; working tree has uncommitted changes.
```

---

# 77. Blame Acceptance Criteria

- HEAD blame tampil.
- Specific revision blame tampil.
- Commit metadata benar.
- Click blame membuka commit.
- Binary file aman.
- Large file guard bekerja.
- Working-tree dirty warning tampil.
- Path validation tetap digunakan.
- No shell strings.
- Blame cache bounded.

---

# 78. Blame Testing

Integration repository:

```text
commit A author A lines 1-3
commit B author B line 2
commit C rename file
```

Verifikasi blame metadata.

---

# 79. P1-06 — Automatic Repository Refresh

## 79.1 Tujuan

Menghilangkan ketergantungan pada tombol manual Refresh.

Repo Atlas harus mendeteksi perubahan penting:

```text
new commit
branch checkout
branch ref update
stage/unstage
working tree file change
cherry-pick state
merge state
rebase state
repository operation
```

---

# 80. Auto Refresh Constraints

Jangan:

```text
rescan repository pada setiap filesystem event
```

Text editor dapat menghasilkan puluhan event.

Gunakan:

```text
watch
→ classify
→ debounce
→ targeted refresh
```

---

# 81. Watch Architecture

Buat:

```text
electron/watch/
├── repository-watcher.cjs
├── watch-manager.cjs
└── event-classifier.cjs
```

Satu watcher per open repository session.

Renderer tidak menggunakan Node filesystem watcher.

---

# 82. Watch Strategy

Recommended dependency:

```text
chokidar
```

Alasan:

```text
cross-platform
recursive behavior lebih konsisten
atomic write handling
ignore patterns
```

Tetapi konfigurasi harus bounded.

---

# 83. Paths yang Dipantau

Git metadata:

```text
.git/HEAD
.git/index
.git/refs/**
.git/packed-refs
.git/CHERRY_PICK_HEAD
.git/MERGE_HEAD
.git/REVERT_HEAD
.git/rebase-merge/**
.git/rebase-apply/**
.git/sequencer/**
```

Worktree:

```text
repository root
```

Ignore:

```text
.git/**
node_modules/**
dist/**
build/**
coverage/**
vendor/**
```

Jangan ignore seluruh generated folders secara otomatis jika user ingin status perubahan Git.

Better worktree watcher dapat mengikuti file list dari P0 dan `.gitignore`.

---

# 84. Large Repository Watch Mode

Repository besar dapat memiliki terlalu banyak paths.

Mode:

```text
smart
git-only
full
off
```

Default:

```text
smart
```

Smart:

```text
always watch Git metadata
watch working tree with chokidar up to threshold
fallback to periodic git status when repository huge
```

Threshold:

```text
50,000 visible files
```

---

# 85. Fallback Polling

Jika full watcher tidak tersedia/terlalu berat:

Active tab:

```text
git status lightweight check every 3 seconds
```

Inactive tab:

```text
every 15 seconds
```

Tetapi Git metadata watcher tetap preferred.

Tidak perlu full scan.

Fingerprint command:

```bash
git status --porcelain=v2 --branch -z
```

Hash output.

Jika berubah:

```text
trigger status refresh
```

---

# 86. Event Classification

```ts
RepositoryChangeEvent = {
  repositoryPath: string,
  kind:
    | "worktree"
    | "index"
    | "head"
    | "refs"
    | "operation-state",
  paths?: string[],
  timestamp: number
}
```

---

# 87. Targeted Refresh

Jangan selalu memanggil full `scanRepository()`.

Tambah IPC:

```text
repository:refresh-status
repository:refresh-refs
repository:refresh-head
```

Atau satu:

```text
repository:refresh-partial
```

Payload enum eksplisit:

```ts
{
  repositoryPath,
  parts: ["status", "refs"]
}
```

Ini masih safe karena enum fixed.

---

# 88. Refresh Rules

## Worktree file event

Refresh:

```text
status
```

Tidak refresh analytics.

## Index event

Refresh:

```text
status
```

## HEAD event

Refresh:

```text
repository identity
current branch
HEAD
commits initial page
status
```

Invalidate:

```text
blame HEAD cache
search commit cache
```

## Refs event

Refresh:

```text
branches
tags
commits
```

Invalidate:

```text
analytics
branch intelligence
health
```

## operation-state

Refresh:

```text
repository state
status
```

---

# 89. Debounce

Per repository:

```text
250 ms
```

Burst maximum wait:

```text
1500 ms
```

Jika event datang terus, refresh tetap terjadi periodik.

---

# 90. Renderer Event Bridge

Preload expose subscription API yang sempit:

```js
onRepositoryChanged(callback)
```

Implementation harus return unsubscribe.

Jangan expose raw IPC.

Example:

```js
onRepositoryChanged: (listener) => {
  const wrapped = (_event, payload) => listener(payload)
  ipcRenderer.on("repository:changed", wrapped)
  return () => ipcRenderer.removeListener("repository:changed", wrapped)
}
```

Channel fixed.

---

# 91. Multi Repository Watcher

Watcher lifecycle:

```text
session created
→ create watcher

session closed
→ dispose watcher

app quit
→ dispose all
```

Inactive tabs tetap dapat menerima event tetapi refresh dapat ditunda.

State:

```text
stale = true
```

Ketika tab diaktifkan:

```text
refresh
```

Ini menghemat resource.

---

# 92. Auto Refresh UI

Header:

```text
Live
```

atau:

```text
Auto refresh
```

Status:

```text
Watching
Paused
Fallback polling
Error
```

Tidak perlu noisy toast untuk setiap change.

Jika data berubah:

```text
subtle "Updated just now"
```

---

# 93. Protect User Context

Auto refresh tidak boleh:

```text
menghapus selection
reset scroll
menutup commit details
mengubah active view
```

Commit graph refresh harus mencoba mempertahankan:

```text
selected hash
anchor
scroll position / focused commit
filter
query
```

Jika selected commit hilang:

```text
show non-blocking state
```

---

# 94. Auto Refresh During Write Operation

Saat Repo Atlas menjalankan:

```text
cherry-pick
stage
unstage
```

watcher pasti mendeteksi event.

Gunakan operation transaction ID.

Flow:

```text
begin operation
watch events buffered
operation selesai
single refresh
release buffer
```

Mencegah repeated refresh.

---

# 95. Auto Refresh Acceptance Criteria

- External commit terdeteksi.
- External checkout terdeteksi.
- External stage/unstage terdeteksi.
- File edit terdeteksi.
- Event burst didebounce.
- UI context tidak reset.
- Multi-repo watcher dispose benar.
- Large repo memiliki fallback.
- Watch error tidak crash app.
- Manual Refresh tetap tersedia.
- Analytics tidak rebuild hanya karena file edit.

---

# 96. Auto Refresh Testing

Unit:

```text
event classifier
debounce
refresh plan
watch lifecycle
```

Electron integration:

```text
open repo
edit file externally
verify workspace status update

git checkout other branch
verify branch changes

git commit externally
verify HEAD update
```

---

# 97. P1-07 — Visual Stage / Unstage

## 97.1 Tujuan

Memungkinkan user mengelola Git index dari Workspace tanpa terminal.

P1 write operations:

```text
stage file
unstage file
stage multiple files
unstage multiple files
stage hunk
unstage hunk
```

Tidak termasuk:

```text
commit
discard
reset
clean
checkout
```

---

# 98. Safety Policy

Repo Atlas sebelumnya read-only kecuali cherry-pick.

P1 perlu operation permission.

Setting:

```text
Repository Operations

Read-only
Safe Write
```

Default untuk existing install:

```text
Read-only
```

User harus enable:

```text
Safe Write
```

sekali.

Persist locally.

---

# 99. Safe Write Scope

Safe Write P1 memungkinkan:

```text
cherry-pick
stage
unstage
```

Tidak memberikan:

```text
arbitrary Git write permission
```

Setiap operation tetap explicit IPC.

---

# 100. Workspace UI

Target:

```text
Workspace

Unstaged Changes

M src/App.jsx                     [Stage]
M src/lib/api.js                  [Stage]
? notes.md                        [Stage]

Staged Changes

M src/components/button.jsx       [Unstage]
```

Toolbar:

```text
Stage All
Unstage All
```

"All" hanya current visible category.

---

# 101. File Selection

Support multi-select.

```text
checkbox
shift click
Cmd/Ctrl click
```

Floating action bar:

```text
3 files selected

[ Stage ]
```

atau:

```text
2 staged files selected

[ Unstage ]
```

Jangan campur staged dan unstaged dalam satu operation.

---

# 102. Stage IPC

```text
workspace:stage-files
```

Payload:

```ts
{
  repositoryPath: string,
  paths: string[]
}
```

Validation:

```text
array
1..200 paths
repository-relative
no null byte
no path traversal
```

Command:

```bash
git add -- <paths...>
```

Gunakan:

```text
--literal-pathspecs
```

seperti existing diff service.

---

# 103. Unstage IPC

```text
workspace:unstage-files
```

Command:

```bash
git restore --staged -- <paths...>
```

Repo Atlas already requires modern Git for conflict prediction.

`git restore` tersedia pada Git version yang lebih lama dari minimum merge-tree requirement.

Tetap detect capability.

Fallback tidak perlu menggunakan:

```text
git reset
```

jika ingin menjaga operation surface sempit.

Jika unsupported:

```text
UNSUPPORTED_GIT_VERSION
```

---

# 104. Unborn Repository

Repository tanpa commit pertama:

```text
HEAD belum ada
```

`git restore --staged` mungkin tidak bekerja normal.

Handle separately.

Untuk unstage pada unborn branch:

```bash
git rm --cached -- <paths>
```

Tetapi ini juga write operation.

Jika ingin P1 lebih aman:

```text
Unstage on repositories without an initial commit is not supported yet.
```

Recommended untuk first P1.

---

# 105. Stage Hunk

UI diff:

```text
@@ -20,5 +20,8 @@

[ Stage Hunk ]
```

Renderer tidak mengirim arbitrary patch text.

Payload:

```ts
{
  repositoryPath: string,
  path: string,
  hunkId: string,
  source: "unstaged"
}
```

Backend:

1. generate current diff sendiri;
2. parse hunks;
3. cari exact hunk ID;
4. rebuild valid patch;
5. apply to index.

---

# 106. Hunk ID

Stable within current diff snapshot.

Compute:

```text
SHA-256(
  path +
  hunk header +
  hunk lines
)
```

Renderer hanya menerima ID dari backend-derived diff model.

Jika file berubah sebelum click:

```text
hunk not found
```

Response:

```text
STALE_DIFF
```

UI refresh diff.

---

# 107. Apply Stage Hunk

Backend generated patch:

```bash
git apply --cached --recount -
```

Input melalui stdin ke child process.

Executable fixed:

```text
git
```

Args fixed.

Renderer tidak memasok patch.

---

# 108. Unstage Hunk

Source:

```text
staged diff
```

Backend regenerates:

```bash
git diff --cached
```

Pilih hunk.

Apply reverse:

```bash
git apply --cached --reverse --recount -
```

Harus diuji secara kuat.

---

# 109. Patch Validation

Sebelum apply:

```text
path exactly matches requested path
no additional files
hunk exists
patch generated from current repository state
```

Optionally dry-run:

```bash
git apply --cached --check
```

kemudian actual apply.

Untuk reverse:

```bash
git apply --cached --reverse --check
```

---

# 110. Partial Line Stage

Tidak termasuk P1 baseline.

Karena line selection jauh lebih kompleks:

```text
context reconstruction
adjacent changes
partial replacement
patch correctness
```

P1 cukup hunk-level.

---

# 111. Stage Operation Response

```ts
WorkspaceOperationResult = {
  changed: boolean,

  paths: string[],

  status: RepositoryStatusSnapshot,

  operation: "stage" | "unstage"
}
```

Backend langsung return refreshed workspace status.

Renderer tidak perlu menunggu watcher.

---

# 112. Read-only Guard

Main process harus memeriksa setting operation policy.

Renderer disabling button saja tidak cukup.

Policy harus ada backend.

Store via Electron application preferences.

Minimum IPC:

```text
settings:get-operation-mode
settings:set-operation-mode
```

Mode:

```text
read-only
safe-write
```

Backend handler untuk stage/unstage:

```text
assertSafeWriteEnabled()
```

Cherry-pick juga sebaiknya mengikuti policy yang sama setelah migration.

---

# 113. Migration Existing Cherry-pick

Karena cherry-pick sudah ada.

P1 migration:

Existing behavior saat upgrade dapat:

```text
safe-write = enabled
```

hanya jika user sebelumnya pernah menjalankan cherry-pick?

Terlalu kompleks.

Lebih aman:

```text
new operation mode defaults read-only
```

Cherry-pick UI menjelaskan bahwa Safe Write harus diaktifkan.

Tetapi ini dapat menjadi behavior change.

Alternative:

```text
read-only lock setting hanya memblok new stage/unstage
cherry-pick tetap seperti existing
```

P1 recommended:

buat operation policy umum tetapi migration default:

```text
safe-write
```

untuk mempertahankan existing cherry-pick behavior.

Tambahkan user setting:

```text
Lock repository to read-only
```

User dapat mengunci.

Ini konsisten dengan roadmap yang menyatakan read-only mode harus dapat dikunci.

---

# 114. Workspace Status Model

Pastikan file dapat direpresentasikan pada dua sisi.

Contoh Git status:

```text
MM file.js
```

file memiliki:

```text
staged modification
unstaged modification
```

Jangan modelkan sebagai satu `kind` saja.

Target:

```ts
WorkspaceFile = {
  path: string,

  indexStatus: string | null,
  worktreeStatus: string | null,

  staged: boolean,
  unstaged: boolean,
  untracked: boolean,
  conflicted: boolean
}
```

Ini mungkin memerlukan update parser status.

---

# 115. Workspace View Sections

```text
Conflicts
Staged
Changes
Untracked
```

Satu file dapat muncul:

```text
Staged
+
Changes
```

jika status `MM`.

Itu benar.

---

# 116. Stage/Unstage Diff Integration

Staged:

```text
DiffView request staged=true
```

Unstaged:

```text
staged=false
```

Setiap hunk:

```text
Stage Hunk
Unstage Hunk
```

berdasarkan section.

---

# 117. Operation Feedback

Jangan toast success berlebihan.

Gunakan inline transition:

```text
file berpindah section
```

Error:

```text
Could not stage App.jsx

The file changed while the operation was being prepared.

[ Refresh ]
```

---

# 118. Conflicts

Conflicted file tidak boleh stage secara sembarang jika masih unmerged.

Git menggunakan `git add` untuk menandai resolved file.

Itu valid tetapi memiliki semantik penting.

P1 baseline:

Untuk conflicted:

```text
Mark as Resolved
```

bukan label `Stage`.

Operation tetap:

```bash
git add
```

Tetapi UI harus jelas.

Hanya enable jika file tidak memiliki unresolved conflict markers?

Git tidak bisa memastikan conflict markers hilang.

Jangan parse source untuk menentukan resolution.

Tampilkan confirmation:

```text
Mark this file as resolved in the Git index?
```

Ini satu-satunya file-level confirm yang direkomendasikan.

---

# 119. Stage/Unstage Acceptance Criteria

- Stage file bekerja.
- Stage multiple files bekerja.
- Unstage file bekerja.
- Status `MM` ditampilkan pada dua sections.
- Untracked file dapat di-stage.
- Stage hunk bekerja.
- Unstage hunk bekerja.
- Stale hunk ditolak.
- Renderer tidak dapat mengirim arbitrary patch.
- Path traversal ditolak.
- Read-only lock enforcement ada di backend.
- Conflict file memakai terminology resolved.
- Watcher tidak menyebabkan repeated refresh storm.
- Operation response langsung memperbarui workspace.
- Cherry-pick regression tidak terjadi.

---

# 120. Stage/Unstage Testing

Git integration scenarios:

```text
modified tracked file
untracked file
deleted file
renamed file
MM file
staged only
conflicted file
hunk stage
hunk unstage
stale hunk
filename with spaces
unicode path
```

Security:

```text
../outside
absolute path
symlink path
unexpected hunk ID
arbitrary patch attempt
```

---

# 121. Shared P1 UI Navigation

Setelah P1:

```text
Overview

Explore
  Files

History
  Commits

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
  Hotspots
  Ownership
```

Blame berada pada file context, bukan top-level navigation.

---

# 122. Command Palette Additions

P0 Command Palette perlu P1 commands:

```text
Open Repository Health
Open Hotspots
Open Ownership
Show Stale Branches
Show Diverged Branches
Blame Current File
Stage Selected Files
Unstage Selected Files
Toggle Auto Refresh
```

Write command disabled jika:

```text
safe write unavailable
no selection
wrong workspace section
repository operation in progress
```

---

# 123. Global Search Integration

P0 Global Search dapat menambahkan:

```text
Hotspot
Contributor
```

tetapi bukan requirement P1 awal.

Recommended minimal:

Contributor result dapat action:

```text
Open Ownership
```

---

# 124. P1 Data Flow

```text
                 Repository Session
                        │
                        ▼
               Repository Snapshot
                        │
            ┌───────────┴────────────┐
            │                        │
            ▼                        ▼
     Analytics Index          Repository Watcher
            │                        │
    ┌───────┼────────┐               │
    │       │        │               │
    ▼       ▼        ▼               ▼
 Health  Hotspots Ownership     Partial Refresh
    │       │        │               │
    └───────┼────────┘               │
            │                        │
            ▼                        ▼
      Insights UI              Session Store
```

Branch intelligence dapat menggunakan:

```text
snapshot + bounded branch-specific Git calculations
```

---

# 125. P1 IPC Summary

Tambahkan:

```text
repository:health
branches:intelligence

analytics:summary
analytics:hotspots
analytics:ownership

file:blame

workspace:stage-files
workspace:unstage-files
workspace:stage-hunk
workspace:unstage-hunk

settings:get-operation-mode
settings:set-operation-mode

repository:watch-start
repository:watch-stop
repository:refresh-partial
```

Watcher start/stop dapat dikelola internal main process tanpa renderer IPC jika session lifecycle sudah di main.

Preferred:

```text
main controls watcher based on explicit repository registration
```

---

# 126. Preload Target

```js
window.repoAtlas = {
  // P0
  openRepository,
  scanRepository,
  revealRepository,
  listCommits,
  commitDetails,
  listRepositoryFiles,
  readRepositoryFile,
  fileHistory,
  fileContentAtRevision,
  fileDiff,
  searchRepository,
  compareRefs,

  // P1
  repositoryHealth,
  branchIntelligence,
  hotspots,
  ownership,
  fileBlame,

  stageFiles,
  unstageFiles,
  stageHunk,
  unstageHunk,

  getOperationMode,
  setOperationMode,

  onRepositoryChanged,

  // existing write
  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,

  platform
}
```

---

# 127. New Error Codes

```text
ANALYTICS_BUILD_FAILED
ANALYTICS_LIMIT_REACHED

BRANCH_ANALYSIS_FAILED

BLAME_FAILED
BLAME_TOO_LARGE

WATCH_FAILED
WATCH_UNAVAILABLE

READ_ONLY_MODE
WRITE_OPERATION_BLOCKED

STAGE_FAILED
UNSTAGE_FAILED
STALE_DIFF
HUNK_NOT_FOUND
CONFLICT_RESOLUTION_REQUIRED
UNSUPPORTED_GIT_VERSION
```

---

# 128. Performance Budgets

These are engineering targets, not guaranteed user-visible timings.

## Repository Health

Basic health:

```text
available without full analytics
```

Full health:

```text
progressive
```

## Analytics

Never load all raw Git history into renderer.

## Branch Intelligence

Bound:

```text
500 branches
concurrency 4
```

## Hotspots

Backend returns top:

```text
100 default
```

## Ownership

Directory summary first.

## Blame

Guard:

```text
2 MB
50k lines
```

## Watcher

No full rescan per filesystem event.

---

# 129. Analytics Progress

Analytics index build dapat memakan waktu pada repository besar.

Main process dapat emit bounded progress:

```ts
{
  repositoryPath,
  phase: "history",
  processedCommits,
  maxCommits
}
```

Preload:

```text
onAnalyticsProgress
```

Tidak emit per commit.

Throttle:

```text
250 ms
```

---

# 130. Analytics Cancellation

Jika repository tab ditutup saat build:

```text
cancel child process
```

Use:

```text
AbortController-like wrapper
```

Main process harus terminate spawned Git process.

Jangan lanjut membangun cache untuk session closed.

---

# 131. Memory Strategy

Analytics index bisa besar.

Per session:

```text
active repo: full analytics cache
inactive repo: keep summary, allow full index eviction
```

Global memory LRU.

Example:

```text
max 3 full analytics indexes
```

Jika repository ke-4 meminta analytics:

```text
evict least recently used inactive index
```

Rebuild on demand.

---

# 132. P1 Demo Mode

Demo dataset wajib mendukung:

```text
health
branch intelligence
hotspots
ownership
blame
auto-refresh indicator mock
stage/unstage disabled atau simulated
```

Untuk browser demo:

Write operation sebaiknya:

```text
simulated
```

dengan badge:

```text
Demo data
```

Jangan mutate real disk.

---

# 133. P1 Testing Stack

Gunakan fondasi P0:

```text
node:test
Vitest
React Testing Library
Playwright Electron
```

Tambahkan fixture builder Git.

---

# 134. Git Fixture Builder

Buat helper:

```text
tests/helpers/git-fixture.cjs
```

API:

```js
createRepo()
commitFile()
commitAs(author)
createBranch()
checkout()
merge()
renameFile()
stageFile()
```

Ini mengurangi duplicated shell setup.

Helper sendiri dapat menggunakan:

```text
execFile("git", args)
```

---

# 135. Test Repository Scenarios

Reusable fixtures:

```text
linear-history
multi-author
branch-divergence
stale-branches
high-churn
rename-history
conflict
staged-unstaged
large-file
```

---

# 136. P1 Implementation Sequence

Urutan dibuat untuk memaksimalkan reuse.

---

## Stage P1-0 — Shared Analytics Foundation

- [x] Add streaming Git runner.
- [x] Add analytics parser.
- [x] Add analytics index.
- [x] Add author identity normalization.
- [x] Add cache.
- [x] Add cancellation.
- [x] Add analytics scope limits.
- [x] Add tests.
- [x] Add analytics demo data.

Exit:

```text
backend dapat menghasilkan bounded file/author history analytics
```

---

## Stage P1-1 — Branch Intelligence

- [x] Default branch resolution review.
- [x] Ahead/behind vs default.
- [x] Merge-base.
- [x] Merged detection.
- [x] Stale status.
- [x] Gone upstream status.
- [x] Branch intelligence IPC.
- [x] List view upgrades.
- [x] Divergence visualization.
- [x] Filters/sorting.
- [x] Tests.

Branch intelligence didahulukan karena Repository Health membutuhkannya.

---

## Stage P1-2 — Hotspot Analysis

- [x] File activity aggregation.
- [x] Churn metric.
- [x] Commit frequency.
- [x] Recency.
- [x] Percentile normalization.
- [x] Generated-file filter.
- [x] Hotspot IPC.
- [x] Hotspot view.
- [x] File History integration.
- [x] Tests.

---

## Stage P1-3 — Contributor Ownership

- [x] Ownership aggregation.
- [x] Author normalization.
- [x] Directory aggregation.
- [x] Concentration metric.
- [x] Recent/all-time mode.
- [x] Ownership IPC.
- [x] Ownership view.
- [x] Hotspot integration.
- [x] Tests.

---

## Stage P1-4 — Repository Health

- [x] Health rules.
- [x] Penalty model.
- [x] Health IPC.
- [x] Progressive Overview card.
- [x] Detailed health view.
- [x] Signal actions.
- [x] Branch integration.
- [x] Hotspot/ownership integration.
- [x] Tests.

Health dibuat setelah underlying signals stabil.

---

## Stage P1-5 — Git Blame

- [x] `git blame --line-porcelain`.
- [x] Parser.
- [x] Cache.
- [x] Large file guard.
- [x] File mode UI.
- [x] Heatmap.
- [x] Commit navigation.
- [x] Previous revision action.
- [x] Tests.

---

## Stage P1-6 — Auto Refresh

- [x] Watch manager.
- [x] Git metadata watcher.
- [x] Worktree watcher.
- [x] Smart mode.
- [x] Fallback polling.
- [x] Event classifier.
- [x] Partial refresh.
- [x] Renderer subscription.
- [x] Session integration.
- [x] Context preservation.
- [x] Analytics invalidation.
- [x] Tests.

---

## Stage P1-7 — Stage / Unstage Foundation

- [x] Operation policy.
- [x] Workspace status model upgrade.
- [x] Stage files.
- [x] Unstage files.
- [x] Multi-select UI.
- [x] Conflict terminology.
- [x] Watcher transaction integration.
- [x] Security tests.

---

## Stage P1-8 — Hunk Stage / Unstage

- [x] Backend hunk IDs.
- [x] Patch regeneration.
- [x] Stage hunk.
- [x] Unstage hunk.
- [x] Stale diff protection.
- [x] Diff UI buttons.
- [x] Integration tests.

---

## Stage P1-9 — Hardening

- [x] 50k-file repository.
- [x] 10k+ commits.
- [x] 500 branches.
- [x] multiple authors.
- [x] huge churn.
- [x] binary.
- [x] large blame file.
- [x] symlink.
- [x] Unicode path.
- [x] Windows path.
- [x] worktree repository.
- [x] submodule.
- [x] active Git operation.
- [x] multi-repository watchers.
- [x] analytics cancellation.
- [x] memory LRU.
- [x] demo mode.
- [x] regression P0.
- [x] regression cherry-pick.

---

# 137. Suggested PR Breakdown

Jangan implement semua P1 dalam satu branch.

```text
PR-01  Streaming Git runner and analytics foundation
PR-02  Analytics caching and cancellation
PR-03  Branch intelligence backend
PR-04  Branch divergence UI
PR-05  Hotspot analytics backend
PR-06  Hotspot insights UI
PR-07  Ownership analytics backend
PR-08  Ownership insights UI
PR-09  Repository health rules
PR-10  Repository health UI
PR-11  Git blame backend
PR-12  Visual blame UI
PR-13  Repository watcher foundation
PR-14  Partial auto-refresh integration
PR-15  Multi-repository watcher hardening
PR-16  Safe write operation policy
PR-17  Stage/unstage file backend
PR-18  Workspace stage/unstage UI
PR-19  Hunk operation backend
PR-20  Hunk stage/unstage UI
PR-21  P1 E2E + performance hardening
```

---

# 138. Dependencies Between PRs

```text
Analytics Foundation
├── Branch Intelligence
├── Hotspots
└── Ownership

Branch Intelligence
Hotspots
Ownership
        └── Repository Health

File Explorer
        └── Git Blame

Repository Watcher
        └── Stage / Unstage

Split Diff
        └── Hunk Stage / Unstage
```

---

# 139. Definition of Done P1

Setiap feature harus memenuhi:

## Functionality

- [ ] loading;
- [ ] error;
- [ ] empty state;
- [ ] keyboard;
- [ ] mouse;
- [x] multi-repository context;
- [x] demo mode.

## Performance

- [x] bounded commands;
- [x] no unbounded renderer payload;
- [x] cancellation;
- [x] caching;
- [x] no unnecessary full scan.

## Explainability

Untuk analytics:

- [ ] raw metric tersedia;
- [ ] score formula documented;
- [ ] scope/truncation visible;
- [ ] no misleading claim.

## Security

- [x] explicit IPC;
- [x] no shell string;
- [x] validation;
- [x] backend write-policy enforcement;
- [x] no arbitrary patch from renderer.

## Tests

- [x] unit;
- [x] Git integration;
- [x] component;
- [ ] E2E critical flow.

---

# 140. P1 Security Checklist

- [x] `spawn("git", args, shell:false)` only for analytics streaming.
- [ ] No generic command executor.
- [x] No arbitrary patch input.
- [x] File paths repository-relative.
- [x] Path count bounded.
- [x] Branch analysis ref validated.
- [x] Blame revision resolved safely.
- [x] Watcher does not expose filesystem API.
- [x] Write mode enforced in main/backend.
- [x] Stage paths validated.
- [x] Hunk ID regenerated backend.
- [x] Stale hunk rejected.
- [x] Conflicted-file operation explicit.
- [x] Child processes cancellable.
- [x] Analytics output bounded.

---

# 141. UX Rules P1

## Insights are explanations, not judgments

Avoid:

```text
Bad repository
Bad code
Dangerous file
```

Use:

```text
High historical churn
Highly concentrated contribution
Branch is 120 commits behind main
No activity for 180 days
```

---

## Health

Show:

```text
why
metric
action
```

---

## Auto Refresh

Silent by default.

No toast spam.

---

## Stage/Unstage

Movement between sections is feedback.

---

## Analytics Scope

Always show if bounded:

```text
Analyzed the most recent 10,000 commits.
```

---

# 142. Settings P1

Add Settings:

```text
General

Auto Refresh
  Smart
  Git only
  Off

Repository Operations
  Safe write enabled
  Read-only lock

Analytics
  Commit scan limit
    5,000
    10,000
    25,000
    50,000

Hotspots
  Exclude generated files
```

Avoid too many settings initially.

Default:

```text
Auto Refresh: Smart
Analytics: 10,000
Exclude generated: yes
```

---

# 143. Repository Session State P1

Extend P0 session:

```ts
RepositorySession = {
  ...

  analytics: {
    status,
    scope,
    summary
  },

  health: {
    status,
    data
  },

  branchIntelligence: {
    status,
    data
  },

  insights: {
    hotspotFilter,
    ownershipPath,
    ownershipPeriod
  },

  watcher: {
    mode,
    status,
    stale
  }
}
```

Do not store full analytics index in renderer.

---

# 144. Final Navigation Target

```text
Repo Atlas
────────────────────────

Overview

Explore
  Files

History
  Commits

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
  Hotspots
  Ownership
```

File context:

```text
Preview
History
Blame
```

---

# 145. User Flow — Repository Health

```text
Open repository
↓
Overview immediately appears
↓
Health analysis loads progressively
↓
3 stale branches
↓
click
↓
Branches filtered to Stale
```

---

# 146. User Flow — Hotspot

```text
Insights
↓
Hotspots
↓
src/App.jsx
↓
detail
↓
File History
↓
select commit
↓
Split Diff
```

---

# 147. User Flow — Ownership

```text
Insights
↓
Ownership
↓
src/components
↓
Faizal 62%
↓
open contributor
↓
top files / recent commits
```

---

# 148. User Flow — Blame

```text
Files
↓
src/App.jsx
↓
Blame
↓
click line
↓
commit details
↓
open diff
```

---

# 149. User Flow — Auto Refresh

```text
Repo Atlas open
↓
external editor modifies file
↓
watch event
↓
debounce
↓
workspace status refresh
↓
dirty indicator updates
```

No manual refresh.

---

# 150. User Flow — Stage

```text
Workspace
↓
Changes
↓
select App.jsx
↓
Stage
↓
backend validates
↓
git add
↓
updated status returned
↓
file moves to Staged
```

---

# 151. User Flow — Stage Hunk

```text
Workspace
↓
open diff
↓
select hunk
↓
Stage Hunk
↓
backend regenerates current diff
↓
match hunk ID
↓
git apply --cached
↓
refresh status/diff
```

---

# 152. P1 Completion Checklist

## Foundation

- [x] Streaming analytics runner
- [x] Analytics parser
- [x] Analytics cache
- [x] Cancellation
- [x] Scope limits
- [x] Memory LRU

## Health

- [x] Health model
- [x] Explainable score
- [x] Signals
- [x] Categories
- [x] Actions
- [x] Progressive loading

## Branch Intelligence

- [x] Default branch
- [x] Ahead/behind
- [x] Divergence
- [x] Merge base
- [x] Merged detection
- [x] Stale
- [x] Gone
- [x] Filters
- [x] Visualization

## Hotspots

- [x] Commit frequency
- [x] Churn
- [x] Recency
- [x] Percentile score
- [x] Generated exclusion
- [x] Hotspot UI
- [x] File history integration

## Ownership

- [x] Contributor normalization
- [x] File ownership
- [x] Directory aggregation
- [x] Concentration
- [x] All-time
- [x] Recent
- [x] Contributor detail

## Blame

- [x] Porcelain parser
- [x] Blame IPC
- [x] Blame view
- [x] Heatmap
- [x] Commit navigation
- [x] Previous revision
- [x] Large file guard

## Auto Refresh

- [x] Watch manager
- [x] Git watcher
- [x] Worktree watcher
- [x] Smart mode
- [x] Fallback
- [x] Debounce
- [x] Partial refresh
- [x] Session lifecycle
- [x] Analytics invalidation
- [x] Context preservation

## Stage / Unstage

- [x] Operation policy
- [x] Workspace model
- [x] Stage file
- [x] Unstage file
- [x] Multi-file
- [x] Conflict resolved action
- [x] Hunk ID
- [x] Stage hunk
- [x] Unstage hunk
- [x] Stale diff protection
- [x] Security tests

## Quality

- [x] Unit
- [x] Git integration
- [x] Component
- [ ] Electron E2E
- [ ] macOS
- [ ] Windows
- [ ] Linux
- [x] Demo
- [x] Large repo
- [x] Multi-repo
- [x] Regression P0
- [x] Regression cherry-pick

---

# 153. Expected Result Setelah P1

Repo Atlas setelah P1:

```text
Repository Explorer
+
Git Visualizer
+
History Explorer
+
Repository Intelligence
+
Safe Workspace Operations
```

Layer product:

```text
P0
Files
History
Diff
Search
Navigation
Multi Repository

P1
Health
Branch Intelligence
Hotspots
Ownership
Blame
Live Refresh
Stage / Unstage
```

Fondasi ini kemudian siap untuk P2/P3:

```text
Reflog Timeline
Worktree Manager
Activity Heatmap
Saved Views
Repository Structure Graph
Dependency Graph
Symbol Explorer
Change Impact Analysis
```

P1 harus menghasilkan repository intelligence yang:

```text
local
fast enough
explainable
deterministic
safe
navigable
```

dan tidak mengorbankan prinsip awal Repo Atlas:

```text
developer understands what will happen before the application changes Git state
```
