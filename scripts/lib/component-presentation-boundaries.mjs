export function componentPresentationFailures(
  relativeFilename,
  source,
  componentIcons,
  allowedIcons = new Set(),
) {
  const failures = [];
  for (const match of source.matchAll(/<EditorIcon\b[^>]*\bname="([^"]+)"/g)) {
    const icon = match[1];
    if (componentIcons.has(icon) && !allowedIcons.has(icon)) {
      failures.push(
        `${relativeFilename}: direct scene-component icon '${icon}'; use SceneComponentPresentation so Inspector, Hierarchy, and Add Component share registry metadata`,
      );
    }
  }
  return failures;
}
