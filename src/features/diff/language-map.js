const EXTENSION_LANGUAGE = Object.freeze({
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  css: "css",
  html: "markup",
  htm: "markup",
  xml: "markup",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  go: "go",
  py: "python",
  java: "java",
  rs: "rust",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
});

export function languageForPath(filePath) {
  const name = String(filePath ?? "").replaceAll("\\", "/").split("/").pop().toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return EXTENSION_LANGUAGE[extension] ?? "text";
}

export function languageMap() {
  return { ...EXTENSION_LANGUAGE };
}
