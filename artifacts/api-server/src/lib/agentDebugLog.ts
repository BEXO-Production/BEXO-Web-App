/** Debug-mode NDJSON logger (session d16a15). Remove after verification. */
export function agentDebugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  // #region agent log
  fetch("http://127.0.0.1:7832/ingest/75f7dbfa-a2dc-49fd-b6f9-b1432ff24dc1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "d16a15",
    },
    body: JSON.stringify({
      sessionId: "d16a15",
      runId: "post-fix",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
