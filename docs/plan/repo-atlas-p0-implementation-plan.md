# Repo Atlas — P0 Implementation Plan

**Repository:** `faizalfakhri0001/repo-atlas`  
**Target:** pengembangan P0 untuk meningkatkan usability, repository exploration, dan developer workflow tanpa menghilangkan prinsip offline-first dan safe Git operations.

---

## 1. Tujuan Dokumen

Dokumen ini menjadi rencana implementasi teknis untuk seluruh fitur P0 berikut:

1. **P0-01 — Command Palette**
2. **P0-02 — Recent Repositories & Multi-Repository Workspace**
3. **P0-03 — Repository File Explorer**
4. **P0-04 — File History**
5. **P0-05 — Split Diff Viewer + Syntax Highlighting**
6. **P0-06 — Global Search**

Dokumen ini dirancang agar dapat langsung dipecah menjadi issue, task, atau pull request.

---

# 2. Kondisi Project Saat Ini

Repo Atlas saat ini sudah memiliki:

- Electron main process.
- React renderer.
- Vite.
- Tailwind CSS.
- Radix/shadcn-style UI primitives.
- Commit graph dengan virtualization.
- Repository scanning.
- Commit detail.
- Unified diff.
- Compare / Pull Request simulation.
- Merge conflict prediction.
- Cherry-pick preview dan execution.
- Repository state detection.
- Branches.
- Workspace.
- Worktrees.
- Submodules.
- Tags.
- Stashes.
- Remotes.
- Contributors.
- Demo mode di browser.
- Dark/light mode.

Arsitektur keamanan saat ini juga sudah tepat:

```text
React Renderer
    │
    ▼
window.repoAtlas
    │
    ▼
Preload / contextBridge
    │
    ▼
Explicit IPC
    │
    ▼
Electron Main
    │
    ▼
Git Service
    │
    ▼
Local Repository
```

Prinsip ini harus dipertahankan.

Tidak boleh ditambahkan API seperti:

```text
runGit(command)
runShell(command)
readAnyFile(path)
ipcInvoke(channel, payload)
```

Semua fitur baru wajib memiliki IPC contract yang eksplisit.

---

# 3. Sasaran P0

Setelah seluruh P0 selesai, pengguna harus dapat:

```text
Open Repo Atlas
    ↓
memilih repository terakhir / recent repository
    ↓
membuka beberapa repository sekaligus
    ↓
mencari file, branch, commit, tag, atau author secara global
    ↓
membuka file melalui file explorer
    ↓
melihat seluruh history file
    ↓
melihat diff unified atau split
    ↓
menjalankan hampir seluruh navigasi melalui keyboard
```

Target UX:

- minimum mouse travel;
- keyboard-first tetapi tetap nyaman untuk mouse user;
- state repository tidak hilang ketika berpindah view;
- state repository tidak hilang ketika berpindah repository;
- semua operasi P0 read-only;
- tetap dapat digunakan tanpa internet;
- tetap memiliki demo/browser mode.

---

# 4. P0 Foundation — Refactor Sebelum Penambahan Fitur

Tahap ini bukan fitur user-facing, tetapi menjadi prerequisite.

## 4.1 Masalah struktur saat ini

Beberapa tanggung jawab mulai terkonsentrasi pada file besar:

```text
src/App.jsx
src/components/commit-graph.jsx
src/components/compare-view.jsx
electron/git-service.cjs
```

Penambahan multi-repository, file tree, history, dan global search langsung ke struktur tersebut akan meningkatkan coupling.

## 4.2 Target struktur frontend

Gunakan struktur feature-based:

```text
src/
├── app/
│   ├── AppShell.jsx
│   ├── RepositoryTabs.jsx
│   ├── Sidebar.jsx
│   ├── Header.jsx
│   └── workspace-store.js
│
├── features/
│   ├── command-palette/
│   ├── repository/
│   ├── commits/
│   ├── files/
│   ├── file-history/
│   ├── compare/
│   ├── diff/
│   ├── search/
│   ├── workspace/
│   ├── branches/
│   └── metadata/
│
├── components/
│   └── ui/
│
└── lib/
    ├── api.js
    ├── demo.js
    ├── git-graph.js
    └── utils.js
```

Tidak perlu memindahkan seluruh project sekaligus.

Refactor hanya file yang disentuh oleh P0.

---

## 4.3 Target struktur Electron Git layer

Direkomendasikan memecah `git-service.cjs` menjadi domain service:

```text
electron/
├── main.cjs
├── preload.cjs
└── git/
    ├── core.cjs
    ├── repository.cjs
    ├── commits.cjs
    ├── files.cjs
    ├── file-history.cjs
    ├── search.cjs
    ├── compare.cjs
    └── cherry-pick.cjs
```

### `core.cjs`

Berisi:

```text
runGit()
GitServiceError
resolveRepository()
validateDirectory()
assertCommitHash()
assertRefName()
assertRelativePath()
```

Tambahkan helper baru:

```text
resolveRepositoryRelativePath()
```

Helper tersebut wajib:

1. menolak absolute path;
2. menolak null byte;
3. menolak path traversal;
4. normalize path;
5. memastikan hasil tetap berada di repository root;
6. menangani symlink secara aman;
7. tidak mengikuti symlink yang keluar repository ketika membaca file.

Pseudo-code:

```js
async function resolveRepositoryRelativePath(root, input) {
  const relative = normalizeRelativePath(input)

  if (path.isAbsolute(relative)) throw INVALID_PATH
  if (relative.includes("\0")) throw INVALID_PATH

  const target = path.resolve(root, relative)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`

  if (target !== root && !target.startsWith(prefix)) {
    throw PATH_OUTSIDE_REPOSITORY
  }

  return target
}
```

Untuk `realpath`, lakukan containment check lagi apabila file adalah symlink.

---

# 5. State Architecture untuk P0

Saat ini aplikasi berorientasi pada satu:

```js
data
activeView
```

P0 membutuhkan repository session.

Gunakan model:

```ts
RepositorySession = {
  id: string,
  path: string,
  name: string,

  snapshot: RepositorySnapshot | null,

  loading: boolean,
  error: AppError | null,

  activeView: string,

  ui: {
    commitGraph: CommitGraphSession,
    compare: CompareSession,
    files: FileExplorerSession,
    search: SearchSession
  },

  lastActivatedAt: number
}
```

Workspace:

```ts
WorkspaceState = {
  activeSessionId: string | null,
  sessions: RepositorySession[],
  recentRepositories: RecentRepository[]
}
```

Recent repository:

```ts
RecentRepository = {
  path: string,
  name: string,
  lastKnownBranch: string,
  lastOpenedAt: number,
  pinned: boolean
}
```

---

# 6. Persistence

Persist hanya metadata ringan.

Key:

```text
repo-atlas-workspace-v1
repo-atlas-recents-v1
repo-atlas-theme
```

Jangan persist:

- full repository snapshot;
- commit history;
- diff;
- file content;
- search index besar.

Contoh:

```json
{
  "activePath": "/Users/user/project-a",
  "openPaths": [
    "/Users/user/project-a",
    "/Users/user/project-b"
  ]
}
```

Startup:

```text
load workspace metadata
    ↓
render shell
    ↓
scan active repository
    ↓
repository tab lain tetap lazy
    ↓
scan tab ketika pertama kali diaktifkan
```

---

# 7. P0-01 — Command Palette

## 7.1 Tujuan

Memberikan pusat navigasi dan action melalui:

```text
Cmd + K
Ctrl + K
```

Command Palette tidak menjalankan raw Git command.

Ia hanya memanggil action aplikasi yang sudah terdaftar.

---

## 7.2 UX

Default:

```text
┌─────────────────────────────────────────────────────┐
│ > Type a command or search...                       │
├─────────────────────────────────────────────────────┤
│ Navigation                                          │
│   Overview                                      ⌘ 1 │
│   Commits                                       ⌘ 2 │
│   Files                                         ⌘ 3 │
│   Workspace                                     ⌘ 4 │
│                                                     │
│ Repository                                          │
│   Open repository                                   │
│   Switch repository                                 │
│   Refresh repository                                │
│                                                     │
│ Git                                                 │
│   Jump to HEAD                                      │
│   Compare branches                                  │
└─────────────────────────────────────────────────────┘
```

Ketika user mengetik:

```text
compare
```

hasil:

```text
Compare refs
Compare current branch with...
Compare selected commits
```

Setelah Global Search tersedia, palette juga dapat menampilkan:

```text
Files
Commits
Branches
Tags
Authors
```

---

## 7.3 Shortcut

Minimum:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + P` | Quick file |
| `Cmd/Ctrl + Shift + F` | Global search |
| `Cmd/Ctrl + 1` | Overview |
| `Cmd/Ctrl + 2` | Commits |
| `Cmd/Ctrl + 3` | Files |
| `Cmd/Ctrl + 4` | Workspace |
| `Cmd/Ctrl + R` | Refresh repository |
| `Esc` | Close palette |
| `↑ / ↓` | Select command |
| `Enter` | Execute |

Hindari shortcut yang bentrok dengan native browser/Electron tanpa penanganan eksplisit.

---

## 7.4 Arsitektur command registry

Buat:

```text
src/features/command-palette/
├── CommandPalette.jsx
├── command-registry.js
├── command-search.js
└── use-command-palette.js
```

Model:

```ts
Command = {
  id: string,
  label: string,
  category: string,
  keywords?: string[],
  shortcut?: string[],
  enabled?: (context) => boolean,
  visible?: (context) => boolean,
  run: (context) => void | Promise<void>
}
```

Contoh:

```js
{
  id: "navigation.files",
  label: "Open Files",
  category: "Navigation",
  keywords: ["explorer", "tree", "repository"],
  shortcut: ["mod", "3"],
  run: ({ navigate }) => navigate("files")
}
```

---

## 7.5 Command context

```ts
CommandContext = {
  activeRepository,
  activeView,
  selectedCommits,
  navigate,
  openRepository,
  refreshRepository,
  openCompare,
  openCommit,
  openFile
}
```

Command tidak boleh mengakses React internal state secara langsung.

Semua action harus melalui context API.

---

## 7.6 Fuzzy matching

Untuk P0 tidak perlu dependency eksternal.

Gunakan scorer sederhana:

Priority:

1. exact prefix;
2. word prefix;
3. substring;
4. keyword substring;
5. fuzzy character order.

Result maksimal:

```text
20
```

Debounce tidak diperlukan karena command list kecil.

Global Search menggunakan search engine berbeda.

---

## 7.7 UI component

Gunakan existing Radix Dialog.

Struktur:

```text
Dialog
├── SearchInput
├── CommandGroup
│   └── CommandItem
└── Footer
```

Command item:

```text
[icon] label                    shortcut
       category/description
```

State:

```text
closed
open
querying
executing
error
```

Command yang async harus menampilkan indicator dan mencegah double execution.

---

## 7.8 Integrasi dengan multi-repository

Command palette harus aware terhadap active session.

Contoh:

```text
Switch Repository: repo-atlas
Switch Repository: backend-api
Switch Repository: frontend-app
```

Command:

```text
Close Current Repository
Open New Repository
Refresh Current Repository
Reveal Current Repository
```

---

## 7.9 Acceptance Criteria

- `Cmd/Ctrl + K` selalu membuka palette dari seluruh view.
- Focus otomatis berada pada input.
- Keyboard navigation bekerja tanpa mouse.
- `Esc` menutup palette dan mengembalikan focus sebelumnya.
- Disabled command tidak dapat dijalankan.
- Command palette tidak kehilangan context repository aktif.
- Search command insensitive terhadap capitalization.
- Tidak ada raw shell/Git command input.
- Demo mode tetap dapat menjalankan command yang relevan.
- Command yang tidak didukung demo harus disabled atau hidden.

---

## 7.10 Testing

### Unit

```text
command scoring
command ordering
enabled/disabled logic
shortcut normalization
```

### Component

```text
open palette
type query
keyboard navigation
execute command
escape
focus restore
disabled command
```

### E2E

```text
Cmd+K
Open Commits
Cmd+K
Open Files
Cmd+K
Switch repository
```

---

# 8. P0-02 — Recent Repositories & Multi-Repository Workspace

## 8.1 Tujuan

Menghilangkan keterbatasan satu repository.

User dapat:

- membuka beberapa repository;
- switch seperti tab browser;
- melihat recent repository;
- pin repository;
- reopen repository;
- close repository;
- restore last workspace.

---

## 8.2 Startup UX

Tanpa tab:

```text
Repo Atlas

Recent Repositories

★ repo-atlas
  ~/Projects/repo-atlas
  main
  opened 5 minutes ago

  backend-api
  ~/Projects/backend-api
  develop
  opened yesterday

[ Open Repository ]
```

---

## 8.3 Repository tabs

```text
┌ repo-atlas × ┐ ┌ backend-api × ┐ ┌ frontend × ┐  +
```

Setiap tab menampilkan:

```text
repository name
dirty indicator
loading indicator
optional branch
close button
```

Contoh:

```text
● repo-atlas · main
```

`●` dapat menandakan uncommitted changes.

---

## 8.4 Maximum sessions

Gunakan soft limit:

```text
10 repository tabs
```

Bukan hard failure.

Jika lebih dari 10, tampilkan confirmation bahwa membuka terlalu banyak repository dapat meningkatkan penggunaan memory.

Jangan melakukan scan semua repository secara bersamaan pada startup.

---

## 8.5 Session lifecycle

State:

```text
created
loading
ready
error
stale
closed
```

Flow:

```text
Open folder
   ↓
deduplicate canonical root
   ↓
create session
   ↓
activate tab
   ↓
scan repository
   ↓
update recent repository
```

Jika repository sudah terbuka:

```text
activate existing session
```

Jangan membuat duplicate tab.

---

## 8.6 Canonical repository identity

Folder yang dipilih mungkin berada di subdirectory repository.

Contoh:

```text
/Project/src/components
```

Tetapi Git root:

```text
/Project
```

Session identity harus memakai:

```text
repository.rootPath
```

bukan folder yang dipilih user.

---

## 8.7 State preservation

Per repository minimal pertahankan:

```text
active view
commit filter
commit search
commit selection
commit scroll position
compare base/head
selected file
file explorer expanded directories
global search query
```

Jangan mempertahankan open dialog yang destructive ketika tab berganti.

Contoh:

```text
CherryPickDialog
```

Jika dialog aktif dan user mencoba pindah repository, dialog harus ditutup atau tetap terkait secara eksplisit dengan repository asal.

Rekomendasi P0:

```text
dialog modal mengunci repository session sampai ditutup
```

---

## 8.8 Recent repositories

Store maksimal:

```text
20 recent repositories
```

Pinned repository tidak ikut terhapus oleh eviction.

Sort:

```text
Pinned first
Last opened descending
```

Recent actions:

```text
Open
Pin / Unpin
Reveal in Finder/Explorer
Remove from recent
```

"Remove from recent" hanya menghapus metadata Repo Atlas.

Tidak menyentuh folder.

---

## 8.9 Missing repository

Jika path tidak ada lagi:

```text
Repository not found

/Users/.../project

[ Locate ] [ Remove from Recent ]
```

`Locate` membuka folder picker.

---

## 8.10 Workspace store API

```js
openRepository(path)
closeRepository(sessionId)
activateRepository(sessionId)
refreshRepository(sessionId)
removeRecent(path)
pinRecent(path)
restoreWorkspace()
```

Gunakan reducer untuk state transition yang predictable.

Contoh action:

```text
SESSION_OPEN_REQUEST
SESSION_OPEN_SUCCESS
SESSION_OPEN_ERROR

SESSION_ACTIVATE

SESSION_REFRESH_REQUEST
SESSION_REFRESH_SUCCESS
SESSION_REFRESH_ERROR

SESSION_CLOSE

RECENT_PIN
RECENT_REMOVE
```

---

## 8.11 App.jsx refactor

Dari:

```jsx
const [data, setData] = useState(null)
const [activeView, setActiveView] = useState("overview")
```

Menjadi:

```jsx
const workspace = useWorkspace()
const session = workspace.activeSession
```

Kemudian:

```jsx
<AppShell>
  <RepositoryTabs />
  <SessionView session={session} />
</AppShell>
```

---

## 8.12 Lazy loading

Startup:

```text
restore paths
    ↓
render tabs
    ↓
scan active tab
```

Tab nonaktif:

```text
snapshot = null
loading = false
```

Saat diklik:

```text
scan repository
```

Setelah pernah discan, snapshot dipertahankan di memory.

---

## 8.13 Acceptance Criteria

- User dapat membuka dua atau lebih repository.
- Setiap repository memiliki state navigation sendiri.
- Repository yang sama tidak dapat terbuka dua kali.
- Repository subfolder dinormalisasi ke root.
- Close tab tidak memengaruhi repository di disk.
- Recent list persist setelah restart.
- Last workspace dapat dipulihkan.
- Hanya active tab yang wajib discan saat startup.
- Missing repository memiliki recovery UI.
- Dirty status terlihat pada tab.
- Demo mode memiliki satu synthetic repository session.
- Multi-repository tidak mengubah security model.

---

## 8.14 Testing

Unit:

```text
workspace reducer
deduplication
recent sorting
pin behavior
restore serialization
```

Component:

```text
open repository tab
switch tabs
close tab
active tab indicator
recent list
missing path UI
```

E2E Electron:

```text
open repo A
open repo B
switch repo A/B
restart app
verify workspace restore
close repo
```

---

# 9. P0-03 — Repository File Explorer

## 9.1 Tujuan

Memberikan cara visual memahami isi repository.

Tambahkan nav:

```text
Files
```

Sidebar:

```text
Overview
Commits
Files
Branches
Compare
Workspace
...
```

---

## 9.2 Sumber data file

Gunakan Git sebagai sumber daftar file:

```bash
git ls-files -z --cached --others --exclude-standard
```

Keuntungan:

- tracked files;
- untracked non-ignored files;
- otomatis menghormati `.gitignore`;
- tidak memerlukan recursive filesystem crawler;
- tidak menampilkan `.git` internal.

Optional metadata dapat diambil terpisah.

---

## 9.3 IPC

Tambahkan:

```text
repository:list-files
repository:file-content
```

Preload:

```js
listRepositoryFiles(payload)
readRepositoryFile(payload)
```

Payload:

```ts
ListFilesRequest = {
  repositoryPath: string
}
```

Response:

```ts
RepositoryFile = {
  path: string,
  name: string,
  extension: string,
  tracked: boolean,
  status?: string,
  size?: number
}
```

Untuk initial P0, size boleh lazy.

---

## 9.4 File content

Payload:

```ts
ReadFileRequest = {
  repositoryPath: string,
  path: string
}
```

Response:

```ts
ReadFileResponse = {
  path: string,
  text: string | null,
  binary: boolean,
  truncated: boolean,
  size: number,
  language: string | null
}
```

Maximum preview:

```text
1 MB
```

Apabila file lebih besar:

```text
truncated = true
```

Untuk binary:

```text
text = null
binary = true
```

---

## 9.5 Security membaca file

Ini berbeda dari Git diff karena menggunakan filesystem.

Wajib menggunakan repository-bound path validation.

Tidak boleh:

```text
../../etc/passwd
/Users/user/secret
C:\Windows\...
```

Symlink:

```text
repo/link -> /outside/repo
```

Jangan baca target luar repository.

Tampilkan:

```text
Symbolic link
Target is outside repository
```

jika diperlukan.

---

## 9.6 Tree model

Backend tidak perlu membuat nested tree.

Backend cukup return flat paths:

```text
src/App.jsx
src/components/button.jsx
src/lib/api.js
package.json
```

Renderer membangun tree:

```ts
TreeNode = {
  id: string,
  name: string,
  path: string,
  type: "file" | "directory",
  children?: TreeNode[]
}
```

Sort:

```text
directory first
alphabetical
case-insensitive
```

---

## 9.7 UI layout

```text
┌─────────────────────┬───────────────────────────────────┐
│ FILES               │ src/components/commit-graph.jsx   │
│                     │                                   │
│ ▾ src               │ [Preview] [History]               │
│   ▾ components      │                                   │
│     commit-graph... │ import ...                        │
│     diff-view.jsx   │ ...                               │
│   ▾ lib             │                                   │
│ package.json        │                                   │
└─────────────────────┴───────────────────────────────────┘
```

Resizable left panel direkomendasikan.

Minimum:

```text
240px
```

Default:

```text
300px
```

---

## 9.8 File tree interactions

Mouse:

```text
single click file -> preview
single click directory -> expand
double click file -> optional pin/open persistent
right click -> context actions
```

Keyboard:

```text
↑ ↓       navigate
→         expand/open
←         collapse/parent
Enter     open
Cmd/Ctrl+P quick file
```

---

## 9.9 Context actions

P0 read-only:

```text
Open
View History
Copy Path
Copy Relative Path
Reveal in File Manager
```

Optional:

```text
Open in default editor
```

Tetapi hanya jika ada explicit Electron API dan aman.

Bukan P0 wajib.

---

## 9.10 Working tree status

Join hasil tree dengan:

```text
data.status.files
```

Contoh:

```text
M App.jsx
A new-file.js
? draft.md
```

Directory dapat memiliki aggregate indicator.

Contoh:

```text
src/components    3 changes
```

---

## 9.11 Filter

File explorer memiliki input:

```text
Filter files...
```

Filter terhadap:

```text
filename
relative path
extension
```

Tidak membaca isi file.

Keyboard:

```text
Cmd/Ctrl+P
```

membuka quick-file mode melalui Command Palette.

---

## 9.12 File preview

P0 preview:

- plain text;
- syntax highlight;
- line number;
- copy path;
- open history;
- file metadata.

Header:

```text
src/components/commit-graph.jsx

JavaScript
30.9 KB
Modified

[ History ] [ Copy Path ]
```

File preview syntax highlighting menggunakan engine yang sama dengan Diff Viewer.

---

## 9.13 Large repository

Potential repository:

```text
100,000+ files
```

Jangan render seluruh tree DOM.

Strategi:

1. build tree sekali;
2. simpan expanded directory dalam `Set`;
3. flatten hanya visible nodes;
4. virtualize visible rows.

Boleh menggunakan custom virtualization sederhana seperti commit graph.

Recommended row height:

```text
28px
```

---

## 9.14 Cache

Per repository session:

```text
fileIndex
fileTree
filePreviewCache
```

Cache preview:

```text
max 20 files
```

Gunakan LRU sederhana.

Cache dibersihkan saat repository refresh apabila status berubah.

---

## 9.15 Acceptance Criteria

- File tree menghormati `.gitignore`.
- Tracked dan untracked non-ignored file terlihat.
- `.git` tidak terlihat.
- File dapat dicari berdasarkan path/name.
- File text dapat dipreview.
- Binary file tidak menyebabkan crash.
- File besar dibatasi.
- Path traversal ditolak.
- Symlink escape ditolak.
- Working tree status terlihat.
- Tree performant untuk repository besar.
- File history dapat dibuka dari file explorer.

---

## 9.16 Testing

Unit:

```text
flat paths -> tree
tree sorting
filter
flatten expanded tree
path containment
binary detection
language detection
```

Integration:

Buat temporary repository:

```text
tracked file
ignored file
untracked file
nested folder
binary file
large file
symlink
```

Verifikasi output.

E2E:

```text
open repository
open Files
expand src
open file
filter file
open History
```

---

# 10. P0-04 — File History

## 10.1 Tujuan

Menampilkan history sebuah file termasuk rename.

Entry point:

```text
File Explorer → History
Commit Detail → file → History
Global Search → file → History
```

---

## 10.2 Git command

Gunakan:

```bash
git log \
  --follow \
  --date=iso-strict \
  --format=... \
  --name-status \
  -- <path>
```

`--follow` penting untuk rename history.

Jangan menjalankan:

```text
git log --follow
```

tanpa path.

---

## 10.3 IPC

Tambahkan:

```text
file:history
```

Payload:

```ts
FileHistoryRequest = {
  repositoryPath: string,
  path: string,
  limit?: number,
  skip?: number
}
```

Default:

```text
limit = 200
```

Maximum:

```text
1000
```

Response:

```ts
FileHistoryResponse = {
  currentPath: string,
  entries: FileHistoryEntry[],
  hasMore: boolean
}
```

Entry:

```ts
FileHistoryEntry = {
  hash: string,
  shortHash: string,

  parentHash: string | null,

  subject: string,

  author: {
    name: string,
    email: string
  },

  date: string,

  status: "A" | "M" | "D" | "R" | "C",

  path: string,
  oldPath?: string
}
```

---

## 10.4 Rename tracking

Contoh:

```text
src/user.js
↓
src/domain/user.js
↓
src/domain/account.js
```

UI harus dapat menunjukkan:

```text
Renamed
src/user.js → src/domain/user.js
```

History tidak boleh berhenti hanya karena file pernah rename.

---

## 10.5 UI

```text
src/components/commit-graph.jsx

History
────────────────────────────────────────────────

Aug 10
a73bcee  Improve graph filtering
Faizal

Aug 08
7dd03ab  Fix keyboard navigation
Faizal

Aug 04
e9cc123  Rename graph.jsx → commit-graph.jsx
Sarah
```

Saat entry dipilih:

```text
left: history
right: diff
```

---

## 10.6 Diff integration

Reuse `DiffView`.

Request:

```ts
{
  type: "commit",
  from: entry.parentHash,
  to: entry.hash,
  path: entry.path,
  oldPath: entry.oldPath
}
```

Untuk root/add commit:

```text
from = null
```

Backend existing diff behavior dapat digunakan.

---

## 10.7 File at revision

Optional tetapi direkomendasikan dalam P0.

IPC:

```text
file:content-at-revision
```

Command:

```bash
git show <hash>:<path>
```

Validasi hash dan path tetap wajib.

UI tab:

```text
[ Diff ] [ File at Commit ]
```

Jika rename, gunakan path yang valid pada revision tersebut.

---

## 10.8 Filters

P0 minimum:

```text
All
Author
Date
```

Search local terhadap loaded entries:

```text
commit message
author
hash
```

Global historical filtering kompleks tidak wajib untuk first implementation.

---

## 10.9 Pagination

Jangan load unlimited history.

Initial:

```text
200 entries
```

Button:

```text
Load more
```

atau infinite loading.

Gunakan explicit pagination yang sama prinsipnya dengan commit graph.

---

## 10.10 State preservation

Per session:

```ts
FileHistorySession = {
  selectedPath,
  selectedHash,
  entries,
  scrollTop
}
```

Pindah tab repository lalu kembali tidak boleh langsung kehilangan selected file apabila session masih hidup.

---

## 10.11 Acceptance Criteria

- History file dapat dibuka dari File Explorer.
- Rename history tetap berlanjut.
- Commit dapat dipilih.
- Diff commit untuk file dapat ditampilkan.
- Root commit tidak error.
- Deleted file history dapat ditampilkan.
- Binary file tidak crash.
- Pagination bekerja.
- Invalid path ditolak.
- File History read-only.
- Demo mode menyediakan synthetic file history.

---

## 10.12 Testing

Integration repo scenario:

```text
commit A: create foo.js
commit B: modify foo.js
commit C: rename foo.js -> bar.js
commit D: modify bar.js
commit E: delete bar.js
```

Verifikasi:

```text
history count
status
rename path
parent hash
diff
```

Component:

```text
loading
empty history
history entry selection
rename badge
load more
```

---

# 11. P0-05 — Split Diff Viewer + Syntax Highlighting

## 11.1 Tujuan

Meningkatkan diff viewer dari unified-only menjadi:

```text
Unified
Split
```

dengan syntax highlighting.

---

## 11.2 Existing behavior yang harus dipertahankan

Tetap dukung:

- unified diff;
- binary state;
- truncated diff warning;
- large diff collapse;
- line numbers;
- added/deleted styling;
- workspace diff;
- compare diff;
- commit diff;
- untracked diff.

---

## 11.3 Refactor komponen

Dari:

```text
src/components/diff-view.jsx
```

menjadi:

```text
src/features/diff/
├── DiffView.jsx
├── UnifiedDiff.jsx
├── SplitDiff.jsx
├── DiffToolbar.jsx
├── diff-parser.js
├── split-aligner.js
├── language-map.js
└── SyntaxLine.jsx
```

---

## 11.4 Diff model

Parser tidak langsung menghasilkan JSX.

Gunakan normalized model:

```ts
DiffFile = {
  meta: string[],
  hunks: DiffHunk[]
}
```

```ts
DiffHunk = {
  header: string,
  context: string,
  oldStart: number,
  newStart: number,
  lines: DiffLine[]
}
```

```ts
DiffLine = {
  type: "add" | "delete" | "context" | "note",
  oldLine: number | null,
  newLine: number | null,
  text: string
}
```

Parser harus pure function dan mudah ditest.

---

## 11.5 Split alignment

Split viewer membutuhkan normalized rows:

```ts
SplitRow = {
  left: DiffLine | null,
  right: DiffLine | null
}
```

Aturan:

### Context

```text
left=context
right=context
```

### Delete only

```text
left=delete
right=null
```

### Add only

```text
left=null
right=add
```

### Replacement block

Input:

```text
-delete A
-delete B
+add A
+add B
+add C
```

Output:

```text
delete A | add A
delete B | add B
null     | add C
```

Ini tidak melakukan semantic diff.

Hanya positional block alignment.

Word-level diff dapat ditambahkan setelah P0 baseline stabil.

---

## 11.6 UI

Toolbar:

```text
[ Unified | Split ]  [ Wrap ]  [ Ignore whitespace ]  [ Previous ] [ Next ]
```

Untuk first P0 release minimum:

```text
Unified/Split
Wrap
Syntax Highlight
```

`Ignore whitespace` membutuhkan request backend berbeda dan dapat dimasukkan sebagai enhancement P0 apabila scope masih memungkinkan.

---

## 11.7 Split layout

```text
OLD                                       NEW
───────────────────────┬────────────────────────
42 const value = 10;   │ 42 const value = 20;
43 foo();              │ 43 foo();
                       │ 44 bar();
```

Setiap sisi:

```text
line number
marker
code
```

Scroll horizontal sinkron.

Vertical scroll adalah satu container.

---

## 11.8 Syntax highlighting

Rekomendasi dependency:

```text
prism-react-renderer
```

Alasan:

- local/offline;
- tidak membutuhkan network;
- cocok dengan React;
- token output dapat dirender tanpa `dangerouslySetInnerHTML`;
- lebih aman daripada raw HTML highlighting;
- cukup untuk file preview dan diff.

Lazy-load syntax highlighter agar initial app startup tidak membesar secara tidak perlu.

---

## 11.9 Language mapping

Buat mapping extension:

```text
.js    -> javascript
.jsx   -> jsx
.ts    -> typescript
.tsx   -> tsx
.json  -> json
.css   -> css
.html  -> markup
.md    -> markdown
.sh    -> bash
.yml   -> yaml
.yaml  -> yaml
.go    -> go
.py    -> python
.java  -> java
.rs    -> rust
```

Fallback:

```text
text
```

---

## 11.10 Performance

Jangan tokenize seluruh diff berkali-kali.

Cache key:

```text
language + line.text
```

Gunakan memoization terbatas.

Untuk diff > 900 lines:

```text
existing collapse behavior tetap aktif
```

Syntax highlight hanya lines yang benar-benar dirender.

Untuk very long single line:

```text
cap tokenization threshold
```

Contoh:

```text
20,000 characters
```

Jika lebih:

```text
render plain text
```

---

## 11.11 Preferences

Persist:

```text
diff mode
wrap lines
syntax highlight enabled
```

Key:

```text
repo-atlas-diff-preferences-v1
```

Contoh:

```json
{
  "mode": "split",
  "wrap": false,
  "syntaxHighlight": true
}
```

---

## 11.12 Accessibility

Jangan hanya menggunakan merah/hijau.

Tetap gunakan:

```text
+
-
background
marker
```

Line harus dapat dibaca dalam light/dark theme.

Gunakan code font yang sudah tersedia/system monospace.

---

## 11.13 Acceptance Criteria

- User dapat switch unified/split.
- Mode persist setelah restart.
- Split alignment benar untuk add/delete/replace.
- Syntax highlighting bekerja.
- Unknown extension tetap dapat dirender.
- Binary file tetap menggunakan binary state.
- Large diff tidak menyebabkan UI freeze signifikan.
- Truncated warning tetap tampil.
- Workspace diff tetap bekerja.
- Compare diff tetap bekerja.
- Commit detail diff tetap bekerja.
- Tidak menggunakan unsafe HTML injection.

---

## 11.14 Testing

Unit:

```text
unified parser
split aligner
replacement blocks
empty hunk
no newline marker
rename metadata
language mapping
```

Snapshot/component:

```text
unified
split
add/delete
binary
truncated
large collapse
```

E2E:

```text
open Compare
select changed file
toggle Split
navigate another file
verify Split remains active
```

---

# 12. P0-06 — Global Search

## 12.1 Tujuan

Satu search untuk menemukan:

```text
commit
branch
tag
file
author
hash
```

Global Search bukan full text source-code search pada P0.

Source-code content search dapat menjadi fase berikutnya menggunakan ripgrep atau indexer khusus.

---

## 12.2 Entry points

```text
Cmd/Ctrl + Shift + F
```

dan:

```text
Command Palette → Search Repository
```

UI dapat berupa dedicated overlay/page.

Recommended:

```text
global search overlay
```

untuk navigasi cepat.

Jika user ingin eksplorasi lebih lanjut:

```text
Open Full Search View
```

---

## 12.3 UX

Query:

```text
payment
```

Result:

```text
FILES
src/api/payment.js
src/domain/payment-service.ts

COMMITS
a812cee Add payment retry
91bd201 Fix payment status

BRANCHES
feature/payment-retry

AUTHORS
John Payment
```

---

## 12.4 Search categories

Minimum:

```text
All
Files
Commits
Branches
Tags
Authors
```

Result limits:

```text
20 per category
100 overall
```

Full search page dapat load more.

---

## 12.5 Search engine architecture

Jangan menjalankan satu giant command.

Gunakan parallel bounded search:

```text
search files
search refs
search commits
search authors
```

Hasil digabung backend atau renderer.

Recommended backend endpoint:

```text
repository:search
```

Payload:

```ts
RepositorySearchRequest = {
  repositoryPath: string,
  query: string,
  types?: SearchType[],
  limit?: number
}
```

Response:

```ts
RepositorySearchResponse = {
  query: string,
  durationMs?: number,
  results: SearchResult[]
}
```

Result:

```ts
SearchResult =
  | FileSearchResult
  | CommitSearchResult
  | BranchSearchResult
  | TagSearchResult
  | AuthorSearchResult
```

---

## 12.6 File search

Reuse file index dari P0-03.

Search berdasarkan:

```text
path
filename
extension
```

Scoring:

1. exact filename;
2. filename prefix;
3. path segment prefix;
4. substring;
5. fuzzy.

Jika file index belum loaded:

```text
load repository:list-files
```

Cache per repository session.

---

## 12.7 Branch/tag search

Gunakan snapshot:

```text
data.branches
data.tags
```

Tidak perlu Git subprocess tambahan apabila snapshot fresh.

---

## 12.8 Commit search

Search harus mencakup history, bukan hanya 1000 commit yang sedang loaded.

Backend gunakan bounded Git commands.

Default generic text:

```bash
git log --all \
  --regexp-ignore-case \
  --fixed-strings \
  --grep=<query> \
  --format=...
```

Author search:

```bash
git log --all \
  --regexp-ignore-case \
  --author=<query> \
  --format=...
```

Hash-like query:

```text
7-40 hexadecimal
```

coba resolve dengan:

```bash
git rev-parse --verify <query>^{commit}
```

Semua tetap menggunakan `execFile()` argument array.

---

## 12.9 Query language

Setelah basic search stabil, dukung:

```text
type:commit login
type:file auth
author:faizal
branch:main
path:src/api
after:2026-01-01
before:2026-08-01
```

Parser renderer/backend:

```ts
SearchQuery = {
  text: string,
  type?: string,
  author?: string,
  branch?: string,
  path?: string,
  after?: string,
  before?: string
}
```

Unknown qualifier dianggap text biasa atau ditandai invalid.

Tanggal harus divalidasi.

---

## 12.10 Search cancellation

User dapat mengetik cepat:

```text
p
pa
pay
paym
payment
```

Request lama tidak boleh overwrite hasil baru.

Gunakan request sequence:

```js
const requestId = ++latestRequestId
```

Ketika response:

```js
if (requestId !== latestRequestId) ignore
```

Jika nanti IPC cancellation ditambahkan, itu enhancement.

---

## 12.11 Debounce

Gunakan:

```text
120–180 ms
```

Untuk input global search.

Tidak perlu search jika query:

```text
< 2 chars
```

kecuali query terlihat seperti hash.

---

## 12.12 Result navigation

File:

```text
open Files view
select file
```

Commit:

```text
open Commits
focus commit
open details
```

Branch:

```text
open Commits filtered branch
```

Tag:

```text
open commit pointed by tag
```

Author:

```text
open Commits dengan search/filter author
```

---

## 12.13 Search result model

File:

```ts
{
  type: "file",
  path,
  name,
  score
}
```

Commit:

```ts
{
  type: "commit",
  hash,
  shortHash,
  subject,
  author,
  date,
  score
}
```

Branch:

```ts
{
  type: "branch",
  name,
  hash,
  current,
  remote,
  score
}
```

Tag:

```ts
{
  type: "tag",
  name,
  hash,
  date,
  score
}
```

Author:

```ts
{
  type: "author",
  name,
  email,
  commits,
  score
}
```

---

## 12.14 Search cache

Cache short-lived:

```text
query + repository revision
```

Repository revision dapat menggunakan:

```text
HEAD hash + scannedAt
```

Cache maksimum:

```text
30 queries/session
```

Clear ketika repository refresh.

---

## 12.15 Global Search + Command Palette

Setelah P0-06 selesai:

Command Palette behavior:

```text
query starts with >
    command-only

normal query
    commands + quick repository results
```

Contoh:

```text
> refresh
```

hanya action.

```text
payment
```

dapat menampilkan:

```text
Commands
Files
Commits
Branches
```

Tetapi Command Palette tetap membatasi hasil.

Full Search tetap tersedia untuk hasil lengkap.

---

## 12.16 Acceptance Criteria

- Search dapat menemukan file.
- Search dapat menemukan branch.
- Search dapat menemukan tag.
- Search dapat menemukan commit yang tidak berada dalam current 1000 loaded commits.
- Search dapat menemukan author.
- Hash dapat dicari.
- Search insensitive terhadap capitalization.
- Search tidak freeze UI.
- Stale response tidak overwrite query terbaru.
- Search dapat dinavigasi keyboard.
- Enter membuka hasil.
- Search bekerja tanpa internet.
- Search tidak menggunakan shell string.
- Demo mode memiliki synthetic results.

---

## 12.17 Testing

Unit:

```text
query parser
search scorer
result grouping
result ordering
hash detection
date validation
```

Integration:

Temporary repository dengan:

```text
multiple authors
branches
tags
100+ commits
renamed file
```

Search:

```text
message
author
branch
tag
hash
file
```

Component:

```text
debounce
keyboard selection
category tabs
loading
empty result
stale response
```

E2E:

```text
Cmd+Shift+F
search commit
open result
search file
open result
```

---

# 13. IPC Contract P0

Tambahan endpoint:

```text
repository:list-files
repository:file-content
file:history
file:content-at-revision
repository:search
```

Existing endpoint tetap:

```text
repository:scan
commits:list
commit:details
diff:file
compare:refs
cherry-pick:preview
cherry-pick:execute
sequencer:action
```

---

# 14. Preload API Setelah P0

Target:

```js
window.repoAtlas = {
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

  cherryPickPreview,
  cherryPickExecute,
  sequencerAction,

  platform
}
```

Tidak expose:

```text
ipcRenderer
fs
path
child_process
shell
```

---

# 15. Error Codes Baru

Standardisasi error.

Tambahkan:

```text
INVALID_PATH
PATH_OUTSIDE_REPOSITORY
FILE_NOT_FOUND
FILE_TOO_LARGE
BINARY_FILE
UNKNOWN_REF
SEARCH_FAILED
HISTORY_FAILED
UNSUPPORTED_FILE
```

UI tidak menampilkan raw stderr secara default.

Developer detail dapat disimpan di:

```text
error.details
```

---

# 16. Loading Strategy

Jangan membuat satu `repository:scan` semakin besar.

Snapshot utama tetap berisi metadata utama.

Load on demand:

```text
RepositorySnapshot
    │
    ├── Commits initial page
    ├── Branches
    ├── Status
    └── Metadata

Files
    → repository:list-files

File Preview
    → repository:file-content

File History
    → file:history

Global Search
    → repository:search
```

Ini mempertahankan startup performance.

---

# 17. Caching Strategy

Per repository:

```text
snapshot cache
file index cache
file content LRU
file history cache
search cache
```

Invalidasi minimal ketika:

```text
manual refresh
repository operation selesai
active HEAD berubah
working tree berubah
```

Automatic filesystem watcher bukan P0 ini.

Jika watcher ditambahkan kemudian, cache invalidation dapat menggunakan event yang sama.

---

# 18. Demo Mode

Setiap P0 wajib memiliki demo fallback.

`createDemoApi()` harus ditambah:

```text
listRepositoryFiles
readRepositoryFile
fileHistory
fileContentAtRevision
searchRepository
```

Gunakan synthetic dataset yang konsisten.

Contoh:

```text
FILE_POOL
```

yang sudah ada dapat menjadi dasar file explorer dan search.

File content synthetic dapat berupa mapping:

```js
DEMO_FILE_CONTENT = {
  "src/app.jsx": "...",
  ...
}
```

History dapat dibangun dari commit dataset synthetic.

---

# 19. Dependencies yang Direkomendasikan

## Runtime

Tambahkan hanya jika dibutuhkan:

```text
prism-react-renderer
```

Untuk syntax highlight.

Command palette tidak membutuhkan dependency tambahan.

File tree tidak wajib dependency tambahan apabila menggunakan virtualization custom.

---

## Dev Dependencies

Tambahkan:

```text
vitest
@testing-library/react
@testing-library/user-event
@testing-library/jest-dom
jsdom
@playwright/test
```

Playwright dapat digunakan untuk Electron E2E.

---

# 20. Scripts Baru

`package.json`:

```json
{
  "scripts": {
    "test": "node --test tests/*.test.cjs tests/*.test.mjs",
    "test:ui": "vitest run",
    "test:ui:watch": "vitest",
    "test:e2e": "playwright test",
    "test:all": "npm test && npm run test:ui && npm run test:e2e"
  }
}
```

Existing tests jangan dihapus.

---

# 21. Testing Pyramid

## Level 1 — Pure Unit

Fokus:

```text
tree builder
query parser
fuzzy scorer
diff parser
split aligner
workspace reducer
path validator
file history parser
```

Cepat dan deterministic.

---

## Level 2 — Git Integration

Gunakan temporary repository.

Test real Git commands:

```text
files listing
gitignore
file history
rename
search
hash resolution
binary file
large file
```

---

## Level 3 — React Component

Test:

```text
Command Palette
Repository Tabs
File Explorer
File History
Diff View
Global Search
```

Mock API bridge.

---

## Level 4 — Electron E2E

Critical paths saja.

```text
Open repository
Open second repository
Switch repository
Browse file
View file history
Open split diff
Global search commit
Command palette navigation
```

---

# 22. Implementation Sequence

Urutan ini dipilih untuk mengurangi rework.

---

## Stage 0 — Foundation

### Tasks

- [x] Extract workspace/session state dari `App.jsx`.
- [x] Introduce workspace reducer/store.
- [x] Refactor app shell.
- [x] Add feature directories.
- [x] Extract reusable Git core helpers.
- [x] Add repository-bound path validator.
- [x] Add UI testing stack.
- [ ] Add Electron E2E baseline. (Dilewati sesuai instruksi pengguna.)
- [x] Verify existing commit graph.
- [x] Verify existing compare.
- [x] Verify existing cherry-pick.

### Exit Criteria

Existing behavior tetap bekerja tanpa regression.

---

## Stage 1 — Recent + Multi Repository

- [x] Repository session model.
- [x] Repository tabs.
- [x] Recent repository storage.
- [x] Startup recent screen.
- [x] Lazy session loading.
- [x] Workspace restore.
- [x] Missing repository recovery.
- [x] Dirty state tab indicator.
- [ ] Multi-repository E2E. (Dilewati sesuai instruksi pengguna.)

---

## Stage 2 — File Explorer

- [x] `repository:list-files`.
- [x] safe path helper.
- [x] `repository:file-content`.
- [x] tree builder.
- [x] virtualized file tree.
- [x] file filter.
- [x] working tree badges.
- [x] text preview.
- [x] binary state.
- [x] large file state.
- [x] Demo API.
- [ ] File Explorer E2E. (Dilewati sesuai instruksi pengguna.)

---

## Stage 3 — File History

- [x] `file:history`.
- [x] parser dengan rename support.
- [x] history view.
- [x] diff integration.
- [x] pagination.
- [x] optional content-at-revision.
- [x] history state persistence.
- [x] rename integration test.
- [ ] File History E2E. (Dilewati sesuai instruksi pengguna.)

---

## Stage 4 — Diff Upgrade

- [x] Extract parser.
- [x] normalized diff model.
- [x] split aligner.
- [x] UnifiedDiff component.
- [x] SplitDiff component.
- [x] diff toolbar.
- [x] syntax highlighter.
- [x] language mapping.
- [x] preferences persistence.
- [x] performance tests.
- [ ] Diff Viewer E2E. (Dilewati sesuai instruksi pengguna.)

---

## Stage 5 — Command Palette

- [x] command registry.
- [x] fuzzy scorer.
- [x] palette UI.
- [x] keyboard shortcut manager.
- [x] navigation commands.
- [x] repository commands.
- [x] file quick-open integration.
- [x] focus handling.
- [x] tests.
- [ ] Command Palette E2E. (Dilewati sesuai instruksi pengguna.)

---

## Stage 6 — Global Search

- [ ] search query model.
- [ ] file search.
- [ ] ref search.
- [ ] commit search.
- [ ] author search.
- [ ] hash search.
- [ ] `repository:search`.
- [ ] global search overlay.
- [ ] result keyboard navigation.
- [ ] stale request protection.
- [ ] command palette integration.
- [ ] full integration tests.

---

## Stage 7 — Hardening

- [ ] test repository 10k+ commits.
- [ ] test repository 50k+ files.
- [ ] test huge diff.
- [ ] test binary files.
- [ ] test symlink escape.
- [ ] test Windows paths.
- [ ] test macOS paths.
- [ ] test Linux paths.
- [ ] verify demo mode.
- [ ] verify light/dark mode.
- [ ] keyboard-only UX audit.
- [ ] regression cherry-pick.
- [ ] regression compare.
- [ ] regression workspace.

---

# 23. Suggested Pull Request Breakdown

Jangan menggabungkan seluruh P0 dalam satu PR.

Recommended:

```text
PR-01  Workspace session foundation
PR-02  Recent repositories
PR-03  Multi-repository tabs
PR-04  Repository file listing backend
PR-05  File explorer UI
PR-06  Secure file preview
PR-07  File history backend
PR-08  File history UI
PR-09  Diff parser refactor
PR-10  Split diff
PR-11  Syntax highlighting
PR-12  Command registry
PR-13  Command palette
PR-14  Global search backend
PR-15  Global search UI
PR-16  Command palette + global search integration
PR-17  E2E and P0 hardening
```

Setiap PR harus dapat direview secara independen.

---

# 24. Definition of Done per Feature

Sebuah fitur P0 tidak dianggap selesai hanya karena UI terlihat.

Harus memenuhi:

## Functional

- [ ] happy path;
- [ ] empty state;
- [ ] loading state;
- [ ] error state;
- [ ] keyboard interaction;
- [ ] mouse interaction.

## Security

- [ ] explicit IPC;
- [ ] validated path/ref/hash;
- [ ] tidak ada shell string;
- [ ] repository boundary terjaga.

## Performance

- [ ] bounded response;
- [ ] pagination/virtualization jika diperlukan;
- [ ] tidak memblok UI;
- [ ] tidak load seluruh history tanpa limit.

## Compatibility

- [ ] macOS;
- [ ] Windows;
- [ ] Linux;
- [ ] demo mode.

## Test

- [ ] unit;
- [ ] integration jika Git API;
- [ ] component;
- [ ] E2E untuk critical flow.

## Documentation

- [ ] README;
- [ ] architecture;
- [ ] roadmap;
- [ ] IPC documentation.

---

# 25. UX Consistency Rules

Gunakan pola yang konsisten.

## Loading

Gunakan:

```text
Skeleton untuk layout
Spinner untuk operation kecil
```

Hindari full-screen loading jika data lama masih dapat ditampilkan.

---

## Empty State

Buruk:

```text
No results.
```

Baik:

```text
No files match "payment".

[ Clear Filter ]
```

---

## Error

Buruk:

```text
Git command failed.
```

Baik:

```text
File history could not be loaded.

The file may no longer exist at this revision.

[ Retry ]
```

---

## Context

Header setiap view minimal menampilkan:

```text
repository
branch
view title
relevant context
```

---

# 26. Performance Budget

Target desain, bukan benchmark absolut.

## Startup

Jangan menambah synchronous recursive filesystem scanning.

## Files

File list dapat besar.

Gunakan:

```text
git ls-files -z
flat data
renderer tree building
virtualized rows
```

## Search

Hard limit Git output.

## Diff

Tetap gunakan max diff bytes.

## History

Pagination.

## Multi-repo

Lazy scan.

---

# 27. Security Checklist P0

- [ ] Tidak expose `ipcRenderer`.
- [ ] Tidak expose `fs`.
- [ ] Tidak expose generic `runGit`.
- [ ] Semua Git menggunakan `execFile`.
- [ ] Query Git selalu argument array.
- [ ] Hash divalidasi.
- [ ] Ref divalidasi.
- [ ] File path repository-relative.
- [ ] Absolute path file ditolak.
- [ ] `..` traversal ditolak.
- [ ] Symlink escape ditolak.
- [ ] Preview file memiliki size limit.
- [ ] Search memiliki result limit.
- [ ] History memiliki pagination.
- [ ] Renderer tidak dapat memilih arbitrary filesystem file untuk dibaca.
- [ ] Browser/demo mode tidak mendapat filesystem access.

---

# 28. Architecture Setelah P0

```text
                          ┌───────────────────────┐
                          │      App Shell        │
                          │                       │
                          │ Repository Sessions   │
                          │ Command Palette       │
                          │ Repository Tabs       │
                          └───────────┬───────────┘
                                      │
             ┌────────────────────────┼────────────────────────┐
             │                        │                        │
             ▼                        ▼                        ▼
       Commit Graph              File Explorer            Global Search
             │                        │                        │
             │                        ├── File Preview          │
             │                        │                        │
             │                        └── File History          │
             │                                 │               │
             └────────────────────┬────────────┴───────────────┘
                                  │
                                  ▼
                              Diff Viewer
                         Unified / Split / Syntax
                                  │
                                  ▼
                           window.repoAtlas
                                  │
                                  ▼
                              Preload IPC
                                  │
                                  ▼
                              Main Process
                                  │
             ┌────────────────────┼─────────────────────────┐
             │                    │                         │
             ▼                    ▼                         ▼
        Repository Git         File APIs               Search APIs
             │                    │                         │
             └────────────────────┴─────────────────────────┘
                                  │
                                  ▼
                               Git CLI
                         + constrained FS read
```

---

# 29. Expected Navigation Setelah P0

```text
Repo Atlas

Repository Tabs
────────────────────────────────────

Overview
Commits
Files
Branches

Changes
  Compare
  Workspace

Repository
  Worktrees
  Submodules
  Refs & Metadata
```

Command Palette membuat menu tidak harus menampung setiap action.

---

# 30. User Flow Utama Setelah P0

## Flow A — Understand a repository

```text
Open Repo Atlas
↓
Recent Repository
↓
Files
↓
src/
↓
open App.jsx
↓
History
↓
select commit
↓
Split Diff
```

---

## Flow B — Find a historical change

```text
Cmd + Shift + F
↓
"payment retry"
↓
Commit result
↓
Open commit
↓
Changed files
↓
Split Diff
```

---

## Flow C — Work across services

```text
Open frontend
↓
Open backend
↓
Open gateway
↓
switch tabs
↓
each repository keeps its own view/filter state
```

---

## Flow D — Keyboard-first workflow

```text
Cmd + K
↓
Files
↓
Cmd + P
↓
payment-service
↓
Enter
↓
History
↓
select commit
```

---

# 31. Final P0 Completion Checklist

## Foundation

- [x] Workspace session architecture
- [x] Feature-based extraction
- [ ] Git domain extraction
- [x] Secure repository path helper
- [x] UI test framework
- [ ] Electron E2E framework (Dilewati sesuai instruksi pengguna.)

## Command Palette

- [x] Command registry
- [x] Fuzzy command search
- [x] Keyboard shortcut
- [x] Navigation actions
- [x] Repository actions
- [x] Quick file integration
- [ ] Global search integration

## Recent / Multi Repository

- [x] Recent list
- [x] Pin/unpin
- [x] Repository tabs
- [x] Lazy loading
- [x] Workspace restore
- [x] State per repository
- [x] Missing repository recovery

## File Explorer

- [x] Git-aware file listing
- [x] `.gitignore` support
- [x] Tree
- [x] Virtualization
- [x] Filter
- [x] Working change badges
- [x] Safe file preview
- [x] Binary handling
- [x] Large file handling

## File History

- [x] History IPC
- [x] `--follow`
- [x] Rename support
- [x] Pagination
- [x] Diff integration
- [x] Revision content

## Diff

- [x] Parser extraction
- [x] Unified renderer
- [x] Split renderer
- [x] Syntax highlighting
- [x] Language mapping
- [x] Preferences
- [x] Large diff protection

## Global Search

- [ ] File
- [ ] Commit
- [ ] Branch
- [ ] Tag
- [ ] Author
- [ ] Hash
- [ ] Query parser
- [ ] Keyboard navigation
- [ ] Request race protection
- [ ] Command palette integration

## Quality

- [ ] Unit tests
- [ ] Git integration tests
- [ ] React component tests
- [ ] Electron E2E tests
- [ ] Demo mode
- [ ] macOS
- [ ] Windows
- [ ] Linux
- [ ] Documentation

---

# 32. Hasil Akhir yang Diharapkan

Setelah P0 selesai, positioning Repo Atlas berubah dari:

```text
Local Git visualizer
```

menjadi:

```text
Visual repository exploration and Git history workspace
```

Core experience:

```text
Repository
    ↓
Files
    ↓
History
    ↓
Changes
    ↓
Diff
```

dengan navigation layer:

```text
Command Palette
Global Search
Multi Repository
```

P0 ini juga membangun fondasi untuk fitur berikutnya:

```text
Git Blame
Repository Health
Code Hotspots
Contributor Ownership
Branch Intelligence
Dependency Graph
Symbol Explorer
Change Impact Analysis
Optional AI
```

Tanpa fondasi P0, fitur-fitur tersebut akan menambah kompleksitas pada UI dan backend secara tidak terkontrol.

Dengan P0, Repo Atlas memiliki struktur yang cukup kuat untuk berkembang menjadi developer tool yang fokus pada repository comprehension, bukan hanya Git visualization.
