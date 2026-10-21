# Working on Braze

Read [the AI game development contract](docs/AI_GAME_DEVELOPER.md)
and [the coding rulebook](docs/CODING_RULEBOOK.md) before changes.
[README](README.md) routes to the eight authoritative guides. Update the owning
guide in the same change; do not create step reports or parallel roadmaps.

- Braze serves agent-led game development and expert manual authoring. A feature
  needs discoverable tools, public JavaScript access and an appropriate manual
  workflow over the same feature-owned operations. Record unsupported paths.
- Validate subsequent work with a representative agent-built game/system and
  assess the actual output, as required by the AI contract. Use isolated projects,
  public tools/scripts and the matching manual workflow; report unverified work.
- Keep roots thin and responsibilities feature-owned. Existing oversized files
  may only shrink; never raise architecture budgets to land work.
- Preserve authored/runtime boundaries, stable asset identity and GPU residency.
- Run `npm run check:docs`, `npm run check:architecture`, `npx tsc --noEmit`,
  `npm test` and `npm run build` at the repository root before handoff. Runtime,
  persistence, resource-lifetime and scale changes also run `npm run test:soak`;
  UI/runtime changes run relevant browser specs. Report actual evidence.
- Use `start.sh` for persistent editor/review servers and inspect
  `./start.sh --status`. Keep one owner per checkout (5179/25179 by default).
  Clean owned servers with `./stop.sh`; tear down automated servers. Never kill
  unrelated port occupants. See [operations](docs/OPERATIONS.md).

For game-building or agent acceptance, use the repository
[braze-game-developer skill](skills/braze-game-developer/SKILL.md).
Discover actual capabilities before authoring. Preserve user projects; source
configuration changes and a runnable fixture are not proof of a playable result.
