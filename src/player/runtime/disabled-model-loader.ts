type LoadFailure = (error: unknown) => void;

class DisabledModelLoader {
  load(
    _url: string,
    _onLoad: (value: never) => void,
    _onProgress: undefined,
    onError: LoadFailure,
  ): void {
    onError(new Error("This model format is not part of the scene-compiled player build."));
  }
}

/** Player-only replacements for model formats not referenced by the baked scene. */
export class FBXLoader extends DisabledModelLoader {}
export class GLTFLoader extends DisabledModelLoader {}
export class USDZLoader extends DisabledModelLoader {}
