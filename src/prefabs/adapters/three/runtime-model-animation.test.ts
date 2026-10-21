import { afterEach, expect, it, vi, type MockInstance } from "vitest";
import { Bone, BoxGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from "three";
import { createAssetCache } from "../../../three/assets";
import { createEmptyCharacterAssetLibrary } from "../../../character/domain/character-asset-library";
import { createDefaultAnimatorComponent } from "../../../character/domain/animator-component";
import { animatorWorldForSession } from "../../../character/adapters/three/shared-animator-world";
import { createThreeAnimatorPlaybackAssetResolver, type ThreeAnimatorPlaybackAssetResolver } from "../../../character/adapters/three/three-animator-playback-resolver";
import type { ThreeAnimatorWorldRig } from "../../../character/adapters/three/three-animator-world-assets";
import type { BrowserThreeWebGpuRenderSession } from "../../../rendering/adapters/browser-three-webgpu-session";
import { normalizeImmutableModelImportSettings } from "../../../lib/model-import-settings";
import { captureRuntimeModel } from "../../../world/domain/runtime-model";
import type { RuntimePrefabResourceCatalog } from "../runtime-prefab-resource-catalog";
import type { RuntimeModelRecord } from "./runtime-model-views";
import { createRuntimeModelAnimation } from "./runtime-model-animation";
import { physicsWorldForSession } from "../../../three/physics/shared-physics-world";
import { captureRuntimeCharacter } from "../../../character-controller/domain/runtime-character";
import type { RuntimeAnimatorCreation } from "../../../character/adapters/three/three-animator-runtime-contracts";

vi.mock("../../../three/assets", () => ({ createAssetCache: vi.fn() }));
vi.mock("../../../character/adapters/three/shared-animator-world", () => ({ animatorWorldForSession: vi.fn() }));
vi.mock("../../../character/adapters/three/three-animator-playback-resolver", () => ({ createThreeAnimatorPlaybackAssetResolver: vi.fn() }));
vi.mock("../../../three/physics/shared-physics-world", () => ({ physicsWorldForSession: vi.fn() }));
afterEach(() => vi.clearAllMocks());

type Resolution = Awaited<ReturnType<ThreeAnimatorPlaybackAssetResolver["resolve"]>>;
type Creation = RuntimeAnimatorCreation;
const guid = "b".repeat(32);

function setup(count = 1) {
  const cacheLeaseRelease = vi.fn(), resolverLeaseRelease = vi.fn();
  const cacheDispose = vi.fn(cacheLeaseRelease), resolverDispose = vi.fn(resolverLeaseRelease);
  vi.mocked(createAssetCache).mockReturnValue({ dispose: cacheDispose } as unknown as ReturnType<typeof createAssetCache>);
  const resolve = vi.fn<ThreeAnimatorPlaybackAssetResolver["resolve"]>();
  vi.mocked(createThreeAnimatorPlaybackAssetResolver).mockReturnValue({ resolve, dispose: resolverDispose });
  const prepareRuntimeChange = vi.fn(), runtimeEntity = vi.fn();
  vi.mocked(animatorWorldForSession).mockReturnValue({ prepareRuntimeChange, runtimeEntity } as unknown as NonNullable<ReturnType<typeof animatorWorldForSession>>);
  const catalog: RuntimePrefabResourceCatalog = { models: new Map([[guid, { asset: { guid, localId: "main" },
    url: "/3d-models/model.glb", primitive: "gltf", importSettings: {}, settings: normalizeImmutableModelImportSettings({}) }]]),
    materials: new Map(), animation: { importedAssets: [], characterAssets: createEmptyCharacterAssetLibrary(), modelImportDocuments: {} } };
  const source = skinnedSource(), animator = createDefaultAnimatorComponent();
  const records: RuntimeModelRecord[] = Array.from({ length: count }, (_, slot) => ({ object: source.object, entity: {
    handle: { world: Symbol(), slot, generation: 1 }, name: `Animated ${slot}`, tags: [], components: ["transform", "meshFilter", "meshRenderer", "animator"],
    model: captureRuntimeModel({ asset: { guid }, animator, bindings: [], castShadows: true, receiveShadows: true,
      worldTransform: { position: [1, 2, 3], rotation: [0, 90, 0], scale: [1, 1, 1] } }),
  } }));
  const success: Resolution = { value: { controller: animator.controller!, clips: [], masks: [] }, diagnostics: [] };
  const bridge = createRuntimeModelAnimation(catalog, [], {} as BrowserThreeWebGpuRenderSession);
  return { bridge, resolve, prepareRuntimeChange, runtimeEntity, records, success, source,
    cacheDispose, resolverDispose, cacheLeaseRelease, resolverLeaseRelease };
}

function skinnedSource() {
  const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const vertices = geometry.attributes.position.count, indices = new Uint16Array(vertices * 4), weights = new Float32Array(vertices * 4);
  for (let vertex = 0; vertex < vertices; vertex++) weights[vertex * 4] = 1;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const bone = new Bone(), mesh = new SkinnedMesh(geometry, material); mesh.add(bone); mesh.bind(new Skeleton([bone]));
  const object = new Group(); object.add(mesh);
  return { object, geometryDispose: vi.spyOn(geometry, "dispose"), materialDispose: vi.spyOn(material, "dispose"), skeletonDispose: vi.spyOn(mesh.skeleton, "dispose") };
}

function cloneDisposals(body: Group) {
  const mesh = body.children[0] as SkinnedMesh;
  expect(mesh.isSkinnedMesh).toBe(true);
  return { material: vi.spyOn(mesh.material as MeshStandardMaterial, "dispose"), skeleton: vi.spyOn(mesh.skeleton, "dispose"), node: body.parent! };
}

function expectSourceRetained(source: ReturnType<typeof skinnedSource>) {
  expect(source.geometryDispose).not.toHaveBeenCalled();
  expect(source.materialDispose).not.toHaveBeenCalled();
  expect(source.skeletonDispose).not.toHaveBeenCalled();
}

function expectLeasesReleasedOnce(fixture: ReturnType<typeof setup>) {
  expect(fixture.resolverDispose).toHaveBeenCalledOnce(); expect(fixture.resolverLeaseRelease).toHaveBeenCalledOnce();
  expect(fixture.cacheDispose).toHaveBeenCalledOnce(); expect(fixture.cacheLeaseRelease).toHaveBeenCalledOnce();
}

it.each(["Abort", "Stop"])("%s during deferred resolution rejects late success before world admission and releases the independent rig", async (mode) => {
  const fixture = setup(), abort = new AbortController();
  let finish!: (result: Resolution) => void;
  fixture.resolve.mockImplementation(() => new Promise((done) => { finish = done; }));
  const preparation = fixture.bridge.prepare(fixture.records, [], abort.signal);
  const rejected = expect(preparation).rejects.toMatchObject({ code: "world-ended" });
  expect(fixture.resolve).toHaveBeenCalledOnce();
  const body = fixture.resolve.mock.calls[0][1] as Group, disposal = cloneDisposals(body);
  expect(body).not.toBe(fixture.source.object); expect(body.parent?.position.toArray()).toEqual([1, 2, 3]);
  if (mode === "Abort") abort.abort();
  fixture.bridge.dispose(); fixture.bridge.dispose();
  expectLeasesReleasedOnce(fixture);
  expect(disposal.material).not.toHaveBeenCalled(); expect(fixture.prepareRuntimeChange).not.toHaveBeenCalled();
  finish(fixture.success); await rejected;
  expect(fixture.prepareRuntimeChange).not.toHaveBeenCalled(); expect(fixture.records[0].animationId).toBeUndefined();
  expect(disposal.material).toHaveBeenCalledOnce(); expect(disposal.skeleton).toHaveBeenCalledOnce(); expect(disposal.node.children).toHaveLength(0);
  fixture.bridge.dispose(); expectLeasesReleasedOnce(fixture); expectSourceRetained(fixture.source);
});

it("cancellation while resolving a later model also releases earlier prepared rigs without admitting the partial batch", async () => {
  const fixture = setup(2), abort = new AbortController();
  let reached!: () => void, finish!: (result: Resolution) => void;
  const waiting = new Promise<void>((done) => { reached = done; });
  fixture.resolve.mockResolvedValueOnce(fixture.success).mockImplementationOnce(() => {
    reached(); return new Promise((done) => { finish = done; });
  });
  const preparation = fixture.bridge.prepare(fixture.records, [], abort.signal);
  const rejected = expect(preparation).rejects.toMatchObject({ code: "world-ended" });
  await waiting;
  const disposals = fixture.resolve.mock.calls.map(([, body]) => cloneDisposals(body as Group));
  abort.abort(); fixture.bridge.dispose(); finish(fixture.success); await rejected;
  expect(fixture.prepareRuntimeChange).not.toHaveBeenCalled(); expect(disposals).toHaveLength(2);
  for (const disposal of disposals) {
    expect(disposal.material).toHaveBeenCalledOnce(); expect(disposal.skeleton).toHaveBeenCalledOnce(); expect(disposal.node.children).toHaveLength(0);
  }
  fixture.bridge.dispose(); expectLeasesReleasedOnce(fixture); expectSourceRetained(fixture.source);
});

it("a rejected world transaction owns transferred rigs and the bridge never disposes them a second time", async () => {
  const fixture = setup(); fixture.resolve.mockResolvedValue(fixture.success);
  let disposal!: ReturnType<typeof cloneDisposals>, rigDisposal!: MockInstance<() => void>;
  fixture.prepareRuntimeChange.mockImplementation((created: readonly Creation[]) => {
    expect(created).toHaveLength(1); disposal = cloneDisposals(created[0].rig.body as Group);
    rigDisposal = vi.spyOn(created[0].rig, "dispose"); created[0].rig.dispose();
    throw new Error("Animator session admission rejected");
  });
  await expect(fixture.bridge.prepare(fixture.records, [], new AbortController().signal)).rejects.toThrow("Animator session admission rejected");
  expect(rigDisposal).toHaveBeenCalledOnce(); expect(disposal.material).toHaveBeenCalledOnce(); expect(disposal.skeleton).toHaveBeenCalledOnce();
  expect(disposal.node.children).toHaveLength(0); fixture.bridge.dispose(); fixture.bridge.dispose();
  expect(rigDisposal).toHaveBeenCalledOnce(); expectLeasesReleasedOnce(fixture); expectSourceRetained(fixture.source);
});

it("failed raw world removal still releases resolver/cache leases and repeated disposal does not retry ownership", async () => {
  const fixture = setup(); fixture.resolve.mockResolvedValue(fixture.success);
  const publish = vi.fn(), retire = vi.fn(); let owned!: ThreeAnimatorWorldRig;
  fixture.prepareRuntimeChange.mockImplementationOnce((created: readonly Creation[]) => {
    owned = created[0].rig; return { publish, rollback: vi.fn(), retire };
  }).mockImplementationOnce(() => { throw new Error("Raw runtime removal failed"); });
  const change = await fixture.bridge.prepare(fixture.records, [], new AbortController().signal); change!.publish();
  fixture.runtimeEntity.mockReturnValue(fixture.records[0].entity.handle);
  const rigDisposal = vi.spyOn(owned, "dispose"), disposal = cloneDisposals(owned.body as Group);
  expect(() => fixture.bridge.dispose()).toThrow(/Runtime Animator resource cleanup failed:.*Raw runtime removal failed/);
  expect(fixture.prepareRuntimeChange.mock.calls[1]).toEqual([[], [fixture.records[0].animationId]]);
  expect(publish).toHaveBeenCalledOnce(); expect(retire).not.toHaveBeenCalled(); expect(rigDisposal).not.toHaveBeenCalled();
  fixture.bridge.dispose(); expect(fixture.prepareRuntimeChange).toHaveBeenCalledTimes(2); expectLeasesReleasedOnce(fixture);
  // The animation world retains the transferred rig after its own failed removal.
  owned.dispose(); expect(rigDisposal).toHaveBeenCalledOnce(); expect(disposal.material).toHaveBeenCalledOnce(); expect(disposal.skeleton).toHaveBeenCalledOnce();
  expectSourceRetained(fixture.source);
});

it("removing a model after its Animator faults forgets the already-retired session", async () => {
  const fixture = setup(); fixture.resolve.mockResolvedValue(fixture.success);
  let owned!: ThreeAnimatorWorldRig;
  fixture.prepareRuntimeChange.mockImplementation((created: readonly Creation[]) => {
    if (created.length) owned = created[0].rig;
    return { publish: vi.fn(), rollback: vi.fn(), retire: vi.fn() };
  });
  const create = await fixture.bridge.prepare(fixture.records, [], new AbortController().signal);
  create!.publish(); create!.retire?.();
  // Local fault isolation has already removed this Animator from its world.
  fixture.runtimeEntity.mockReturnValue(undefined); owned.dispose();
  const remove = await fixture.bridge.prepare([], fixture.records, new AbortController().signal);
  expect(fixture.prepareRuntimeChange.mock.calls[1]).toEqual([[], []]);
  remove!.publish(); remove!.retire?.(); fixture.runtimeEntity.mockClear();
  fixture.bridge.dispose();
  // Repeated fault/spawn/remove cycles must not accumulate dead IDs to scan on Stop.
  expect(fixture.runtimeEntity).not.toHaveBeenCalled();
  expect(fixture.prepareRuntimeChange).toHaveBeenCalledTimes(2);
  expectLeasesReleasedOnce(fixture); expectSourceRetained(fixture.source);
});

it("resolves a character's live generation handle when applying motion after physics publication", async () => {
  const f = setup(); f.resolve.mockResolvedValue(f.success);
  f.records[0].entity = { ...f.records[0].entity, character: captureRuntimeCharacter({ position: [1, 2, 3],
    capsule: { id: "cap", center: [0, 0.9, 0], radius: 0.35, halfLength: 0.55 } }) };
  let creation!: Creation;
  f.prepareRuntimeChange.mockImplementation((created: readonly Creation[]) => {
    if (created.length) creation = created[0];
    return { publish: vi.fn(), rollback: vi.fn(), retire: vi.fn() };
  });
  const applyRootMotion = vi.fn(), runtimeCharacterMotorFor = vi.fn();
  vi.mocked(physicsWorldForSession).mockReturnValue({ runtimeCharacterMotorFor } as unknown as NonNullable<ReturnType<typeof physicsWorldForSession>>);
  const change = await f.bridge.prepare(f.records, [], new AbortController().signal);
  expect(creation.object.rigidbody?.bodyType).toBe("kinematic");
  expect(runtimeCharacterMotorFor).not.toHaveBeenCalled(); expect(applyRootMotion).not.toHaveBeenCalled();
  change!.publish(); runtimeCharacterMotorFor.mockReturnValue({ applyRootMotion });
  const application = { characterId: creation.object.id, delta: { translation: [0.1, 0, 0] as const, rotation: [0, 0, 0, 1] as const }, fixedDeltaSeconds: 1 / 60 };
  creation.rootMotionSink!.applyRootMotion(application);
  expect(runtimeCharacterMotorFor).toHaveBeenCalledWith(f.records[0].entity.handle);
  expect(applyRootMotion).toHaveBeenCalledWith(application);
  runtimeCharacterMotorFor.mockReturnValue(undefined);
  expect(() => creation.rootMotionSink!.applyRootMotion(application)).toThrowError(expect.objectContaining({ code: "stale-handle" }));
  f.bridge.dispose();
  expect(() => creation.rootMotionSink!.applyRootMotion(application)).toThrowError(expect.objectContaining({ code: "world-ended" }));
  expect(applyRootMotion).toHaveBeenCalledOnce(); creation.rig.dispose(); expectSourceRetained(f.source);
});
