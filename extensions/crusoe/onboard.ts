import { createDefaultModelsConnectionPresetAppliers } from "openclaw/plugin-sdk/provider-onboard";
import {
  buildCrusoeCatalogModels,
  buildCrusoeProvider,
  CRUSOE_DEFAULT_MODEL_ID,
  CRUSOE_DEFAULT_MODEL_REF,
  CRUSOE_PROVIDER_ID,
} from "./provider-catalog.js";

export const { applyConfig: applyCrusoeConfig } = createDefaultModelsConnectionPresetAppliers<[]>({
  primaryModelRef: CRUSOE_DEFAULT_MODEL_REF,
  resolveParams: () => {
    const defaultProvider = buildCrusoeProvider();
    return {
      providerId: CRUSOE_PROVIDER_ID,
      api: defaultProvider.api ?? "openai-completions",
      baseUrl: defaultProvider.baseUrl,
      defaultModels: buildCrusoeCatalogModels,
      defaultModelId: CRUSOE_DEFAULT_MODEL_ID,
      aliases: [{ modelRef: CRUSOE_DEFAULT_MODEL_REF, alias: "GPT-OSS 120B" }],
    };
  },
});
