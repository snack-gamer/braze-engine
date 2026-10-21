import "./player.css";
import type { RendererFailureDiagnostic } from "../three/device-lifecycle";

type PlayerDisposer = () => void;

const rootElement = document.getElementById("root");
if (!(rootElement instanceof HTMLElement)) throw new Error("Player root element is missing.");
const root: HTMLElement = rootElement;

let disposePlayer: PlayerDisposer | null = null;
const startup = new AbortController();

function renderMessage(title: string, detail: string, fatal = false): void {
  const message = document.createElement("main");
  message.className = `player-message${fatal ? " player-message--fatal" : ""}`;
  message.setAttribute(fatal ? "role" : "aria-live", fatal ? "alert" : "polite");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const body = document.createElement("span");
  body.textContent = detail;
  message.append(heading, body);
  root.replaceChildren(message);
}

async function startPlayer(signal: AbortSignal): Promise<void> {
  renderMessage("Loading", "Preparing the exported scene.");
  const contentUrl = new URL("player-content.json", document.baseURI);
  const response = await fetch(contentUrl, { signal });
  if (!response.ok) throw new Error(`Player package request failed (${response.status}).`);
  const rawPackage = await response.json() as unknown;
  signal.throwIfAborted();
  const { mountPlayer } = await import("./application/mount-player");
  signal.throwIfAborted();
  root.replaceChildren();
  const disposer = await mountPlayer(root, rawPackage, {
    signal,
    onRendererFailure: (diagnostic: RendererFailureDiagnostic) => {
      if (signal.aborted) return;
      renderMessage("Renderer unavailable", diagnostic.message, true);
    },
  });
  if (signal.aborted) {
    disposer();
    return;
  }
  disposePlayer = disposer;
}

void startPlayer(startup.signal).catch((error: unknown) => {
  if (startup.signal.aborted) return;
  console.error("[player] startup failed", error);
  renderMessage(
    "Player unavailable",
    error instanceof Error ? error.message : String(error),
    true,
  );
});

const dispose = () => {
  if (startup.signal.aborted) return;
  startup.abort();
  disposePlayer?.();
  disposePlayer = null;
};
const onPageHide = (event: PageTransitionEvent) => {
  if (!event.persisted) dispose();
};
window.addEventListener("pagehide", onPageHide);

type HotModule = { dispose: (callback: () => void) => void };
(import.meta as ImportMeta & { hot?: HotModule }).hot?.dispose(() => {
  window.removeEventListener("pagehide", onPageHide);
  dispose();
});
