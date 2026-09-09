/** "2.1 GB" / "480 MB" — used across Home, Profile and Storage settings. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}
