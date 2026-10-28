# The Long Return

A playable browser prototype of an overhead exploration RPG with a persistent, changing settlement.

## Play

Run the game locally with Node.js 22 or later and Python 3. The complete design document is in [design-document.md](design-document.md); its generated web edition is available at `/design.html` after building.

```sh
git clone https://github.com/Paradox560/the-long-return.git
cd the-long-return
npm ci --prefix game/local --ignore-scripts
python3 build-game.py
node game/local/server.mjs
```

Open http://127.0.0.1:4174/ . On macOS, `start-local.command` is an alternative launcher after installing the dependency and building the document. The game remains playable before sign-in. Connect through the storyteller button after beginning a journey; approve plan usage on OpenAI’s own screen. Eligible ChatGPT Plus and Pro accounts can use this integration. Hosted plan usage requires separate OpenAI approval.

Controls: WASD or arrow keys to move, E to interact, J for your journal, M for the map, Enter to describe an intention. On supported browsers, Speak creates a transcript for review before submission. Touch controls appear on small screens.

A first journey:

1. Follow the road east from the Reedway to Bellwether.
2. Meet Mara and Halen. Decide whether to repair the spillway and move the grain.
3. Travel east to Upland Station. Negotiate with Rook or fight, and investigate the archive.
4. Rest at the southern camp for three nights.
5. Return west. Investigate what changed and help the displaced family.

## What is implemented

- Three connected, seeded regions with local movement and collision from semantic terrain/object data.
- Original procedural pixel art, direct movement, nearby interaction prompts, typed action interpretation, and optional browser speech transcription.
- Persistent campaign premise, player vitality, inventory, relationships, discoveries, decision history, and deterministic combat.
- Settlement outcomes tied to the spillway and grain decisions, with a journal that preserves prior observations.
- Browser autosave, JSON export/import, and combat restoration.
- A bounded AI dungeon-master endpoint: it may narrate and propose an available action. The engine validates the action and current proximity before applying consequences.

This is a focused playable slice, not the full design document implemented. Region geography is generated from deterministic rules, rather than live model-generated layouts or images. Campaign inputs influence the narrator’s context; the visual setting remains the marsh frontier. Creative actions are limited to the interactions the engine currently supports. Free-form language does not grant arbitrary world-editing powers.

## Build and verify

```sh
python3 build-game.py
node --test game/engine.test.mjs game/server/dm.test.mjs game/local/local.test.mjs
```

`game/` is source. `playable/` is an explicit publish allowlist containing only intended web assets and the hosted function. `design-document.md` is the complete design source. `build.py` generates its web edition.

Local sign-in implementation and checks are described in `game/local/README.md`. Local OAuth registration and credentials stay outside `playable/`, in a gitignored `.long-return-local` directory with restricted permissions. Never publish this directory. No existing Codex credentials are reused.

Saved journeys are currently per browser origin and device. Export and import a save when moving between the local and hosted editions.

## Validation limits

Automated tests cover region seams and collisions, pure rendering inputs, interaction bounds, reward idempotency, storm outcomes and continuity, deterministic combat, save validation, bounded model proposals, provider errors, and response timeouts. A real browser playthrough verifies movement, region travel, inspection, typed actions, and the journal. Auth and model tests use fixtures until the player completes ChatGPT sign-in; a connected label alone is not proof of successful inference.
