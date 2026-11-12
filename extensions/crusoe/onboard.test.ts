import { resolveAgentModelPrimaryValue } from "openclaw/plugin-sdk/provider-onboard";
import { describe, expect, it } from "vitest";
import { applyCrusoeConfig } from "./onboard.js";
import { buildCrusoeCatalogModels, CRUSOE_DEFAULT_MODEL_REF } from "./provider-catalog.js";

describe("Crusoe onboarding", () => {
  it("applies the manifest catalog, default, and alias in replace mode", () => {
    const config = applyCrusoeConfig({ models: { mode: "replace" } });

    expect(config.models?.providers?.crusoe?.models).toEqual(buildCrusoeCatalogModels());
    expect(resolveAgentModelPrimaryValue(config.agents?.defaults?.model)).toBe(
      "crusoe/openai/gpt-oss-120b",
    );
    expect(config.agents?.defaults?.models).toEqual({
      [CRUSOE_DEFAULT_MODEL_REF]: { alias: "GPT-OSS 120B" },
    });
  });

  it("preserves an explicitly configured primary model and its alias", () => {
    const pinnedRef = "crusoe/zai-org/GLM-5.3";
    const config = applyCrusoeConfig({
      agents: {
        defaults: { model: pinnedRef, models: { [pinnedRef]: { alias: "Pinned route" } } },
      },
    });

    expect(resolveAgentModelPrimaryValue(config.agents?.defaults?.model)).toBe(pinnedRef);
    expect(config.agents?.defaults?.models?.[pinnedRef]).toEqual({ alias: "Pinned route" });
  });

  it("leaves ordinary catalogs runtime-owned", () => {
    const config = applyCrusoeConfig({});

    expect(config.models?.providers?.crusoe?.models).toEqual([]);
    expect(config.agents?.defaults?.models?.[CRUSOE_DEFAULT_MODEL_REF]).toEqual({
      alias: "GPT-OSS 120B",
    });
    expect(applyCrusoeConfig(config)).toEqual(config);
  });
});
