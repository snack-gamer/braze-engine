import { expect, test } from "playwright/test";
import { installCharacterFixture } from "./fixtures/character-authoring";

test("authors typed AND conditions on a Behavior Map connector", async ({ page }) => {
  const fixture = await installCharacterFixture(page);
  await page.goto("/");

  const inspector = page.locator(".rail-right");
  await inspector.getByRole("button", { name: "Add Component", exact: true }).click();
  const palette = page.getByRole("dialog", { name: "Add Component", exact: true });
  await palette.getByRole("searchbox", { name: "Search palette", exact: true }).fill("Animator");
  await palette.getByRole("button", { name: "Animator Controller", exact: true }).click();
  await inspector.getByRole("button", { name: "Build from 1 Clip", exact: true }).click();
  await inspector.getByRole("button", { name: /Hero Character Controller/ }).click();

  const behaviorMap = page.locator("#editor-dock-surface-animator");
  const addParameter = behaviorMap.getByRole("button", { name: "Add parameter", exact: true });
  await addParameter.click();
  const parameterMenu = behaviorMap.getByRole("menu", { name: "Parameter types", exact: true });
  await expect(parameterMenu.getByRole("menuitem")).toHaveText(["Float", "Int", "Bool", "Trigger"]);
  await parameterMenu.getByRole("menuitem", { name: "Float", exact: true }).click();
  const parameterName = behaviorMap.getByLabel("Parameter name", { exact: true });
  await expect(parameterName).toBeFocused();
  await parameterName.fill("Speed");
  await parameterName.press("Enter");

  await behaviorMap.getByRole("button", { name: "Select Speed parameter", exact: true })
    .click({ button: "right" });
  const speedActions = page.getByRole("menu", { name: "Speed parameter actions", exact: true });
  await expect(speedActions.getByRole("menuitem")).toHaveText(["Rename", "Delete"]);
  await speedActions.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const inlineParameterName = behaviorMap.getByLabel("Rename Speed parameter", { exact: true });
  await expect(inlineParameterName).toBeFocused();
  await inlineParameterName.fill("Movement Speed");
  await inlineParameterName.press("Enter");
  await expect(behaviorMap.getByRole("button", {
    name: "Select Movement Speed parameter",
    exact: true,
  })).toBeVisible();

  await addParameter.click();
  await parameterMenu.getByRole("menuitem", { name: "Bool", exact: true }).click();
  await expect(parameterName).toBeFocused();
  await parameterName.fill("Grounded");
  await parameterName.press("Enter");

  const parameterInspector = behaviorMap.getByRole("complementary", {
    name: "Animator context inspector",
    exact: true,
  });
  const currentBool = parameterInspector.getByRole("checkbox", { name: "Current value", exact: true });
  await currentBool.check();
  await expect(currentBool).toBeChecked();
  await expect(behaviorMap.locator(".animator-rail-row", { hasText: "Grounded" })).toContainText("On");

  await behaviorMap.getByRole("button", { name: "Select Movement Speed parameter", exact: true }).click();
  const currentFloat = parameterInspector.getByLabel("Current parameter value", { exact: true });
  await currentFloat.fill("0.75");
  await currentFloat.press("Enter");
  await expect(currentFloat).toHaveValue("0.75");
  await expect(currentFloat).toHaveCSS("cursor", "ew-resize");

  const fieldBounds = await currentFloat.boundingBox();
  if (!fieldBounds) throw new Error("Current parameter field is not visible");
  await page.mouse.move(fieldBounds.x + fieldBounds.width / 2, fieldBounds.y + fieldBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(fieldBounds.x + fieldBounds.width / 2 + 40, fieldBounds.y + fieldBounds.height / 2);
  await page.mouse.up();
  await expect(currentFloat).toHaveValue("0.85");

  await addParameter.click();
  await parameterMenu.getByRole("menuitem", { name: "Int", exact: true }).click();
  await parameterName.fill("Temporary");
  await parameterName.press("Enter");
  await behaviorMap.getByRole("button", { name: "Select Temporary parameter", exact: true })
    .click({ button: "right" });
  const temporaryActions = page.getByRole("menu", {
    name: "Temporary parameter actions",
    exact: true,
  });
  await temporaryActions.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(behaviorMap.getByRole("button", {
    name: "Select Temporary parameter",
    exact: true,
  })).toHaveCount(0);

  const router = behaviorMap.locator('.animator-graph-node[data-kind="anyState"]');
  const idle = behaviorMap.locator('.animator-graph-node[data-kind="state"]');
  await router.getByRole("button", {
    name: "Create transition from Reaction Router",
    exact: true,
  }).click();
  await idle.getByRole("button", { name: "Connect to Idle", exact: true }).click();

  const connectorInspector = behaviorMap.getByRole("complementary", {
    name: "Animator context inspector",
    exact: true,
  });
  await expect(connectorInspector.getByText("Conditions", { exact: true })).toBeVisible();
  await expect(connectorInspector.getByText(
    "All conditions must be true (AND). Use another connector for OR.",
    { exact: true },
  )).toBeVisible();

  const addCondition = connectorInspector.getByRole("button", {
    name: "Add transition condition",
    exact: true,
  });
  await addCondition.click();
  const firstOperator = connectorInspector.getByLabel("Condition 1 operator", { exact: true });
  await expect(firstOperator.locator("option")).toHaveText([">", "<"]);
  await connectorInspector.getByLabel("Condition 1 threshold", { exact: true }).fill("0.2");

  await addCondition.click();
  await connectorInspector.getByLabel("Condition 2 parameter", { exact: true })
    .selectOption({ label: "Grounded" });
  await expect(connectorInspector.getByLabel("Condition 2 operator", { exact: true }))
    .toHaveValue("if");
  await expect(connectorInspector.getByLabel("Condition 2 threshold", { exact: true }))
    .toHaveCount(0);

  const badge = behaviorMap.locator(".animator-graph-edge__condition-badge");
  await expect(badge).toHaveAttribute("data-condition-count", "2");
  await expect(badge).toHaveAttribute("data-parameter-types", "F B");
  await expect(badge).toHaveAttribute("transform", /translate\([^)]+\) rotate\([^)]+\)/);
  await expect(badge).toContainText("F B · 2");
  await expect(badge.locator("text")).toHaveAttribute("dominant-baseline", "central");
  await expect(behaviorMap.locator('.animator-graph-edge[data-kind="transition"]'))
    .toHaveAttribute("aria-label", /2 conditions/);

  await expect.poll(() => {
    const animator = fixture.sceneObject()?.animator as {
      controller?: {
        parameters?: Array<{ id?: string; name?: string; kind?: string }>;
        layers?: Array<{ anyStateTransitions?: Array<{
          conditions?: Array<{ parameterId?: string; mode?: string; threshold?: number }>;
        }> }>;
      };
    } | undefined;
    const controller = animator?.controller;
    const parameterNames = new Map(
      controller?.parameters?.map((parameter) => [parameter.id, parameter.name]) ?? [],
    );
    const conditions = controller?.layers?.[0]?.anyStateTransitions?.[0]?.conditions ?? [];
    return conditions.map((condition) => ({
      parameter: parameterNames.get(condition.parameterId),
      mode: condition.mode,
      threshold: condition.threshold,
    }));
  }).toEqual([
    { parameter: "Movement Speed", mode: "greater", threshold: 0.2 },
    { parameter: "Grounded", mode: "if", threshold: undefined },
  ]);
});
