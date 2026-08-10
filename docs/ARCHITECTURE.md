# Architecture

## Tujuan

Repo Atlas memisahkan UI tidak terpercaya dari akses filesystem dan proses lokal. React hanya menerima data serializable dari preload bridge. Main process menjadi satu-satunya bagian aplikasi yang dapat membuka dialog native, membaca repository melalui Git CLI, dan membuka file manager.

## Process model

### Renderer

Tanggung jawab:

- navigasi antartampilan;
- filtering dan rendering data;
- commit graph lane calculation;
- local preference untuk theme dan repository terakhir.

Renderer tidak mengimpor `electron`, `fs`, `child_process`, atau Node.js API lain.

### Preload

Preload mengekspos API terbatas per fitur:

```js
window.repoAtlas.openRepository()
window.repoAtlas.scanRepository(path)
window.repoAtlas.revealRepository(path)
window.repoAtlas.listCommits({ repositoryPath, refs, order, limit, skip })
window.repoAtlas.commitDetails({ repositoryPath, hash })
window.repoAtlas.fileDiff({ repositoryPath, from, to, path, oldPath, type, staged })
window.repoAtlas.compareRefs({ repositoryPath, base, head })
window.repoAtlas.cherryPickPreview({ repositoryPath, hashes })
window.repoAtlas.cherryPickExecute({ repositoryPath, hashes })
window.repoAtlas.sequencerAction({ repositoryPath, action })
window.repoAtlas.platform
```

`ipcRenderer` tidak diekspos secara langsung. Ketika bridge tidak tersedia
(dibuka di browser biasa), renderer memakai demo dataset read-only dari
`src/lib/demo.js` dan menandai UI dengan badge "Demo data".

### Main process

Main process:

- membuat BrowserWindow;
- menetapkan security flags;
- menangani native folder dialog;
- memvalidasi input IPC;
- menjalankan Git service;
- mengubah error internal menjadi object serializable.

### Git service

Git service menggunakan `execFile`, bukan `exec`.

Setiap scan:

1. memvalidasi bahwa path ada dan berupa directory;
2. menentukan repository root dan Git directory;
3. membaca status dan Git version;
4. menjalankan scanner independen secara paralel;
5. menggunakan fallback kosong apabila metadata opsional tidak tersedia;
6. mengembalikan satu snapshot repository.

## Offline-first

Offline-first dalam aplikasi ini berarti:

- fungsi inti tidak memerlukan internet;
- tidak ada API server;
- tidak ada authentication provider;
- tidak ada asset eksternal saat runtime;
- tidak ada remote Git command;
- repository terakhir disimpan melalui localStorage renderer;
- seluruh UI dibundel ke installer.

## Data model utama

```text
RepositorySnapshot
├── repository (termasuk defaultBranch, totalCommits)
├── state (cherry-pick / merge / rebase / revert / bisect in progress)
├── status
├── branches[] (termasuk ahead/behind/gone vs upstream)
├── commits[]
├── worktrees[]
├── submodules[]
├── remotes[]
├── tags[]
├── stashes[]
├── contributors[]
└── countObjects
```

Snapshot bersifat immutable dari sudut pandang renderer. Tombol Refresh membuat snapshot baru.
Data on-demand (detail commit, diff file, hasil compare, preview cherry-pick) diminta melalui
IPC terpisah dan tidak disimpan di snapshot.

## Commit graph

`src/lib/git-graph.js` menghitung layout lane sekali per daftar commit:

- input harus berurutan newest-first dengan children sebelum parents
  (`--topo-order` atau `--date-order`);
- setiap lane menunggu hash parent berikutnya, sehingga warna konsisten
  mengikuti garis cabang, bukan indeks kolom;
- setiap row menyimpan `edges` untuk segmen di atasnya, sehingga list yang
  divirtualisasi cukup merender beberapa row overscan agar garis tersambung;
- merge membuka lane baru atau menyambung ke lane yang sudah menunggu parent
  kedua; fork mempertemukan beberapa lane pada commit yang sama.

## Operasi tulis (cherry-pick)

Satu-satunya operasi tulis. Kontraknya:

1. `cherry-pick:preview` — validasi hash, cek working tree bersih, cek tidak ada
   operasi lain berjalan, lalu simulasikan setiap commit dengan
   `git merge-tree --write-tree --merge-base=<commit>^ HEAD <commit>` (read-only).
2. `cherry-pick:execute` — menolak berjalan bila preview blocked; menjalankan
   `git cherry-pick` dengan editor dinonaktifkan (`core.editor=true`).
3. Bila konflik, UI menawarkan `sequencer:action` (`continue` / `skip` / `abort`);
   abort mengembalikan branch ke keadaan semula.

Prediksi konflik compare view memakai `git merge-tree --write-tree` (Git ≥ 2.38)
dan tidak pernah menyentuh working tree.

## Performance

- Git commands independen dijalankan paralel.
- Commit history dimuat 1000 record per halaman (tombol Load more menambah halaman).
- Commit list divirtualisasi (hanya row terlihat + overscan yang dirender).
- Renderer tidak meminta detail diff untuk setiap commit; diff diminta per file.
- Graph lane dihitung ulang hanya saat daftar commit berubah; pencarian hanya
  menyorot (dim) tanpa membangun ulang graph.
- Data besar berada di scroll container, bukan document body.

## Extension points

Fitur baru sebaiknya ditambahkan melalui satu IPC method spesifik, bukan generic command executor.

Contoh yang aman:

```text
repository:get-reflog(limit)
repository:get-file-history(path)
```

Hindari API seperti:

```text
repository:run-command(commandString)
filesystem:read-any-file(path)
ipc:send(channel, payload)
```
