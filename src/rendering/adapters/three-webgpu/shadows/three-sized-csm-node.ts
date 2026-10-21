import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type { NodeBuilder, PerspectiveCamera } from "three/webgpu";
import { createShadowCascadePolicies } from "../../../runtime/shadows/shadow-cascade-policy";
import { calculateShadowCascadeSplits } from "../../../runtime/shadows/shadow-cascade-splits";

/** Size lazy cascade targets before their first allocation, while only public lights exist. */
export class ThreeSizedCsmNode extends CSMShadowNode {
  override setup(builder: NodeBuilder) {
    const output = super.setup(builder);
    const camera = this.camera as PerspectiveCamera;
    const policies = createShadowCascadePolicies(calculateShadowCascadeSplits({
      near: camera.near, far: camera.far, maxShadowDistance: this.maxFar,
    }));
    for (let index = 0; index < policies.length; index++) {
      const size = policies[index].mapSize;
      this.lights[index]?.shadow?.mapSize.set(size, size);
    }
    return output;
  }
}
