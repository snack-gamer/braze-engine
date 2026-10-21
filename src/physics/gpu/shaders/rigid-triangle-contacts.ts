/** Double-sided triangle surfaces. SAT/clipped box faces and exact convex point distance. */
export const rigidTriangleContactsWgsl = /* wgsl */`
fn closestTriangle(point: vec3f, a: vec3f, b: vec3f, c: vec3f) -> vec3f {
  let ab = b - a; let ac = c - a; let ap = point - a;
  let d1 = dot(ab, ap); let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) { return a; }
  let bp = point - b; let d3 = dot(ab, bp); let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) { return b; }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) { return a + ab * (d1 / (d1 - d3)); }
  let cp = point - c; let d5 = dot(ab, cp); let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) { return c; }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) { return a + ac * (d2 / (d2 - d6)); }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && d4 >= d3 && d5 >= d6) { return b + (c - b) * ((d4 - d3) / (d4 - d3 + d5 - d6)); }
  return a + (ab * vb + ac * vc) / (va + vb + vc);
}
fn triangleRoundedPoint(tri: Collider, body: Collider, center: vec3f, margin: f32) -> Manifold {
  var result: Manifold; let closest = closestTriangle(center, tri.triA, tri.triB, tri.triC);
  let delta = center - closest; let distance = length(delta);
  if (distance > body.shape.x + margin) { return result; }
  var normal = normalize(cross(tri.triB - tri.triA, tri.triC - tri.triA));
  normal *= positiveSign(dot(body.position - tri.triA, normal));
  if (distance > 1e-7) { normal = delta / distance; }
  result.count = 1u; result.points[0] = surfaceContact(tri, body, normal, closest, center - normal * body.shape.x);
  return result;
}
fn triangleRounded(tri: Collider, body: Collider, margin: f32) -> Manifold {
  if (body.shape.w == 1.0) { return triangleRoundedPoint(tri, body, body.position, margin); }
  let arm = axis(body.rotation, 1u) * body.shape.y; let start = body.position - arm; let delta = arm * 2.0;
  var low = 0.0; var high = 1.0;
  for (var i = 0u; i < 24u; i++) {
    let t = (low + high) * 0.5; let point = start + delta * t;
    let closest = closestTriangle(point, tri.triA, tri.triB, tri.triC);
    if (dot(point - closest, delta) < 0.0) { low = t; } else { high = t; }
  }
  var result = triangleRoundedPoint(tri, body, start + delta * ((low + high) * 0.5), margin);
  for (var i = 0u; i < 2u; i++) {
    let next = triangleRoundedPoint(tri, body, start + delta * f32(i), margin);
    result = mergeContacts(tri.owner, body.owner, result, next);
  }
  return result;
}
fn triangleAxis(tri: Collider, box: Collider, direction: vec3f, feature: u32) -> SeparatingAxis {
  let a = dot(tri.triA - box.position, direction); let b = dot(tri.triB - box.position, direction); let c = dot(tri.triC - box.position, direction);
  let low = min(a, min(b, c)); let high = max(a, max(b, c)); let radius = projectionRadius(box, direction);
  var result: SeparatingAxis; result.feature = feature;
  result.normal = select(-direction, direction, low >= -high); result.separation = max(low, -high) - radius;
  return result;
}
fn triangleBox(tri: Collider, box: Collider, margin: f32) -> Manifold {
  var result: Manifold; let vertices = array<vec3f, 3>(tri.triA, tri.triB, tri.triC);
  let faceNormal = normalize(cross(tri.triB - tri.triA, tri.triC - tri.triA));
  var best = triangleAxis(tri, box, faceNormal, 0u);
  if (best.separation > margin) { return result; }
  for (var i = 0u; i < 3u; i++) {
    let candidate = triangleAxis(tri, box, axis(box.rotation, i), 1u + i);
    if (candidate.separation > margin) { return result; }
    if (candidate.separation > best.separation + 0.001) { best = candidate; }
    for (var j = 0u; j < 3u; j++) {
      let crossed = cross(axis(box.rotation, i), vertices[(j + 1u) % 3u] - vertices[j]); let squared = dot(crossed, crossed);
      if (squared < 1e-10) { continue; }
      let edge = triangleAxis(tri, box, crossed / sqrt(squared), 4u + i * 3u + j);
      if (edge.separation > margin) { return result; }
      if (edge.separation > best.separation + 0.001) { best = edge; }
    }
  }
  let normal = best.normal; // box toward triangle
  if (best.feature >= 4u) {
    let boxEdge = (best.feature - 4u) / 3u; let triEdge = (best.feature - 4u) % 3u;
    let half = axis(box.rotation, boxEdge) * box.shape[boxEdge]; let a = edgeCenter(box, boxEdge, normal) - half;
    let b = vertices[triEdge]; let da = half * 2.0; let db = vertices[(triEdge + 1u) % 3u] - b; let r = a - b;
    let aa = dot(da, da); let bb = dot(db, db); let ab = dot(da, db); let ar = dot(da, r); let br = dot(db, r);
    let denominator = aa * bb - ab * ab; var s = 0.0;
    if (denominator > 1e-12) { s = clamp((ab * br - ar * bb) / denominator, 0.0, 1.0); }
    var t = (ab * s + br) / max(bb, 1e-12);
    if (t < 0.0) { t = 0.0; s = clamp(-ar / max(aa, 1e-12), 0.0, 1.0); }
    if (t > 1.0) { t = 1.0; s = clamp((ab - ar) / max(aa, 1e-12), 0.0, 1.0); }
    result.count = 1u; result.points[0] = surfaceContact(tri, box, -normal, b + db * t, a + da * s); return result;
  }
  var polygon: Polygon;
  var face = 0u;
  for (var i = 1u; i < 3u; i++) { if (abs(dot(axis(box.rotation, i), normal)) > abs(dot(axis(box.rotation, face), normal))) { face = i; } }
  if (best.feature == 0u) {
    let center = box.position + axis(box.rotation, face) * box.shape[face] * positiveSign(dot(axis(box.rotation, face), normal));
    let u = axis(box.rotation, (face + 1u) % 3u) * box.shape[(face + 1u) % 3u];
    let v = axis(box.rotation, (face + 2u) % 3u) * box.shape[(face + 2u) % 3u];
    polygon.count = 4u; polygon.points[0] = center - u - v; polygon.points[1] = center + u - v;
    polygon.points[2] = center + u + v; polygon.points[3] = center - u + v;
    for (var i = 0u; i < 3u; i++) {
      let side = normalize(cross(vertices[(i + 1u) % 3u] - vertices[i], faceNormal));
      polygon = clipPolygon(polygon, side, dot(vertices[i], side));
    }
    for (var i = 0u; i < polygon.count; i++) {
      let onBox = polygon.points[i]; let separation = dot(tri.triA - onBox, normal);
      if (separation > margin) { continue; }
      result.points[result.count] = surfaceContact(tri, box, -normal, onBox + normal * separation, onBox); result.count++;
    }
  } else {
    face = best.feature - 1u; polygon.count = 3u;
    for (var i = 0u; i < 3u; i++) { polygon.points[i] = vertices[i]; }
    for (var i = 0u; i < 3u; i++) {
      if (i == face) { continue; } let side = axis(box.rotation, i);
      polygon = clipPolygon(polygon, side, dot(box.position, side) + box.shape[i]);
      polygon = clipPolygon(polygon, -side, dot(box.position, -side) + box.shape[i]);
    }
    for (var i = 0u; i < polygon.count; i++) {
      let onTri = polygon.points[i]; let separation = dot(onTri - box.position, normal) - box.shape[face];
      if (separation > margin) { continue; }
      result.points[result.count] = surfaceContact(tri, box, -normal, onTri, onTri - normal * separation); result.count++;
    }
  }
  return result;
}
fn triangleContact(tri: Collider, body: Collider, reversed: bool, margin: f32) -> Manifold {
  var result: Manifold;
  if (body.shape.w == 4.0) { return result; }
  if (body.shape.w == 0.0) { result = triangleBox(tri, body, margin); } else { result = triangleRounded(tri, body, margin); }
  if (reversed) {
    for (var i = 0u; i < result.count; i++) {
      let point = result.points[i]; result.points[i].normal = vec4f(-point.normal.xyz, point.normal.w);
      result.points[i].localA = vec4f(point.localB.xyz, point.localA.w); result.points[i].localB = vec4f(point.localA.xyz, 0.0);
    }
  }
  return result;
}
`;
