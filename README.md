# Repo Atlas

Aplikasi desktop offline-first untuk membaca dan memvisualisasikan metadata Git dari sebuah project folder — commit graph ala GitKraken/GitLens, simulasi pull request dengan prediksi konflik, dan cherry-pick visual. Dibangun menggunakan Electron, React, Vite, Tailwind CSS, dan komponen bergaya shadcn/ui (Radix).

Tidak ada login, autentikasi, telemetry, database cloud, atau request ke layanan remote. Semua pembacaan bersifat read-only; satu-satunya operasi tulis adalah cherry-pick yang selalu melalui preview dan konfirmasi eksplisit.

## Fitur

- Membuka folder repository melalui native folder dialog, mengingat repository terakhir.
- Commit graph interaktif:
  - lane berwarna stabil per cabang dengan kurva merge/fork yang mulus;
  - virtualized list + pagination (1000 commit per halaman, tombol Load more);
  - urutan topology atau date;
  - pencarian yang menyorot hasil (graph tetap utuh) dengan navigasi next/prev;
  - filter berdasarkan branch/tag (klik chip ref juga memfilter);
  - klik commit → panel detail: author/committer, body, parents, refs,
    signed status, changed files dengan +/- dan diff per file;
  - multi-select (Cmd/Ctrl/Shift+klik), context menu (copy hash/message,
    cherry-pick, compare with HEAD), keyboard navigation (↑/↓/Enter/Esc);
  - baris "uncommitted changes" saat working tree kotor;
  - tombol jump-to-HEAD.
- Compare / simulasi Pull Request:
  - pilih base dan compare ref (branch lokal, remote, tag, atau hash);
  - ahead/behind, fast-forward, merge-base;
  - daftar commit, files changed dengan diff viewer master-detail;
  - prediksi konflik merge via `git merge-tree` tanpa menyentuh working tree
    (Git ≥ 2.38), lengkap dengan daftar file yang akan konflik;
  - cherry-pick commit terpilih langsung dari hasil compare.
- Cherry-pick visual:
  - pilih commit dari graph, panel detail, atau compare view;
  - preview per commit: clean / conflict (beserta file) sebelum eksekusi;
  - guard otomatis: working tree harus bersih, tidak ada operasi lain berjalan;
  - saat konflik: abort (rollback penuh), resolve manual, continue, atau skip
    dari banner status di atas aplikasi.
- Deteksi state repository: cherry-pick, merge, rebase, revert, bisect yang
  sedang berlangsung ditampilkan sebagai banner dengan aksi yang relevan.
- Branches: local/remote tabs, ahead/behind/gone terhadap upstream, aksi
  "show in graph" dan "compare with current".
- Workspace: file staged / unstaged / untracked / conflicted dengan diff viewer.
- Worktrees, submodules, tags, stashes, remotes, contributors.
- Overview dengan aktivitas commit 6 minggu terakhir.
- Dark dan light theme.
- Demo mode otomatis saat dibuka di browser biasa (tanpa Electron) memakai
  sample repository, berguna untuk preview UI.
- Packaging untuk macOS, Windows, dan Linux melalui electron-builder.

## Requirement

- Node.js 22 atau lebih baru.
- npm 10 atau lebih baru.
- Git CLI tersedia di `PATH`.

## Menjalankan development

```bash
npm install
npm run dev
```

Vite berjalan di `127.0.0.1:5173`, lalu Electron membuka renderer tersebut.

## Menjalankan test

```bash
npm test
npm run test:ui
npm run check:electron
```

Test mencakup parser Git, integrasi pemindaian terhadap repository Git lokal sementara, dan smoke test komponen UI melalui Vitest.

## Build renderer

```bash
npm run build
npm start
```

`npm start` menggunakan hasil build dari folder `dist` jika environment variable `VITE_DEV_SERVER_URL` tidak tersedia.

## Membuat installer

```bash
npm run dist
```

Output dibuat di folder `release`.

Target default:

- macOS: DMG dan ZIP.
- Windows: NSIS dan portable executable.
- Linux: AppImage dan DEB.

Installer harus dibuat pada sistem operasi target atau menggunakan CI yang sesuai.

## Arsitektur keamanan

Renderer React tidak memiliki akses Node.js langsung.

```text
React renderer
    │
    │ window.repoAtlas API terbatas
    ▼
Preload + contextBridge
    │
    │ ipcRenderer.invoke pada channel eksplisit
    ▼
Electron main process
    │
    │ execFile("git", [argument...])
    ▼
Local Git repository
```

Konfigurasi BrowserWindow:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webSecurity: true`
- external window creation ditolak
- navigasi renderer di luar URL aplikasi ditolak
- Content Security Policy diterapkan

Aplikasi tidak menggunakan shell string untuk perintah Git. Semua perintah menggunakan `execFile` dengan argument array untuk mengurangi risiko command injection.

## Perintah Git yang digunakan

Pembacaan (read-only):

- `git rev-parse`
- `git status --porcelain=v2`
- `git for-each-ref`
- `git log`
- `git show -s`
- `git diff` / `git diff-tree` (numstat, name-status, patch per file)
- `git rev-list --count` / `--left-right`
- `git merge-base`
- `git merge-tree --write-tree` (prediksi konflik, tidak menyentuh working tree)
- `git worktree list --porcelain`
- `git submodule status --recursive`
- `git config -f .gitmodules`
- `git symbolic-ref refs/remotes/origin/HEAD`
- `git remote -v`
- `git stash list`
- `git shortlog`
- `git count-objects`

Operasi tulis — hanya cherry-pick, selalu lewat preview + konfirmasi:

- `git cherry-pick <hash...>` beserta `--continue` / `--skip` / `--abort`

Tidak ada `fetch`, `pull`, `push`, `checkout`, `reset`, `clean`, `commit`, atau command lain yang mengubah repository. Semua argumen divalidasi (hash regex, ref name check) dan dijalankan melalui `execFile` dengan argument array — tanpa shell string.

## Struktur project

```text
repo-atlas/
├── electron/
│   ├── git/
│   │   └── core.cjs           # execFile, error handling, argumen, dan path boundary
│   ├── git-service.cjs        # Parser, snapshot, compare, dan cherry-pick
│   ├── main.cjs               # Window lifecycle dan IPC handlers
│   └── preload.cjs            # contextBridge API
├── src/
│   ├── app/
│   │   ├── AppShell.jsx       # Layout aplikasi dan host view
│   │   ├── workspace-reducer.js
│   │   └── workspace-store.js  # Session/workspace state
│   ├── features/               # Entry point feature-based secara incremental
│   ├── components/
│   │   ├── ui/                # Primitives (button, dialog, popover, tabs, ...)
│   │   ├── commit-graph.jsx   # Graph virtualized + interaksi
│   │   ├── commit-details.jsx # Panel detail commit
│   │   ├── diff-view.jsx      # Unified diff viewer + helper file badges
│   │   ├── compare-view.jsx   # Simulasi pull request
│   │   ├── cherry-pick-dialog.jsx
│   │   ├── state-banner.jsx   # Banner operasi yang sedang berjalan
│   │   └── ...                # overview, branches, worktrees, workspace, refs
│   ├── lib/
│   │   ├── git-graph.js       # Layout lane/edge commit graph
│   │   ├── api.js             # Bridge Electron atau demo fallback
│   │   ├── demo.js            # Sample repository untuk browser
│   │   └── utils.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── tests/
│   ├── git-core.test.cjs       # Validasi boundary repository dan symlink
│   ├── git-service.test.cjs   # Parser + integrasi repo Git nyata
│   ├── git-graph.test.mjs      # Invariant layout graph
│   └── ui-components.ui.test.jsx # Smoke test Testing Library
├── components.json            # Konfigurasi shadcn/ui
├── vite.config.js
└── package.json
```

## Batasan saat ini

- Git CLI harus terpasang secara terpisah; prediksi konflik memerlukan Git ≥ 2.38.
- Commit graph memuat 1000 commit per halaman (Load more untuk halaman berikutnya).
- Diff viewer berbentuk unified (belum ada split view) dan diff sangat besar dipotong.
- Detail merge commit menampilkan perubahan terhadap first parent.
- Cherry-pick menargetkan branch yang sedang checked out (perilaku Git standar).
- Repository dengan aturan `safe.directory` yang menolak akses harus diperbaiki melalui konfigurasi Git pengguna.
- Remote URL hanya dibaca. Aplikasi tidak melakukan koneksi ke remote.

## Dokumentasi lanjutan

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)

## Referensi teknologi

- Electron: https://www.electronjs.org/docs/latest/
- Vite: https://vite.dev/guide/
- Tailwind CSS: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui untuk Vite: https://ui.shadcn.com/docs/installation/vite
# repo-atlas
