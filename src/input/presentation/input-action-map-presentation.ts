/** Reusable Project asset identity; Input maps are not scene components. */
export const inputActionMapPresentation = Object.freeze({
  label: "Input Action Map",
  category: "Input",
  description: "Named keyboard, pointer and gamepad actions for the project.",
  aliases: ["controls", "bindings", "keyboard", "gamepad"],
  order: 10,
  icon: "assetInput" as const,
});
