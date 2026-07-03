export function summarizeSpawnFailure({ label, result }) {
  const details = [];
  if (result.error) details.push(`spawn error: ${result.error.message}`);
  if (typeof result.status === "number") details.push(`exit status: ${result.status}`);
  if (result.signal) details.push(`signal: ${result.signal}`);

  const cause = details.length > 0 ? details.join(", ") : "unknown failure";
  console.error(`[build] ${label} failed (${cause}).`);
}
