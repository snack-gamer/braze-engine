/** OBB SAT, face clipping and edge/edge contacts; no AABB collision approximation. */
export const rigidBoxContactsWgsl = /* wgsl */`
struct Polygon { count: u32, points: array<vec3f, 8> }
struct SeparatingAxis { normal: vec3f, separation: f32, feature: u32 }

fn projectionRadius(body: Collider, normal: vec3f) -> f32 {
  return dot(abs(inverseRotate(body.rotation, normal)), body.shape.xyz);
}
fn testAxis(a: Collider, b: Collider, direction: vec3f, feature: u32) -> SeparatingAxis {
  var hit: SeparatingAxis;
  let delta = b.position - a.position;
  hit.normal = direction * positiveSign(dot(delta, direction));
  hit.separation = abs(dot(delta, direction)) - projectionRadius(a, direction) - projectionRadius(b, direction);
  hit.feature = feature;
  return hit;
}
fn clipPolygon(input: Polygon, direction: vec3f, plane: f32) -> Polygon {
  var output: Polygon;
  if (input.count == 0u) { return output; }
  var previous = input.points[input.count - 1u];
  var previousDistance = dot(previous, direction) - plane;
  for (var i = 0u; i < input.count; i++) {
    let current = input.points[i];
    let distance = dot(current, direction) - plane;
    if ((distance < 0.0 && previousDistance > 0.0) || (distance > 0.0 && previousDistance < 0.0)) {
      let fraction = previousDistance / (previousDistance - distance);
      output.points[output.count] = mix(previous, current, fraction);
      output.count++;
    }
    if (distance <= 0.0) {
      output.points[output.count] = current; output.count++;
    }
    previous = current; previousDistance = distance;
  }
  return output;
}
fn faceContacts(a: Collider, b: Collider, hit: SeparatingAxis, margin: f32) -> Manifold {
  var result: Manifold;
  let referenceIsA = hit.feature < 3u;
  var reference = b; if (referenceIsA) { reference = a; }
  var incident = a; if (referenceIsA) { incident = b; }
  let face = hit.feature % 3u;
  let normal = select(-hit.normal, hit.normal, referenceIsA);
  let extent = reference.shape.xyz;
  let center = reference.position + normal * extent[face];
  let u = axis(reference.rotation, (face + 1u) % 3u);
  let t = axis(reference.rotation, (face + 2u) % 3u);
  var incidentFace = 0u;
  var alignment = abs(dot(axis(incident.rotation, 0u), normal));
  for (var i = 1u; i < 3u; i++) {
    let next = abs(dot(axis(incident.rotation, i), normal));
    if (next > alignment) { alignment = next; incidentFace = i; }
  }
  let incidentAxis = axis(incident.rotation, incidentFace);
  let incidentExtent = incident.shape.xyz;
  let incidentCenter = incident.position - incidentAxis * positiveSign(dot(incidentAxis, normal)) * incidentExtent[incidentFace];
  let iu = axis(incident.rotation, (incidentFace + 1u) % 3u) * incidentExtent[(incidentFace + 1u) % 3u];
  let it = axis(incident.rotation, (incidentFace + 2u) % 3u) * incidentExtent[(incidentFace + 2u) % 3u];
  // Clip relative to the reference face center, preserving precision away from origin.
  let relative = incidentCenter - center;
  var polygon: Polygon;
  polygon.count = 4u;
  polygon.points[0] = relative - iu - it;
  polygon.points[1] = relative + iu - it;
  polygon.points[2] = relative + iu + it;
  polygon.points[3] = relative - iu + it;
  polygon = clipPolygon(polygon, u, extent[(face + 1u) % 3u]);
  polygon = clipPolygon(polygon, -u, extent[(face + 1u) % 3u]);
  polygon = clipPolygon(polygon, t, extent[(face + 2u) % 3u]);
  polygon = clipPolygon(polygon, -t, extent[(face + 2u) % 3u]);
  for (var i = 0u; i < polygon.count; i++) {
    let separation = dot(polygon.points[i], normal);
    if (separation > margin) { continue; }
    let onIncident = center + polygon.points[i];
    let onReference = onIncident - separation * normal;
    let pointA = select(onIncident, onReference, referenceIsA);
    let pointB = select(onReference, onIncident, referenceIsA);
    result.points[result.count] = surfaceContact(a, b, hit.normal, pointA, pointB);
    result.count++;
  }
  return result;
}
fn edgeCenter(body: Collider, edge: u32, direction: vec3f) -> vec3f {
  var center = body.position;
  for (var i = 0u; i < 3u; i++) {
    if (i == edge) { continue; }
    let basis = axis(body.rotation, i);
    center += basis * body.shape[i] * positiveSign(dot(basis, direction));
  }
  return center;
}
fn edgeContact(a: Collider, b: Collider, hit: SeparatingAxis) -> Manifold {
  let edgeA = (hit.feature - 6u) / 3u;
  let edgeB = (hit.feature - 6u) % 3u;
  let halfA = axis(a.rotation, edgeA) * a.shape[edgeA];
  let halfB = axis(b.rotation, edgeB) * b.shape[edgeB];
  let startA = edgeCenter(a, edgeA, hit.normal) - halfA;
  let startB = edgeCenter(b, edgeB, -hit.normal) - halfB;
  let da = 2.0 * halfA; let db = 2.0 * halfB; let r = startA - startB;
  let aa = dot(da, da); let bb = dot(db, db); let ab = dot(da, db);
  let ar = dot(da, r); let br = dot(db, r);
  let denominator = aa * bb - ab * ab;
  var s = 0.0;
  if (denominator > 1e-12) { s = clamp((ab * br - ar * bb) / denominator, 0.0, 1.0); }
  var t = (ab * s + br) / max(bb, 1e-12);
  if (t < 0.0) { t = 0.0; s = clamp(-ar / max(aa, 1e-12), 0.0, 1.0); }
  if (t > 1.0) { t = 1.0; s = clamp((ab - ar) / max(aa, 1e-12), 0.0, 1.0); }
  var result: Manifold; result.count = 1u;
  result.points[0] = surfaceContact(a, b, hit.normal, startA + s * da, startB + t * db);
  return result;
}
fn boxBox(a: Collider, b: Collider, margin: f32) -> Manifold {
  var empty: Manifold;
  var best = testAxis(a, b, axis(a.rotation, 0u), 0u);
  if (best.separation > margin) { return empty; }
  for (var i = 1u; i < 6u; i++) {
    var body = a; if (i >= 3u) { body = b; }
    let candidate = testAxis(a, b, axis(body.rotation, i % 3u), i);
    if (candidate.separation > margin) { return empty; }
    if (candidate.separation > best.separation) { best = candidate; }
  }
  for (var i = 0u; i < 3u; i++) {
    for (var j = 0u; j < 3u; j++) {
      let crossed = cross(axis(a.rotation, i), axis(b.rotation, j));
      let squared = dot(crossed, crossed);
      if (squared < 1e-8) { continue; }
      let candidate = testAxis(a, b, crossed / sqrt(squared), 6u + i * 3u + j);
      if (candidate.separation > margin) { return empty; }
      // Prefer stable face manifolds when an edge axis is essentially tied.
      if (candidate.separation > best.separation + 0.001) { best = candidate; }
    }
  }
  if (best.feature < 6u) { return faceContacts(a, b, best, margin); }
  return edgeContact(a, b, best);
}
`;
