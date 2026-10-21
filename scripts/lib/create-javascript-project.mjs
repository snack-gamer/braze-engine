import { mkdir, readFile, writeFile, cp, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { javascriptStarterScene } from './javascript-project-template.mjs';

const defaultEngineRoot = fileURLToPath(new URL('../..', import.meta.url));
/** New directories only: never overwrite or migrate an existing user project. */
export async function createJavascriptProject(destination, { name = 'My Game', engineRoot = defaultEngineRoot } = {}) {
  if (typeof destination !== 'string' || !destination.trim()) throw new Error('Provide a new project directory.');
  if (typeof name !== 'string' || !name.trim() || name.length > 128) throw new Error('Project name must contain 1–128 characters.');
  const root = path.resolve(destination), engine = path.resolve(engineRoot);
  const config = JSON.parse(await readFile(path.join(engine, 'tsconfig.json'), 'utf8'));
  // Non-recursive claim fails if the directory already exists, including symlinks.
  await mkdir(root);
  try {
    // Node/TypeScript resolve config paths from the canonical directory. /tmp
    // and other symlinked parents must use the same base when emitting relatives.
    const canonicalRoot = await realpath(root), canonicalEngine = await realpath(engine);
    const relativeEngine = path.relative(canonicalRoot, canonicalEngine).split(path.sep).join('/');
    for (const folder of ['Scripts/Behaviors', 'Scripts/Systems', 'Prefabs', 'Models', 'Materials', 'Input', 'Audio']) {
      await mkdir(path.join(root, 'assets', folder), { recursive: true });
    }
    await mkdir(path.join(root, 'scenes'));
    await mkdir(path.join(root, 'tests'));
    await cp(path.join(engine, 'templates/javascript'), path.join(root, 'assets/Scripts'), { recursive: true, force: false, errorOnExist: true });
    const json = (file, value) => writeFile(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await json('braze.project.json', { version: 1, name, assetsPath: 'assets', scenesPath: 'scenes', libraryPath: '.braze/Library',
      enginePath: relativeEngine, gameplayEntry: 'assets/Scripts/main.js', runtimePhysicsCapacity: 0 });
    await json('project.json', { version: 'braze-engine/project-v1', materials: [] });
    await json('scenes/current.scene.json', javascriptStarterScene());
    await json('jsconfig.json', { extends: `${relativeEngine}/tsconfig.json`, compilerOptions: {
      allowJs: true, checkJs: true, noEmit: true,
      typeRoots: [`${relativeEngine}/node_modules/@types`, `${relativeEngine}/node_modules`],
      paths: { ...config.compilerOptions.paths, '@braze/game': ['src/gameplay/public.ts'] },
    }, include: ['assets/Scripts/**/*.js', 'tests/**/*.js'] });
    await writeFile(path.join(root, '.gitignore'), '.braze/Library/\n.braze/Backups/\n.braze/Trash/\nnode_modules/\ndist-player/\n', { flag: 'wx' });
    return Object.freeze({ root, entry: 'assets/Scripts/main.js', sceneId: 'current' });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
