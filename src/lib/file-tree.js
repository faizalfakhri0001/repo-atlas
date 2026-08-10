function normalizeFilePath(value) {
  if (typeof value !== "string") return "";
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function compareTreeNodes(left, right) {
  if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
}

function createDirectory(name, filePath) {
  return {
    id: filePath || "root",
    name,
    path: filePath,
    type: "directory",
    children: [],
    changeCount: 0,
    statusCounts: {},
  };
}

function addStatusCount(node, status) {
  if (!status || status === ".") return;
  node.changeCount += 1;
  node.statusCounts[status] = (node.statusCounts[status] ?? 0) + 1;
}

function aggregateDirectory(node) {
  node.changeCount = 0;
  node.statusCounts = {};
  for (const child of node.children) {
    if (child.type === "file") {
      addStatusCount(node, child.status);
      continue;
    }
    aggregateDirectory(child);
    node.changeCount += child.changeCount;
    for (const [status, count] of Object.entries(child.statusCounts)) {
      node.statusCounts[status] = (node.statusCounts[status] ?? 0) + count;
    }
  }
}

export function buildFileTree(files = []) {
  const root = createDirectory("Repository", "");
  const directories = new Map([["", root]]);
  const seenFiles = new Set();

  for (const entry of files) {
    const filePath = normalizeFilePath(entry?.path);
    if (!filePath || seenFiles.has(filePath)) continue;
    seenFiles.add(filePath);

    const parts = filePath.split("/").filter(Boolean);
    const fileName = parts.pop();
    let parentPath = "";
    let parent = root;
    for (const part of parts) {
      const directoryPath = parentPath ? `${parentPath}/${part}` : part;
      let directory = directories.get(directoryPath);
      if (!directory) {
        directory = createDirectory(part, directoryPath);
        directories.set(directoryPath, directory);
        parent.children.push(directory);
      }
      parent = directory;
      parentPath = directoryPath;
    }

    parent.children.push({
      id: filePath,
      name: fileName,
      path: filePath,
      type: "file",
      extension: entry.extension ?? "",
      tracked: Boolean(entry.tracked),
      size: entry.size ?? null,
      status: entry.status ?? null,
      changeCount: 0,
      statusCounts: {},
    });
  }

  const sort = (node) => {
    node.children.sort(compareTreeNodes);
    for (const child of node.children) {
      if (child.type === "directory") sort(child);
    }
  };
  sort(root);
  aggregateDirectory(root);
  return root;
}

export function flattenVisibleTree(root, expandedPaths = new Set()) {
  const rows = [];
  const expanded = expandedPaths instanceof Set ? expandedPaths : new Set(expandedPaths);

  const visit = (node, depth) => {
    rows.push({ node, depth });
    if (node.type !== "directory" || !expanded.has(node.path)) return;
    for (const child of node.children) visit(child, depth + 1);
  };

  for (const child of root?.children ?? []) visit(child, 0);
  return rows;
}

export function filterFileEntries(files = [], query = "") {
  const normalized = String(query).trim().toLowerCase();
  if (!normalized) return files;
  return files.filter((file) => {
    const path = normalizeFilePath(file?.path).toLowerCase();
    const name = String(file?.name ?? path.split("/").pop() ?? "").toLowerCase();
    const extension = String(file?.extension ?? "").toLowerCase();
    return path.includes(normalized) || name.includes(normalized) || extension.includes(normalized);
  });
}

export function collectDirectoryPaths(root) {
  const paths = [];
  const visit = (node) => {
    if (node.type !== "directory") return;
    paths.push(node.path);
    node.children.forEach(visit);
  };
  (root?.children ?? []).forEach(visit);
  return paths;
}

export { compareTreeNodes, normalizeFilePath };
