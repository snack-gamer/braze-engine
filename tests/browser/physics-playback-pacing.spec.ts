import { expect, test } from "playwright/test";

const pacingScene = {
  version: "braze-engine/scene-v0",
  activeObjectId: "falling-cube",
  environment: { worldSource: "sky" },
  objects: [
    {
      id: "falling-cube",
      name: "Falling cube",
      source_type: "cube",
      visible: true,
      transform: { position: [0, 6, 0], rotation_degrees: [0, 0, 0], scale: [1, 1, 1] },
      rigidbody: {
        enabled: true,
        body_type: "dynamic",
        mass_mode: "automatic",
        density: 1,
        use_gravity: true,
        linear_damping: 0,
        angular_damping: 0.05,
        interpolation: "none",
      },
      colliders: [
        {
          id: "falling-cube-collider",
          enabled: true,
          shape: "box",
          center: [0, 0, 0],
          size: [1, 1, 1],
          friction: 0.5,
        },
      ],
    },
    {
      id: "ground",
      name: "Ground",
      source_type: "cube",
      visible: true,
      transform: { position: [0, -0.25, 0], rotation_degrees: [0, 0, 0], scale: [10, 0.5, 10] },
      colliders: [
        {
          id: "ground-collider",
          enabled: true,
          shape: "box",
          center: [0, 0, 0],
          size: [1, 1, 1],
          friction: 0.5,
        },
      ],
    },
  ],
  physics: {
    gravity: [0, -10, 0],
    fixed_timestep: 1 / 60,
    max_substeps: 5,
    solver_iterations: 10,
  },
};

test("Play Mode completes fixed steps without frame-gated solver stages", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    if (method === "GET" && pathname === "/api/scenes/current") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok", scene: pacingScene }),
      });
    } else if (method === "GET" || method === "HEAD") {
      await route.continue();
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{\"status\":\"ok\"}" });
    }
  });

  await page.goto("/");
  const viewport = page.getByLabel("3D scene viewport");
  await expect(viewport).toBeVisible();
  await expect(page.getByRole("heading", { name: "Falling cube", exact: true })).toBeVisible();
  await page.getByLabel("Enter Play Mode").click();
  await expect(viewport).toHaveAttribute("data-physics-status", "running", { timeout: 30_000 });

  const firstStep = Number(await viewport.getAttribute("data-physics-completed-step"));
  await page.waitForFunction(
    ({ start, required }) => {
      const value = Number(
        document.querySelector<HTMLElement>('[aria-label="3D scene viewport"]')?.dataset.physicsCompletedStep,
      );
      return value >= start + required;
    },
    { start: firstStep, required: 60 },
    // The project browser may use a software WebGPU adapter in CI. This bound
    // catches the former minute-per-fall scheduler without asserting a
    // hardware-independent frame rate.
    { timeout: 45_000 },
  );

  expect(Number(await viewport.getAttribute("data-physics-completed-step"))).toBeGreaterThanOrEqual(firstStep + 60);
  expect(runtimeErrors).toEqual([]);
  await page.getByLabel("Exit Play Mode").click();
});
