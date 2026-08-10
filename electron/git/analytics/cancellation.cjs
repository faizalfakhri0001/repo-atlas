const { GitServiceError } = require("../core.cjs");

function cancellationError() {
  return new GitServiceError("Analytics build was cancelled.", "ANALYTICS_CANCELLED");
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw cancellationError();
}

function createCancellationSource() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    get cancelled() {
      return controller.signal.aborted;
    },
  };
}

function linkCancellationSignal(signal, controller) {
  if (!signal) return () => {};
  const cancel = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", cancel, { once: true });
  return () => signal.removeEventListener("abort", cancel);
}

module.exports = {
  cancellationError,
  createCancellationSource,
  linkCancellationSignal,
  throwIfCancelled,
};
