# AI Integration Summary

**Author:** Tsholo K. Setati  
**Project:** ID-8 (Microsoft Innovation Hub Enterprise Discovery)

## What's New? 🤖✨

I've added powerful AI capabilities to the ID-8 (Microsoft Innovation Hub Use Case Assessment) tool to make the discovery process smarter, faster, and more insightful.

## Key AI Features

### 1. 💡 Smart Question Assistance (Standard Discovery)
**What it does**: Helps you think through complex discovery questions
**How to use**: Click the "Need help?" button next to any question
**Result**: Get thoughtful prompts and examples tailored to your industry and context

### 2. 🎯 Real-Time Discovery Insights (Live Discovery)
**What it does**: Analyzes your voice responses in real-time
**How to use**: Click "Get AI Insight" after answering a question
**Result**: Receive immediate analysis highlighting opportunities and suggesting areas to explore

### 3. 🚀 Automatic Use Case Generation
**What it does**: Generates 5-8 relevant, evidence-backed candidates based on your discovery session
**How to use**: Happens automatically at the end of discovery
**Result**: Lean candidates with business outcomes, KPIs, process context, risk, and complexity. Detailed Microsoft solution mapping is intentionally deferred until after scoring.

### 4. 🏗️ Post-Ranking Solution Mapping
**What it does**: Maps the top-ranked use case to Microsoft products, services, a reference architecture, implementation complexity, compliance, security, and an optional agentic pattern
**How to use**: Complete Impact/Feasibility and RICE scoring, then select **Solution Design**
**Result**: The ranked use case is saved with mapping provenance and opens as the linked seed in Solution Blueprint. If AI mapping is unavailable, deterministic archetype inference still opens the workspace.

### 5. 📄 Professional Executive Summaries
**What it does**: Creates executive-ready summaries of your discovery sessions
**How to use**: Generated automatically after scoring all use cases
**Result**: 3-4 paragraph summary covering key findings, recommendations with scores, and strategic next steps

## AI Model Information

The application uses task-specific model routing and bounded output budgets:

- **Development**: Foundry Local first when explicitly enabled, then Azure OpenAI if the local service is unavailable or returns an invalid response.
- **Production**: Azure OpenAI only, followed by the typed deterministic fallback owned by each feature.
- **Strict JSON**: GPT-5-nano for extraction/formatting. Explicit Phi JSON requests are routed server-side to nano because the existing Phi deployment times out in JSON mode; plain-text Phi requests are unchanged.
- **Embeddings**: 1536 dimensions; production reuses the existing `text-embedding-3-large` deployment with `dimensions: 1536`. The local default remains `text-embedding-3-small`.
- **Images**: `gpt-image-1-mini` with low-cost quality defaults.

The API exposes separate liveness and readiness checks:

- `/api/health` confirms that the Functions host is serving requests.
- `/api/ai-readiness` checks configuration only, with **zero inference calls**. `configured` means settings are present, not that inference was tested.
- `/api/ai-readiness?refresh=true` is an authenticated, explicitly metered connection test. Its result is cached for 15 minutes; normal generation never performs this preflight.

The status badge checks every 15 minutes while the page is visible. Clicking it explicitly tests inference. Chat requests have a 35-second provider timeout and a 40-second browser timeout, below the managed API's 45-second limit; ambiguous failures are never automatically replayed.

Use-case candidates and ranked solution mappings are validated against bounded schemas. Permanent provider failures are not retried; the application automatically switches candidate generation to clearly labelled industry templates.

## Azure Authentication

Set `AZURE_OPENAI_AUTH_TYPE` explicitly in every environment:

- `key` (managed production mode): uses `AZURE_OPENAI_API_KEY` in the Static Web App's encrypted API settings. Managed Functions do not support managed identity or Key Vault references. Keys are never returned to the browser.
- `entra-id`: supported for local development or a separately managed host. The developer identity requires **Cognitive Services OpenAI User** on the existing AI Services/OpenAI account.

The two modes are strict. An Entra failure does not silently cross over to a configured key.

User authentication is separate from model authentication: the application requires the platform's Microsoft Entra (`aad`) identity, checks it again in a shared HTTP invocation policy, and rejects other identity providers. The Free plan uses Static Web Apps' preconfigured Entra provider. This requires an Entra account, not membership of a particular tenant; tenant-specific/custom registration would require an additional access design or Standard plan.

Public routes are limited to liveness/configuration, scheduled feed reads, questionnaire configuration by unguessable link token, and questionnaire submission. Creating questionnaires and reading submissions also require sign-in; the existing admin token is still required for submissions.

For direct local Functions development only, set `ID8_ALLOW_ANONYMOUS_LOCAL=true` in ignored local settings and configure Azurite or a development Storage account. The bypass is ignored in Azure/production. The Vite development UI skips the production sign-in gate; production builds do not.

## Server cost controls

- Atomic Azure Table Storage transactions reserve both per-user and application-wide quotas before billable work. Storage failures fail closed.
- Defaults: 200 requests/user/day, 2,000/application/day; 20/user/minute, 100/application/minute.
- Conservative token reservations: 200,000/user/day and 2,000,000/application/day, counting input UTF-8 bytes, a message-overhead allowance, and the maximum output budget. Failed/uncertain requests retain their reservation; these are safety ceilings, not estimates of billed dollars.
- Images: one low-quality image/request, three/user/day and 15/application/day.
- OCR: first ten pages/request; 50 reserved pages/user/day and 200/application/day. Longer scanned files must be split explicitly.
- Agent runs: five/user/day and 20/application/day; provider run caps are 8,000 prompt and 2,000 completion tokens.
- Combined chat/system input is capped at 48,000 UTF-8 bytes. Embedding batches allow 1-16 inputs and at most 32,000 combined bytes.
- Output ceilings are task-specific; executive content defaults to the mini route. `AI_ALLOW_PREMIUM=true` is required to authorize the premium alias.
- Successful completions are cached privately per signed-in user for 15 minutes in Blob Storage. Concurrent requests share work; cross-instance leases prevent duplicate paid requests. Cached responses report zero new tokens.
- Application Insights samples successful traffic and suppresses routine liveness/configuration results. Retained monitoring history is not deleted.

Quota settings use `AI_*` and `AI_USER_*` prefixes; see `quota-store.ts` and `configure-managed-api.ts` for the complete names. The browser displays actual provider tokens/deployment, not character-based dollar guesses. Azure budget alerts are advisory, not hard spending limits.

## Blob-backed knowledge retrieval

`POST /api/search-knowledge` preserves `{ query, top?, category? }` and returns `{ items, count, vector, provider, message? }`. The provider is `blob-hybrid`.

The existing private Storage account holds `knowledge-index/id8-knowledge.json`. Each warm managed Function caches the validated index for five minutes and revalidates its ETag. Ranking combines BM25 keyword scores and cosine vector similarity with reciprocal rank fusion. Query embeddings are cached in memory for one hour. No dedicated search compute is provisioned.

This is suitable for ID-8's 56-document, low-traffic reference corpus, **not** an unlimited enterprise search replacement:

| Option | Suitable use | Trade-off |
| --- | --- | --- |
| Existing Blob + managed Functions (selected) | Small, infrequent knowledge retrieval | 1,000 documents / 32 MiB guardrails, in-memory linear vector scan; no managed semantic ranker |
| SQLite FTS/vector extension | Local or single-host applications | Persistent writable database and native-extension packaging are awkward in managed Functions |
| PostgreSQL + pgvector | A larger corpus when PostgreSQL already exists | A new standalone database adds baseline cost and operations |
| Dedicated Azure AI Search | Large corpus, high QPS, managed indexing/ranking and enterprise features | Fixed capacity costs even when idle |

When embeddings are unavailable, the API logs the reason and explicitly reports keyword-only results. Missing or corrupt indexes return an error, not an empty success. Only public reference material belongs in the shared index; customer-specific corpora need tenant-scoped storage and authorization.

The migration script exports every ID-8-owned source index to non-expiring `knowledge-backups/` blobs, verifies document IDs/content/metadata, regenerates non-retrievable source vectors once, and verifies the destination checksum. It does not delete Search. Preserve the backup and validate authenticated retrieval before deleting the source service.

After `az login`, `npm --prefix api run knowledge:verify` checks real Blob/vector retrieval, cache round trips and durable quota boundaries. `npm --prefix api run verify:managed` invokes the protected handlers locally with test platform identities against existing Azure dependencies and verifies the deployed gateway's anonymous rejections and public questionnaire round trip. It creates and deletes only synthetic questionnaire/submission and verification-user quota rows; it never sends fake identity headers to the live gateway. This is an operator-authorized integration check, not a completed end-to-end Entra browser login.

`ai-response-cache/` expires after one day. Knowledge indexes, migration backups, questionnaires and quota rows are not subject to the 45-day feed-snapshot expiration rule. Quota counters use fixed global/per-user rows rather than creating a new row every minute.

The run-cost estimator is for hypothetical customer workloads, not ID-8's Azure bill. It no longer invents $25/$75 monthly hosting fees. Users can compare Blob hybrid retrieval, and fixed Search capacity is counted once only when they explicitly assign workloads to the same platform group. Old saved estimates remain unchanged until re-saved.

### October 2026 rollout

The 56-document Search corpus was backed up, migrated, and checked against real embeddings. POPIA, RAG knowledge retrieval, and document extraction scenarios each returned the expected reference at rank 1. Dedicated `id8-search`, the unused legacy Standard site, and the duplicate standalone Function/Flex plan were then removed after the managed deployment and verification passed.

### ID-8 technical naming and address migration

The canonical repository is `TsholoMSFT/ID-8`; the active Free site is `id8-app`. The browser workspace at its new Azure-generated origin starts fresh, as approved. Server-side questionnaires and research data stay in the existing private Storage account.

Active app-owned identifiers use `id8` prefixes: `id8quotas`, `knowledge-index/id8-knowledge.json`, `id8-rss-monitor`, and `id8-filings-monitor`. Verified copies and migration manifests are retained in `id8-migration-backups/`; original source data and historical records are not rewritten.

Operator sequence after Azure preparation/validation: provision `id8-app`, run `npm --prefix api run id8:migrate -- prepare`, publish the new deployment and legacy-address handoff, then run `npm --prefix api run id8:migrate -- activate`. The new API stays paused until old metered access is blocked, quota counters and index checksums match, and feed schedules are switched without duplication. API/model keys are transferred only between encrypted server settings and are never committed or logged.

During cutover, the old Free address displayed ID-8 and handed visitors over while preserving questionnaire paths. After verification, the owner explicitly approved deleting that old site and both disabled feed workflows. The former URL no longer works: use [the canonical ID-8 site](https://red-field-069bdce0f.5.azurestaticapps.net/) and its questionnaire URLs.

The one-time cutover is complete; do not rerun it as part of ordinary releases. Historical resource names and a small number of explicitly labelled compatibility aliases remain only for archives, rollback, or existing local tooling. The previous completed data-schema marker is recognized so the branding change cannot replay older destructive schema cleanup.

The pre-change 30-day Cost Management baseline was **R4,317.52 for the scoped ID-8 resources**, of which **R4,301.34 (99.63%) was dedicated Search**. Removing that service eliminates its ongoing fixed charge; this is not a guarantee that future total spend will be zero. Shared AI-account costs and future model/storage/traffic usage are separate. Both existing storage accounts, knowledge backups, and monitoring history were retained.

## Foundry Local Development Setup

Prerequisites are Windows, Node.js 20 or later, and enough disk space for the selected model and execution provider. The root development dependencies include the official `foundry-local-sdk-winml` package; they are not part of the Azure Functions package.

1. List aliases available for this device with `npm run foundry:models`.
2. Start and, on first use, download the configured model with `npm run foundry:local -- --model=<alias>`.
3. Set `FOUNDRY_LOCAL_ENABLED` to `true` in `api/local.settings.json` and keep `FOUNDRY_LOCAL_ENDPOINT` on an HTTP loopback address.
4. Start Azure Functions and the frontend/SWA emulator normally.

The default alias is `phi-4-mini-instruct`; use an alias from `foundry:models` if it is unavailable on this machine. Model acquisition happens only during the explicit Foundry Local startup command, never during `/api/chat`. Press Ctrl+C to unload the model and stop the local service.

Local requests stay on-device. If local inference times out, fails, or produces malformed JSON for a JSON task, the same task content is sent to Azure OpenAI as the configured development fallback. Production ignores all Foundry Local settings.

## Where to See AI in Action

1. **Live Discovery Mode**: Look for the "Get AI Insight" button after answering questions
2. **Standard Discovery Mode**: Click "Need help?" next to any question
3. **Discovery Results Screen**: Watch AI generate use cases automatically
4. **Executive Summary Section**: See AI-generated summaries on your dashboard with sparkle icon

## Privacy & Data

- AI only sees information you explicitly provide in the discovery process
- Generated content is stored locally in your browser and, for 15 minutes, in a private per-user server response cache (cache blobs expire after one day)
- No personal authentication data is sent to AI services
- You maintain full control over all generated content

## Tips for Best Results

From my experience, here's what works best:

✅ **Provide detailed answers**: More context leads to better AI suggestions
✅ **Use AI help when stuck**: Don't hesitate to request insights or suggestions
✅ **Review AI suggestions**: AI recommendations are starting points - customize as needed
✅ **Include industry specifics**: Mention specific technologies, processes, or challenges

## Troubleshooting

**"Failed to generate insight"**: Click the button again to retry, or continue without AI assistance

**Use case generation takes a while**: This is normal - analyzing comprehensive responses takes 5-15 seconds

**Live Discovery not working**: Make sure you're using Chrome, Edge, or Safari for speech recognition

---

**Need More Help?**
See [AI-FEATURES.md](./AI-FEATURES.md) for complete technical documentation
