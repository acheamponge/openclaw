import type { ProviderRuntimeModel } from "openclaw/plugin-sdk/plugin-entry";
import { registerSingleProviderPlugin } from "openclaw/plugin-sdk/plugin-test-runtime";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createProviderDynamicModelContext,
  runSingleProviderCatalog,
} from "../test-support/provider-model-test-helpers.js";
import crusoePlugin from "./index.js";
import {
  CRUSOE_BASE_URL,
  CRUSOE_DEFAULT_CONTEXT_WINDOW,
  CRUSOE_DEFAULT_MAX_TOKENS,
  CRUSOE_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

const makeModel = (overrides: Partial<ProviderRuntimeModel> = {}): ProviderRuntimeModel => ({
  id: CRUSOE_DEFAULT_MODEL_ID,
  name: CRUSOE_DEFAULT_MODEL_ID,
  provider: "crusoe",
  api: "openai-completions",
  baseUrl: CRUSOE_BASE_URL,
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: CRUSOE_DEFAULT_CONTEXT_WINDOW,
  maxTokens: CRUSOE_DEFAULT_MAX_TOKENS,
  ...overrides,
});

describe("crusoe provider plugin", () => {
  let provider: Awaited<ReturnType<typeof registerSingleProviderPlugin>>;
  beforeEach(async () => {
    provider = await registerSingleProviderPlugin(crusoePlugin);
  });
  const resolveModel = (modelId: string, models = [makeModel()]) =>
    provider.resolveDynamicModel?.(
      createProviderDynamicModelContext({ provider: "crusoe", modelId, models }),
    );

  it("builds the static Crusoe catalog", async () => {
    const catalog = await runSingleProviderCatalog({ catalog: provider.staticCatalog });
    expect(catalog).toMatchObject({ api: "openai-completions", baseUrl: CRUSOE_BASE_URL });
    expect(catalog.models?.map((model) => model.id)).toEqual([
      "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B",
      "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      "nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B",
      "google/gemma-4-31b-it",
      "openai/gpt-oss-120b",
    ]);
    expect(catalog.models?.find((model) => model.id === CRUSOE_DEFAULT_MODEL_ID)).toMatchObject({
      id: CRUSOE_DEFAULT_MODEL_ID,
      name: "GPT-OSS 120B",
      reasoning: true,
      input: ["text"],
      contextWindow: CRUSOE_DEFAULT_CONTEXT_WINDOW,
      maxTokens: CRUSOE_DEFAULT_MAX_TOKENS,
      compat: { supportedReasoningEfforts: ["low", "medium", "high"], thinkingRequired: true },
    });
  });

  it("registers no thinking hook: manifest rows own their profiles", () => {
    expect(provider.resolveThinkingProfile).toBeUndefined();
  });

  it.each([
    undefined,
    makeModel({
      api: "openai-responses",
      baseUrl: "https://models.example.test/v1",
      headers: { "X-Route": "custom-template" },
      contextWindow: 64_000,
      maxTokens: 16_000,
      cost: { input: 2, output: 3, cacheRead: 1, cacheWrite: 0 },
    }),
  ])("resolves forward-compat models with template %j", (model) => {
    const template = model ?? makeModel();
    const id = "zai-org/GLM-5.3";
    const resolved = resolveModel(id, model ? [model] : []);
    expect(resolved).toMatchObject({
      ...template,
      id,
      name: id,
      provider: "crusoe",
      reasoning: true,
      input: ["text"],
    });
    expect(resolved?.headers).toEqual(template.headers);
  });

  it("does not copy the default row's thinking ladder onto unlisted ids", () => {
    const resolved = resolveModel("deepseek-ai/Deepseek-V4-Flash");
    expect(resolved?.compat).toMatchObject({
      supportsUsageInStreaming: true,
      supportsPromptCacheKey: true,
      supportsStrictMode: false,
    });
    expect(resolved?.compat).not.toHaveProperty("thinkingRequired");
    expect(resolved?.compat).not.toHaveProperty("supportedReasoningEfforts");
  });

  it("defers manifest catalog models to core static-catalog resolution", () => {
    expect(resolveModel(CRUSOE_DEFAULT_MODEL_ID)).toBeUndefined();
    expect(resolveModel("google/gemma-4-31b-it")).toBeUndefined();
  });
});
