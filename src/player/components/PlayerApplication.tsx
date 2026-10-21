import { CharacterPlaybackAssetProvider } from "../../character/application/CharacterPlaybackAssetProvider";
import type { BrowserThreeWebGpuRenderSession } from "../../rendering/adapters/browser-three-webgpu-session";
import { RenderSessionProvider } from "../../rendering/application/RenderSessionProvider";
import type { PlayerTimelinePlayback } from "../runtime/player-timeline-playback";
import type { DecodedPlayerPackage } from "../serialization/player-package-codec";
import { PlayerViewport } from "./PlayerViewport";

type PlayerApplicationProps = Readonly<{
  playerPackage: DecodedPlayerPackage;
  renderSession: BrowserThreeWebGpuRenderSession;
  timeline: PlayerTimelinePlayback | null;
}>;

/** Production composition root: renderer, read-only assets, and the game viewport. */
export function PlayerApplication({
  playerPackage,
  renderSession,
  timeline,
}: PlayerApplicationProps) {
  return (
    <RenderSessionProvider session={renderSession}>
      <CharacterPlaybackAssetProvider
        library={playerPackage.characterAssets}
        importedAssets={playerPackage.importedAssets}
        ready
      >
        <PlayerViewport playerPackage={playerPackage} timeline={timeline} />
      </CharacterPlaybackAssetProvider>
    </RenderSessionProvider>
  );
}
