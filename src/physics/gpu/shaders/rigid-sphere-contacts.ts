export const rigidSphereContactsWgsl = /* wgsl */`
fn sphereSphere(a: Collider, b: Collider, margin: f32) -> Manifold {
  var result: Manifold;
  let delta = b.position - a.position;
  let distance = length(delta);
  let ra = a.shape.x; let rb = b.shape.x;
  if (distance > ra + rb + margin) { return result; }
  var normal = vec3f(1.0, 0.0, 0.0);
  if (distance > 1e-7) { normal = delta / distance; }
  result.count = 1u;
  result.points[0] = surfaceContact(a, b, normal, a.position + normal * ra, b.position - normal * rb);
  return result;
}

fn sphereBox(sphere: Collider, box: Collider, reversed: bool, margin: f32) -> Manifold {
  var result: Manifold;
  let radius = sphere.shape.x;
  let extent = box.shape.xyz;
  let center = inverseRotate(box.rotation, sphere.position - box.position);
  var closest = clamp(center, -extent, extent);
  let offset = closest - center;
  let distance = length(offset);
  var normal: vec3f;
  if (distance > 1e-7) {
    if (distance > radius + margin) { return result; }
    normal = rotate(box.rotation, offset / distance);
  } else {
    // Interior sphere: push out through the nearest face, not toward the center.
    let gaps = extent - abs(center);
    var face = 0u;
    if (gaps.y < gaps[face]) { face = 1u; }
    if (gaps.z < gaps[face]) { face = 2u; }
    let sign = positiveSign(center[face]);
    closest[face] = sign * extent[face];
    normal = -sign * axis(box.rotation, face);
  }
  let onSphere = sphere.position + radius * normal;
  let onBox = box.position + rotate(box.rotation, closest);
  result.count = 1u;
  if (reversed) {
    result.points[0] = surfaceContact(box, sphere, -normal, onBox, onSphere);
  } else {
    result.points[0] = surfaceContact(sphere, box, normal, onSphere, onBox);
  }
  return result;
}
`;
