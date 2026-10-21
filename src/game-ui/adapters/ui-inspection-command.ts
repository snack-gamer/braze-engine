import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { gameplayWorldForSession } from "../../gameplay/adapters/shared-gameplay-world";
export function inspectGameUi(session: BrowserThreeWebGpuRenderSession, request: Record<string, unknown>) {
  if (request.screenId !== undefined && typeof request.screenId !== "string") throw new Error("UI screenId must be a string.");
  const world = gameplayWorldForSession(session); if (!world) throw new Error("Enter Play before inspecting UI.");
  return world.inspectUi(request.screenId, request.offset as number | undefined, request.limit as number | undefined);
}
