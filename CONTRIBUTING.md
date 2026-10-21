# Contributing to Braze

Braze is in early development. Start with the [README](README.md),
[AGENTS.md](AGENTS.md) and the eight guides linked there. The current priorities
and limitations live in [STATUS.md](docs/STATUS.md).

## Issues and changes

For a bug, include reproduction steps, expected and observed behavior, the
revision, operating system, browser, GPU and relevant diagnostics. Use a small
project you have permission to share. Remove credentials and private assets.
Discuss substantial features in an issue before implementing them.

Keep pull requests focused. Explain the problem, resulting behavior and actual
validation. Update the existing guide that owns the feature; do not add parallel
roadmaps or milestone reports. Treat other contributors respectfully and review
the work rather than the person. AI-assisted contributions are welcome and must
meet the same correctness, licensing and review requirements.

## Development checks

Run from the repository root:

```sh
npm ci
npm run check:docs
npm run check:architecture
npx tsc --noEmit
npm test
npm run build
```

Runtime, persistence, resource lifetime and scale changes also require
`npm run test:soak`. UI/runtime changes require the relevant browser specs:

```sh
npx playwright install chromium
npm run test:browser -- tests/browser/scene-workspace.spec.ts
```

Choose the specs for your change. Browser and WebGPU results depend on the
actual adapter; software-rendered runs do not establish hardware performance.
CI checks source, unit tests and builds. It does not replace browser or agent
acceptance. See [Operations](docs/OPERATIONS.md) for the complete matrix.

Engine changes require a representative project built through public tools and
scripts, plus the corresponding manual workflow. Follow the
[acceptance contract](docs/AI_GAME_DEVELOPER.md#required-agent-acceptance), use an
isolated project and report unverified criteria honestly. Keep games and test
outputs outside tracked engine source. Stop owned test servers after use.

## Licensing

Submit only work you have the right to contribute under this repository's
[MIT License](LICENSE). Identify third-party code and assets, preserve their
notices and update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Do not include
downloaded game assets without a compatible redistribution license.
