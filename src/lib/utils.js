import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDate(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size || unit === "minute") {
      return formatter.format(Math.round(diff / size), unit);
    }
  }
  return date.toLocaleString();
}

export function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function truncateMiddle(value, start = 28, end = 18) {
  if (!value || value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function formatCount(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Classifies a `%D` decoration label into { type, name, branch }.
 * type: "head" | "branch" | "remote" | "tag" | "detached"
 */
export function classifyRef(label, remoteNames = []) {
  const raw = label.trim();
  if (raw === "HEAD") return { type: "detached", name: "HEAD", branch: "" };
  if (raw.startsWith("HEAD ->")) {
    const branch = raw.replace(/^HEAD ->\s*/, "");
    return { type: "head", name: branch, branch };
  }
  if (raw.startsWith("tag:")) {
    const name = raw.replace(/^tag:\s*/, "");
    return { type: "tag", name, branch: "" };
  }
  const remotes = remoteNames.length > 0 ? remoteNames : ["origin"];
  for (const remote of remotes) {
    if (raw === `${remote}/HEAD`) return { type: "remote", name: raw, branch: "" };
    if (raw.startsWith(`${remote}/`)) return { type: "remote", name: raw, branch: raw.slice(remote.length + 1) };
  }
  return { type: "branch", name: raw, branch: raw };
}

export function authorInitials(name) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function authorHue(seed) {
  let hash = 0;
  const text = String(seed || "");
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
