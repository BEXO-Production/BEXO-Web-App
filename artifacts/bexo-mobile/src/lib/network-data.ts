/**
 * The pure geometry behind the Network globe — a fibonacci sphere and a
 * hand-rolled perspective projection, shared by the real connection graph in
 * `app/(app)/network.tsx`. Contains no people: the graph itself always comes
 * from `GET /api/connections` (see `src/lib/connections-api.ts`).
 */

/**
 * A point on a fibonacci sphere — an even scatter of N items over a sphere,
 * with no clumping at the poles.
 */
export function spherePoint(i: number, n: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const yFrac = n <= 1 ? 0 : 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - yFrac * yFrac));
  const theta = golden * i;
  return { x: Math.cos(theta) * r, y: yFrac, z: Math.sin(theta) * r };
}

/** Rigid rotate + perspective divide, so size/opacity/paint order share one depth. */
export function projectPoint(
  p: { x: number; y: number; z: number },
  R: number,
  rotY: number,
  rotX: number,
  zoom: number,
  center: number,
) {
  "worklet";
  const x = p.x * R;
  const y = p.y * R;
  const z = p.z * R;
  const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
  const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
  const y1 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
  const focal = 640;
  const dist = focal / zoom;
  const scale = dist / (dist + z2);
  return { sx: center + x1 * scale, sy: center + y1 * scale, scale, z: z2 };
}
