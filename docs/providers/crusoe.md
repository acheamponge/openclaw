---
summary: "Crusoe setup (auth + model selection)"
title: "Crusoe"
read_when:
  - You want to use Crusoe Serverless Inference with OpenClaw
  - You need the Crusoe API key env var or default model id
  - You are choosing a thinking level on a Crusoe model
---

[Crusoe](https://crusoe.ai) serves open-weight models from its own GPU cloud through an OpenAI-compatible API. Install the official Crusoe provider plugin to use the current catalog and any model id your account can see at runtime.

| Property        | Value                                      |
| --------------- | ------------------------------------------ |
| Provider id     | `crusoe`                                   |
| Package         | `@openclaw/crusoe-provider`                |
| Auth env var    | `CRUSOE_API_KEY`                           |
| Onboarding flag | `--auth-choice crusoe-api-key`             |
| Direct CLI flag | `--crusoe-api-key <key>`                   |
| API             | OpenAI-compatible (`openai-completions`)   |
| Base URL        | `https://api.inference.crusoecloud.com/v1` |
| Default model   | `crusoe/openai/gpt-oss-120b`               |
| Default alias   | `GPT-OSS 120B`                             |

## Getting started

<Steps>
  <Step title="Install the plugin">
    ```bash
    openclaw plugins install @openclaw/crusoe-provider
    ```
  </Step>
  <Step title="Create a Crusoe API key">
    In the [Crusoe console](https://console.crusoecloud.com), open **Intelligence Foundry > Inference** and create an API key.
  </Step>
  <Step title="Set the Crusoe API key">
    <CodeGroup>

```bash Onboarding
openclaw onboard --auth-choice crusoe-api-key
```

```bash Direct flag
openclaw onboard --non-interactive --accept-risk --skip-health \
  --auth-choice crusoe-api-key \
  --crusoe-api-key "$CRUSOE_API_KEY"
```

```bash Env only
export CRUSOE_API_KEY=...
```

    </CodeGroup>

    Onboarding stores the key against the `crusoe` provider in your auth profiles and sets GPT-OSS 120B as the default model.

  </Step>
  <Step title="Verify the model is available">
    ```bash
    openclaw models list --provider crusoe
    ```

    The list should include `GPT-OSS 120B` and every other public chat model your key can see. If `CRUSOE_API_KEY` is unresolved, `openclaw models status --json` reports the missing credential under `auth.unusableProfiles`.

  </Step>
</Steps>

## Non-interactive setup

For scripted or CI installs, pass everything on the command line:

```bash
openclaw onboard --non-interactive \
  --mode local \
  --auth-choice crusoe-api-key \
  --crusoe-api-key "$CRUSOE_API_KEY" \
  --skip-health \
  --accept-risk
```

`--mode` defaults to `local`, so this is the same run as the **Direct flag**
command above. Run it on the Gateway host: remote-client onboarding
(`--mode remote`) only configures the local client connection and does not set
up provider credentials on the server.

## Built-in catalog

Setup saves connection settings and aliases without copying generated catalog rows into your config.
Explicit `models.mode: "replace"` keeps catalog seeding enabled; custom model rows stay intact.

| Model ref                                              | Name                                   | Input       | Context | Max output | Thinking                         |
| ------------------------------------------------------ | -------------------------------------- | ----------- | ------- | ---------- | -------------------------------- |
| `crusoe/openai/gpt-oss-120b`                           | GPT-OSS 120B                           | text        | 131,072 | 32,768     | low/medium/high (default medium) |
| `crusoe/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B`      | Nemotron 3 Super 120B A12B             | text        | 262,144 | 65,536     | off/on (default on)              |
| `crusoe/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`         | Nemotron 3 Nano 30B A3B                | text        | 262,144 | 65,536     | off/on (default on)              |
| `crusoe/nvidia/Nemotron-3-Nano-Omni-Reasoning-30B-A3B` | Nemotron 3 Nano Omni 30B A3B Reasoning | text, image | 262,144 | 65,536     | off/on (default on)              |
| `crusoe/google/gemma-4-31b-it`                         | Gemma 4 31B IT                         | text, image | 262,144 | 32,768     | off/on (default off)             |

Prices come from the [Crusoe pricing page](https://www.crusoe.ai/cloud/pricing) and are refreshed from the live model list on every catalog refresh. OpenClaw keeps conservative output caps on the built-in rows; the endpoint accepts larger `max_tokens` values.

## Live model list

With a key saved, OpenClaw lists every public chat deployment the key can see from `GET /v1/models` and keeps the vendor's ids, context windows, and prices. Private dedicated deployments and non-chat rows such as embeddings are not listed as chat models. New Crusoe models need no OpenClaw release: pick them as `crusoe/<model id>` once they appear in `openclaw models list --provider crusoe`.

## Thinking

Crusoe models control reasoning through the OpenAI `reasoning_effort` field, and reasoning text is returned in the message `reasoning` field, interleaved with tool calls.

- **GPT-OSS 120B** accepts `low`, `medium`, and `high`, and each level changes how long the model reasons. The model cannot turn reasoning off, so the thinking picker offers only those three levels.
- **Nemotron 3** and **Gemma 4** are hybrid-reasoning models: `reasoning_effort: "none"` turns reasoning off and any other level turns it on without changing its length. The picker therefore offers `off` and `on`. Nemotron 3 reasons by default; Gemma 4 does not.

Models that appear only in the live list get the endpoint transport and the generic thinking ladder. Configure a custom model row if a listed model needs a different ladder.

## Custom Crusoe model ids

OpenClaw accepts any Crusoe model id at runtime. Use the exact id shown by the live model list and prefix it with `crusoe/`. Dynamic ids use the endpoint's OpenAI-compatible API, advertise text input, and keep the default row's context and output caps. For a model with different capabilities, configure a custom model entry with its supported input types.

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "crusoe/zai-org/GLM-5.3",
      },
    },
  },
}
```

<AccordionGroup>
  <Accordion title="How model id prefixing works">
    Every Crusoe model ref in OpenClaw starts with `crusoe/` followed by the exact id from the Crusoe model list, which itself contains a slash. For example:

    - `crusoe/openai/gpt-oss-120b`
    - `crusoe/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B`

    OpenClaw strips the `crusoe/` prefix when constructing the API request and sends the remaining id to the Crusoe endpoint as the OpenAI-compatible `model` field.

  </Accordion>

  <Accordion title="Environment availability for the daemon">
    If the Gateway runs as a managed service (launchd, systemd, Docker), the Crusoe key must be visible to that process, not just to your interactive shell.

    <Warning>
      A key exported only in an interactive shell will not help a launchd or systemd daemon unless that environment is imported there too. Set the key in `~/.openclaw/.env` or via `env.shellEnv` to make it readable from the gateway process.
    </Warning>

    OpenClaw loads `~/.openclaw/.env` when it loads config, so keys stored there reach managed gateway services on every platform. Restart the gateway (or re-run `openclaw doctor --fix`) after rotating the key.

  </Accordion>
</AccordionGroup>

## Related

<CardGroup cols={2}>
  <Card title="Model providers" href="/concepts/model-providers" icon="layers">
    Choosing providers, model refs, and failover behavior.
  </Card>
  <Card title="Thinking modes" href="/tools/thinking" icon="brain">
    `/think` levels, provider policies, and routing reasoning-capable models.
  </Card>
  <Card title="Crusoe docs" href="https://docs.crusoecloud.com/serverless-inference/overview" icon="book">
    Serverless Inference overview, available models, and rate limits.
  </Card>
  <Card title="Troubleshooting" href="/help/troubleshooting" icon="wrench">
    General troubleshooting and FAQ.
  </Card>
</CardGroup>
