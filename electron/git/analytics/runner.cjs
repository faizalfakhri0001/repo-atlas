const { spawn } = require("node:child_process");
const { GitServiceError, humanizeGitError } = require("../core.cjs");
const { cancellationError } = require("./cancellation.cjs");

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_OUTPUT_BYTES = 64 * 1024;

function gitEnvironment() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
    LC_ALL: "C",
  };
}

function normalizeRunnerError(error, fallbackMessage = "Git analytics could not be built.") {
  if (error instanceof GitServiceError) return error;
  if (error?.code === "ENOENT") {
    return new GitServiceError(
      "Git executable was not found. Install Git and ensure it is available in PATH.",
      "GIT_NOT_FOUND",
      error.message,
    );
  }
  return new GitServiceError(error?.message || fallbackMessage, "ANALYTICS_BUILD_FAILED", error?.stack || "");
}

function runGitStream(cwd, args, options = {}) {
  if (typeof cwd !== "string" || cwd.trim().length === 0 || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    return Promise.reject(new GitServiceError("A working directory and Git argument list are required.", "INVALID_ARGUMENT"));
  }

  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1, Number(options.timeoutMs)) : DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = Number.isFinite(Number(options.maxOutputBytes))
    ? Math.max(1, Number(options.maxOutputBytes))
    : DEFAULT_MAX_OUTPUT_BYTES;
  const signal = options.signal;
  const spawnProcess = typeof options.spawnFn === "function" ? options.spawnFn : spawn;

  if (signal?.aborted) return Promise.reject(cancellationError());

  return new Promise((resolve, reject) => {
    let child;
    let settled = false;
    let closeCode = null;
    let closeSignal = null;
    let totalBytes = 0;
    let stderr = "";
    let streamError = null;
    let timedOut = false;
    let cancelled = false;
    let timer = null;
    let forceKillTimer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", onAbort);
    };

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };

    const terminate = () => {
      if (!child || child.killed) return;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled && !child.killed) child.kill("SIGKILL");
      }, 250);
      forceKillTimer.unref?.();
    };

    const onAbort = () => {
      cancelled = true;
      terminate();
    };

    try {
      child = spawnProcess("git", args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: gitEnvironment(),
      });
    } catch (error) {
      finish(normalizeRunnerError(error));
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => {
      if (settled || streamError) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalBytes += buffer.byteLength;
      if (totalBytes > maxOutputBytes) {
        streamError = new GitServiceError(
          `Analytics output exceeded the ${maxOutputBytes}-byte limit.`,
          "ANALYTICS_LIMIT_REACHED",
        );
        terminate();
        return;
      }
      try {
        options.onChunk?.(buffer);
      } catch (error) {
        streamError = normalizeRunnerError(error);
        terminate();
      }
    });

    child.stderr.on("data", (chunk) => {
      if (stderr.length >= MAX_ERROR_OUTPUT_BYTES) return;
      stderr += String(chunk).slice(0, MAX_ERROR_OUTPUT_BYTES - stderr.length);
    });

    child.once("error", (error) => {
      if (!streamError) streamError = normalizeRunnerError(error);
    });

    child.once("close", (code, signalName) => {
      closeCode = code;
      closeSignal = signalName;
      if (cancelled) {
        finish(cancellationError());
        return;
      }
      if (timedOut) {
        finish(new GitServiceError("Git analytics timed out.", "GIT_TIMEOUT", stderr));
        return;
      }
      if (streamError) {
        finish(streamError);
        return;
      }
      if (closeCode !== 0) {
        finish(new GitServiceError(humanizeGitError(stderr || `Git exited with code ${closeCode ?? "unknown"}.`), "ANALYTICS_BUILD_FAILED", stderr));
        return;
      }
      finish(null, { code: closeCode, signal: closeSignal, bytes: totalBytes, stderr });
    });
  });
}

module.exports = {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  runGitStream,
};
