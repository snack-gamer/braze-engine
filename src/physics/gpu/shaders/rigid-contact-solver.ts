/** Substepped soft sequential impulses. Pair scheduling guarantees exclusive body writes. */
export const rigidContactSolverWgsl = /* wgsl */`
fn applyImpulse(a: u32, b: u32, ra: vec3f, rb: vec3f, impulse: vec3f) {
  applyBodyImpulse(a, ra, -impulse);
  applyBodyImpulse(b, rb, impulse);
}
fn relativeVelocity(a: u32, b: u32, ra: vec3f, rb: vec3f) -> vec3f {
  return linearVelocity(b) + cross(angularVelocity(b), rb) - linearVelocity(a) - cross(angularVelocity(a), ra);
}
fn inverseEffectiveMass(a: u32, b: u32, ra: vec3f, rb: vec3f, direction: vec3f) -> f32 {
  let ca = cross(ra, direction); let cb = cross(rb, direction);
  return properties[a].inertia.w + properties[b].inertia.w
    + dot(ca, worldInverseInertia(a, ca)) + dot(cb, worldInverseInertia(b, cb));
}
fn warmStartPair(a: u32, b: u32) {
  let manifold = manifolds[pairIndex(a, b)];
  for (var i = 0u; i < manifold.count; i++) {
    let c = manifold.points[i];
    if (c.normal.w < 0.0) { continue; }
    applyImpulse(a, b, rotate(q[a], c.localA.xyz), rotate(q[b], c.localB.xyz),
      c.normal.xyz * c.impulse.w + c.impulse.xyz);
  }
}
fn solvePair(a: u32, b: u32, h: f32, biased: bool) {
  let slot = pairIndex(a, b);
  let count = manifolds[slot].count;
  let omega = 6.28318530718 * min(params.timing.y, 0.25 / h);
  let a1 = 2.0 * params.timing.z + h * omega;
  let a2 = h * omega * a1;
  let softMass = a2 / (1.0 + a2);
  let softImpulse = 1.0 / (1.0 + a2);
  for (var i = 0u; i < count; i++) {
    var c = manifolds[slot].points[i];
    if (c.normal.w < 0.0) { continue; }
    let friction = c.normal.w;
    let normal = c.normal.xyz;
    let ra = rotate(q[a], c.localA.xyz); let rb = rotate(q[b], c.localB.xyz);
    let separation = dot(p[b].xyz - p[a].xyz + rb - ra, normal);
    let inverseMass = inverseEffectiveMass(a, b, ra, rb, normal);
    if (inverseMass <= 1e-12) { continue; }
    var massScale = 1.0; var impulseScale = 0.0; var bias = 0.0;
    if (separation > 0.0) { bias = separation / h; }
    else if (biased) {
      massScale = softMass; impulseScale = softImpulse;
      bias = max(-2.0, omega / a1 * min(0.0, separation + params.timing.w));
    }
    if (c.localA.w > 0.0) { massScale = 1.0; impulseScale = 0.0; bias = -c.localA.w; }
    let normalVelocity = dot(relativeVelocity(a, b, ra, rb), normal);
    let delta = -massScale * (normalVelocity + bias) / inverseMass - impulseScale * c.impulse.w;
    let accumulated = max(0.0, c.impulse.w + impulseRelaxation() * delta);
    applyImpulse(a, b, ra, rb, normal * (accumulated - c.impulse.w));
    c.impulse.w = accumulated;

    let reference = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(normal.x) > 0.577);
    let t1 = normalize(cross(normal, reference)); let t2 = cross(normal, t1);
    let k11 = inverseEffectiveMass(a, b, ra, rb, t1);
    let k22 = inverseEffectiveMass(a, b, ra, rb, t2);
    let k12 = dot(cross(ra, t1), worldInverseInertia(a, cross(ra, t2)))
      + dot(cross(rb, t1), worldInverseInertia(b, cross(rb, t2)));
    let determinant = k11 * k22 - k12 * k12;
    if (determinant > 1e-12) {
      let relative = relativeVelocity(a, b, ra, rb);
      let speed = vec2f(dot(relative, t1), dot(relative, t2));
      let increment = vec2f(k12 * speed.y - k22 * speed.x, k12 * speed.x - k11 * speed.y) / determinant;
      var tangent = c.impulse.xyz + impulseRelaxation() * (t1 * increment.x + t2 * increment.y);
      let magnitude = length(tangent);
      let limit = friction * accumulated;
      if (magnitude > limit && magnitude > 1e-12) { tangent *= limit / magnitude; }
      applyImpulse(a, b, ra, rb, tangent - c.impulse.xyz);
      c.impulse = vec4f(tangent, accumulated);
    }
    manifolds[slot].points[i] = c;
  }
}
`;
