# Play locally with your ChatGPT plan

This server runs The Long Return on your computer and uses the supported **Continue with ChatGPT** OAuth flow. It does not need an API key, extract credentials from Codex, or require you to publish the game's source. You approve access in your own browser when you click the sign-in link.

The current official integration supports eligible local personal projects and open-source tools. The remotely hosted Spacefast version needs approved access before offering ChatGPT plan usage; deploying this local sign-in server to Spacefast is not an equivalent workaround. See the [official integration's usage-policy section](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) and [partner client request](https://developers.openai.com/siwc/request-client-id).

## Launch

Requires Node.js 22 or later. From this directory:

```sh
npm ci --ignore-scripts
npm start
```

Open [the local game](http://127.0.0.1:4174). Use **127.0.0.1**, not `localhost`. The server listens only on that loopback address. Port 4174 is the default; set `PORT` to another available port if needed.

The desktop launcher prepared alongside this project can set `LONG_RETURN_DATA_DIR` to the project's ignored `.long-return-local` directory. Without an override, credentials are stored under `~/.config/the-long-return/`, entirely outside the game source. Never put this state directory in a published folder or archive.

1. Open the chronicler's connection settings in the game.
2. Click **Continue with ChatGPT**.
3. Complete OpenAI sign-in and decide whether to grant ChatGPT plan usage.
4. Return to the game, choose an available model, and submit an action.

Model choices come from the signed-in account's current catalog. A successful OAuth callback confirms identity and permissions; only a completed model request confirms inference worked. Eligible plan access and account/workspace policy still apply. Usage counts against your ChatGPT plan. The game links to [ChatGPT usage settings](https://chatgpt.com/settings/usage).

## Credentials and sessions

The app creates its **own** stable host ID, uses fresh state, nonce, and PKCE values, and validates the returned ID token with OpenAI's published keys. It checks signature, issuer, issued client ID audience, expiry, nonce, and returning-account identity. New client IDs are obtained only from the verified authorization flow; no existing app client is impersonated. The flow follows the [official registration guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

The server saves only this app's credential records in `chatgpt-session.json`. Its directory is mode `0700`; the atomic credential file is mode `0600`. Provider access, refresh, and ID tokens stay out of browser storage, served files, logs, and responses. Sign-in transaction state stays in server memory for ten minutes. The browser holds only an opaque HttpOnly, SameSite=Lax local session cookie and a CSRF token.

The local callback is exactly `http://127.0.0.1:PORT/auth/callback`. Its HTTP transport is the documented loopback flow; the server never listens on a network interface. Host checks prevent DNS rebinding, browser-origin checks and CSRF tokens protect API writes, and the static allowlist exposes only game assets and the design document.

Refreshes are serialized for a registration so rotating refresh tokens do not race. Signing out attempts remote revocation and clears all local tokens, while retaining the registration mapping and stable host ID for reauthorization. If revocation cannot be confirmed, the response says so and directs the user to disconnect in ChatGPT settings. These behaviors follow [accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).

## Model request behavior

The local server discovers models from `GET https://api.openai.com/v1/models`, preserving visible catalog ordering. It sends the chosen slug with the user's OAuth bearer to the public Responses endpoint. It requires `store:false` and `stream:true`, removes preview-unsupported fields including `max_output_tokens`, and accepts only an SSE `response.completed` result. It never uses ChatGPT's private backend endpoints. See [models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

The existing dungeon-master validator still restricts the result to current action/target pairs. The game engine decides outcomes. The client must continue checking campaign, region, revision, and proximity before applying any proposal. A 45-second server timeout, a 1 MiB stream cap, and at most two concurrent model requests bound this prototype's local work. A partial or failed model response does not mutate the world.

## Routes

- `GET /api/dm`: connection status, safe account labels, model choices, selected model, and CSRF token.
- `POST /api/dm`: the existing bounded dungeon-master request and response contract.
- `GET /api/auth/start`: begin sign-in. Add `?new=1` to register another account/workspace.
- `GET /auth/callback`: the exact OAuth loopback callback.
- `GET /api/auth/models`: refresh the model catalog.
- `POST /api/auth/model`: choose `{ "model": "catalog-slug" }`.
- `POST /api/auth/select`: choose a saved `{ "registrationId": "local-record-id" }`.
- `POST /api/auth/logout`: revoke and clear the selected connection.

All API POSTs require an application/json body, the current session cookie, and `X-CSRF-Token` from status. The server supports separate stored registrations; the first UI focuses on one active account.

## Verification and remaining step

Run `npm test` here. Tests use locally generated signing keys, synthetic tokens, a mocked provider, and a short-lived loopback server. They cover PKCE construction, state replay, invalid token signatures/claims, missing plan permission, refresh rotation, credential permissions, SSE completion, DNS rebinding, origin checks, CSRF, and private-file exclusion. No real OAuth approval or paid inference occurs during tests.

The remaining end-to-end check requires the user to click **Continue with ChatGPT**, authorize access, and complete one model turn. The implementation does not claim that sign-in or live inference succeeded before that happens.
