import type { GameCameraPose, GameVec3 } from "../../gameplay/domain/game-module";

export type GameCameraLease = Readonly<{
  setPose: (pose: GameCameraPose) => void;
  snapshot: () => GameCameraPose | null;
  /** Restore the attached view's camera. Retained commands are revoked. */
  release: () => void;
}>;
export type GameCamera = Readonly<{
  setPose: (pose: GameCameraPose) => void;
  snapshot: () => GameCameraPose | null;
  /** One active camera policy per Play world; duplicate claims fail explicitly. */
  acquire: (ownerLabel?: string) => GameCameraLease;
  /** Pull a camera boom against captured, live static geometry only. Metres. */
  constrain: (target: GameVec3, position: GameVec3, radius: number) => GameVec3;
}>;
