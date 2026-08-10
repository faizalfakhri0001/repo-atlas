# Roadmap

## Phase 1 — MVP read-only

Status: selesai.

- repository picker;
- overview;
- commit graph;
- branches;
- worktrees;
- submodules;
- workspace status;
- tags, stashes, remotes, contributors;
- offline packaging.

## Phase 2 — Commit inspection

Status: selesai (kecuali split view dan file history).

- [x] commit detail panel;
- [x] changed files per commit;
- [x] unified diff viewer (split view belum);
- [x] copy hash dan path;
- [x] virtualized commit list + pagination (1000/halaman);
- [x] pencarian dengan highlight, filter branch, urutan topo/date;
- [x] workspace diff (staged, unstaged, untracked);
- [ ] parent selector untuk merge commit (saat ini selalu first parent);
- [ ] file history.

## Phase 2.5 — Compare dan cherry-pick (selesai)

- [x] compare view / simulasi pull request antara dua ref;
- [x] ahead/behind, daftar commit, files changed dengan diff;
- [x] prediksi konflik merge via `git merge-tree` (Git ≥ 2.38);
- [x] cherry-pick visual multi-commit dengan preview konflik;
- [x] continue / skip / abort dari state banner;
- [x] deteksi state repository (cherry-pick/merge/rebase/revert/bisect).

## Phase 3 — Repository structure

- file tree yang menghormati `.gitignore`;
- language statistics;
- large files;
- Git LFS detection;
- nested repositories;
- submodule dependency graph;
- worktree relationship map;
- branch divergence visualization.

## Phase 4 — Advanced Git metadata

- reflog timeline;
- hooks inventory;
- sparse-checkout state;
- shallow repository status;
- signed commit dan tag status;
- commit author timeline;
- repository activity heatmap;
- branch lifetime dan stale branch analysis.

## Phase 5 — Optional write operations

Write operation tidak boleh menggunakan generic Git command input. Setiap operasi harus memiliki IPC contract, validation, preview, dan confirmation sendiri.

Sudah diimplementasikan mengikuti kontrak tersebut:

- [x] cherry-pick (preview merge-tree → confirm → execute → continue/skip/abort).

Candidate operations berikutnya:

- create/delete local branch;
- create/remove worktree;
- stage/unstage file;
- stash create/apply;
- checkout branch;
- commit creation.

Mode read-only harus tetap menjadi default dan dapat dikunci permanen melalui setting aplikasi.
