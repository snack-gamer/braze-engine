import { describe, expect, it, vi } from "vitest";
import { createAnimatorPlaybackEventPublisher } from "./animator-playback-event-port";

const event = {
  kind: "state" as const,
  characterId: "hero",
  layerId: "base",
  stateId: "idle",
  event: { id: "ready", name: "Ready", timeSeconds: 0, payload: {} },
};

describe("Animator playback event port", () => {
  it("publishes through a bounded disposable subscription seam", () => {
    const publisher = createAnimatorPlaybackEventPublisher(1);
    const listener = vi.fn();
    const subscription = publisher.port.subscribe(listener);

    expect(subscription.value).toBeTypeOf("function");
    expect(publisher.port.subscribe(vi.fn()).diagnostics[0]?.code)
      .toBe("animator-event-listener-capacity");
    publisher.publish(event);
    expect(listener).toHaveBeenCalledWith(event);

    subscription.value?.();
    publisher.publish(event);
    expect(listener).toHaveBeenCalledOnce();
    publisher.dispose();
    expect(publisher.port.subscribe(listener).diagnostics[0]?.code)
      .toBe("disposed-animator-event-port");
  });

  it("isolates listener failures", () => {
    const onError = vi.fn();
    const publisher = createAnimatorPlaybackEventPublisher(undefined, onError);
    const survivor = vi.fn();
    publisher.port.subscribe(() => { throw new Error("game callback failed"); });
    publisher.port.subscribe(survivor);

    expect(() => publisher.publish(event)).not.toThrow();
    expect(survivor).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      code: "animator-event-listener-failed",
    }));
  });

  it("falls back to the bounded default for a non-finite listener limit", () => {
    const publisher = createAnimatorPlaybackEventPublisher(Number.NaN);
    const subscriptions = Array.from({ length: 32 }, () => (
      publisher.port.subscribe(vi.fn())
    ));

    expect(subscriptions.every((subscription) => subscription.value)).toBe(true);
    expect(publisher.port.subscribe(vi.fn()).diagnostics[0]?.code)
      .toBe("animator-event-listener-capacity");
    publisher.dispose();
  });
});
