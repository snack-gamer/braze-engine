import { largeGeometryWgsl } from "./rigid-large-shaders";
import { rigidEventsWgsl } from "../shaders/rigid-events";

export const largeContactsWgsl = largeGeometryWgsl + rigidEventsWgsl + /* wgsl */`
fn overlap(low: vec3f, high: vec3f, node: u32) -> bool {
  return all(low <= tree[node].high) && all(high >= tree[node].low);
}
fn bodyExtent(body: u32) -> vec3f {
  let shape = properties[body].shape;
  if (shape.w > 2.5) { return vec3f(shape.z + 0.02); }
  if (shape.w > 1.5) { return abs(axis(q[body], 1u)) * shape.y + vec3f(shape.x + 0.02); }
  if (shape.w > 0.5) { return vec3f(shape.x + 0.02); }
  return abs(axis(q[body], 0u)) * shape.x + abs(axis(q[body], 1u)) * shape.y
    + abs(axis(q[body], 2u)) * shape.z + vec3f(0.02);
}
fn contact(a: u32, b: u32) -> Manifold {
  return shapeContact(a, b, motionMargin(a, b));
}
fn persist(body: u32, neighbor: u32, next: Manifold) -> Manifold {
  var result = next; result.pad0 = neighbor;
  result.generationA = bodyGeneration(body); result.generationB = bodyGeneration(neighbor);
  var oldPoints: array<Contact, 8>; var matchedMask = 0u;
  for (var slot = 0u; slot < NEIGHBORS; slot++) {
    let old = previous[body * NEIGHBORS + slot];
    if (old.count == 0u || old.pad0 != neighbor || old.generationA != bodyGeneration(body) || old.generationB != bodyGeneration(neighbor)) { continue; }
    var used = 0u;
    for (var i = 0u; i < result.count; i++) {
      var best = 0.0025; var matchedPoint = 8u;
      for (var j = 0u; j < old.count; j++) {
        if ((used & (1u << j)) != 0u || dot(result.points[i].normal.xyz, old.points[j].normal.xyz) < 0.95) { continue; }
        let da = result.points[i].localA.xyz - old.points[j].localA.xyz;
        let db = result.points[i].localB.xyz - old.points[j].localB.xyz;
        let distance = dot(da, da) + dot(db, db);
        if (distance < best) { best = distance; matchedPoint = j; }
      }
      if (matchedPoint < 8u) {
        oldPoints[i] = old.points[matchedPoint]; matchedMask |= 1u << i;
        used |= 1u << matchedPoint;
        let normal = result.points[i].normal.xyz; let impulse = old.points[matchedPoint].impulse;
        result.points[i].impulse = vec4f(impulse.xyz - normal * dot(impulse.xyz, normal), impulse.w);
      }
    }
    break;
  }
  for (var i = 0u; i < result.count; i++) {
    result.points[i] = finalizeContact(min(body, neighbor), max(body, neighbor), result.points[i], oldPoints[i], (matchedMask & (1u << i)) != 0u);
  }
  return result;
}
fn ownsEvents(body: u32, neighbor: u32) -> bool {
  return body < neighbor || (properties[neighbor].inertia.w == 0.0 && p[neighbor].w >= 0.0);
}
fn publishTransitions(body: u32, count: u32) {
  for (var i = 0u; i < count; i++) {
    let next = manifolds[body * NEIGHBORS + i]; let neighbor = next.pad0;
    if (!ownsEvents(body, neighbor)) { continue; }
    var oldFlags = 0u;
    for (var j = 0u; j < NEIGHBORS; j++) {
      let old = previous[body * NEIGHBORS + j];
      if (old.count > 0u && old.pad0 == neighbor && old.generationA == bodyGeneration(body) && old.generationB == bodyGeneration(neighbor)) { oldFlags = old.pad1; break; }
    }
    emitTransitions(min(body, neighbor), max(body, neighbor), oldFlags, next.pad1);
  }
  for (var i = 0u; i < NEIGHBORS; i++) {
    let old = previous[body * NEIGHBORS + i]; if (old.count == 0u || old.pad1 == 0u || !ownsEvents(body, old.pad0)) { continue; }
    if (old.generationA != bodyGeneration(body) || old.generationB != bodyGeneration(old.pad0)) { continue; }
    var found = false;
    for (var j = 0u; j < count; j++) { if (manifolds[body * NEIGHBORS + j].pad0 == old.pad0) { found = true; break; } }
    if (!found) { emitTransitions(min(body, old.pad0), max(body, old.pad0), old.pad1, 0u); }
  }
}
@compute @workgroup_size(64)
fn contacts(@builtin(global_invocation_id) id: vec3u) {
  let body = id.x; if (body >= params.count || atomicLoad(&status[0]) != 0u) { return; }
  var empty: Manifold;
  for (var slot = 0u; slot < NEIGHBORS; slot++) { manifolds[body * NEIGHBORS + slot] = empty; }
  if (properties[body].inertia.w == 0.0 && p[body].w >= 0.0) { return; }
  let half = sweptExtent(body, bodyExtent(body)); let low = p[body].xyz - half; let high = p[body].xyz + half;
  var stack: array<u32, 32>; var top = 1u; stack[0] = 1u; var found = 0u;
  loop {
    if (top == 0u) { break; } top--; let node = stack[top];
    if (!overlap(low, high, node)) { continue; }
    if (node < params.paddedCount) {
      if (top + 2u > 32u) { atomicStore(&status[0], 2u); return; }
      stack[top] = node * 2u; stack[top + 1u] = node * 2u + 1u; top += 2u; continue;
    }
    let neighbor = tree[node].body;
    if (neighbor >= params.count || neighbor == body) { continue; }
    let next = contact(min(body, neighbor), max(body, neighbor));
    if (next.count == 0u) { continue; }
    if (found == NEIGHBORS) { atomicStore(&status[0], 1u); return; }
    manifolds[body * NEIGHBORS + found] = persist(body, neighbor, next); found++;
  }
  publishTransitions(body, found);
}
`;
