import { describe, expect, it } from "vitest";
import { classifyIntent } from "./local-answers";

describe("classifyIntent", () => {
  it("routes greetings", () => {
    expect(classifyIntent("hi")).toBe("greeting");
    expect(classifyIntent("Hello there")).toBe("greeting");
    expect(classifyIntent("good morning")).toBe("greeting");
  });

  it("routes SKU lookups before anything else", () => {
    expect(classifyIntent("how is CHG-001 doing")).toBe("sku");
    expect(classifyIntent("acc-001")).toBe("sku");
  });

  it("routes reorder intent", () => {
    expect(classifyIntent("What should I reorder this week?")).toBe("reorder");
    expect(classifyIntent("anything running out soon?")).toBe("reorder");
    expect(classifyIntent("what is about to stock out")).toBe("reorder");
  });

  it("routes promo intent, including pasted promo copy", () => {
    expect(classifyIntent("draft a weekend promo for slow movers")).toBe("promo");
    expect(
      classifyIntent(
        "Weekend offer at Cedar Electronics: save 15% on USB Flash Drive 128GB. Available while stock lasts.",
      ),
    ).toBe("promo");
  });

  it("routes sales questions", () => {
    expect(classifyIntent("How were sales this week?")).toBe("sales");
    expect(classifyIntent("what were my best sellers")).toBe("sales");
  });

  it("routes inventory questions", () => {
    expect(classifyIntent("what is low on stock right now")).toBe("inventory");
    expect(classifyIntent("how many wireless mice do we have available")).toBe(
      "inventory",
    );
  });

  it("falls back to a snapshot for anything else", () => {
    expect(classifyIntent("tell me something useful")).toBe("snapshot");
    expect(classifyIntent("what do you think")).toBe("snapshot");
  });
});
