# Editor design guide

Status: mandatory for all engine editor UI changes, including changes made by
future agents. Read this guide before editing Inspector, hierarchy, asset,
workspace, toolbar or shared control presentation. Game-authored runtime UI has
its own theme and is not a second editor design system.

## Shared ownership

- `theme.css` owns palette, typography, density, spacing, field and icon metrics.
- `editor-design.css` is the ordered editor stylesheet entry.
- `editor-inspector-theme.css` owns Inspector identity and component chrome.
- `styles/inspector-properties.css` owns property alignment and vector layout;
  `styles/inspector-actions.css` owns body actions.
- `ui/controls.css` owns control surfaces and interaction states;
  `ui/field-layout.css` owns select-arrow and numeric-text geometry.
- `ui/icons.ts` is the only glyph registry. React and DOM adapters share it.
  Native select arrows come from `native-select-glyph.ts`, configured at editor
  startup from that registry and theme colors. Never embed a competing chevron
  or replace a native menu only to adjust its arrow.

Make a shared correction at its owner. Avoid page-specific overrides that
undo shared spacing, alignment, icon sizes or disabled/focus behavior.

## Surface hierarchy

Editor surfaces follow one neutral elevation ladder: canvas/well, window,
contained region, component card, component header, raised/hover. A child
container must be subtly brighter than the surface that owns it so Inspector
components, hierarchy rows, asset tiles, and popovers remain visually distinct.

Rules:

- Consume the shared `--layer-*` tokens from `editor-theme.css`; feature CSS
  must not invent another near-identical grey.
- Keep selectors with the feature surface that owns them. Compatibility entry
  stylesheets may contain ordered imports only; they are not a home for new
  rules. Treat import order and intentional cross-feature overrides as part of
  the public cascade contract.
- Use brightness, a quiet outline, and at most a shallow shadow to communicate
  containment. Do not assign alternating arbitrary greys to sibling cards.
- Inputs remain recessed wells inside components; headers and hover states move
  upward by one elevation level.
- Interaction accent, semantic status colors, and 3D axis colors do not define
  structural elevation.
- A new panel must be checked in normal, hover, selected, disabled, and focus
  states against both its parent surface and neighboring panels.

## Inspector layout and popup design (mandatory)

These rules apply to every component, asset, render, physics and behavior
Inspector, including new agent-authored engine UI. Use the shared presenters
and `--inspector-*` tokens in `theme.css`; do not repair one panel with a
competing skin, arbitrary width or tighter spacing override.

- Use `InspectorRow` for properties, `InspectorGroup` for related subsections,
  and `InspectorSection` for components. Labels share a left column; values
  share a start edge. Center labels, disclosure glyphs and values vertically.
  Controls must never overlap their labels or push unrelated rows sideways.
- Property enum selectors and mask triggers use the shared 180px maximum and
  shrink to the available value column. Single numbers cap at 120px. Sliders,
  XYZ vectors, text and object-reference fields may use the remaining width.
  Only long asset/object selectors opt into `inspector-row--wide-control`.
  Do not stretch a two-choice enum merely because the Inspector is wide.
- Property rows use a 26px minimum, 22px fields, 2px vertical padding and a
  6px column gap. Keep the shared responsive vector reflow at 340px. Verify
  compact and wide panes; never fix overflow by clipping controls or labels
  without a readable tooltip/accessibility name.
- Body action groups use `inspector-actions`: wrap with an 8px gap, 6px
  separation above and 6px top padding. A quiet horizontal hairline separates
  actions from properties. Compact icon actions inside headers retain their
  header spacing. Buttons must not touch each other or adjacent fields.
- Use whitespace and group-header hairlines to express related settings.
  Nested dependencies may use the existing vertical gutter hairline. Do not
  add a divider after every scalar row or stack redundant component bars.
- Native selects remain the default for simple enums. Custom mask/choice lists
  open as anchored overlays through `InspectorMenuSelect`,
  never inline expanding `details` that moves the rest of the Inspector.
  Menus escape scroll-container clipping, fit the viewport, flip above when
  needed and scroll internally. Keep trigger text and the trailing chevron
  centered, with a reserved non-shrinking icon slot.
- Multi-select menus use checkmarked `menuitemcheckbox` rows. Bulk actions
  (Nothing/Everything) have a hairline before individual options. Keep choices
  open while toggling. Support arrows, Home/End, Enter/Space, Escape with focus
  restored, Tab onward, outside-click dismissal and scroll/resize dismissal.
  Do not let menu keystrokes trigger Scene navigation or playback.
- Check hover, focus, selected and disabled states; opening a menu must leave
  the label, following fields and action buttons at exactly the same positions.
  Keep a relevant browser geometry/keyboard regression when changing shared
  layout or popup behavior. Existing field edits still use undo and persistence.

- Mesh references use the registry’s grid-style `meshFilter` glyph in the field,
  picker and Project subasset badge; whole models retain their model glyph.
- Mesh and other asset references reuse `InspectorObjectField`: compact type glyph,
  ellipsized name, separate trailing picker button, and a readable None/Missing state.
  Clicking the assigned asset name reveals it in Project; the picker remains distinct.
  Delete/Backspace clears a focused editable reference. Do not make plain enums wide
  to match reference fields.
- Object-picker buttons use the small ring with a filled center dot from the
  shared `objectPicker` glyph. Keep the full button hit area; do not enlarge the
  ring to fill it or substitute an empty circle.
- Searchable asset pickers use a viewport-bounded native modal dialog with an internal
  scrolling results, search autofocus, arrow/Home/End navigation, Enter confirmation,
  Escape cancellation and focus restoration. Opening never moves Inspector rows.
  Stop editor shortcuts inside the dialog and retain the shared field/type tokens.

Asset browser modals use 92% of the window width and 88% of its height, with a
small viewport gutter on compact screens. Do not cap them at a fixed desktop box.
Reuse the Project window's `editor-toolbar`, segmented icon buttons, integrated
search and `EditorRange` chrome. Keep filters compact and accessible by name,
with quiet hairline group separators rather than chunky button backgrounds. Reuse
the full Project type-filter strip; incompatible types stay disabled with explanatory
tooltips. Favorites reads Project favorites (meshes inherit their source model's
favorite); confirmed choices enter the same 24-item Recent list. Mounted picker
and Project views must synchronize preference changes without a reload. Tile
glyphs scale modestly with zoom (about 28px inside a 72px background at the default
88px tile size), using theme icon roles as bounds. Reduce excess background space
before enlarging glyphs, and apply sizing through identity wrappers as well as SVGs.
Include
name/path search, source and folder filters, name sorting, grid/list views, preview
zoom, result counts and selected-asset details. Type eligibility comes from the
field owner; do not permit incompatible types or offer nonfunctional Scene tabs. Single
click/Space changes the pending choice and detail footer. Double-click, Enter or
Select applies one history edit; Cancel/Escape changes nothing. Show clear empty
results and page beyond 60 items, keeping thumbnail work bounded. Material spheres
reuse the Project thumbnail cache, not a renderer per tile. Mesh choices currently
use type glyphs, not misleading whole-model images for individual mesh subassets.
Keep search, toolbar, results and details separated by spacing and hairlines; use
shared icon size roles and retain usable picker/control hit areas at narrow widths.

Material rows follow the same reference-field contract. Keep `Element n` labels,
14px swatches, a separate picker button and consistent field baselines. Use the
shared `AssetReferencePicker` for searchable mesh and material choices. A material
count is read-only while slots come from the mesh; do not show drag handles or
add/remove buttons without a working ordering or multi-pass rendering contract.
Clearing a slot restores its mesh/default surface. Component Reset clears overrides
and restores enabled/shadow/output defaults through one Undo transaction.

## Object identity and hierarchy

- Object header glyphs use the 16px control role. The lock glyph uses the 14px
  compact role. Both retain a 22px field-height slot; reducing a glyph must not
  reduce its usable control area. Brand-sized glyphs do not belong beside names.
- The name and Tag/Layer rows share identity metrics. Tag's selector starts at
  the name input's left edge. Layer's selector ends at its right edge, leaving
  the same reserved lock column. Tag and Layer selectors have equal widths.
  Labels occupy their own columns and never crowd or overflow a value field.
- All applicable hierarchy action glyphs remain visible at rest, including
  unselected rows when the pointer is elsewhere. Use neutral color, not hover
  visibility, to keep them quiet. Hover, focus and enabled states add emphasis.
- Never reserve hidden action slots between visible hierarchy icons. Put optional
  object-specific actions before the shared Solo, Visibility and Lock controls;
  right-align the group so those common controls line up without internal holes.
  Size each row's component and action groups to their actual content, keeping
  no extra padding at the component/action boundary. Both groups use the same
  slot width and glyph size, so icon centers stay equally spaced across the row.
  Tree disclosure spacers remain valid because they communicate nesting.

## Dropdown arrows and numeric text

- Every single-value native editor select uses the shared disclosure glyph,
  centered vertically with an 8px right inset. Reserve space for the glyph so
  long labels cannot overlap it. Keep that geometry in hover/focus/disabled
  states, including identity selectors and detached editor windows.
- Custom menu triggers use the same inset and disclosure size. Multiple-select
  and listbox controls do not get a closed-field dropdown arrow.
- Numeric digits must be optically centered in the visible well, not merely
  centered by an input element's rectangle. Use the shared font and numeric
  optical-inset token to account for its ascent/descent; keep the full hit area
  and editable caret. Never add ad hoc offsets to one number or one Inspector.
- Verify positive/negative/decimal values, units, vector cells and disabled
  fields. A unit must not change the alignment or clip the number.

## Verification before handoff

Check representative camera, mesh and physics Inspectors at wide and narrow
pane sizes in the embedded browser. Check the actual glyph/text pixels as well
as control bounds. Move the pointer away from hierarchy rows to verify action
visibility. Exercise native selection, menu keyboard navigation, focused and
disabled fields, and resize/reopen behavior. Preserve authored values; isolated
fixtures use an explicit completed Save before reload when testing persistence.
Keep targeted layout/pixel regressions when correcting shared geometry, run the
repository's required checks, and update [STATUS](./STATUS.md) with actual
outcomes and limitations. [Architecture](./ENGINE_ARCHITECTURE.md#editor-visual-system)
describes implementation ownership; this guide owns the design rules.
