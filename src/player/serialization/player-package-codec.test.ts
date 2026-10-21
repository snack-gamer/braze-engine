import { describe, expect, it } from "vitest";
import { PLAYER_PACKAGE_VERSION, decodePlayerPackage } from "./player-package-codec";

function packageFixture(): Record<string, unknown> {
  return {
    version: PLAYER_PACKAGE_VERSION,
    sceneId: "main",
    scene: {
      version: "braze-engine/scene-v1",
      activeCameraId: "camera",
      objects: [{
        id: "camera",
        name: "Camera",
        source_type: "camera",
        transform: {
          position: [0, 1, 5],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        camera: { target: [0, 0, 0], fov: 50, near: 0.1, far: 200 },
      }],
    },
    materials: [{ id: "material", name: "Material" }],
    characterAssets: {
      version: "braze/character-assets-v1",
      animatorControllers: [],
      avatarMasks: [],
    },
    importedAssets: [{
      guid: "a".repeat(32),
      name: "Hero",
      filename: "Hero.fbx",
      path: "assets/Hero.fbx",
      url: "./3d-models/Hero.fbx",
      sizeBytes: 123,
    }],
    modelImportDocuments: {
      "Hero.fbx": {
        version: "braze/model-import-v3",
        sourceFilename: "Hero.fbx",
        settings: { scaleFactor: 2 },
        revision: "meta-r1",
        updatedAt: null,
        importVersion: "import-r1",
      },
    },
    features: {
      modelLoaders: ["fbx"],
      animator: true,
      physics: false,
      particles: false,
      timeline: false,
      water: false,
      cloner: false,
      environment: "sky",
      effects: {
        ao: false,
        bloom: false,
        ssr: false,
        clouds: true,
        godrays: true,
        scattering: true,
        fog: false,
      },
    },
  };
}

describe("player package codec", () => {
  it("hydrates the immutable runtime payload without editor persistence state", () => {
    const decoded = decodePlayerPackage(packageFixture());

    expect(decoded.sceneId).toBe("main");
    expect(decoded.scene.activeCameraId).toBe("camera");
    expect(decoded.scene.objects[0].primitive).toBe("camera");
    expect(decoded.materials[0]).toMatchObject({ id: "material", roughness: 0.55 });
    expect(decoded.importedAssets[0].url).toBe("./3d-models/Hero.fbx");
    expect(decoded.features.modelLoaders).toEqual(["fbx"]);
    expect(decoded.features.effects.godrays).toBe(true);
  });

  it("rejects malformed catalog entries before renderer startup", () => {
    const fixture = packageFixture();
    fixture.importedAssets = [{ filename: "Hero.fbx" }];

    expect(() => decodePlayerPackage(fixture)).toThrow("importedAssets[0].name");
  });

  it("rejects invalid model import document filenames before renderer startup", () => {
    const fixture = packageFixture();
    fixture.modelImportDocuments = {
      "../Hero.fbx": (fixture.modelImportDocuments as Record<string, unknown>)["Hero.fbx"],
    };

    expect(() => decodePlayerPackage(fixture)).toThrow("contains invalid filename");
  });

  it("rejects model import document keys with the same canonical filename", () => {
    const fixture = packageFixture();
    const document = (fixture.modelImportDocuments as Record<string, unknown>)["Hero.fbx"];
    fixture.modelImportDocuments = {
      "Characters/Hero.fbx": document,
      "/Characters\\Hero.fbx": document,
    };

    expect(() => decodePlayerPackage(fixture)).toThrow("normalize to the same filename");
  });

  it("rejects unsupported model import document versions", () => {
    const fixture = packageFixture();
    const document = (fixture.modelImportDocuments as Record<string, Record<string, unknown>>)["Hero.fbx"];
    document.version = "braze/model-import-v999";

    expect(() => decodePlayerPackage(fixture)).toThrow("Unsupported player model import document version");
  });

  it("rejects invalid and canonically colliding imported asset filenames", () => {
    const invalid = packageFixture();
    (invalid.importedAssets as Array<Record<string, unknown>>)[0].filename = "../Hero.fbx";
    expect(() => decodePlayerPackage(invalid)).toThrow("filename is invalid");

    const colliding = packageFixture();
    colliding.importedAssets = [
      ...(colliding.importedAssets as Array<Record<string, unknown>>),
      {
        ...(colliding.importedAssets as Array<Record<string, unknown>>)[0],
        filename: "/Hero.fbx",
      },
    ];
    expect(() => decodePlayerPackage(colliding)).toThrow("normalize to the same filename");
  });

  it("requires a one-to-one imported asset document manifest", () => {
    const missing = packageFixture();
    missing.modelImportDocuments = {};
    expect(() => decodePlayerPackage(missing)).toThrow("is missing imported asset");

    const orphan = packageFixture();
    (orphan.modelImportDocuments as Record<string, unknown>)["Unused.fbx"] = {
      ...(orphan.modelImportDocuments as Record<string, Record<string, unknown>>)["Hero.fbx"],
      sourceFilename: "Unused.fbx",
    };
    expect(() => decodePlayerPackage(orphan)).toThrow("contains unknown imported asset");
  });

  it("requires each import document source filename to identify its canonical key", () => {
    const fixture = packageFixture();
    const document = (fixture.modelImportDocuments as Record<string, Record<string, unknown>>)["Hero.fbx"];
    document.sourceFilename = "Other.fbx";

    expect(() => decodePlayerPackage(fixture)).toThrow("sourceFilename must identify");
  });

  it("does not accept inherited required package fields", () => {
    const fixture = packageFixture();
    delete fixture.sceneId;
    Object.setPrototypeOf(fixture, { sceneId: "inherited" });

    expect(() => decodePlayerPackage(fixture)).toThrow("player package.sceneId must be a string");
  });

  it("rejects malformed or duplicate model loader manifests", () => {
    const unsupported = packageFixture();
    (unsupported.features as Record<string, unknown>).modelLoaders = ["fbx", "obj"];
    expect(() => decodePlayerPackage(unsupported)).toThrow("contains unsupported loader");

    const duplicate = packageFixture();
    (duplicate.features as Record<string, unknown>).modelLoaders = ["fbx", "fbx"];
    expect(() => decodePlayerPackage(duplicate)).toThrow("contains duplicate loader");
  });
});
