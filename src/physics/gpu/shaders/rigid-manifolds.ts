/** Pair slots are fully reserved in the bounded small-world path: no append overflow. */
export const rigidManifoldsWgsl = /* wgsl */`
fn generateManifold(a: u32, b: u32) {
  let slot = pairIndex(a, b);
  var old = manifolds[slot];
  if (old.generationA != bodyGeneration(a) || old.generationB != bodyGeneration(b)) { var empty: Manifold; old = empty; }
  var next: Manifold;
  if (properties[a].inertia.w + properties[b].inertia.w == 0.0 && p[a].w >= 0.0 && p[b].w >= 0.0) {
    manifolds[slot] = next; return;
  }
  let radiusA = bodyRadius(a); let radiusB = bodyRadius(b);
  let margin = motionMargin(a, b);
  if (length(p[b].xyz - p[a].xyz) > radiusA + radiusB + margin) {
    emitTransitions(a, b, old.pad1, 0u);
    manifolds[slot] = next; return;
  }
  next = shapeContact(a, b, margin);
  next.generationA = bodyGeneration(a); next.generationB = bodyGeneration(b);
  var used = 0u;
  for (var i = 0u; i < next.count; i++) {
    var previous: Contact;
    var matchedPoint = 8u;
    var bestDistance = 0.0025;
    for (var j = 0u; j < old.count; j++) {
      if ((used & (1u << j)) != 0u) { continue; }
      if (dot(next.points[i].normal.xyz, old.points[j].normal.xyz) < 0.95) { continue; }
      let da = next.points[i].localA.xyz - old.points[j].localA.xyz;
      let db = next.points[i].localB.xyz - old.points[j].localB.xyz;
      let distance = dot(da, da) + dot(db, db);
      if (distance < bestDistance) { bestDistance = distance; matchedPoint = j; }
    }
    if (matchedPoint < 8u) {
      previous = old.points[matchedPoint];
      used |= 1u << matchedPoint;
      let normal = next.points[i].normal.xyz;
      let oldImpulse = old.points[matchedPoint].impulse;
      let tangent = oldImpulse.xyz - normal * dot(oldImpulse.xyz, normal);
      next.points[i].impulse = vec4f(tangent, oldImpulse.w);
    }
    next.points[i] = finalizeContact(a, b, next.points[i], previous, matchedPoint < 8u);
  }
  emitTransitions(a, b, old.pad1, next.pad1);
  manifolds[slot] = next;
}
`;
