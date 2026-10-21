import assert from "node:assert/strict";
import test from "node:test";
import { shouldTrackAssetWatchPath } from "./asset-source-watcher.mjs";

test("asset watcher tracks authored sources and sidecars but ignores hidden atomic/cache files", () => {
  assert.equal(shouldTrackAssetWatchPath("Characters/Hero.fbx"), true);
  assert.equal(shouldTrackAssetWatchPath("Characters/Hero.fbx.braze.meta"), true);
  assert.equal(shouldTrackAssetWatchPath("Characters/Hero.fbx.meta"), true);
  assert.equal(shouldTrackAssetWatchPath(".DS_Store"), false);
  assert.equal(shouldTrackAssetWatchPath("Characters/.Hero.fbx.braze.meta.1.tmp"), false);
  assert.equal(shouldTrackAssetWatchPath(".cache/preview.png"), false);
  assert.equal(shouldTrackAssetWatchPath(null), true);
});
