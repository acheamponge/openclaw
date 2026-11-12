import type { ProviderResolveDynamicModelContext } from "openclaw/plugin-sdk/plugin-entry";
import { defineSingleProviderPluginEntry } from "openclaw/plugin-sdk/provider-entry";
import {
  buildProviderReplayFamilyHooks,
  resolveFamilyForwardCompatModel,
} from "openclaw/plugin-sdk/provider-model-shared";
import { applyCrusoeConfig } from "./onboard.js";
import manifest from "./openclaw.plugin.json" with { type: "json" };
import {
  CRUSOE_BASE_URL,
  CRUSOE_DEFAULT_CONTEXT_WINDOW,
  CRUSOE_DEFAULT_MAX_TOKENS,
  CRUSOE_DEFAULT_MODEL_ID,
  CRUSOE_LIVE_MODEL_DISCOVERY,
  CRUSOE_PROVIDER_ID,
  isCrusoeCatalogModelId,
} from "./provider-catalog.js";

// Ids outside the manifest and the live listing get the endpoint's transport
// without a thinking ladder; the live listing is the source for everything else.
const CRUSOE_DYNAMIC_MODEL_COMPAT = {
  supportsUsageInStreaming: true,
  supportsPromptCacheKey: true,
  supportsStrictMode: false,
} as const;

function resolveCrusoeDynamicModel(ctx: ProviderResolveDynamicModelContext) {
  const modelId = ctx.modelId.trim();
  if (!modelId || isCrusoeCatalogModelId(modelId)) {
    return undefined;
  }

  return resolveFamilyForwardCompatModel({
    providerId: CRUSOE_PROVIDER_ID,
    modelId,
    ctx,
    cases: [
      {
        match: () => true,
        templateIds: [CRUSOE_DEFAULT_MODEL_ID],
        patch: ({ template }) =>
          template
            ? undefined
            : {
                api: "openai-completions",
                baseUrl: CRUSOE_BASE_URL,
                contextWindow: CRUSOE_DEFAULT_CONTEXT_WINDOW,
                maxTokens: CRUSOE_DEFAULT_MAX_TOKENS,
              },
      },
    ],
    patch: {
      provider: CRUSOE_PROVIDER_ID,
      reasoning: true,
      input: ["text"],
      compat: CRUSOE_DYNAMIC_MODEL_COMPAT,
    },
    synthesize: true,
  });
}

export default defineSingleProviderPluginEntry({
  id: CRUSOE_PROVIDER_ID,
  name: "Crusoe Provider",
  description: "Bundled Crusoe provider plugin",
  manifest,
  provider: {
    label: "Crusoe",
    docsPath: "/providers/crusoe",
    manifestAuth: { applyConfig: applyCrusoeConfig },
    catalog: {
      discoveryMode: "strict",
      allowExplicitBaseUrl: true,
      liveModelDiscovery: CRUSOE_LIVE_MODEL_DISCOVERY,
    },
    ...buildProviderReplayFamilyHooks({ family: "openai-compatible" }),
    resolveDynamicModel: resolveCrusoeDynamicModel,
    isModernModelRef: () => true,
  },
});
