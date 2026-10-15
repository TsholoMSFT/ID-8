# Local Azure Functions Troubleshooting (KARABO)

This repo uses Azure Functions Core Tools (v4) for the backend under `api/`.

Use the repository launcher rather than invoking the global `func` shim directly:

```powershell
.\scripts\start-local-api.ps1
```

The launcher builds the API, starts Azurite when needed, resolves Node 20/22 and Core Tools, and fails unless `/api/health` becomes reachable. Override resolution with `KARABO_NODE_EXE` and `KARABO_FUNC_EXE`.

On Windows ARM64, native ARM64 Core Tools can fail the Node worker handshake with `Value cannot be null. (Parameter 'provider')`. The launcher prefers portable x64 Node at `%LOCALAPPDATA%\karabo-node-x64` and x64 Core Tools at `%LOCALAPPDATA%\karabo-func-x64` when installed, allowing Windows x64 emulation to avoid the native gRPC failure.

## Symptom: routes print, but `localhost:<port>` is not reachable

If `func start` prints routes like `http://localhost:7071/api/chat` but:
- `curl http://localhost:7071/api/chat` fails, and/or
- `Test-NetConnection localhost -Port 7071` fails, and/or
- `netstat -ano | findstr :7071` shows **no LISTENING socket**

…it usually means the Functions host process is not actually staying alive, or it is failing before the HTTP listener is bound.

### 1) Verify the process is still running

- Start in the foreground to watch for shutdown messages:
  - `cd api`
  - `func start --verbose --port 7071`

If it exits immediately, scroll up for the first error.

### 2) Ensure storage is configured (recommended)

Even for HTTP-only projects, local host stability is best when storage is set.

- Install and start Azurite (recommended for local dev)
- Set in `api/local.settings.json`:
  - `AzureWebJobsStorage` = `UseDevelopmentStorage=true`

### 3) Eliminate port conflicts + loopback quirks

- Try a different port:
  - `func start --verbose --port 7075`
- Try using IPv4 explicitly:
  - `curl http://127.0.0.1:7071/api/rss-feeds`

### 4) Check environment and runtime prerequisites

- Azure Functions Core Tools v4 installed: `func --version`
- Node version supported by your Core Tools install
- If you’re in a corporate environment:
  - VPN / endpoint security can interfere with local listeners
  - Temporarily disable VPN and re-test

### 5) Verify the API is reachable from the frontend

The frontend calls `/api/*`.

- If you are running Vite separately, confirm any proxy config (or Static Web Apps emulator) is routing `/api` to the Functions host.
- Production uses the managed Static Web Apps API; the old standalone Function host is retired. A Vite proxy does not supply a production Entra session. Use the deployed site in a signed-in browser, or run local Functions with the explicit development-only bypass:

```powershell
# Set KARABO_ALLOW_ANONYMOUS_LOCAL=true in ignored api/local.settings.json.
# Use a development Storage connection/Azurite for quota and questionnaire data.
npm run dev
```

After liveness succeeds, check non-billable configuration and explicitly test inference only when necessary:

```powershell
Invoke-RestMethod http://127.0.0.1:7071/api/ai-readiness
Invoke-RestMethod http://127.0.0.1:7071/api/ai-readiness?refresh=true
```

## RSS storage configuration

The RSS endpoint reads from Azure Blob Storage container `rss-feeds`.

The backend accepts either of these env vars:
- `AZURE_STORAGE_CONNECTION_STRING` (preferred)
- `AzureWebJobsStorage` (fallback)

If RSS returns an empty list with a message about configuration, set one of those.

## Foundry Local routing

`/api/health` reports safe Foundry Local metadata under `foundryLocal`: whether a loopback endpoint is configured, whether local routing is enabled for this runtime, and the selected model alias.

- A non-loopback or HTTPS `FOUNDRY_LOCAL_ENDPOINT` is rejected.
- `NODE_ENV=production` or `AZURE_FUNCTIONS_ENVIRONMENT=production` disables local routing even if the enable flag is set.
- A stopped local service should add only the configured timeout before `/api/chat` falls through to Azure OpenAI. Lower `FOUNDRY_LOCAL_TIMEOUT_MS` if this delay is too long.
- Run `npm run foundry:models` from the repository root if the configured alias is not present in the local catalog.
