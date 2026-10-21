import { LoadingManager, Texture } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

class AnalysisTextureLoader {
  path = "";

  constructor(onTexture) { this.onTexture = onTexture; }

  setPath(path) {
    this.path = path || "";
    return this;
  }

  load(url) {
    this.onTexture?.(this.path + url);
    return new Texture();
  }
}

function exactArrayBuffer(source) {
  return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
}

/** Parses FBX structure synchronously while deliberately suppressing texture I/O. */
export function parseFbxSource(source, onTexture) {
  const manager = new LoadingManager();
  manager.addHandler(/.*/, new AnalysisTextureLoader(onTexture));
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previousWindow = globalThis.window;
  if (!hadWindow) {
    globalThis.window = {
      URL: { createObjectURL: () => "blob:braze-fbx-analysis" },
    };
  }
  try {
    return new FBXLoader(manager).parse(exactArrayBuffer(source), "");
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
}
