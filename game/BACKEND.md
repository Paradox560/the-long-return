# Live dungeon master backend

The game can run its local simulation without any model credentials. Live free-form interpretation is implemented in `server/dm.mjs`, but requires an OpenAI API key configured **on the Spacefast server**. A Spacefast login or handoff authorizes deployment; it is not an OpenAI API credential. The official runtime documentation describes outbound `fetch` and environment variables, but does not document a bundled AI inference service.

This is an integration ready for credential configuration, not evidence that live model inference has been exercised. Local mode must remain visibly labeled as local; do not describe its authored responses as model-generated.

The repository includes no deployment credentials. Configure a server API key for your own hosted deployment, or use the personal local edition described in [local/README.md](local/README.md) to connect an eligible ChatGPT plan.

## Deployment files

Keep the static client and its assets at the game publish root. Add the following file:

```js
// functions/api/dm.mjs
import { GET as getDM, POST as postDM } from '../../server/dm.mjs';
export async function GET(request, context) { return getDM(request, context); }
export async function POST(request, context) { return postDM(request, context); }
```

The Spacefast Functions file router exposes that module at `/api/dm`. Do not add a root `handler.*`: root handlers claim the whole site, while this file router claims only the API route. The existing `sf.jsonc` should include:

```json
{
  "$schema": "https://spacefast.com/schemas/sf.json",
  "runtime": {
    "kind": "functions",
    "compatibilityDate": "2026-07-01"
  }
}
```

Publish the game directory through the authorized CLI:

```sh
python3 build-game.py
npx -y spacefast@latest publish ./playable --space "$SPACEFAST_SPACE_ID" --api-url https://api.spacefast.com --json
```

Set `SPACEFAST_SPACE_ID` to your own Space ID and run from the `the-long-return` project directory. Adding `--dry-run` first prints the plan without uploading or writing deployment state. Use normal publish so Functions detection and bundling run. Do not use `--prebuilt`: it promises no build, and the documentation does not establish that raw server sources are bundled in that lane. The HTTP static archive publish lane does not deploy Functions bundles. A successful publish must be checked for live activation. Spacefast's `sf dev` does not run Functions, so the local static preview will use local mode unless a local API adapter is supplied.

Keep publishing scoped to the generated `playable/` staging directory. The CLI drops dotenv, credential, dependency, and state paths; still inspect the intended file list before publishing. The default snapshot mode replaces previous content, so retain any previous design document intentionally if it should remain accessible.

## Credential configuration

Required server variable: `OPENAI_API_KEY`. Optional server variable: `OPENAI_MODEL`, default `gpt-6-astra`. The default follows the current official Structured Outputs example; choose a model available to the owner's API project when configuring the key. No account, subscription, billing, or credential changes were made by this implementation.

The owner can add a write-only secret on the Space's Variables page, or use the documented CLI stdin flow. Never enter the key in the browser game, chat, source files, query strings, or a command-line argument. For a local file already containing a key with restrictive permissions:

```sh
npx -y spacefast@latest env set OPENAI_API_KEY --secret --value-from-stdin --space "$SPACEFAST_SPACE_ID" --api-url https://api.spacefast.com < /path/to/private/key-file
```

Setting a variable queues a re-finalization. It affects the live runtime after that operation completes. Do not treat a successful variable write as a completed deployment. The endpoint never returns the credential or upstream error bodies. Do not put secrets in Spacefast `templates`, because substitution produces client-visible files.

## Browser contract

`GET /api/dm` returns `{ok:true, configured:boolean, mode:"live"|"local", message:string}`. When configured, `model` is also returned. Configured means a server key exists, not that credentials, quota, or model access have been verified.

`POST /api/dm` accepts JSON:

```json
{
  "message": "Could I brace the sluice with driftwood?",
  "context": {
    "revision": 7,
    "region": { "id": "mereford", "name": "Mereford" },
    "nearbyTargets": [{ "id": "sluice", "name": "Sluice gate" }],
    "availableActions": [
      { "id": "repair_sluice", "description": "Repair the damaged gate", "targetIds": ["sluice"] }
    ]
  }
}
```

The full context can also include campaign choices, day, minutes, player, inventory, known flags, recent journal, and current objective. The server forwards only these recognized top-level fields. Do not include private credentials or information the player should not yet know.

A completed response is:

```json
{
  "ok": true,
  "mode": "live",
  "narration": "You can try wedging driftwood beneath the damaged hinge.",
  "actionId": "repair_sluice",
  "targetId": "sluice",
  "basedOnRevision": 7
}
```

Both IDs may be `null` for conversation, observation, or an unsupported intention. The model cannot provide arbitrary patches, create inventory, award experience, move the player, change NPC memories, or mutate a region. Only an exact action/target pair from the current `availableActions` can be proposed. The engine still validates the result and determines success and consequences.

Before applying a response, the client must compare **campaign/session identity, region identity, revision, and proximity** with the snapshot used in the request. It must discard stale responses. Movement remains active while waiting; a late answer must never act on another region or a newly loaded save. The engine's committed result is authoritative; model narration describes attempts prospectively and current facts, never successful outcomes in advance.

## Delays and failures

The server aborts provider work after 20 seconds. Requests have a 32 KiB body limit, a 24,000-character context limit, and a 1,200-character message limit. The provider has a 2,000-token response cap and `store:false`. This makes an output bounded; it is not a claim about total provider data retention.

Failures return `{ok:false, mode:"unavailable", code, message}` with an appropriate HTTP status. Missing credentials return `503 not_configured`; quota/rate failures return `429 model_busy`; provider auth failures return `503 provider_auth_failed`; timeouts return `504 model_timeout`. Invalid, incomplete, or refused model replies do not alter the world. Errors are safe to display as plain text.

The UI should let the player continue exploring, retain the draft intent, and offer an explicit retry or switch to local mode. Do not automatically replay a state-changing action after a timeout. Do not silently run a different local action after an ambiguous live failure.

## Verification and remaining work

Run `node --test server/dm.test.mjs` from the game directory. The tests use a provider stub and cover missing credentials, exact pair validation, non-mutating replies, unsupported targets, origin checks, body limits, provider errors, incomplete replies, refusals, and cancellation. They do not call a paid service.

After credential configuration, perform a small live smoke test and measure latency, refusal handling, and actual output quality. The deployment relies on Spacefast's existing access controls. Browser-origin checks reduce cross-site requests but are **not authentication or a spending quota**. A public release needs authenticated player sessions, persistent rate and spending limits, and abuse monitoring before attaching a shared paid provider key. The first playable prototype remains a single-player local-save simulation; this endpoint is not an authoritative multiplayer state server.

## Official references

- [Spacefast Functions](https://spacefast.com/docs/functions.md): file routing, context environment, outbound access, publish detection, local development limitations.
- [Spacefast environment variables](https://spacefast.com/docs/environment-variables.md): write-only secrets, stdin setting, runtime access, and re-finalization.
- [Spacefast configuration](https://spacefast.com/docs/config-file.md): Functions declaration and private configuration file.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): Responses API schema format, current model example, and refusal/incomplete handling.
