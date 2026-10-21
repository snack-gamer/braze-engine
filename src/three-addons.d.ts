declare module "three/addons/loaders/FBXLoader.js" {
  export { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
}

declare module "three/addons/loaders/GLTFLoader.js" {
  export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
}

declare module "three/webgpu" {
  export * from "three/src/Three.WebGPU.js";
}

declare module "three/tsl" {
  export * from "three/src/nodes/TSL.js";
}

declare module "three/addons/tsl/display/BloomNode.js" {
  export { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
  export { default } from "three/examples/jsm/tsl/display/BloomNode.js";
}

declare module "three/addons/tsl/display/GTAONode.js" {
  export { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
  export { default } from "three/examples/jsm/tsl/display/GTAONode.js";
}

declare module "three/addons/tsl/display/BilateralBlurNode.js" {
  export { bilateralBlur } from "three/examples/jsm/tsl/display/BilateralBlurNode.js";
  export { default } from "three/examples/jsm/tsl/display/BilateralBlurNode.js";
}

declare module "three/addons/tsl/display/GodraysNode.js" {
  export { godrays } from "three/examples/jsm/tsl/display/GodraysNode.js";
  export { default } from "three/examples/jsm/tsl/display/GodraysNode.js";
}

declare module "three/addons/tsl/display/SSRNode.js" {
  export { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
  export { default } from "three/examples/jsm/tsl/display/SSRNode.js";
}
