/** Contact arms refer to the shared center of mass, never independent child bodies. */
export const rigidCompoundContactsWgsl = /* wgsl */`
fn separationOf(a: u32, b: u32, point: Contact) -> f32 {
  return dot(p[b].xyz + rotate(q[b], point.localB.xyz) - p[a].xyz - rotate(q[a], point.localA.xyz), point.normal.xyz);
}
fn mergeContacts(a: u32, b: u32, old: Manifold, next: Manifold) -> Manifold {
  if (next.count == 0u) { return old; }
  var points: array<Contact, 16>; var count = old.count;
  for (var i = 0u; i < old.count; i++) { points[i] = old.points[i]; }
  for (var i = 0u; i < next.count; i++) {
    var duplicate = false;
    for (var j = 0u; j < count; j++) {
      if (distance(points[j].localA.xyz, next.points[i].localA.xyz) < 0.001
        && distance(points[j].localB.xyz, next.points[i].localB.xyz) < 0.001
        && (points[j].normal.w < 0.0) == (next.points[i].normal.w < 0.0)
        && dot(points[j].normal.xyz, next.points[i].normal.xyz) > 0.999) { duplicate = true; }
    }
    if (!duplicate) { points[count] = next.points[i]; count++; }
  }
  var result: Manifold;
  result.pad1 = old.pad1 | next.pad1;
  if (count <= 8u) {
    result.count = count; for (var i = 0u; i < count; i++) { result.points[i] = points[i]; } return result;
  }
  // Preserve the deepest contact, then maximize spatial/normal coverage within the manifold budget.
  var deepest = 0u; var depth = separationOf(a, b, points[0]);
  for (var i = 1u; i < count; i++) {
    let value = separationOf(a, b, points[i]); if (value < depth) { depth = value; deepest = i; }
  }
  result.points[0] = points[deepest]; result.count = 1u; var used = 1u << deepest;
  for (var chosen = 1u; chosen < 8u; chosen++) {
    var best = 0u; var bestScore = -1.0;
    for (var i = 0u; i < count; i++) {
      if ((used & (1u << i)) != 0u) { continue; }
      var score = 1e30;
      for (var j = 0u; j < result.count; j++) {
        let da = points[i].localA.xyz - result.points[j].localA.xyz;
        let db = points[i].localB.xyz - result.points[j].localB.xyz;
        score = min(score, dot(da, da) + dot(db, db) + 0.1 * (1.0 - dot(points[i].normal.xyz, result.points[j].normal.xyz)));
      }
      score /= 1.0 + 10.0 * max(0.0, separationOf(a, b, points[i]));
      if (score > bestScore) { bestScore = score; best = i; }
    }
    result.points[chosen] = points[best]; result.count++; used |= 1u << best;
  }
  return result;
}
fn shapeContact(a: u32, b: u32, margin: f32) -> Manifold {
  let start = properties[a].collision.z; let count = properties[a].collision.w;
  for (var i = 0u; i < count; i++) {
    if (properties[start + i].collision.x == b && properties[start + i].collision.y == 0u) { var empty: Manifold; return empty; }
  }
  let sa = properties[a].shape; let sb = properties[b].shape;
  let na = select(1u, u32(sa.y), sa.w == 3.0); let nb = select(1u, u32(sb.y), sb.w == 3.0);
  if (na == 1u && nb == 1u) { return primitiveContact(collider(a, 0u), collider(b, 0u), margin); }
  var result: Manifold;
  for (var i = 0u; i < na; i++) {
    for (var j = 0u; j < nb; j++) {
      result = mergeContacts(a, b, result, primitiveContact(collider(a, i), collider(b, j), margin));
    }
  }
  return result;
}
`;
