import type { GameplayDiagnostic } from "../domain/game-module";
import "./game-failure.css";

/** Low-frequency fault presentation; gameplay frame state never enters React. */
export function GameFailure({ diagnostic }: { diagnostic: GameplayDiagnostic | null }) {
  if (!diagnostic) return null;
  return <div className="gameplay-failure" role="alert">
    <strong>Game logic stopped</strong>
    <span>{diagnostic.message}</span>
  </div>;
}
