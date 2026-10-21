import { RIGID_LAYOUT as L } from "../rigid-layout";

/**
 * Small-world path: one workgroup, closed-form round-robin pair batches.
 * Each round owns each body at most once, including statics. Uniform barriers
 * separate rounds. This is deliberately bounded; large-world BVH/islands are
 * a later path, not a body-count-dependent CPU dispatch loop.
 */
export const rigidStepWgsl = /* wgsl */`
fn pairForRound(lane: u32, round: u32) -> vec2u {
  let ring = params.paddedCount - 1u;
  var a = params.paddedCount - 1u; var b = round;
  if (lane > 0u) { a = (round + lane) % ring; b = (round + ring - lane) % ring; }
  return vec2u(min(a, b), max(a, b));
}
fn applyForces(body: u32, h: f32) {
  if (properties[body].inertia.w == 0.0) { return; }
  let dynamics = properties[body].dynamics;
  let acceleration = dynamics.x * params.gravity.xyz + properties[body].inertia.w * properties[body].force.xyz;
  v[body] = vec4f((v[body].xyz + h * acceleration) / (1.0 + h * dynamics.y), 0.0);
  w[body] = vec4f((w[body].xyz + h * worldInverseInertia(body, properties[body].torque.xyz)) / (1.0 + h * dynamics.z), 0.0);
}
fn integrate(body: u32, h: f32) {
  if (properties[body].inertia.w == 0.0 && p[body].w >= 0.0) { return; }
  p[body] = vec4f(p[body].xyz + h * v[body].xyz, p[body].w);
  q[body] = integrateRotation(q[body], w[body].xyz, h);
}
@compute @workgroup_size(${L.workgroupSize})
fn step(@builtin(local_invocation_index) lane: u32) {
  if (lane == 0u) { atomicAdd(&status[3], 1u); }
  if (lane < params.count) {
    p[lane] = positions[lane]; q[lane] = orientations[lane];
    v[lane] = velocities[lane].linear; w[lane] = velocities[lane].angular;
  }
  storageBarrier(); workgroupBarrier();
  let h = params.timing.x / f32(params.substeps);
  for (var substep = 0u; substep < params.substeps; substep++) {
    if (lane < params.count) { applyForces(lane, h); }
    // Speculative margins read both bodies' velocities; all force writes must finish first.
    workgroupBarrier();
    if (lane < params.count) {
      for (var other = lane + 1u; other < params.count; other++) { generateManifold(lane, other); }
    }
    storageBarrier(); workgroupBarrier();
    for (var round = 0u; round < params.paddedCount - 1u; round++) {
      if (lane < params.paddedCount / 2u) {
        let pair = pairForRound(lane, round);
        if (pair.y < params.count) { warmStartPair(pair.x, pair.y); }
      }
      workgroupBarrier();
    }
    for (var sweep = 0u; sweep < params.sweeps; sweep++) {
      for (var round = 0u; round < params.paddedCount - 1u; round++) {
        let order = select(round, params.paddedCount - 2u - round, (sweep & 1u) != 0u);
        if (lane < params.paddedCount / 2u) {
          let pair = pairForRound(lane, order);
          if (pair.y < params.count) { solvePair(pair.x, pair.y, h, true); solveJointPair(pair.x, pair.y, h, true); }
        }
        storageBarrier(); workgroupBarrier();
      }
      if (lane < params.count) { solveJointPair(lane, 0xffffffffu, h, true); }
      workgroupBarrier();
    }
    if (lane < params.count) { integrate(lane, h); }
    workgroupBarrier();
    for (var sweep = 0u; sweep < ${L.relaxationSweeps}u; sweep++) {
      for (var round = 0u; round < params.paddedCount - 1u; round++) {
        if (lane < params.paddedCount / 2u) {
          let pair = pairForRound(lane, round);
          if (pair.y < params.count) { solvePair(pair.x, pair.y, h, false); solveJointPair(pair.x, pair.y, h, false); }
        }
        storageBarrier(); workgroupBarrier();
      }
      if (lane < params.count) { solveJointPair(lane, 0xffffffffu, h, false); }
      workgroupBarrier();
    }
  }
  if (lane < params.count) {
    positions[lane] = p[lane]; orientations[lane] = q[lane];
    velocities[lane].linear = v[lane]; velocities[lane].angular = w[lane];
  }
}
`;
