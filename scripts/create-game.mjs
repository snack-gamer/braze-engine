import { createJavascriptProject } from './lib/create-javascript-project.mjs';

const [destination, ...name] = process.argv.slice(2);
if (!destination || destination === '--help') {
  console.log('Usage: npm run create:game -- <new-directory> [game name]\nCreates a JavaScript Collect Three starter. The parent directory must exist; existing projects are never overwritten.');
  if (!destination) process.exitCode = 1;
} else {
  try {
    const result = await createJavascriptProject(destination, { name: name.join(' ') || 'My Game' });
    console.log(JSON.stringify(result, null, 2));
    console.log('Open with BRAZE_PROJECT_ROOT set to root through start.sh. Save the current editor before switching.');
    console.log('Check scripts with: npx tsc --noEmit -p <root>/jsconfig.json');
    console.log('WASD, Space, E near orange cubes. Console shows score. Behaviors Inspector edits collectible fields.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
