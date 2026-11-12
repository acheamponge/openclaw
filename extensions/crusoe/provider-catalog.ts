import {
  buildOpenAICompatibleLiveModels,
  type OpenAICompatibleModelDiscoveryOptions,
} from "openclaw/plugin-sdk/provider-catalog-live-runtime";
import {
  buildManifestModelProviderConfig,
  readManifestProviderDefaultModelRef,
} from "openclaw/plugin-sdk/provider-catalog-shared";
import type {
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-model-shared";
import { asPositiveSafeInteger, isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import manifest from "./openclaw.plugin.json" with { type: "json" };

export const CRUSOE_PROVIDER_ID = "crusoe";

const CRUSOE_MANIFEST_PROVIDER = buildManifestModelProviderConfig({
  providerId: CRUSOE_PROVIDER_ID,
  catalog: manifest.modelCatalog.providers.crusoe,
});
export const CRUSOE_DEFAULT_MODEL_REF = readManifestProviderDefaultModelRef(
  manifest,
  CRUSOE_PROVIDER_ID,
)!;

export const CRUSOE_BASE_URL = CRUSOE_MANIFEST_PROVIDER.baseUrl;
export const CRUSOE_DEFAULT_MODEL_ID = CRUSOE_DEFAULT_MODEL_REF.slice(
  `${CRUSOE_PROVIDER_ID}/`.length,
);

const CRUSOE_DEFAULT_MODEL = CRUSOE_MANIFEST_PROVIDER.models.find(
  (model) => model.id === CRUSOE_DEFAULT_MODEL_ID,
);
if (!CRUSOE_DEFAULT_MODEL?.contextWindow || !CRUSOE_DEFAULT_MODEL.maxTokens) {
  throw new Error(`Missing Crusoe modelCatalog row ${CRUSOE_DEFAULT_MODEL_ID}`);
}

export const CRUSOE_DEFAULT_CONTEXT_WINDOW: number = CRUSOE_DEFAULT_MODEL.contextWindow;
export const CRUSOE_DEFAULT_MAX_TOKENS: number = CRUSOE_DEFAULT_MODEL.maxTokens;

export function isCrusoeNativeModel(
  model: { api?: string; baseUrl?: string } | undefined,
  sourceApi = model?.api,
): boolean {
  return (
    sourceApi === "openai-completions" && model?.baseUrl?.replace(/\/+$/, "") === CRUSOE_BASE_URL
  );
}

export function isCrusoeCatalogModelId(modelId: string): boolean {
  return CRUSOE_MANIFEST_PROVIDER.models.some((model) => model.id === modelId);
}

export function buildCrusoeCatalogModels(): ModelDefinitionConfig[] {
  return CRUSOE_MANIFEST_PROVIDER.models;
}

export function buildCrusoeProvider(): ModelProviderConfig {
  return buildManifestModelProviderConfig({
    providerId: CRUSOE_PROVIDER_ID,
    catalog: manifest.modelCatalog.providers.crusoe,
  });
}

function readLowercaseString(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// Crusoe lists every deployment the key can see, including private dedicated
// deployments and non-chat rows such as embeddings. Only public chat rows are
// selectable models; rows without those fields (other inventory shapes) pass.
// The modality decides it: `type` reads "multimodal" on vision models and is
// blank on some chat models (GET /v1/models, captured 2026-09-12).
function isCrusoeChatRow(row: Record<string, unknown>): boolean {
  if (row.is_public === false) {
    return false;
  }
  const architecture = isRecord(row.architecture) ? row.architecture : undefined;
  const modality = readLowercaseString(architecture?.modality);
  return modality === "" || modality === "text" || modality === "multimodal";
}

/** Crusoe publishes USD per million tokens as decimal strings. */
function readPricePerMillion(value: unknown): number | undefined {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\s*\d+(?:\.\d+)?\s*$/.test(text)) {
    return undefined;
  }
  const price = Number(text);
  return Number.isFinite(price) && price >= 0 ? price : undefined;
}

function enrichCrusoeModel(
  model: ModelDefinitionConfig,
  record: Record<string, unknown>,
): ModelDefinitionConfig {
  const manifestModel = CRUSOE_MANIFEST_PROVIDER.models.find((entry) => entry.id === model.id);
  const base: ModelDefinitionConfig = manifestModel
    ? { ...manifestModel, input: [...manifestModel.input] }
    : model;
  const contextWindow =
    asPositiveSafeInteger(record.context_length) ??
    base.contextWindow ??
    CRUSOE_DEFAULT_CONTEXT_WINDOW;
  const topProvider = isRecord(record.top_provider) ? record.top_provider : undefined;
  const listedMaxTokens = asPositiveSafeInteger(topProvider?.max_completion_tokens);
  // Manifest rows keep their reviewed output caps; listed-only rows take the
  // vendor's cap, bounded by the context window.
  const maxTokens = manifestModel
    ? base.maxTokens
    : Math.min(listedMaxTokens ?? base.maxTokens ?? CRUSOE_DEFAULT_MAX_TOKENS, contextWindow);
  const pricing = isRecord(record.pricing) ? record.pricing : undefined;
  const input = readPricePerMillion(pricing?.prompt);
  const output = readPricePerMillion(pricing?.completion);
  const cacheRead = readPricePerMillion(pricing?.input_cache_reads);
  const cost =
    input !== undefined && output !== undefined
      ? { input, output, cacheRead: cacheRead ?? input, cacheWrite: 0 }
      : base.cost;
  const architecture = isRecord(record.architecture) ? record.architecture : undefined;
  const inputModalities: ModelDefinitionConfig["input"] =
    readLowercaseString(architecture?.modality) === "multimodal" || base.input.includes("image")
      ? ["text", "image"]
      : ["text"];
  return { ...base, contextWindow, maxTokens, cost, input: inputModalities };
}

export function projectCrusoeModels(
  rows: readonly unknown[],
  fallback: ModelProviderConfig,
): ModelDefinitionConfig[] {
  const records = rows.filter(
    (row): row is Record<string, unknown> => isRecord(row) && isCrusoeChatRow(row),
  );
  const recordsById = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (id && !recordsById.has(id)) {
      recordsById.set(id, record);
    }
  }
  return buildOpenAICompatibleLiveModels(records, fallback).map((model) => {
    const record = recordsById.get(model.id);
    return record ? enrichCrusoeModel(model, record) : model;
  });
}

export const CRUSOE_LIVE_MODEL_DISCOVERY: OpenAICompatibleModelDiscoveryOptions = {
  projectRows: projectCrusoeModels,
};
