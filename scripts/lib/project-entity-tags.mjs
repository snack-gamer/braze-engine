import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

/** Build captures the same project section the editor loads at Play startup. */
export function readProjectEntityTags(projectRoot) {
  const configPath = path.join(projectRoot, "braze.project.json");
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
  const filename = path.resolve(projectRoot, config.projectFile ?? "project.json");
  const within = (root, file) => { const relative = path.relative(root, file); return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
  if (!within(path.resolve(projectRoot), filename)) throw Error("Project tags file escapes the project root.");
  if (!existsSync(filename)) return undefined;
  if (!within(realpathSync(projectRoot), realpathSync(filename)) || statSync(filename).size > 8 * 1024 * 1024) throw Error("Project tags source escapes the project root or exceeds 8 MiB.");
  return JSON.parse(readFileSync(filename, "utf8")).entityTags;
}
