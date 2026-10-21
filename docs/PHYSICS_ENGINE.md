# Braze Physics Engine

Status: GPU impulse physics with a spatial large-world path; 10,000 active bodies and small/large contact scenes pass browser regression tests. Hardware frame-time budgets remain unmeasured.

This guide owns supported physics and the explicitly planned technical targets
below. [STATUS.md](./STATUS.md) owns prioritization and current evidence.

## Current implementation

The rigid solver uses Box2D-inspired substepped soft impulses in 3D WGSL. It is
an independent solver, not a Box2D library integration or a complete 3D engine.
Normal Play Mode uses it directly. No URL parameter, backend selector, or legacy
fallback remains.

| Capability | Current state |
| --- | --- |
| Shared world | One simulation per shared device session, consumed by Scene and Game views. |
| Timing/lifecycle | Fixed ticks, bounded catch-up, Pause/Step, GPU poses, Stop restoration and owned resource retirement. |
| Shapes | Spheres, oriented boxes, capsules and baked static triangle surfaces; static Collider-only objects, dynamic and kinematic Rigidbodies. |
| Dynamics | Full compound inertia tensors, gravity, damping, friction, restitution and persistent world-space force/torque commands. |
| Compounds | Multiple primitive colliders share one dynamic/kinematic pose, center of mass and inertia tensor. Child meshes retain their authored transforms. |
| Characters | Upright capsule displacement motor with wall sliding, slope limits, stairs, ground snapping and overlap recovery against static geometry. Root motion and live commands share it; gameplay supplies gravity/jump displacement. |
| Joints | Distance, ball socket, fixed and hinge constraints; world/body anchors, hinge angle limits and connected collision control. GPU chain tests pass both schedules. |
| Ragdolls | Primitive 11-body/10-joint assembly survives a perturbed fall on both schedules. Skeletal animation handoff remains pending. |
| Filtering/events | Reciprocal 32-layer masks, triggers and collision/trigger enter/exit transitions buffered on GPU; explicit on-demand event polling reports overflow. |
| Solver schedule | Four substeps. Small worlds use sequential pair batches; larger worlds use twelve relaxed Jacobi sweeps plus two relaxation sweeps. |
| Capacity | No fixed scene body ceiling. At most 64 bodies use the small-workgroup optimization; larger scenes use spatial lookup and parallel solving, within device buffer/dispatch limits. |
| Runtime commands | Sparse linear/angular impulses, velocity and persistent force changes; kinematic pose targets advance over one fixed tick, then stop. |
| Queries | Immediate CPU raycasts, sphere casts and capsule casts against a cold-built static BVH; moving GPU bodies are explicitly excluded. |
| Fast motion | Velocity-expanded broadphase and speculative contacts. A 1,000 m/s sphere versus a 5 cm wall passes both schedules. This is not a complete swept time-of-impact solver. |
| Unsupported | Torus/dynamic-convex collision, interpolation, sleeping, dynamic spatial queries, moving-platform character attachment, joint motors/breaking, skinned ragdoll handoff and soft bodies. |
| Editing | Authored changes rebuild the world. Opt-in runtime dynamic box/sphere slots support sparse insertion/removal without rebuilding or resetting other bodies; broader topology edits remain pending. |

Unsupported shapes and interpolation produce initialization diagnostics. Characters
use a single world-upright capsule and static sweeps; generic kinematic targets
remain unconstrained. Character commands return the constrained command pose,
not a readback of GPU simulation. Dynamic props react to character targets, but
moving platforms/dynamic obstruction are not part of the CPU character sweep.

The user requested the full milestone: 10,000+ rigid bodies, character movement,
compounds, joints, triggers/events, mesh collision and ragdolls. Completion of
one row does not imply full Unity/PhysX parity. Remaining feature work and
hardware performance acceptance must stay explicit.

The solver regenerates collision manifolds on every substep. Reusing local
contact anchors across substeps, as specified by the target contract, remains an
implementation gap. Large worlds build a balanced spatial tree once during scene
compilation and refit its bounds on the GPU every substep. Tree topology stays
valid under motion but can become inefficient when bodies mix across the initial
spatial partition; adaptive GPU rebuilding and islands remain future work.

Large-world contact storage is linear in body count: two banks reserve sixteen
neighbor manifolds per body, each with up to eight contact points. A dense overlap
that exceeds the reservation freezes simulation on the GPU and reports a bounded
asynchronous capacity error. It never silently drops contacts. Allocation fails
before simulation if storage/binding/dispatch limits are insufficient. These
resource checks remain intentional; removing the old body ceiling does not mean
unlimited memory or unbounded contact density.

The 10,000-body test runs gravity and floor contacts for 90 fixed ticks. Separate
large-path tests cover a dynamic box stack, sphere drop and rotated-box contacts.
This proves these workloads, not 60 FPS, dense 10k piles or 100k-body simulation.

## Supported persistence

Only current Rigidbody, Collider and world-settings fields are accepted. Retired
solver readers, migration payloads, settings and tests have been removed. Current
project physics data uses this format; historical backup files are not source.

## Validation

Automated regression coverage exercises compilation, backend
preparation, actual WebGPU free fall and sphere/box contacts, plus Play transport
and editor boundaries. Readback in the standalone browser fixture is test-only;
production stepping and presentation remain GPU resident.

Run architecture, TypeScript, unit/server tests, build/bundle budgets, soak and
relevant browser specs before handoff, as required by repository instructions.
User visual acceptance and hardware timings are separate from automated checks.

## Live editor verification

The versioned automation API now targets an explicit open browser session. Agent
edits use editor object history, selection/camera controls and normal persistence.
Play/Pause/Step/Stop and bounded physics diagnostics are available without pose
readback. A persistent visible browser at port 5179 was used to build and run the
Physics Playground, launch a sphere, raise a kinematic platform with a dynamic
rider, and query the authored static platform height. The original scene objects
were retained. See [AI_GAME_DEVELOPER.md](./AI_GAME_DEVELOPER.md).

## Event and joint contracts

`editor.events` drains a GPU transition buffer on demand. Events identify body
pairs and fixed-tick numbers; enter/exit can both occur between polls. There is
no automatic pose readback or CPU body scan. Capacity is 1,024–65,536 events per
world; overflow reports the dropped count and does not freeze the solver.
Compound events aggregate their child colliders by owner pair. Static mesh
triangles expose separate `aColliderId`/`bColliderId` proxy identifiers; object IDs
can recur across their contacts. Consumers aggregate at object level if needed.

Joints keep authored references through duplication, prefab instantiation and
reimport. Anchors use object-local metres; an unconnected anchor uses world
metres. Automatic anchors/rest lengths resolve at world creation. Hinge limits
use authored degrees relative to the initial pose. Motors, break thresholds,
cone limits and skinned bone handoff are not implemented yet.


## Static mesh contract

`editor.mesh` captures object-local render triangles in Edit Mode. Apply its
geometry to a mesh collider, or use the Inspector's Bake Object Mesh button. The
snapshot persists through normal scene/prefab codecs; source changes require
explicit re-baking. Skinned/instanced capture is rejected. Degenerate triangles
are skipped; invalid indices, empty geometry and moving concave meshes fail
before world creation. No bounding-box fallback is used.

Static triangles use the scene's existing GPU spatial tree as independent proxies,
so holes/concavity remain open. These proxies count toward storage capacity and
local contact-density limits. Narrow phase supports clipped box/triangle SAT and
sphere/capsule distance contacts; CPU static BVH queries use the same authored
surfaces. Triangle surfaces are double-sided, not closed solid volumes. Dense
triangle tessellation and internal seam smoothing need further performance and
robustness work. Mesh scale has not been accepted against production level assets.

The visible playground now includes the character stair course, compound dumbbell,
limited hinge pendulum, primitive ragdoll and a baked wall. Source scene objects
were preserved. The skill's ragdoll command batch is exercised by GPU browser tests.

## Planned solver and scale contract

Everything in this section is a design target unless the current-capability table
above explicitly marks it implemented. Acceptance must use agent-built games and
manual workflows as well as numeric/GPU fixtures. No single game requirement gates
general engine work.

### Solver decisions

**Rigid bodies:** engine-owned GPU substepped impulses with soft contact
constraints, persistent manifolds, warm starting, Coulomb friction, restitution,
and velocity relaxation. Start with four solver substeps per fixed tick. This
is the Soft Step/TGS family. The numerical starting point is
[Catto's Solver2D description](https://box2d.org/posts/2024/02/solver2d/);
its examples inform the method but do not prove our 3D GPU performance.

**Soft bodies:** GPU XPBD constraints for cloth stretch/bend, rope stretch/bend,
and tetrahedral deformable strain/volume. Compliance describes the material;
iterations control solve quality. [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf)
provides the compliant constraint formulation; finite iteration error still
needs validation. Capacity is measured in particles and constraints, not just
authored objects.

**Coupling:** both solvers share a world, collision infrastructure, materials,
and substep timeline. Coupling constraints apply matching linear reactions and
the corresponding rigid-body torque within each substep. Each contact has one
response owner. A deformable pushing a free rigid body must work in both
directions; visual overlap prevention alone does not pass.

The impulse path is the rigid contact/joint foundation; XPBD is the deformation
foundation. Articulations also require a reduced-coordinate tree solver coupled
to contacts. Its detailed algorithm is a mission 5 prerequisite; loose joints
alone do not complete that goal.

Use portable WGSL on the existing shared WebGPU device. No CUDA dependency or
CPU simulation fallback. [PhysX GPU simulation requires CUDA](https://nvidia-omniverse.github.io/PhysX/physx/5.7.0/docs/GPURigidBodies.html),
so importing it does not fulfill this engine's portability contract. Baseline
kernels use f32 and integer atomics, with no subgroup-size assumption;
[portable WGSL atomics](https://www.w3.org/TR/WGSL/#atomic-types) are integer types.
Optional optimizations must retain an equivalent baseline path.

### Ownership and data

| Boundary | Responsibility |
| --- | --- |
| `physics/domain`, `physics/serialization` | Backend-neutral components, units, settings, validation and versioned migrations. |
| `physics/authoring` | Changed-object compilation, collider cooking, mass properties, parent/local conversion. |
| `physics/runtime` | World lifecycle, handles, command/query/event contracts, fixed stepping and diagnostics. Public ports expose no Three/React/GPU objects. |
| `physics/gpu` | Packed buffers, collision stages, rigid/soft solving, GPU encoding and resource lifetime; separate modules by responsibility. |
| Rendering/editor adapters | GPU pose/deformation bindings, interpolation, instancing, picking and selected-object inspection. |

One world owns a body; Scene and Game consume that same world. Independent
worlds are explicit. Keep the shared engine loop, admission governor and
retirement signal. No second clock, per-pass fence, frame-loop compilation,
whole-scene traversal, CPU pose mirroring, or awaited GPU results.

Handles contain world generation, slot and slot generation. Compact GPU indices
remain private. Removed handles cannot address replacements; delayed commands
and results carry their original generation. A compound is one body with local
collider shapes and combined mass/inertia, not several constrained bodies.

Use meters, kilograms, seconds, right-handed Y-up coordinates, XYZW unit
quaternions and radians. Preserve authored gravity (current default `[0,-10,0]`).
Bake supported scale into colliders; diagnose shear/unsupported scaling. Keep
center of mass separate from object origin. Simulation and rendering use the same Y-up coordinates. Static bodies have colliders without a dynamic/kinematic Rigidbody.

Own reusable structure-of-arrays storage, lookup tables, scratch capacity and
previous/current committed poses. Rendering consumes these GPU buffers directly;
interpolation does not alter simulation state. CPU work scales with changes and
requested output, not total bodies. Stop invalidates the generation, restores
authored presentation and retires resources after admitted work. Device loss
reports a structured failure; it cannot write runtime poses into saved content.

### Stepping and collision

- Default fixed tick: **1/60 s**, with **four internal solver substeps**. Default
  maximum: **two catch-up ticks per admitted frame**. Distinguish these settings;
  migrate explicit project timing values. Clamp long gaps and report discarded
  backlog instead of silently changing the tick size.
- Apply time scale once at the accumulator. Pause accumulates no backlog; Step
  executes one outer tick. Admission rejection consumes neither tick nor command.
  Publish the pose pair and interpolation fraction consistently to every view.
- Tick flow: stage commands, predict swept bounds, find pairs, prepare persistent
  contacts/constraints, solve/integrate substeps, finalize outputs, then commit.
  Reuse local contact anchors while valid. Bounds include translation/rotation;
  motion or correction beyond them requires collision refresh. Substeps are not CCD.
- Use a GPU Morton-sorted linear BVH for moving colliders and a separate static
  hierarchy. Rebuild/refit on GPU; static mesh cooking changes with assets.
  [Karras's parallel BVH construction](https://research.nvidia.com/publication/2012-06_maximizing-parallelism-construction-bvhs-octrees-and-k-d-trees)
  is the starting reference. A global grid cell size is not a public requirement.
- Narrow phase starts with sphere/box/capsule pairs and box face clipping; later
  add convex GJK/EPA with persistent manifolds, static triangles and terrain.
  Broad-phase overlap alone is never a contact.
- GPU islands connect awake bodies through contacts/joints; static bodies cannot
  join unrelated islands. Sleep/wake propagates through affected islands.
  Kinematic targets derive contact velocity; teleport separately invalidates
  contact history.
- Small independent islands use a fused workgroup path when resources fit.
  Large islands use conflict-free constraint batches. GPU validation proves
  write ownership; a fixed number of coloring attempts is insufficient.
  Unassigned constraints use bounded Jacobi contributions and reduction,
  never conflicting writes or omission. Report this path's workload share and
  require the same contact-quality gates.
- Reuse valid scheduling and compact active work. CPU dispatch loops cannot
  scale with body count. Indirect dispatch still incurs command overhead: record
  dispatch count and validate both tiny and large scenes before accepting the
  scheduling design. Empty indirect dispatches are not treated as free.

### Gameplay APIs and output

Batch commands for body/collider creation, removal, enabling, parameters,
force/torque/impulse, velocity, kinematic targets, teleport and sleep/wake.
Commands submitted before tick admission apply at its start in submission order.
Force/torque acts for that tick; persistent forces use explicit controllers or
fields. An impulse applies once. Forces do not move static/kinematic bodies.
Invalid handles produce structured rejection.

Queries support nearest/any/all ray hits, overlaps and shape sweeps, with layers,
trigger selection and exclusions. Results carry world generation, request ID,
sampled tick, body/collider handles and hit details. CPU results are asynchronous
snapshots of committed state; GPU controllers may consume in-simulation queries
without readback. Synchronous CPU access to current GPU state is not promised:
Unity capability parity does not imply identical API timing.

Events are explicitly subscribed, collider-pair based enter/stay/exit streams;
stay is opt-in. Evaluate once per outer tick. Contact state uses the last
substep's contact set with aggregate tick impulses; triggers sample final tick
overlap. Swept trigger crossings are a separate mode implemented with CCD.
Exit reports separation, disable, removal or filter change. A removed handle
identifies its former body but cannot be dereferenced. Stop closes the stream
with a reset marker rather than flooding exits.

Deliver in tick order with stable pair ordering and sequence numbers. Callbacks
can only affect subsequent unadmitted ticks. Cross-GPU bit-identical floating
point results are not promised. Explicit subscriptions/queries are standing
output demand: copy only requested compact records into a reusable staging ring,
then map/deliver asynchronously outside the frame callback. No demand means no
gameplay readback. Target delivery within two display frames under the accepted
workload, exposing actual latency; no same-frame result or frame-loop wait.

### Capacity and failure

Reserve body, collider, pair, contact, constraint, query and event capacities
explicitly. Excess query requests return `busy`; bounded all-hit results expose
`truncated`. Physical contacts and event transitions cannot be silently dropped.
Coalesce opt-in stay records before using space reserved for transitions.

Stage ticks against the last committed state. Pair/contact/constraint overflow
or a full transition queue latches a GPU fault and withholds that tick's commit;
subsequent queued work respects the latch. Rendering retains valid poses. Report
required/available capacity asynchronously. Grow at a safe resource boundary
within the memory ceiling, then retry without losing or duplicating commands.
If growth cannot fit, pause the world with an actionable diagnostic. Never
publish a partially solved world. Generation checks protect replaced buffers
and pending readback. This explicit overload path does not await JS in stepping.

### Performance acceptance

The engine remains portable within its core WebGPU capability profile. The
user's **current machine** is the first acceptance machine. Record exposed
adapter limits, browser/build and engine revision alongside measurements.
Validate allocation/binding sizes against device limits before Play. No
brand-specific algorithm; portability does not imply identical throughput.

These are initial engineering targets, **not measured results**. Changing them
requires a documented decision and new evidence.

| Budget | Target on the acceptance machine |
| --- | --- |
| Presentation | 60 FPS, p95 total frame work within 16.67 ms, using simple instanced benchmark rendering. Record one-view and two-view results separately. |
| 100k active rigid physics | p95 GPU time <=6 ms per 1/60 s tick, including collision and all four solver substeps. |
| Physics CPU submission | p95 <=0.5 ms/tick for unchanged worlds; explicitly requested JS event consumers reported separately. |
| Small scene | p95 physics GPU time <=0.5 ms for 2–100 bodies; report command count. |
| Rigid GPU memory | <=512 MiB, including scratch, caches, snapshots and outputs. Rendering assets excluded and separately reported. Device allocation/binding limits still apply. |
| Output envelope | 4,096 event records, 256 query requests and 4,096 total query hits per tick; queued output room for eight ticks. Validate latency and overload. |
| Soft baseline | 100,000 particles / 500,000 internal constraints. Mixed workload below shares the 6 ms physics target with a 768 MiB total physics ceiling. |

Fixtures use fixed seeds and saved parameters. Record actual awake bodies,
collider pairs, contact points, constraints and output volume. After warm-up,
capture >=30 seconds of p50/p95/p99, memory, backlog and overflow. GPU timestamps
are opt-in diagnostics; without them mark GPU-time acceptance unverified rather
than infer it from FPS. These runs belong to final validation, not this design step.

| Workload | Required measurement |
| --- | --- |
| 100k active rigid | 100,000 awake dynamic primitives, sleeping disabled, sustained gravity/forces and collisions, >=25k simultaneous contact pairs during measurement. Envelope: 1M candidate pairs / 400k contact points. Unconstrained particles alone do not pass. |
| Dense contacts | 10k boxes in piles/stacks, sleeping disabled during timing, <=400k contact points. Measure penetration/jitter too. |
| Sleep/wake | 100k registered bodies; report awake count separately. Settle islands, wake a connected pile, and edit locally without rebuilding unrelated bodies. |
| Gameplay | 100k rigid scene with subscriptions/queries through the output envelope; correct timing, handles and ordering, plus an explicit overflow exercise. |
| CCD | 1,000 small fast bodies moving more than a diameter per tick through thin-obstacle scenes, including rotation and kinematic interaction; no tunneling in the fixture's declared speed/size range. |
| Mixed rigid/soft | 10k rigid + 100k particles + 500k internal constraints + up to 100k coupling/self-contact constraints. Cloth, rope and volumes measured separately and together. |

100k means the declared active rigid workload, not arbitrary all-to-all contact
or 100k complex deformable meshes. Smaller devices retain the API and report
capacity/timing limits; never silently reduce correctness to achieve a count.

### Capability and reliability gates

Use [Unity built-in 3D physics](https://docs.unity.com/en-us/engine/6000.6/manual/physics-section/physics-overview)
as the capability reference. Every replacement row starts **planned**, then moves
to **implemented** and **validated** with evidence. Historical sphere behavior
does not validate the new solver. Feature fixtures must record geometry, seed,
observation method and numerical tolerances before declaring acceptance.

| Gate | Required outcome/evidence |
| --- | --- |
| Foundation | Static/dynamic/kinematic, mass/inertia, gravity/forces/torques/impulses, damping, native compounds and interpolation. Matching views, pane reopen, Pause/Step, Stop/replay. |
| Collision | Primitive/convex/compound/static mesh/terrain; layers, per-pair ignore, friction/restitution and explicit material combine rules. Correct rotated/scaled and parented authoring. |
| Stability | Meter-scale 10-box stack upright for 60 s; settled penetration <5 mm and jitter <2 mm, including mass ratios through 100:1. No NaNs/runaway energy; isolated restitution/friction reference cases. |
| Gameplay | Contact/trigger lifecycle, ray/overlap/sweep queries, sleeping/waking, CCD; bounded delivery and stale-handle rejection. Removal/filter changes leave no stuck trigger. |
| Joints/articulations | Fixed, hinge, distance/spring, configurable six-axis limits/motors/breakage; ragdolls and reduced-coordinate articulation chains under contact load. |
| Characters/vehicles | Grounding, slopes/steps, platforms, root motion; wheel ray/sweep contact, suspension, steering, braking and traction, each with a live acceptance scene. |
| Soft bodies | Cloth, ropes, deformable volumes, self-collision and two-way coupling; measured strain/volume error and capacity. Volumes extend the built-in 3D reference. |
| Editor/lifecycle | Collider/joint tools, accurate GPU-pose selection, versioned persistence, undo/redo, multiple worlds, clean Stop/device-loss/disposal, bounded repeated-session memory. |
| Timing/scale | Matching fixed-tick behavior across render cadences; applicable budgets above without hidden backlog/overflow. Cross-device correctness when another device is available. |

### Current implementation

Small scenes use one workgroup with reserved pair slots and round-robin body
ownership. Above 64 bodies, a balanced spatial tree is uploaded at world creation
and refit on the GPU. Per-body contact banks and relaxed Jacobi impulse passes
avoid conflicting velocity writes. Scene body count is checked against actual
device storage/dispatch limits, not a fixed scene cap.

Sixteen neighbor manifolds per body are reserved in each large-world contact
bank. GPU overflow halts integration and emits a bounded asynchronous diagnostic.
GPU topology rebuilding, islands and contact-anchor reuse remain pending. The
10,000-body floor-contact regression validates active solving; it does not
establish real-hardware frame-time budgets or dense pile capacity.

Only current physics persistence remains. See [PHYSICS_ENGINE.md](./PHYSICS_ENGINE.md)
for supported features and gameplay-first ordering. The capability and scale
tables above remain targets; 100k bodies and soft simulation remain stretch work.

## Agent physics authoring recipe


Discover current capabilities and consult `docs/PHYSICS_ENGINE.md` for limitations.
Colliders support boxes, spheres, capsules and static triangle meshes; moving
compound bodies use primitive children. Joints support distance, ball, fixed and
hinge constraints. Ragdolls can be built from those primitives and joints; animation
handoff to skinned bones is unfinished.

## Mesh baking

In Edit Mode, call `editor.mesh` with `objectId`. It captures loaded render triangles
in object-local coordinates without mutating the scene. Preview/apply a
`component.set` for `collider` with `shape: "mesh"`, the returned `geometry`, and
`center: [0,0,0]`. Meshes must be static. The Inspector's **Bake Object Mesh** button
uses the same capture path. Re-bake after source geometry changes. Baked collision
geometry is an explicit authored snapshot, saved with the collider.

For existing colliders always pass their `id`; omitting it adds a new collider.
Mesh triangles have separate spatial proxies and event collider IDs. Use event
`aColliderId`/`bColliderId` to distinguish them; object IDs can recur in a batch.
Events are transitions drained by `editor.events`, not continuous contact reports.
Check `dropped` when polling infrequently; no CPU pose mirror is maintained.

## Jointed ragdoll recipe

[../skills/braze-game-developer/examples/jointed-ragdoll.json](../skills/braze-game-developer/examples/jointed-ragdoll.json) is a tested
11-body, 10-joint command batch with child render meshes. Create its objects and
components atomically. Change IDs and references together to create additional
instances. Its transform root is at `[25,1.5,-8]`; place a floor below it or move
the root to your scene. Use a torso impulse to unbalance the initially symmetric
standing pose. Both GPU schedules are tested for fall stability and anchor error.
The recipe uses world metres and capsule Y axes. Joint anchors use object-local
coordinates; omitted connected anchors match the authored world anchor. Hinge
limits are degrees relative to the initial pose. Avoid scaling dynamic roots
when explicit collider dimensions and anchors already describe the desired size.

Character displacement commands include static stair/slope/wall constraints.
Gravity/jump displacement remains gameplay-owned; sending only horizontal moves
after walking off a ledge does not implement falling. Dynamic props respond to
kinematic characters, but the character sweep does not query moving GPU bodies.
