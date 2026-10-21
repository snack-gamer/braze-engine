import { largeHeaderWgsl } from "./rigid-large-shaders";
import { rigidContactSolverWgsl } from "../shaders/rigid-contact-solver";
import { rigidJointsWgsl } from "../shaders/rigid-joints";

export const largeSolveWgsl = largeHeaderWgsl + /* wgsl */`
@group(0) @binding(10) var<storage, read_write> outputVelocity: array<Velocity>;
var<private> bodyA: u32;
var<private> slotIndex: u32;
var<private> linear: array<vec3f, 2>;
var<private> angular: array<vec3f, 2>;
var<private> relaxation: f32;
fn pairIndex(a: u32, b: u32) -> u32 { return slotIndex; }
fn linearVelocity(body: u32) -> vec3f { return linear[select(1u, 0u, body == bodyA)]; }
fn angularVelocity(body: u32) -> vec3f { return angular[select(1u, 0u, body == bodyA)]; }
fn impulseRelaxation() -> f32 { return relaxation; }
fn applyBodyImpulse(body: u32, arm: vec3f, impulse: vec3f) {
  let slot = select(1u, 0u, body == bodyA);
  linear[slot] += properties[body].inertia.w * impulse;
  angular[slot] += worldInverseInertia(body, cross(arm, impulse));
}
fn applyAngularImpulse(body: u32, impulse: vec3f) {
  angular[select(1u, 0u, body == bodyA)] += worldInverseInertia(body, impulse);
}
fn degree(body: u32) -> f32 {
  if (body >= params.count) { return 1.0; }
  var count = f32(properties[body].collision.w);
  for (var slot = 0u; slot < NEIGHBORS; slot++) {
    if (manifolds[body * NEIGHBORS + slot].count > 0u) { count += 1.0; }
  }
  return max(1.0, count);
}
` + rigidContactSolverWgsl + rigidJointsWgsl + /* wgsl */`
@compute @workgroup_size(64)
fn forces(@builtin(global_invocation_id) id: vec3u) {
  let body = id.x; if (body >= params.count || atomicLoad(&status[0]) != 0u) { return; }
  var velocity = inputVelocity[body];
  if (properties[body].inertia.w > 0.0) {
    let h = params.timing.x / f32(params.substeps); let dynamics = properties[body].dynamics;
    let acceleration = dynamics.x * params.gravity.xyz + properties[body].inertia.w * properties[body].force.xyz;
    velocity.linear = vec4f((velocity.linear.xyz + h * acceleration) / (1.0 + h * dynamics.y), 0.0);
    velocity.angular = vec4f((velocity.angular.xyz + h * worldInverseInertia(body, properties[body].torque.xyz)) / (1.0 + h * dynamics.z), 0.0);
  }
  outputVelocity[body] = velocity;
}
@compute @workgroup_size(64)
fn solve(@builtin(global_invocation_id) id: vec3u) {
  let body = id.x; if (body >= params.count || atomicLoad(&status[0]) != 0u) { return; }
  let initial = inputVelocity[body]; var deltaLinear = vec3f(0.0); var deltaAngular = vec3f(0.0);
  let count = degree(body);
  for (var slot = 0u; slot < NEIGHBORS; slot++) {
    slotIndex = body * NEIGHBORS + slot;
    if (manifolds[slotIndex].count == 0u) { continue; }
    let neighbor = manifolds[slotIndex].pad0;
    bodyA = min(body, neighbor); let bodyB = max(body, neighbor);
    linear[0] = inputVelocity[bodyA].linear.xyz; angular[0] = inputVelocity[bodyA].angular.xyz;
    linear[1] = inputVelocity[bodyB].linear.xyz; angular[1] = inputVelocity[bodyB].angular.xyz;
    relaxation = 1.0 / max(count, degree(neighbor));
    if (stage.start == 0u) { warmStartPair(bodyA, bodyB); }
    else { solvePair(bodyA, bodyB, params.timing.x / f32(params.substeps), stage.start == 1u); }
    deltaLinear += linearVelocity(body) - initial.linear.xyz;
    deltaAngular += angularVelocity(body) - initial.angular.xyz;
  }
  if (stage.start != 0u) {
    let start = properties[body].collision.z; let joints = properties[body].collision.w;
    for (var i = 0u; i < joints; i++) {
      let neighbor = properties[start + i].collision.x; bodyA = body;
      linear[0] = initial.linear.xyz; angular[0] = initial.angular.xyz;
      linear[1] = vec3f(0.0); angular[1] = vec3f(0.0);
      if (neighbor < params.count) { linear[1] = inputVelocity[neighbor].linear.xyz; angular[1] = inputVelocity[neighbor].angular.xyz; }
      relaxation = 1.0 / max(count, degree(neighbor));
      solveJoint(body, start + i, params.timing.x / f32(params.substeps), stage.start == 1u);
      deltaLinear += linear[0] - initial.linear.xyz; deltaAngular += angular[0] - initial.angular.xyz;
    }
  }
  outputVelocity[body].linear = vec4f(initial.linear.xyz + deltaLinear, 0.0);
  outputVelocity[body].angular = vec4f(initial.angular.xyz + deltaAngular, 0.0);
}
@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) id: vec3u) {
  let body = id.x; if (body >= params.count || atomicLoad(&status[0]) != 0u || (properties[body].inertia.w == 0.0 && p[body].w >= 0.0)) { return; }
  let h = params.timing.x / f32(params.substeps); let velocity = inputVelocity[body];
  p[body] = vec4f(p[body].xyz + h * velocity.linear.xyz, p[body].w);
  q[body] = integrateRotation(q[body], velocity.angular.xyz, h);
}
`;
