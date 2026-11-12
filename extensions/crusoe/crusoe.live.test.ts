// Crusoe live tests prove model discovery, streamed text, and a tool-call round trip.
import {
  completeSimple,
  streamSimple,
  type AssistantMessage,
  type Model,
  type Tool,
} from "openclaw/plugin-sdk/llm";
import { registerSingleProviderPlugin } from "openclaw/plugin-sdk/plugin-test-runtime";
import type { ProviderCatalogContext } from "openclaw/plugin-sdk/provider-catalog-shared";
import { extractNonEmptyAssistantText, isLiveTestEnabled } from "openclaw/plugin-sdk/test-live";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";
import {
  buildCrusoeCatalogModels,
  CRUSOE_BASE_URL,
  CRUSOE_DEFAULT_MODEL_ID,
} from "./provider-catalog.js";

const CRUSOE_API_KEY = process.env.CRUSOE_API_KEY?.trim() ?? "";
const LIVE = isLiveTestEnabled(["CRUSOE_LIVE_TEST"]) && CRUSOE_API_KEY.length > 0;
const describeLive = LIVE ? describe : describe.skip;
const manifestModelIds = buildCrusoeCatalogModels().map((model) => model.id);

function liveCatalogContext(): ProviderCatalogContext {
  return {
    config: {},
    env: {},
    resolveProviderApiKey: () => ({ apiKey: CRUSOE_API_KEY }),
    resolveProviderAuth: () => ({ apiKey: CRUSOE_API_KEY, mode: "api_key", source: "profile" }),
  };
}

async function discoverLiveCatalog() {
  const provider = await registerSingleProviderPlugin(plugin);
  const result = await provider.catalog?.run(liveCatalogContext());
  if (!result || !("provider" in result)) {
    throw new Error(`Crusoe live discovery failed: ${JSON.stringify(result?.outcomes)}`);
  }
  return result.provider;
}

function liveModel(id: string): Model<"openai-completions"> {
  return {
    provider: "crusoe",
    baseUrl: CRUSOE_BASE_URL,
    id,
    name: id,
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8192,
  } as Model<"openai-completions">;
}

function liveEchoTool(): Tool {
  return {
    name: "live_echo",
    description: "Return the supplied value.",
    parameters: Type.Object({ value: Type.String() }, { additionalProperties: false }),
  };
}

function requireToolCall(message: AssistantMessage) {
  const toolCall = message.content.find((block) => block.type === "toolCall");
  if (toolCall?.type !== "toolCall") {
    throw new Error(`Crusoe live model did not call a tool: ${message.stopReason}`);
  }
  return toolCall;
}

describeLive("crusoe plugin live", () => {
  it("lists the account's public chat deployments including the manifest rows", async () => {
    const provider = await discoverLiveCatalog();
    for (const modelId of manifestModelIds) {
      const model = provider.models.find((candidate) => candidate.id === modelId);
      expect(model, `listed manifest model ${modelId}`).toBeDefined();
      expect(model?.cost.input).toBeGreaterThan(0);
      expect(model?.contextWindow).toBeGreaterThan(0);
    }
  }, 30_000);

  it("streams text with a reasoning effort on the default model", async () => {
    const catalog = await discoverLiveCatalog();
    const definition = catalog.models.find((model) => model.id === CRUSOE_DEFAULT_MODEL_ID);
    if (!definition) {
      throw new Error(`Crusoe live catalog did not include ${CRUSOE_DEFAULT_MODEL_ID}`);
    }
    let payload: Record<string, unknown> | undefined;
    const stream = await streamSimple(
      { ...liveModel(CRUSOE_DEFAULT_MODEL_ID), ...definition } as Model<"openai-completions">,
      { messages: [{ role: "user", content: "Reply with exactly: ok", timestamp: Date.now() }] },
      {
        apiKey: CRUSOE_API_KEY,
        maxTokens: 2048,
        reasoning: "low",
        onPayload: (value) => {
          payload = value as Record<string, unknown>;
        },
      },
    );
    const response = await stream.result();
    if (response.stopReason === "error") {
      throw new Error(response.errorMessage || "Crusoe stream returned an error");
    }
    expect(payload?.reasoning_effort).toBe("low");
    expect(extractNonEmptyAssistantText(response.content)).toMatch(/ok/i);
  }, 60_000);

  it.each(manifestModelIds)(
    "completes a tool-call round trip with %s",
    async (modelId) => {
      const catalog = await discoverLiveCatalog();
      const definition = catalog.models.find((candidate) => candidate.id === modelId);
      if (!definition) {
        throw new Error(`Crusoe live catalog did not include ${modelId}`);
      }
      const model = { ...liveModel(modelId), ...definition } as Model<"openai-completions">;
      const tool = liveEchoTool();
      const userPrompt = {
        role: "user" as const,
        content: "Call live_echo with value crusoe. Do not answer directly.",
        timestamp: Date.now() - 3,
      };
      const first = await completeSimple(
        model,
        { messages: [userPrompt], tools: [tool] },
        { apiKey: CRUSOE_API_KEY, maxTokens: 2048, reasoning: "low" },
      );
      if (first.stopReason === "error") {
        throw new Error(first.errorMessage || "Crusoe first turn returned an error");
      }
      const toolCall = requireToolCall(first);
      expect(toolCall.name).toBe("live_echo");
      expect(toolCall.arguments).toEqual({ value: "crusoe" });

      const second = await completeSimple(
        model,
        {
          messages: [
            userPrompt,
            first,
            {
              role: "toolResult",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: [{ type: "text", text: "ok" }],
              isError: false,
              timestamp: Date.now() - 1,
            },
            { role: "user", content: "Reply with exactly: ok", timestamp: Date.now() },
          ],
          tools: [tool],
        },
        { apiKey: CRUSOE_API_KEY, maxTokens: 2048, reasoning: "low" },
      );
      if (second.stopReason === "error") {
        throw new Error(second.errorMessage || "Crusoe second turn returned an error");
      }
      expect(extractNonEmptyAssistantText(second.content)).toMatch(/^ok[.!]?$/i);
    },
    120_000,
  );
});
