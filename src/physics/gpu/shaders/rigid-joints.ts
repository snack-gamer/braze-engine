/** Velocity constraints share the contact schedule. World anchors use the uint32 sentinel. */
export const rigidJointsWgsl = /* wgsl */`
fn jointPosition(body: u32) -> vec3f { if (body >= params.count) { return vec3f(0.0); } return p[body].xyz; }
fn jointRotation(body: u32) -> vec4f { if (body >= params.count) { return vec4f(0.0, 0.0, 0.0, 1.0); } return q[body]; }
fn jointMass(body: u32) -> f32 { if (body >= params.count) { return 0.0; } return properties[body].inertia.w; }
fn jointLinear(body: u32) -> vec3f { if (body >= params.count) { return vec3f(0.0); } return linearVelocity(body); }
fn jointAngular(body: u32) -> vec3f { if (body >= params.count) { return vec3f(0.0); } return angularVelocity(body); }
fn jointLinearAxis(a: u32, b: u32, ra: vec3f, rb: vec3f, direction: vec3f, error: f32, h: f32, biased: bool) {
  let ca = cross(ra, direction); let cb = cross(rb, direction);
  let k = jointMass(a) + jointMass(b) + dot(ca, worldInverseInertia(a, ca)) + dot(cb, worldInverseInertia(b, cb));
  if (k < 1e-12) { return; }
  let relative = jointLinear(b) + cross(jointAngular(b), rb) - jointLinear(a) - cross(jointAngular(a), ra);
  let bias = select(0.0, clamp(0.2 * error / h, -10.0, 10.0), biased);
  let impulse = -impulseRelaxation() * (dot(relative, direction) + bias) / k * direction;
  applyBodyImpulse(a, ra, -impulse); if (b < params.count) { applyBodyImpulse(b, rb, impulse); }
}
fn jointAngularAxis(a: u32, b: u32, direction: vec3f, error: f32, h: f32, biased: bool) {
  let k = dot(direction, worldInverseInertia(a, direction) + worldInverseInertia(b, direction));
  if (k < 1e-12) { return; }
  let bias = select(0.0, clamp(0.2 * error / h, -5.0, 5.0), biased);
  let impulse = -impulseRelaxation() * (dot(jointAngular(b) - jointAngular(a), direction) + bias) / k * direction;
  applyAngularImpulse(a, -impulse); if (b < params.count) { applyAngularImpulse(b, impulse); }
}
fn multiplyRotation(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
fn solveJoint(a: u32, record: u32, h: f32, biased: bool) {
  let joint = properties[record]; let b = joint.collision.x;
  // A removed endpoint is an inactive zero-radius sphere, not a world anchor.
  if (properties[a].shape.w == 1.0 && properties[a].shape.x == 0.0) { return; }
  if (b < params.count) {
    if (properties[b].shape.w == 1.0 && properties[b].shape.x == 0.0) { return; }
  }
  let qa = jointRotation(a); let qb = jointRotation(b);
  let ra = rotate(qa, joint.shape.xyz); let rb = rotate(qb, joint.inertia.xyz);
  let error = jointPosition(b) + rb - jointPosition(a) - ra;
  let kind = u32(joint.inertia.w);
  if (kind == 0u && joint.shape.w > 1e-6) {
    let distance = length(error); var direction = vec3f(1.0, 0.0, 0.0);
    if (distance > 1e-6) { direction = error / distance; }
    jointLinearAxis(a, b, ra, rb, direction, distance - joint.shape.w, h, biased);
  } else {
    for (var axisIndex = 0u; axisIndex < 3u; axisIndex++) {
      var direction = vec3f(0.0); direction[axisIndex] = 1.0;
      jointLinearAxis(a, b, ra, rb, direction, error[axisIndex], h, biased);
    }
  }
  if (kind < 2u) { return; }
  let desired = multiplyRotation(qa, joint.dynamics);
  var delta = multiplyRotation(qb, vec4f(-desired.xyz, desired.w)); if (delta.w < 0.0) { delta = -delta; }
  let sine = length(delta.xyz); var rotationError = vec3f(0.0);
  if (sine > 1e-7) { rotationError = delta.xyz * (2.0 * atan2(sine, delta.w) / sine); }
  if (kind == 2u) {
    for (var axisIndex = 0u; axisIndex < 3u; axisIndex++) {
      var direction = vec3f(0.0); direction[axisIndex] = 1.0;
      jointAngularAxis(a, b, direction, rotationError[axisIndex], h, biased);
    }
  } else {
    let axisA = rotate(qa, joint.inertiaCross.xyz); let axisB = rotate(qb, joint.force.xyz);
    let reference = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(axisA.x) > 0.577);
    let t1 = normalize(cross(axisA, reference)); let t2 = cross(axisA, t1);
    let crossed = cross(axisA, axisB); let size = length(crossed); var alignment = vec3f(0.0);
    if (size > 1e-7) { alignment = crossed * (atan2(size, dot(axisA, axisB)) / size); }
    else if (dot(axisA, axisB) < 0.0) { alignment = t1 * 3.14159265; }
    jointAngularAxis(a, b, t1, dot(alignment, t1), h, biased);
    jointAngularAxis(a, b, t2, dot(alignment, t2), h, biased);
    if (joint.collision.z != 0u) {
      let angle = 2.0 * atan2(dot(delta.xyz, axisA), delta.w);
      let limitError = angle - clamp(angle, joint.inertiaCross.w, joint.force.w);
      if (abs(limitError) > 1e-5) { jointAngularAxis(a, b, axisA, limitError, h, biased); }
    }
  }
}
fn solveJointPair(a: u32, b: u32, h: f32, biased: bool) {
  let start = properties[a].collision.z; let count = properties[a].collision.w;
  for (var i = 0u; i < count; i++) { if (properties[start + i].collision.x == b) { solveJoint(a, start + i, h, biased); } }
}
`;
