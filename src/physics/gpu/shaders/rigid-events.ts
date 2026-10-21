export const rigidEventsWgsl = /* wgsl */`
fn emitEvent(kind: u32, a: u32, b: u32) {
  let slot = atomicAdd(&status[1], 1u); let capacity = (arrayLength(&status) - 4u) / 6u;
  if (slot >= capacity) { atomicStore(&status[2], 1u); return; }
  let at = 4u + slot * 6u;
  atomicStore(&status[at], kind); atomicStore(&status[at + 1u], a); atomicStore(&status[at + 2u], b);
  atomicStore(&status[at + 3u], atomicLoad(&status[3]));
  atomicStore(&status[at + 4u], bodyGeneration(a)); atomicStore(&status[at + 5u], bodyGeneration(b));
}
fn emitTransitions(a: u32, b: u32, previousFlags: u32, nextFlags: u32) {
  if ((previousFlags & 1u) == 0u && (nextFlags & 1u) != 0u) { emitEvent(1u, a, b); }
  if ((previousFlags & 1u) != 0u && (nextFlags & 1u) == 0u) { emitEvent(2u, a, b); }
  if ((previousFlags & 2u) == 0u && (nextFlags & 2u) != 0u) { emitEvent(3u, a, b); }
  if ((previousFlags & 2u) != 0u && (nextFlags & 2u) == 0u) { emitEvent(4u, a, b); }
}
`;
