import { createFollowCamera, createCharacterLocomotion, type GameContext, type GameModule } from "../../../src/gameplay/public";

const probe = {
  creates: 0, disposes: 0, ticks: 0, lookTotal: 0, grounded: false, position: [0, 0, 0] as readonly number[],
  context: null as GameContext | null, failNext: false,
  lastTickIndex: 0, walkRequested: false, walkTicks: 0, walkDistance: 0, walkActive: false,
};
Object.assign(window, { gameplayProbe: probe });

const game: GameModule = {
  version: 1,
  input: { version: 1, actions: [
    { name: "move", kind: "axis", bindings: [
      { device: "keyboard", code: "KeyD" }, { device: "keyboard", code: "KeyA", scale: -1 },
      { device: "keyboard", code: "ArrowRight" }, { device: "keyboard", code: "ArrowLeft", scale: -1 },
    ] },
    { name: "moveForward", kind: "axis", bindings: [
      { device: "keyboard", code: "KeyS" }, { device: "keyboard", code: "KeyW", scale: -1 },
      { device: "keyboard", code: "ArrowDown" }, { device: "keyboard", code: "ArrowUp", scale: -1 },
    ] },
    { name: "jump", kind: "button", bindings: [{ device: "keyboard", code: "Space" }] },
    { name: "look", kind: "delta", bindings: [{ device: "pointer-delta", axis: "x" }] },
  ] },
  create(context) {
    probe.creates += 1; probe.context = context;
    probe.position = [0, 0, 0];
    probe.lastTickIndex = 0; probe.walkTicks = 0; probe.walkDistance = 0; probe.walkActive = false; probe.walkRequested = false;
    let walkStart: number | null = null;
    const camera = createFollowCamera({ offset: [0, 4, 7], targetOffset: [0, 0.9, 0], fov: 55, sharpness: 0 });
    const hero = context.world.findByAuthoredId("hero")!;
    const motion = createCharacterLocomotion((delta) => context.characters.move(hero, delta), { speed: 3, gravity: 9.81, jumpSpeed: 5 });
    return {
      fixedUpdate(tick) {
        if (probe.failNext) throw new Error("Controlled gameplay regression failure");
        probe.lastTickIndex = tick.index;
        if (probe.walkRequested && !probe.walkActive) {
          probe.walkRequested = false; probe.walkActive = true; probe.walkTicks = 0;
          walkStart = probe.position[2]; probe.walkDistance = 0;
        }
        probe.lookTotal += Math.abs(context.input.action("look").value);
        const result = motion.step({
          x: probe.walkActive ? 0 : context.input.action("move").value,
          z: probe.walkActive ? 1 : context.input.action("moveForward").value,
          jump: !probe.walkActive && context.input.action("jump").pressed,
        }, tick.deltaSeconds);
        probe.position = result.position; probe.grounded = result.grounded; probe.ticks += 1;
        if (probe.walkActive) {
          probe.walkTicks += 1; probe.walkDistance = result.position[2] - walkStart!;
          if (probe.walkTicks >= 120) probe.walkActive = false;
        }
        context.camera.setPose(camera.sample(result.position, tick.deltaSeconds));
      },
      dispose() { probe.disposes += 1; },
    };
  },
};
export default game;
