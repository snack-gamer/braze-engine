import { afterEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("project API section revisions", () => {
  it("serializes same-section saves and advances their expected revision", async () => {
    const requests: Array<Record<string, unknown>> = [];
    let revision = "materials-r1";
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method !== "PUT") {
        return jsonResponse({
          status: "ok",
          project: { materials: [] },
          revision: "project-r1",
          sectionRevisions: { materials: revision },
        });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push(body);
      revision = revision === "materials-r1" ? "materials-r2" : "materials-r3";
      return jsonResponse({
        status: "ok",
        project: { materials: (body.patch as { materials: unknown[] }).materials },
        revision: `project-${revision}`,
        sectionRevisions: { materials: revision },
      });
    }));

    const { fetchProject, saveProjectSection } = await import("./project-api");
    await fetchProject();
    await Promise.all([
      saveProjectSection("materials", [{ id: "one" }] as never),
      saveProjectSection("materials", [{ id: "two" }] as never),
    ]);

    expect((requests[0]?.expectedSectionRevisions as Record<string, string>).materials).toBe("materials-r1");
    expect((requests[1]?.expectedSectionRevisions as Record<string, string>).materials).toBe("materials-r2");
  });

  it("surfaces a same-section conflict instead of overwriting", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => (
      init?.method === "PUT"
        ? jsonResponse({
            status: "conflict",
            message: "changed elsewhere",
            section: "materials",
            actualRevision: "remote",
          }, 409)
        : jsonResponse({
            status: "ok",
            project: { materials: [] },
            revision: "project-r1",
            sectionRevisions: { materials: "local" },
          })
    )));

    const { ProjectSectionConflictError, fetchProject, saveProjectSection } = await import("./project-api");
    await fetchProject();
    await expect(saveProjectSection("materials", [])).rejects.toBeInstanceOf(ProjectSectionConflictError);
  });

  it("three-way merges independent concurrent material edits before retrying", async () => {
    const base = [
      { id: "metal", color: "gray", roughness: 0.5 },
      { id: "wood", color: "brown", roughness: 0.8 },
    ];
    const remote = [
      { id: "metal", color: "silver", roughness: 0.5 },
      base[1],
    ];
    const writes: Array<Record<string, unknown>> = [];
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method !== "PUT") {
        reads += 1;
        return jsonResponse({
          status: "ok",
          project: { materials: reads === 1 ? base : remote },
          revision: `project-r${reads}`,
          sectionRevisions: { materials: reads === 1 ? "materials-base" : "materials-remote" },
        });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push(body);
      if (writes.length === 1) {
        return jsonResponse({
          status: "conflict",
          message: "changed elsewhere",
          section: "materials",
          actualRevision: "materials-remote",
        }, 409);
      }
      return jsonResponse({
        status: "ok",
        project: body.patch,
        revision: "project-merged",
        sectionRevisions: { materials: "materials-merged" },
      });
    }));

    const { fetchProject, saveProjectSection } = await import("./project-api");
    await fetchProject();
    const local = [base[0], { ...base[1], roughness: 0.9 }];
    await saveProjectSection("materials", local as never);

    expect(writes).toHaveLength(2);
    expect((writes[1].expectedSectionRevisions as Record<string, string>).materials).toBe("materials-remote");
    expect((writes[1].patch as { materials: unknown }).materials).toEqual([
      { id: "metal", color: "silver", roughness: 0.5 },
      { id: "wood", color: "brown", roughness: 0.9 },
    ]);
  });

  it("rebases a queued local snapshot over an earlier automatic merge", async () => {
    const base = [
      { id: "metal", color: "gray", roughness: 0.5 },
      { id: "wood", color: "brown", roughness: 0.8 },
    ];
    const remote = [
      { ...base[0], color: "silver" },
      base[1],
    ];
    const writes: Array<Record<string, unknown>> = [];
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method !== "PUT") {
        reads += 1;
        return jsonResponse({
          status: "ok",
          project: { materials: reads === 1 ? base : remote },
          revision: `project-r${reads}`,
          sectionRevisions: { materials: reads === 1 ? "base-r1" : "remote-r2" },
        });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push(body);
      if (writes.length === 1) {
        return jsonResponse({
          status: "conflict",
          section: "materials",
          actualRevision: "remote-r2",
        }, 409);
      }
      const revision = writes.length === 2 ? "merged-r3" : "queued-r4";
      return jsonResponse({
        status: "ok",
        project: body.patch,
        revision: `project-${revision}`,
        sectionRevisions: { materials: revision },
      });
    }));

    const { fetchProject, saveProjectSection } = await import("./project-api");
    await fetchProject();
    const firstLocal = [base[0], { ...base[1], roughness: 0.9 }];
    const newerLocal = [base[0], { ...base[1], roughness: 0.95 }];
    await Promise.all([
      saveProjectSection("materials", firstLocal as never),
      saveProjectSection("materials", newerLocal as never),
    ]);

    expect(writes).toHaveLength(3);
    expect((writes[2].patch as { materials: unknown }).materials).toEqual([
      { id: "metal", color: "silver", roughness: 0.5 },
      { id: "wood", color: "brown", roughness: 0.95 },
    ]);
  });

  it("does not clear a section conflict when another project read completes", async () => {
    const base = [{ id: "metal", roughness: 0.5 }];
    const remote = [{ id: "metal", roughness: 0.9 }];
    let reads = 0;
    let writes = 0;
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init?: RequestInit) => {
      if (init?.method !== "PUT") {
        reads += 1;
        const materials = reads === 1 ? base : remote;
        return jsonResponse({
          status: "ok",
          project: { materials },
          revision: `project-r${reads}`,
          sectionRevisions: { materials: reads === 1 ? "base" : "remote" },
        });
      }
      writes += 1;
      return jsonResponse({
        status: "conflict",
        section: "materials",
        actualRevision: "remote",
      }, 409);
    }));

    const { ProjectSectionConflictError, fetchProject, saveProjectSection } = await import("./project-api");
    await fetchProject();
    const local = [{ id: "metal", roughness: 0.2 }];
    await expect(saveProjectSection("materials", local as never))
      .rejects.toBeInstanceOf(ProjectSectionConflictError);

    await fetchProject();
    await expect(saveProjectSection("materials", local as never))
      .rejects.toBeInstanceOf(ProjectSectionConflictError);
    expect(writes).toBe(1);
  });

  it("keeps a superseded hydration response from rolling back the adopted save base", async () => {
    let resolveSuperseded!: (response: Response) => void;
    let reads = 0;
    const writes: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn((_path: string, init?: RequestInit): Promise<Response> => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        writes.push(body);
        return Promise.resolve(jsonResponse({
          status: "ok",
          project: body.patch,
          revision: "project-saved",
          sectionRevisions: { materials: "materials-saved" },
        }));
      }
      reads += 1;
      if (reads === 1) {
        return new Promise<Response>((resolve) => {
          resolveSuperseded = resolve;
        });
      }
      return Promise.resolve(jsonResponse({
        status: "ok",
        project: { materials: [{ id: "newer" }] },
        revision: "project-newer",
        sectionRevisions: { materials: "materials-newer" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const {
      adoptProjectSectionSnapshot,
      fetchProjectSectionSnapshot,
      saveProjectSection,
    } = await import("./project-api");
    const superseded = fetchProjectSectionSnapshot();
    const latest = await fetchProjectSectionSnapshot();
    adoptProjectSectionSnapshot("materials", latest);
    resolveSuperseded(jsonResponse({
      status: "ok",
      project: { materials: [{ id: "older" }] },
      revision: "project-older",
      sectionRevisions: { materials: "materials-older" },
    }));
    await superseded;

    await saveProjectSection("materials", [{ id: "newer" }] as never);

    expect((writes[0].expectedSectionRevisions as Record<string, string>).materials)
      .toBe("materials-newer");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("rejects malformed project envelopes before they can become a save base", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      status: "ok",
      project: [],
      revision: "project-invalid",
      sectionRevisions: { materials: "materials-invalid" },
    })));
    const { fetchProjectSectionSnapshot } = await import("./project-api");

    await expect(fetchProjectSectionSnapshot()).rejects.toThrow(/Project request failed/);
  });
});
