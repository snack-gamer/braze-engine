/** Capsules have a local Y segment with hemispherical ends. Shared by both schedules. */
export const rigidCapsuleContactsWgsl = /* wgsl */`
fn segmentArm(body: Collider) -> vec3f {
  return axis(body.rotation, 1u) * body.shape.y;
}
fn closestOnSegment(point: vec3f, start: vec3f, end: vec3f) -> vec3f {
  let delta = end - start;
  return start + delta * clamp(dot(point - start, delta) / max(dot(delta, delta), 1e-12), 0.0, 1.0);
}
fn roundedContact(a: Collider, b: Collider, ca: vec3f, cb: vec3f, margin: f32) -> Manifold {
  var result: Manifold;
  let delta = cb - ca; let distance = length(delta);
  let ra = a.shape.x; let rb = b.shape.x;
  if (distance > ra + rb + margin) { return result; }
  var normal = vec3f(1.0, 0.0, 0.0);
  if (distance > 1e-7) { normal = delta / distance; }
  result.count = 1u;
  result.points[0] = surfaceContact(a, b, normal, ca + normal * ra, cb - normal * rb);
  return result;
}
fn capsuleSphere(capsule: Collider, sphere: Collider, reversed: bool, margin: f32) -> Manifold {
  let arm = segmentArm(capsule);
  let closest = closestOnSegment(sphere.position, capsule.position - arm, capsule.position + arm);
  if (reversed) { return roundedContact(sphere, capsule, sphere.position, closest, margin); }
  return roundedContact(capsule, sphere, closest, sphere.position, margin);
}
fn capsuleCapsule(a: Collider, b: Collider, margin: f32) -> Manifold {
  let aa = segmentArm(a); let ab = segmentArm(b);
  let startA = a.position - aa; let startB = b.position - ab;
  let da = 2.0 * aa; let db = 2.0 * ab; let r = startA - startB;
  let x = dot(da, da); let y = dot(db, db); let z = dot(da, db);
  let c = dot(da, r); let f = dot(db, r); let denom = x * y - z * z;
  var s = 0.0;
  if (denom > 1e-12) { s = clamp((z * f - c * y) / denom, 0.0, 1.0); }
  var t = (z * s + f) / max(y, 1e-12);
  if (t < 0.0) { t = 0.0; s = clamp(-c / max(x, 1e-12), 0.0, 1.0); }
  else if (t > 1.0) { t = 1.0; s = clamp((z - c) / max(x, 1e-12), 0.0, 1.0); }
  var result = roundedContact(a, b, startA + da * s, startB + db * t, margin);
  if (denom < 0.001 * x * y) {
    for (var endpoint = 0u; endpoint < 2u; endpoint++) {
      let pointA = startA + da * f32(endpoint);
      let pointB = closestOnSegment(pointA, startB, startB + db);
      let next = roundedContact(a, b, pointA, pointB, margin);
      if (next.count == 0u) { continue; }
      var duplicate = false;
      for (var i = 0u; i < result.count; i++) {
        if (distance(result.points[i].localA.xyz, next.points[0].localA.xyz) < 0.001) { duplicate = true; }
      }
      if (!duplicate) { result.points[result.count] = next.points[0]; result.count++; }
    }
  }
  return result;
}
fn capsulePointBox(capsule: Collider, box: Collider, center: vec3f, reversed: bool, margin: f32) -> Manifold {
  var result: Manifold;
  let radius = capsule.shape.x; let extent = box.shape.xyz;
  let local = inverseRotate(box.rotation, center - box.position);
  var closest = clamp(local, -extent, extent); let delta = closest - local;
  let distance = length(delta); var normal: vec3f;
  if (distance > 1e-7) {
    if (distance > radius + margin) { return result; }
    normal = rotate(box.rotation, delta / distance);
  } else {
    let gaps = extent - abs(local); var face = 0u;
    if (gaps.y < gaps[face]) { face = 1u; } if (gaps.z < gaps[face]) { face = 2u; }
    let sign = positiveSign(local[face]); closest[face] = sign * extent[face]; normal = -sign * axis(box.rotation, face);
  }
  let onCapsule = center + normal * radius; let onBox = box.position + rotate(box.rotation, closest);
  result.count = 1u;
  if (reversed) { result.points[0] = surfaceContact(box, capsule, -normal, onBox, onCapsule); }
  else { result.points[0] = surfaceContact(capsule, box, normal, onCapsule, onBox); }
  return result;
}
fn capsuleBox(capsule: Collider, box: Collider, reversed: bool, margin: f32) -> Manifold {
  let arm = segmentArm(capsule); let start = capsule.position - arm; let end = capsule.position + arm;
  let localStart = inverseRotate(box.rotation, start - box.position);
  let localDelta = inverseRotate(box.rotation, end - start); let extent = box.shape.xyz;
  // Squared segment-to-AABB distance is convex. Its derivative is monotone;
  // bounded bisection also handles parallel faces and zero-length segments.
  var low = 0.0; var high = 1.0;
  for (var iteration = 0u; iteration < 24u; iteration++) {
    let t = (low + high) * 0.5; let point = localStart + localDelta * t;
    let derivative = dot(point - clamp(point, -extent, extent), localDelta);
    if (derivative < 0.0) { low = t; } else { high = t; }
  }
  var result = capsulePointBox(capsule, box, mix(start, end, (low + high) * 0.5), reversed, margin);
  // A capsule lying on a face needs both end contacts for stable torque.
  for (var endpoint = 0u; endpoint < 2u; endpoint++) {
    let next = capsulePointBox(capsule, box, select(start, end, endpoint == 1u), reversed, margin);
    if (next.count == 0u) { continue; }
    var duplicate = false;
    for (var i = 0u; i < result.count; i++) {
      if (distance(result.points[i].localA.xyz, next.points[0].localA.xyz) < 0.001
        && distance(result.points[i].localB.xyz, next.points[0].localB.xyz) < 0.001) { duplicate = true; }
    }
    if (!duplicate) { result.points[result.count] = next.points[0]; result.count++; }
  }
  return result;
}
fn primitiveShapeContact(a: Collider, b: Collider, margin: f32) -> Manifold {
  if ((a.mask & b.layer) == 0u || (b.mask & a.layer) == 0u) { var empty: Manifold; return empty; }
  let ka = a.shape.w; let kb = b.shape.w;
  if (ka == 4.0) { return triangleContact(a, b, false, margin); }
  if (kb == 4.0) { return triangleContact(b, a, true, margin); }
  if (ka > 1.5 && kb > 1.5) { return capsuleCapsule(a, b, margin); }
  if (ka > 1.5 && kb > 0.5) { return capsuleSphere(a, b, false, margin); }
  if (kb > 1.5 && ka > 0.5) { return capsuleSphere(b, a, true, margin); }
  if (ka > 1.5) { return capsuleBox(a, b, false, margin); }
  if (kb > 1.5) { return capsuleBox(b, a, true, margin); }
  if (ka > 0.5 && kb > 0.5) { return sphereSphere(a, b, margin); }
  if (ka > 0.5) { return sphereBox(a, b, false, margin); }
  if (kb > 0.5) { return sphereBox(b, a, true, margin); }
  return boxBox(a, b, margin);
}
fn primitiveContact(a: Collider, b: Collider, margin: f32) -> Manifold {
  var result = primitiveShapeContact(a, b, select(margin, 0.0, a.trigger || b.trigger));
  for (var i = 0u; i < result.count; i++) {
    let c = result.points[i];
    let separation = dot(p[b.owner].xyz + rotate(q[b.owner], c.localB.xyz) - p[a.owner].xyz - rotate(q[a.owner], c.localA.xyz), c.normal.xyz);
    if (separation <= 0.002) { result.pad1 |= select(1u, 2u, c.normal.w < 0.0); }
  }
  return result;
}
`;
