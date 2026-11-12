import type { ModelProviderConfig } from "openclaw/plugin-sdk/provider-model-shared";
import { describe, expect, it } from "vitest";
import {
  buildCrusoeCatalogModels,
  CRUSOE_BASE_URL,
  CRUSOE_DEFAULT_MODEL_ID,
  isCrusoeNativeModel,
  projectCrusoeModels,
} from "./provider-catalog.js";

const fallback: ModelProviderConfig = {
  baseUrl: CRUSOE_BASE_URL,
  api: "openai-completions",
  models: [],
};

// Shape of `GET /v1/models` on api.inference.crusoecloud.com (captured 2026-09-12).
function liveRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    object: "model",
    created: 0,
    owned_by: "openai",
    is_public: true,
    type: "chat",
    context_length: 131072,
    architecture: { modality: "text", instruct_type: "chat" },
    supported_parameters: ["reasoning_effort", "tools", "max_tokens"],
    is_billed_by_token: true,
    pricing: {
      prompt: "0.05",
      completion: "0.25",
      image: "0",
      request: "0",
      video: "0",
      input_cache_reads: "0.05",
    },
    top_provider: { context_length: 131072, max_completion_tokens: 131072 },
    ...overrides,
  };
}

describe("Crusoe live model projection", () => {
  it("keeps only public chat deployments", () => {
    const models = projectCrusoeModels(
      [
        liveRow({ id: "openai/gpt-oss-120b" }),
        liveRow({ id: "example/private-deployment", is_public: false, type: "" }),
        liveRow({
          id: "example/embedding-model",
          architecture: { modality: "embedding" },
          type: "embedding",
        }),
        liveRow({ id: "example/image-model", architecture: { modality: "image" } }),
        "not-a-row",
        { object: "model" },
      ],
      fallback,
    );
    expect(models.map((model) => model.id)).toEqual(["openai/gpt-oss-120b"]);
  });

  it("keeps vision and untyped chat rows whatever the type field says", () => {
    const models = projectCrusoeModels(
      [
        liveRow({
          id: "google/gemma-4-31b-it",
          type: "multimodal",
          architecture: { modality: "multimodal" },
        }),
        liveRow({ id: "nvidia/Nemotron-3.5-Lightning-30B-A3B", type: "" }),
      ],
      fallback,
    );
    expect(models.map((model) => model.id)).toEqual([
      "google/gemma-4-31b-it",
      "nvidia/Nemotron-3.5-Lightning-30B-A3B",
    ]);
    expect(models[0]?.input).toEqual(["text", "image"]);
  });

  it("admits rows from other inventory shapes that carry only an id", () => {
    const models = projectCrusoeModels(
      [{ id: "contract-probe-chat-1", object: "model", metadata: { tags: [] } }],
      fallback,
    );
    expect(models.map((model) => model.id)).toEqual(["contract-probe-chat-1"]);
  });

  it("overlays manifest rows with the listed context and pricing", () => {
    const [model] = projectCrusoeModels(
      [
        liveRow({
          id: CRUSOE_DEFAULT_MODEL_ID,
          context_length: 200000,
          pricing: { prompt: "0.10", completion: "0.50", input_cache_reads: "0.02" },
        }),
      ],
      fallback,
    );
    const manifestModel = buildCrusoeCatalogModels().find(
      (entry) => entry.id === CRUSOE_DEFAULT_MODEL_ID,
    );
    expect(model).toMatchObject({
      id: CRUSOE_DEFAULT_MODEL_ID,
      name: manifestModel?.name,
      reasoning: true,
      contextWindow: 200000,
      maxTokens: manifestModel?.maxTokens,
      cost: { input: 0.1, output: 0.5, cacheRead: 0.02, cacheWrite: 0 },
      compat: manifestModel?.compat,
    });
  });

  it("projects listed-only rows from the vendor fields", () => {
    const [model] = projectCrusoeModels(
      [
        liveRow({
          id: "zai-org/GLM-5.3-Flash",
          name: "zai-org/GLM-5.3-Flash",
          context_length: 1048576,
          architecture: { modality: "multimodal" },
          pricing: { prompt: "0.15", completion: "0.50", input_cache_reads: "0.03" },
          top_provider: { context_length: 1048576, max_completion_tokens: 131072 },
        }),
      ],
      fallback,
    );
    expect(model).toMatchObject({
      id: "zai-org/GLM-5.3-Flash",
      input: ["text", "image"],
      contextWindow: 1048576,
      maxTokens: 131072,
      cost: { input: 0.15, output: 0.5, cacheRead: 0.03, cacheWrite: 0 },
    });
    expect(model.compat).toBeUndefined();
  });

  it("bounds a listed output cap by the context window and ignores bad prices", () => {
    const [model] = projectCrusoeModels(
      [
        liveRow({
          id: "example/odd-row",
          context_length: 8192,
          pricing: { prompt: "free", completion: "0.50" },
          top_provider: { max_completion_tokens: 32768 },
        }),
      ],
      fallback,
    );
    expect(model.maxTokens).toBe(8192);
    expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("recognizes native Crusoe routes by transport and base URL", () => {
    expect(isCrusoeNativeModel({ api: "openai-completions", baseUrl: `${CRUSOE_BASE_URL}/` })).toBe(
      true,
    );
    expect(isCrusoeNativeModel({ api: "openai-responses", baseUrl: CRUSOE_BASE_URL })).toBe(false);
    expect(
      isCrusoeNativeModel({ api: "openai-completions", baseUrl: "https://proxy.example.test/v1" }),
    ).toBe(false);
  });
});
