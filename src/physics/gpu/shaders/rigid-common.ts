import { RIGID_LAYOUT as L } from "../rigid-layout";

export const rigidPropertiesWgsl = /* wgsl */`
struct Properties {
  shape: vec4f, // box half-extents or sphere radius in x; w: 0 box, 1 sphere
  inertia: vec4f, // inverse principal moments, inverse mass
  dynamics: vec4f, // gravity scale, linear damping, angular damping, friction
  inertiaCross: vec4f, // inverse inertia tensor xy, xz, yz; restitution
  collision: vec4u, // layer bit, mask, reserved, reserved
  force: vec4f, torque: vec4f, // xyz: persistent forces; force.w: opaque u32 body generation
}
`;
export const rigidTypesWgsl = rigidPropertiesWgsl + /* wgsl */`
struct Parameters {
  count: u32, paddedCount: u32, substeps: u32, sweeps: u32,
  gravity: vec4f,
  timing: vec4f, // fixed dt, contact hertz, damping ratio, penetration slop
}
struct Collider { owner: u32, position: vec3f, rotation: vec4f, shape: vec4f, friction: f32, restitution: f32, layer: u32, mask: u32, trigger: bool, triA: vec3f, triB: vec3f, triC: vec3f }
struct Velocity { linear: vec4f, angular: vec4f }
struct Contact { normal: vec4f, localA: vec4f, localB: vec4f, impulse: vec4f }
struct Manifold { count: u32, pad0: u32, pad1: u32, pad2: u32, generationA: u32, generationB: u32, pad3: u32, pad4: u32, points: array<Contact, ${L.contactsPerPair}> }
`;

export const rigidMathWgsl = /* wgsl */`
fn bodyGeneration(body: u32) -> u32 { return bitcast<u32>(properties[body].force.w); }
fn rotate(rotation: vec4f, vector: vec3f) -> vec3f {
  return vector + 2.0 * cross(rotation.xyz, cross(rotation.xyz, vector) + rotation.w * vector);
}
fn inverseRotate(rotation: vec4f, vector: vec3f) -> vec3f {
  return rotate(vec4f(-rotation.xyz, rotation.w), vector);
}
fn axis(rotation: vec4f, index: u32) -> vec3f {
  var basis = vec3f(0.0); basis[index] = 1.0; return rotate(rotation, basis);
}
fn worldInverseInertia(body: u32, value: vec3f) -> vec3f {
  if (body >= params.count) { return vec3f(0.0); }
  let local = inverseRotate(q[body], value); let crossTerms = properties[body].inertiaCross.xyz;
  return rotate(q[body], properties[body].inertia.xyz * local + vec3f(
    crossTerms.x * local.y + crossTerms.y * local.z,
    crossTerms.x * local.x + crossTerms.z * local.z,
    crossTerms.y * local.x + crossTerms.z * local.y));
}
fn collider(body: u32, child: u32) -> Collider {
  var result: Collider; result.owner = body; result.position = p[body].xyz;
  result.rotation = q[body]; result.shape = properties[body].shape; result.friction = properties[body].dynamics.w;
  result.restitution = properties[body].inertiaCross.w; result.layer = properties[body].collision.x; result.mask = properties[body].collision.y;
  if (result.shape.w == 4.0) {
    result.triA = result.position + rotate(result.rotation, properties[body].force.xyz);
    result.triB = result.position + rotate(result.rotation, properties[body].torque.xyz);
    result.triC = result.position + rotate(result.rotation, properties[body].dynamics.xyz);
  }
  if (result.shape.w == 3.0) {
    let part = properties[u32(result.shape.x) + child]; let r = part.dynamics;
    result.shape = part.shape; result.friction = part.inertia.w;
    result.restitution = part.inertiaCross.w; result.layer = part.collision.x; result.mask = part.collision.y;
    result.position += rotate(q[body], part.inertia.xyz);
    result.rotation = vec4f(q[body].w * r.xyz + r.w * q[body].xyz + cross(q[body].xyz, r.xyz), q[body].w * r.w - dot(q[body].xyz, r.xyz));
  }
  result.trigger = result.restitution < 0.0;
  if (result.trigger) { result.restitution = -1.0 - result.restitution; }
  return result;
}
fn surfaceContact(a: Collider, b: Collider, normal: vec3f, pointA: vec3f, pointB: vec3f) -> Contact {
  var c: Contact;
  c.normal = vec4f(normal, sqrt(a.friction * b.friction));
  if (a.trigger || b.trigger) { c.normal.w = -1.0 - c.normal.w; }
  c.localA = vec4f(inverseRotate(q[a.owner], pointA - p[a.owner].xyz), max(a.restitution, b.restitution));
  c.localB = vec4f(inverseRotate(q[b.owner], pointB - p[b.owner].xyz), 0.0);
  return c;
}
fn finalizeContact(a: u32, b: u32, source: Contact, old: Contact, matched: bool) -> Contact {
  if (source.normal.w < 0.0) { var sensor = source; sensor.localA.w = 0.0; sensor.localB.w = 0.0; return sensor; }
  var c = source; let ra = rotate(q[a], c.localA.xyz); let rb = rotate(q[b], c.localB.xyz);
  let relative = collisionLinearVelocity(b) + cross(collisionAngularVelocity(b), rb)
    - collisionLinearVelocity(a) - cross(collisionAngularVelocity(a), ra);
  var incoming = dot(relative, c.normal.xyz);
  // Remember an approach stopped by speculation, until the surfaces actually meet.
  if (matched && old.localA.w == 0.0 && incoming <= 0.01) { incoming = min(incoming, old.localB.w); }
  let separation = dot(p[b].xyz + rb - p[a].xyz - ra, c.normal.xyz);
  var bounce = 0.0;
  if (incoming < -1.0 && separation <= 0.002) { bounce = -c.localA.w * incoming; }
  c.localA.w = bounce; c.localB.w = incoming;
  return c;
}
fn integrateRotation(rotation: vec4f, spin: vec3f, h: f32) -> vec4f {
  let speed = length(spin); if (speed < 1e-8) { return rotation; }
  let halfAngle = 0.5 * h * speed; let xyz = spin * (sin(halfAngle) / speed); let scalar = cos(halfAngle);
  return normalize(vec4f(scalar * rotation.xyz + rotation.w * xyz + cross(xyz, rotation.xyz), scalar * rotation.w - dot(xyz, rotation.xyz)));
}
fn bodyRadius(body: u32) -> f32 {
  let shape = properties[body].shape;
  if (shape.w > 2.5) { return shape.z; }
  if (shape.w > 0.5) { return shape.x + shape.y; }
  return length(shape.xyz);
}
fn motionMargin(a: u32, b: u32) -> f32 {
  let h = params.timing.x / f32(params.substeps);
  return 0.02 + h * (length(collisionLinearVelocity(b) - collisionLinearVelocity(a))
    + length(collisionAngularVelocity(a)) * bodyRadius(a) + length(collisionAngularVelocity(b)) * bodyRadius(b));
}
fn sweptExtent(body: u32, extent: vec3f) -> vec3f {
  let h = params.timing.x / f32(params.substeps);
  return extent + abs(collisionLinearVelocity(body)) * h + vec3f(length(collisionAngularVelocity(body)) * bodyRadius(body) * h);
}
fn positiveSign(value: f32) -> f32 { return select(-1.0, 1.0, value >= 0.0); }
`;

/** Small-world storage and velocity access. Large worlds reuse the geometry math. */
export const rigidCommonWgsl = rigidTypesWgsl + /* wgsl */`
@group(0) @binding(0) var<uniform> params: Parameters;
@group(0) @binding(1) var<storage, read> properties: array<Properties>;
@group(0) @binding(2) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> orientations: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> velocities: array<Velocity>;
@group(0) @binding(5) var<storage, read_write> manifolds: array<Manifold>;
@group(0) @binding(6) var<storage, read_write> status: array<atomic<u32>>;
var<workgroup> p: array<vec4f, ${L.smallWorldThreshold}>;
var<workgroup> q: array<vec4f, ${L.smallWorldThreshold}>;
var<workgroup> v: array<vec4f, ${L.smallWorldThreshold}>;
var<workgroup> w: array<vec4f, ${L.smallWorldThreshold}>;

fn pairIndex(a: u32, b: u32) -> u32 {
  return a * (2u * params.count - a - 1u) / 2u + b - a - 1u;
}
fn collisionLinearVelocity(body: u32) -> vec3f { return v[body].xyz; }
fn collisionAngularVelocity(body: u32) -> vec3f { return w[body].xyz; }
fn linearVelocity(body: u32) -> vec3f { return v[body].xyz; }
fn angularVelocity(body: u32) -> vec3f { return w[body].xyz; }
fn impulseRelaxation() -> f32 { return 1.0; }
fn applyBodyImpulse(body: u32, arm: vec3f, impulse: vec3f) {
  v[body] = vec4f(v[body].xyz + properties[body].inertia.w * impulse, 0.0);
  w[body] = vec4f(w[body].xyz + worldInverseInertia(body, cross(arm, impulse)), 0.0);
}
fn applyAngularImpulse(body: u32, impulse: vec3f) { w[body] = vec4f(w[body].xyz + worldInverseInertia(body, impulse), 0.0); }
` + rigidMathWgsl;
