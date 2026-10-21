import { createContext, useContext, type PropsWithChildren } from "react";
import type { BrowserThreeWebGpuRenderSession } from "../adapters/browser-three-webgpu-session";

const RenderSessionContext = createContext<BrowserThreeWebGpuRenderSession | null>(null);

type RenderSessionProviderProps = PropsWithChildren<{
  session: BrowserThreeWebGpuRenderSession;
}>;

export function RenderSessionProvider({ session, children }: RenderSessionProviderProps) {
  return <RenderSessionContext.Provider value={session}>{children}</RenderSessionContext.Provider>;
}

export function useRenderSession(): BrowserThreeWebGpuRenderSession {
  const session = useOptionalRenderSession();
  if (!session) throw new Error("A ThreeScene requires the app-owned WebGPU render session.");
  return session;
}

/** Read-only authoring surfaces may publish assets without mounting a renderer. */
export function useOptionalRenderSession(): BrowserThreeWebGpuRenderSession | null {
  return useContext(RenderSessionContext);
}
