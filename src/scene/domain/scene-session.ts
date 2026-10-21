import { validateSceneId } from "./scene-identity";

export type SceneInstance = Readonly<{
  instanceId: number;
  sceneId: string;
  phase: "loading" | "ready" | "failed";
}>;
export type SceneSession = Readonly<{
  activeInstanceId: number;
  instances: readonly SceneInstance[];
}>;

export function createSceneSession(sceneId: string, instanceId = 0): SceneSession {
  return { activeInstanceId: instanceId, instances: [{ instanceId, sceneId: validateSceneId(sceneId), phase: "loading" }] };
}
export function activeSceneInstance(session: SceneSession): SceneInstance {
  const instance = session.instances.find((item) => item.instanceId === session.activeInstanceId);
  if (!instance) throw new Error("The active scene instance is not registered.");
  return instance;
}
/** Single loading replaces the collection; additive loading requires a separate operation. */
export function replaceSceneInstance(session: SceneSession, sceneId: string): SceneSession {
  return createSceneSession(sceneId, session.activeInstanceId + 1);
}
export function setSceneInstancePhase(session: SceneSession, instanceId: number, phase: SceneInstance["phase"]): SceneSession {
  const instance = session.instances.find((item) => item.instanceId === instanceId);
  if (!instance || instance.phase === phase) return session;
  return { ...session, instances: session.instances.map((item) => item.instanceId === instanceId ? { ...item, phase } : item) };
}
