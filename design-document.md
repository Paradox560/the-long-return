# The Long Return

**A single-player open-world RPG with an AI dungeon master**  
Game design document · Version 0.1 · October 26, 2026

> Travel into the unknown. Leave a mark. Return to a place that remembers you—and discover what happened while you were away.

This is a proposed design, not a description of an implemented game. Numerical budgets below are initial targets to validate in a prototype. **The Long Return** is a working title; the player defines the setting of each campaign.

## 01. Vision and design pillars

The player explores an overhead pixel-art world through direct movement, encounters people with their own needs, and pursues ideas through typed or spoken intentions. An AI dungeon master establishes discoveries, portrays inhabitants, interprets unusual actions, and sustains an adventure shaped by consequences. The world extends beyond the immediate screen and continues to develop during the character's travels.

The central pleasure is learning a place well enough to notice its changes. A familiar inn can become a refuge. A repaired road can attract traders. An abandoned village can retain the objects, names, and scars that reveal why its residents left. Exploration creates both forward curiosity—what lies beyond the ridge—and backward curiosity—what became of the people behind me?

Five pillars govern decisions:

1. **Movement is immediate.** Walking, collision, the camera, and ordinary interactions never wait for a language-model response.
2. **Curiosity creates direction.** Landmarks, rumors, tracks, relationships, and unfinished business invite exploration without prescribing a single route.
3. **Intentions matter.** Creative actions compose real world capabilities and produce persistent, intelligible consequences.
4. **Places have histories.** Revisits reveal accumulated events; reentry is never permission to reroll a location.
5. **The world can surprise without cheating.** Geography, resources, knowledge, and rules constrain the dungeon master as well as the player.

The intended audience enjoys exploration, tabletop improvisation, and environmental storytelling. Play should support a meaningful 20–40 minute excursion and campaigns spread across many sessions. The default experience is reflective and adventurous, with bursts of tactical danger. Campaign tone can change that balance.

### Reference: Tilth

Tilth is the reference for the requested overhead pixel-art exploration. Its [hackathon entry](https://cerebralvalley.ai/e/openai-gpt-6-astra-nyc/hackathon/gallery/49) describes an AI dungeon master producing structured content and interpreting free-form actions, with engine validation of movement, dice, damage, and progression. Its [project README](https://github.com/shresthkapoor7/tilth) describes a map-dominant interface, a following camera, depth-sorted scenery, and foliage that fades when it obscures the traveler. Those are useful starting points for readable exploration. This document proposes a separate single-player design with durable campaigns and causally evolving locations; it does not assume Tilth already implements those systems or reuse its assets.

## 02. Campaign creation and the world contract

Campaign creation begins with three questions: **What is this world? What should it feel like? What brings your character here?** The player can write a paragraph, speak an answer, or choose examples and edit them.

| Input | Player example | Design effect |
| --- | --- | --- |
| Setting | A marsh frontier where old flood engines are failing | Biomes, technology, available materials, institutions, travel constraints |
| Tone | Wistful, mysterious, occasionally dangerous | Dialogue style, threat frequency, descriptive emphasis, consequences |
| Premise | I am a wandering surveyor searching for my missing mentor | Starting knowledge, a personal thread, initial relationships and equipment |
| Character | Practical, observant, poor at formal persuasion | Starting proficiencies and opportunities; no fixed class requirement |
| Preferences | Low combat frequency; no permanent character death | Encounter mix and defeat rules |

The AI returns a short editable **campaign charter**: world rules, tone, the character's role, a starting situation, and three possible leads. It also states any important limitations of the selected content pack. The player approves or revises the charter before entering play. A custom setting is a promise the game must actually support: the prototype supports one frontier-fantasy asset pack with flexible names, premise, cultures, and tone. A fully visualized science-fiction city or underwater campaign requires additional packs and mechanics; unsupported concepts are offered as explicit adaptations, not accepted silently.

Behind the charter is a versioned world bible: technology and magic limits, travel scale, calendar, broad geography, starting factions, terminology, and content boundaries. The player sees what their character would know; the director can maintain hidden causes and planned events separately. Unknown territory remains partially unspecified, but anything already established by a map, reliable report, event, or quest constrains future generation.

Starting geography includes a safe arrival point, a recognizable landmark, one nearby settlement or social hub, and two accessible directions. Opening narration is short enough to enter play quickly. The DM suggests opportunities and asks occasional character questions, but the player may ignore the personal premise, abandon a lead, settle somewhere temporarily, or pursue a self-chosen goal.

Changing tone later adjusts future presentation. Changing physical world rules, chronology, or the campaign premise is an explicit charter revision or a separate save branch. It cannot silently rewrite earlier outcomes.

## 03. Core gameplay loop and pacing

The recurring loop is **notice → approach → investigate → choose → act → observe → remember → travel or return**.

1. A visual landmark, overheard argument, unusual trail, or map note raises a question.
2. The player moves toward it, inspecting terrain and objects along the way.
3. Local clues and conversations reveal opportunities, risks, and partial explanations.
4. The player selects a conventional action or expresses a creative intention.
5. Rules resolve costs, uncertainty, reactions, and consequences.
6. The scene changes visibly where appropriate, and a concise DM response explains the result.
7. The journal records the discovery and any changed commitments. Relationships and world events update.
8. The player explores onward, follows a new connection, rests, or returns to a familiar place.

Short loops take seconds: inspect a marker, open a gate, follow footprints. Medium loops take several minutes: find a water source, negotiate passage, investigate an empty camp. Long loops span sessions: restore a trade route, understand a migration, change a faction relationship, or resolve the character's premise.

The director monitors unresolved hooks, recent combat, discovery variety, and the player's apparent interests. It can offer quieter scenery after danger or a distant clue after a long empty stretch. These are pacing opportunities, not authority to teleport discoveries, invent a crisis on every return, or guarantee success. A player can spend time fishing or mapping without being repeatedly interrupted by urgent quests.

Target an interesting observation every 30–90 seconds along tested routes, with deliberate quiet stretches around major landmarks. Treat this as a playtest hypothesis, not a rigid spawn timer. Discoveries must belong to the terrain and its history. Encounter density cannot replace meaningful distinctions between places.

## 04. Controls, action entry, and the dungeon master

### Direct exploration

| Control | Default behavior |
| --- | --- |
| WASD or arrow keys / left stick | Continuous movement; diagonal speed normalized |
| Mouse or right stick | Select or inspect a visible target; optional camera look-ahead |
| E / controller south button | Context interaction with the highlighted nearby entity |
| Hold inspect | Show names, footprints, available affordances, and interaction range |
| Enter | Open the intention composer; Enter submits while focused |
| Hold V / microphone control | Push-to-talk; release to finish transcription |
| J / M | Journal / discovered-world map |
| Escape / menu button | Cancel current input, close panel, then pause menu |

All keys are remappable. Mouse-only click-to-move is optional and uses the same pathfinding and collision as direct movement. Controller and keyboard can access every important function. Typing must never move the character accidentally: the composer takes keyboard focus and releases it on close. The default composer pauses campaign time; an optional walk-and-talk mode allows local movement while an asynchronous conversation resolves.

Speech is another way to author the same action, not a separate rule system. Show the transcript before submission; let players edit it or cancel without cost. Spoken output is optional, interruptible, captioned, and independent of whether an action has committed. The prototype prioritizes text; a thin push-to-talk transcription path can follow after the core loop works. Raw voice recordings need not be retained in the campaign save.

### Interpreting intentions

The DM converts a request into a structured proposal: actor, target IDs, goal, method, relevant resources, time cost, preconditions, risk, and a small set of supported effects. The engine checks the proposal against the current world revision and resolves it through game rules. The model narrates the committed outcome; it does not declare success first and hope the simulation agrees.

Examples include moving a barrel to block a doorway, using wet cloth against smoke, trading a favor for a map, making a distracting noise, following a suspect discreetly, or offering a plausible lie. These combine affordances such as movable, flammable, concealable, climbable, readable, owned, and socially significant. They must do more than translate every imaginative sentence into an ordinary attack.

The initial action vocabulary covers inspect, move, manipulate, combine, use, talk, trade, persuade, deceive, intimidate, sneak, attack, defend, flee, rest, and wait. Compositions operate on supported objects and systems. A new unsupported mechanic receives an honest constraint or a useful alternative; narration cannot conjure a capability the engine lacks.

For a routine action, infer reasonable details and display the interpretation briefly. Clarify only when different readings would change the target, spend a scarce resource, advance substantial time, or create serious danger. “Burn it” near a document and a house needs clarification. “Lift the loose plank with my crowbar” generally does not.

Checks use a compact, transparent rule: a committed engine roll plus a relevant proficiency against a difficulty derived from the situation. Trivial feasible actions succeed without rolling; impossible actions explain the limiting condition. Risky actions can produce success, success with a cost, or failure with a concrete consequence. Announce meaningful stakes before commitment. Do not secretly reroll until the DM gets a preferred story.

### Pending and stale actions

Every submitted action has a unique ID and status: interpreting, awaiting confirmation if needed, resolving, committed, canceled, or failed. Show immediate acknowledgment and a cancel affordance before commitment. A timed-out submission cannot charge twice when retried. If a result arrives after the target moved, the player left, or the world changed, revalidate it. A stale response may ask for a new attempt; it cannot act on the NPC now occupying the old screen position.

The DM manages goals, dialogue, clues, and encounter proposals. The engine owns coordinates, inventories, resources, dice, damage, time, permissions, and state transitions. Player prose and generated dialogue are input data, never instructions to bypass these rules.

## 05. Exploration, rewards, and discoveries

Exploration should change what the player can understand or do. Rewards include new routes, practical tools, recipes, shelters, trusted contacts, rare materials, faction access, personal revelations, and evidence that resolves an old mystery. A memorable view can be a reward, but the world also needs discoveries with mechanical and relational value.

Use four overlapping discovery types:

- **Geographic:** a ford, a collapsed pass, an overlook, a seasonal shortcut, an underground entrance.
- **Human:** a migrant camp, a hidden household, a disputed boundary, a familiar person in a new role.
- **Historical:** flood marks, abandoned machinery, a repaired memorial, a document that changes the meaning of a ruin.
- **Systemic:** a material that conducts heat, creatures avoiding a particular sound, a route that becomes safe at low water.

The map records observed terrain and attributed reports separately. An unvisited destination can appear as an approximate rumor rather than a precise omniscient marker. A previously visited place carries a last-seen date. New ownership or destruction is not revealed on the map until the character learns of it.

Avoid rewarding repeated border crossings, refreshing artwork, or harvesting the same first-discovery flag. Significant discoveries have stable IDs. Renewable resources replenish only under explicit time and ecological rules. Unique objects remain unique even if moved, stolen, destroyed, or recovered from ruins.

Travel should involve choices about exposure, information, and opportunity rather than constant inventory friction. Supplies matter on long trips, but early exploration has generous margins. Camps provide recovery, reflection, and time advancement. Fast travel, added after the prototype, follows discovered viable routes, advances campaign time, and previews known risks. It cannot ignore a destroyed bridge or unknown intervening terrain.

## 06. NPCs, relationships, and knowledge

Each important NPC has a stable identity, current location, role, needs, capabilities, possessions, schedule, commitments, and a bounded memory of interactions. A role such as innkeeper can change hands; the player’s friendship remains attached to the original person.

Relationships track several dimensions—trust, affection, fear, and obligation—rather than a single approval number. Observable incidents drive changes. A merchant may respect the player's reliability while resenting a public humiliation. Dialogue reflects those tensions. Small favors, recurring visits, remembered promises, and shared danger should build relationships as meaningfully as major quests.

NPCs pursue simple goals when offscreen: maintain food, protect a dependent, complete work, avoid a threat, or reach a destination. The simulation resolves a small number of consequential decisions at time checkpoints. It does not require a language-model conversation for every villager every minute.

Knowledge has provenance. An NPC can know a fact because they witnessed it, were told by someone, read a notice, or made a fallible inference. Store source, time learned, confidence, and whether the information is outdated or intentionally deceptive. An isolated merchant can sincerely report that a village is thriving even after it has evacuated. The game should preserve this as an understandable knowledge gap, not accidentally present it as current omniscient truth.

Individual memories propagate to factions through witnesses, messages, and gossip with travel delays. Helping someone secretly does not instantly improve reputation across the world. Deception can work, but contradictory evidence matters. NPCs may refuse requests because of goals or loyalties; persuasion is not mind control.

Important movement, death, and role changes are recorded. If a quest giver relocates, the quest references the same person and the player can seek evidence of their destination. Avoid disposable dialogue generators whose names and personalities change each visit. Background crowds may use lightweight records, but any character the player meaningfully engages becomes persistent.

## 07. Quests and emergent objectives

Quests are structured commitments with narrative presentation. Each has an ID, involved entity IDs, prerequisites, objective predicates, known evidence, time conditions, promised rewards, and explicit states: discovered, accepted, active, changed, completed, failed, or abandoned. The prose journal is a view of that record.

Favor goals with several supported approaches. “Get safe passage across the floodplain” could involve repairing a ferry, bargaining with a boat owner, finding an old causeway, or helping a patrol clear a route. These approaches need real resources, routes, and consequences; the AI should not merely attach the same outcome text to arbitrary inputs.

The player can propose a personal objective such as documenting the old wells. The director offers a bounded way to recognize progress through actual discoveries. It may create future opportunities that fit unconstrained territory, but cannot invent a previously nonexistent well inside a fully explored house just to satisfy the request.

Changes in the world can alter a quest without erasing its history. If a recipient leaves, delivery becomes a search. If a protected animal dies, the protection objective fails and a new consequence may open. If a bridge is destroyed, a route objective gains an obstruction or an alternative already supported by the world. Completed work remains completed; a later setback becomes a new event.

Major investigations should have several independently placed evidence paths before a crisis occurs. Losing one witness need not dead-end the campaign. This redundancy does not guarantee every objective is recoverable. Clear failure, changed relationships, and a new direction can be valid consequences. Never respawn a dead witness or move the needed clue into the player's pocket to preserve a script.

Deadlines are campaign-time commitments, communicated when reasonably knowable. The DM may warn of smoke or an approaching storm without revealing its exact timetable. Time spent reading, typing, waiting on generation, or using the pause menu does not consume a deadline.

## 08. Combat, danger, and defeat

Combat uses readable turn-based encounters inside the overhead world. Exploration remains real time. When danger becomes committed, a clear transition establishes initiative, reachable movement, and action costs. The single-player game waits for the player; there is no turn countdown.

A turn provides a movement budget and one major action, with small free interactions only where rules allow. Terrain affects line of sight, cover, elevation where supported, and escape. Direct movement becomes a preview or bounded movement command during combat; it cannot bypass the turn budget. Standard attacks, guarding, retreat, and item use resolve locally without a model call. Creative tactics use the same validated intention pipeline as exploration.

Enemy behavior follows authored tactical rules and stated goals. AI narration can characterize fear or negotiation but cannot alter hit points, reach, or damage secretly. Telegraph dangerous attacks, show affected tiles, and surface consequential terrain. A player might cut a rope holding a load above an enemy only if that rope, load, position, and interaction exist in the scene.

Encounters need exits other than extermination: intimidation, bargaining, hiding, surrender, distraction, or leaving the disputed place. Not every enemy accepts every option. Combat rewards should not make peaceful problem solving an inferior progression strategy.

Default defeat is a setback with a clear causal outcome: retreat with lost time, capture by an existing faction, injury, or loss of recoverable equipment. The system chooses among consequences justified by the encounter; it does not invent a rescuer retrospectively. The player can instead load a previous save. Optional harsher campaign modes can include permanent death, but the prototype uses a predictable retreat rule. Accessibility settings adjust animation, feedback, and tactical difficulty without changing the facts already recorded in the world.

## 09. Progression and the player's lasting footprint

Progression combines proficiencies, tools, knowledge, and relationships. Start with a few broad aptitudes—observation, survival, craft, presence, and combat—and specialize through meaningful milestones. Significant discoveries and resolved commitments grant advancement alongside dangerous encounters. Repeating trivial actions does not farm proficiency indefinitely.

Horizontal growth opens methods: a climbing kit enables a route, a language unlocks records, an introduction opens a guarded archive, and knowledge of a flood cycle changes travel planning. Modest numerical growth improves reliability without turning the entire world into level-scaled opposition. Regions can remain dangerous, peaceful, or changed for reasons independent of the player's level.

The persistent character record includes abilities, inventory and item condition, injuries, resources, known techniques, relationships, discoveries, promises, and personal goals. Player-built objects, stored belongings, repaired infrastructure, and marks left on the landscape have stable IDs and ownership. A later event can affect them, but only through recorded rules. The player can discover a burned chest and recover its metal contents; a visual regeneration cannot simply delete it.

Reward screens should identify the practical new possibility. “You learned to read the flood gauges” is more useful than an unexplained experience number. Let players pin a personal goal and record their own notes without forcing those notes to become canonical world facts.

## 10. World consistency: three layers of truth

The world has three separate layers: **canonical reality**, **historical events**, and **character knowledge**. Current reality tells the engine where the bridge is. History explains when it collapsed. The player's old map may still show it intact; a remote NPC may have heard an inaccurate account. Contradictions between beliefs can create play. Contradictions inside canonical reality are defects.

| Record | What persists | What can change and how |
| --- | --- | --- |
| Geography | Region IDs, coordinates, established adjacency, terrain history | Floods, excavations, collapse, or other explicit events can alter topology; connected regions update together |
| Locations and objects | Stable IDs, footprints, ownership history, interaction definitions | Construction, damage, movement, consumption, or replacement through validated events |
| People | Identity, biography, relationships, witnessed history | Location, needs, allegiance, role, health, beliefs, and survival through simulation or actions |
| Quests | IDs, original commitments, accepted outcomes, evidence history | Current conditions and supported resolutions; completion never silently resets |
| Player | Progress, possessions, discoveries, promises | Earned advancement, expenditure, injury, loss, and learning |
| Visuals | Asset manifest and revision used by each saved scene | Palette-safe variants and decorative refreshes; semantic changes require a new world revision |
| Knowledge | Who learned which report, from whom, and when | Corrections and new observations append or supersede beliefs without deleting prior experiences |

### Three distinct forms of generation

**New territory:** elaborate an unexplored region within already established geography, campaign rules, neighboring exits, and promised facts. Commit it before the player can interact with it.

**Visual refresh:** render the same semantic state again. Lighting, supported seasonal dressing, or equivalent asset variants can change appearance. Walkability, doors, object identity, inventory, residents, and quest conditions do not change. A recognizably interactive feature must remain accurately represented. Seasonal resources or hazards are semantic changes even if they look cosmetic.

**World evolution:** apply a causally justified state transition, validate it, commit a new region revision, and then regenerate its scene. Buildings, residents, routes, and resources may change substantially. The scene must retain evidence connecting old and new states unless an explicit event plausibly removes that evidence.

Regenerating a visited region does not automatically evolve it. Ten immediate exits and reentries should yield the same inhabitants, loot, and conditions unless a legitimate scheduled or player-caused event occurs. Some revisits should be almost unchanged. Major transformations remain distinctive because stability is also allowed.

### Non-negotiable invariants

- A named person, unique item, or location retains its identity through visual replacement.
- Every canonical state difference has a committed cause; artwork cannot introduce facts.
- Terrain rendering, collision, navigation, selection targets, and interaction anchors refer to the same committed revision.
- Connections agree across region boundaries; a river or road cannot jump sideways at a seam.
- No quest, relationship, or ownership record points to an entity silently erased by generation.
- NPC dialogue is constrained by that NPC's knowledge, not the entire director's context.
- A loaded save reconstructs its recorded world, not a new model interpretation of the save summary.

## 11. Time, events, and transformed regions

Use explicit campaign time rather than the computer's wall clock. Movement advances time according to a declared travel scale. Long journeys, crafting, waiting, and resting have shown costs. Reading and action composition pause time by default. Network delays, application suspension, and days spent away from the game do not age the campaign. Any future offline-progression mode must be an explicit campaign option.

The prototype can use one campaign minute per second of active exploration, with small combat rounds measured in seconds. This is a tuning value: the calendar should communicate the travel fiction, and substantial work can advance time through a confirmation such as “Repairing this mechanism takes four hours.” The simulation advances scheduled events against that same clock. Local movement distance and long-distance travel time must not be inconsistently narrated.

### Sources and scales of change

| Timescale | Examples | Required explanation |
| --- | --- | --- |
| Minutes to hours | A market closes, an NPC departs, a fire spreads | Schedule, witnessed action, or an active incident |
| Days | New travelers arrive, food runs short, a settlement evacuates | Travel, resources, warnings, and a precipitating event |
| Weeks or seasons | A village adds homes, crops fail, a faction establishes a post | Labor, materials, access, seasonal conditions, and sustained incentives |
| Exceptional rapid transformation | A flood destroys a district; a magical event alters terrain | A world-rule-compatible event with recorded cause and observable consequences |

Changes can arise from time, world events, player decisions, or their interaction. Repairing a road improves trade potential; merchants still need time and a reason to arrive. Refusing a request does not automatically cause catastrophe. A village under pressure may find another solution, relocate, or deteriorate according to its resources and decisions. Player choices should have proportionate influence, not total responsibility for every event.

A location has a few relevant pressures, such as water safety, food, trade access, population, and security. These produce bounded transitions rather than a limitless simulated economy. The director proposes a consequential event only when its preconditions hold. Examples include an arriving caravan, a failed sluice, a new household, or an evacuation. Each event stores its trigger, affected entities, time, effects, and evidence opportunities.

### The evolution transaction

1. On travel, rest, a major action, or a scheduled checkpoint, advance relevant regions from their last simulated time to the current campaign time.
2. Resolve due events using their prerequisites, resources, and causal order. An offscreen region can be processed lazily, but shared events retain one timestamp and identity across regions.
3. Build a proposed patch against an expected world revision. Include affected terrain, entities, inventories, quests, beliefs, and evidence.
4. Validate references, route continuity, interaction reachability, resource accounting, and quest consequences. If the patch fails, retain the last valid state.
5. Commit all semantic changes and event records atomically. Produce a matching render manifest.
6. Reveal the change through observation and reports. Do not automatically disclose every offscreen event to the player.

Region boundaries are scheduling tools, not causes. The same fire cannot happen again each time a region loads. If an event changes a river crossing, both connected region records and route planning update in one consistent transaction.

### When scenes may change

An active region is pinned to a committed revision. Routine NPC movement and visible effects happen through normal simulation. Major replacements occur while the area is unloaded, while the character is resting through a clear transition, or through a staged event the player can witness. Never replace a village beneath the player's feet or spawn a wall around their current position.

For an in-view transformation, present the process: rising water, a warning, residents moving, then changed terrain. Validate a safe position or a deliberate hazard outcome for the character. An unloaded area's new state becomes active when the player returns; it must include collision and interactions together with its visuals.

Complete transformations are allowed. A village can disappear under water or be rebuilt by a different community. Its location identity, geographic relationships, history, and affected people's records persist. Total destruction does not imply total amnesia. Ruins, records elsewhere, survivors, or known absence can preserve an investigable trail.

## 12. World memory, journal, and saving

### Authoritative memory

Store current structured state, an append-only event ledger, and periodic snapshots. A compact schema is sufficient:

| Record | Minimum fields |
| --- | --- |
| Campaign | ID, charter revision, clock, world seed, rules and schema versions |
| Region | Stable ID and coordinate, adjacent exits, semantic revision, terrain and object manifest, last simulated time |
| Entity | Stable ID, type, region and position, properties, owner, state, historical references |
| Event | ID, timestamp, causes, affected IDs, preconditions, committed effects, witnesses and evidence |
| Knowledge | Holder ID, fact or report ID, source, learned time, confidence, supersession |
| Quest | ID, parties, predicates, accepted promises, state, deadlines, reward ledger |
| Render | Region revision, asset IDs and hashes, visual variant seed, generator version |
| Action | Unique ID, expected revision, interpretation, rule result, cost, commit status |

An event might record that the Day 5 flood followed a storm and a closed spillway, moved three households to higher ground, destroyed a workshop, and interrupted a delivery. It references earlier choices without pretending that one choice was the storm's cause.

The DM receives a bounded context assembled for the task: campaign rules, current scene, relevant entity state, nearby affordances, recent committed events, and memories retrieved by stable IDs. NPC dialogue receives the NPC's beliefs and the facts needed for portrayal, with hidden global facts withheld. A quest ruling receives its actual predicates and inventory rather than a prose recollection.

Summaries reduce retrieval cost but are never the sole authority for identity, item ownership, outcomes, or deadlines. Keep source event IDs behind every summary. If a summary and structured state disagree, rebuild the summary. Cache invalidation follows affected entity and region revisions. Important memories are pinned; low-value ambient details can be compacted without discarding consequential events.

### Player-facing memory

The journal separates **what I saw**, **what I was told**, **what I promised**, and **what changed**. Entries carry dates and sources. A location page preserves prior visits, sketches or old map states, notable people, unresolved questions, and personal notes. It never spoils events the player has not learned about.

On returning to a changed place, a subtle “Last visited: Day 2” marker and optional prior sketch encourage comparison. New observations append to history. The player can investigate conflicting reports, mark a rumor as disproven, or follow a displaced person's trail. The journal supports memory rather than delivering a full omniscient explanation immediately.

### Save and restore contract

Autosave after committed consequential actions, before and after major travel or evolution, and at a safe periodic interval. Offer manual save slots, a named campaign history, and an explicit load confirmation. Save the exact character state, regions, event ledger position, action IDs, random generator state, knowledge, quest state, asset references, and version metadata. A seed alone cannot reproduce generated content after a model or generator update.

Use a transactional local database for the first playable. Retain at least two rotating known-good checkpoints and a checksum for each completed snapshot. Loading reconstructs a snapshot plus later committed events and runs integrity checks. Optional cloud synchronization later copies versioned save bundles; a conflict creates selectable branches rather than merging contradictory histories automatically. Provider credentials never belong in an exported campaign.

Pending generation jobs are resumable work, not committed reality. Save their inputs and expected revisions if useful, then cancel or restart them on load. If an action committed before a crash, its saved ID prevents a second reward. If it never committed, no cost is deducted. Reject late responses from a previous load using a session epoch as well as a world revision.

Campaign migrations are versioned, retain a backup, and preserve old assets or a documented equivalent. Missing decorative art can fall back to a valid tile. Missing semantic entities cannot be repaired by asking the model to improvise a replacement. Export and import should round-trip the campaign’s structured state and human-readable journal.

## 13. Practical generation and responsive exploration

The long-term experience is continuous exploration through dynamically generated environments. The practical first version uses large regions assembled ahead of the player, a stable world graph, and small render chunks. These are implementation units; crossing their edges should usually be visually uneventful.

### Start with meaning, then produce pixels

Do not generate a beautiful whole-region image and infer collision afterward. The first playable generates a semantic plan and renders it using a curated pixel-art kit. The AI proposes biome, landmarks, local history, residents, discoveries, and opportunities. Deterministic assembly turns that proposal into terrain, objects, navigation, and visuals.

The pipeline is:

1. **Reserve geography.** Choose the region ID, coordinates, shared boundary strips, road and river connectors, elevation constraints, and any already promised destination.
2. **Plan content.** Request structured landmarks, inhabitants, relationships, encounters, and causal hooks within campaign rules and a finite object vocabulary.
3. **Assemble terrain.** Use seeded procedural rules and authored motifs to create connected terrain and sensible spacing. Reserve object footprints and approach tiles.
4. **Validate playability.** Check boundary agreement, reachable entry points, essential interactions, quest references, unique IDs, and hazard placement. Repair bounded errors deterministically; otherwise use a valid fallback template.
5. **Render from the manifest.** Place tiles, sprites, overlays, collision masks, selection bounds, and interaction anchors from the same records.
6. **Cache and commit.** Cache validated assets and publish the complete region revision atomically. Only then may the player enter or interact.

State progression is planned → assembled → validated → ready → committed. “Image finished” is not equivalent to “region ready.” Unobserved content can be revised before commitment; established facts and player observations remain constraints.

### Terrain, art, and interaction agreement

Each terrain type defines movement cost and collision. Each object defines its footprint, visual anchor, interaction points, height or occlusion behavior, and available actions. A tree canopy may extend beyond its trunk collision, but it fades or outlines the traveler when needed. A painted doorway has a corresponding door object and valid approach tile; decorative false doors must read as sealed or noninteractive. Water, cliffs, ramps, bridges, and fences need consistent visual conventions.

Pathfinding and pointer selection query this semantic model. Text descriptions and accessible labels query it too. Visual variants are permitted only when their silhouette and semantic meaning remain compatible. QA includes screenshot review and automated manifest checks; schema validity alone cannot prove that a tile looks walkable.

Optional generated sprites or background dressing can be added later. They must match tile scale, palette, transparency, anchors, and declared footprint. Reject assets that obscure boundaries or imply nonexistent interactions. Generated full-scene imagery with reliable semantic masks, stable objects, and editable revisions is a research track, not a dependency of the first playable.

### Local movement and streaming

Run input, collision, animation, camera, and nearby rules locally on committed data. Use a fixed simulation step with interpolated rendering, and perform generation, validation, decompression, and persistence outside the render loop. Model streaming text must not trigger repeated expensive map rebuilds. AI availability affects new interpretation and content, not whether the player can walk across prepared terrain.

A starting configuration is a 128 × 128 tile region, rendered in 32 × 32 tile chunks. At three tiles per second, crossing its width without stopping takes about 43 seconds. Landmarks and route choices extend actual exploration time; region size alone does not make the world interesting. Tune dimensions using traversal tests and memory budgets.

On entering a region, prepare all plausible neighbors' shared boundaries and basic playable terrain, then prioritize richer content by direction, speed, selected destination, and estimated time to entry. Reserve at least one additional ring of geography so fast travel or sudden turns do not require inventing incompatible seams. Keep the current region, nearby ready regions, and recent visits in memory; store exact committed regions on disk for deterministic reload.

Use a deadline derived from estimated boundary arrival minus safety margin. Do not wait until the player touches an edge to begin. Generation targets such as a p95 of 20 seconds per region plan are budgets to test, not promises about a particular model. Prefetching needs to tolerate worse tail latency and rapid direction changes.

### Delays and failures

| Situation | Player experience and fallback |
| --- | --- |
| Optional narration is late | Movement continues; a small pending indicator appears; the player can dismiss speech |
| A creative action is pending | Show the interpreted target and status; pause local stakes by default; allow cancellation before commit |
| A new region's rich content is late | Use the already validated basic region with required routes and promised facts; retain it as canonical once observed |
| Required destination cannot validate | Keep the player in playable terrain or an established connector; show an honest travel/loading transition, retry, and safe return |
| An artwork request fails | Use approved tile assets with the same semantic manifest |
| The AI service is unavailable | Continue prepared exploration and standard actions; preserve the save; show which creative actions need reconnection |

Fallback regions are actual world content. A later AI result cannot replace a seen empty field with a village without an event. Optional decorations can arrive outside view if they preserve meaning; richer semantic content waits for a valid future change. Keep empty connector strips short and geographically motivated. Do not conceal indefinite delays behind artificial walking or invent plot barriers solely because a server is slow.

Set bounded retries and cancel obsolete requests. If required preparation still blocks travel after a proposed five-second wait, offer a validated fallback where possible or a safe return. At no point should the game stop processing input without visible feedback. Standard actions use local results; generated narration is never required to unlock an already validated door.

## 14. Visual direction and interface

### The world on screen

Use a fixed overhead or shallow three-quarter pixel-art view with consistent scale. Start with 16-pixel terrain tiles and characters large enough for readable poses; use integer scaling or a controlled pixel-perfect presentation. The horizon is implied through paths, occlusion, and landmarks rather than a distant camera view.

Favor strong terrain silhouettes, a restrained palette per biome, distinct materials, and sparse motion: water movement, smoke, lanterns, foliage, and working residents. Character and object contrast must survive dusk and bad weather. Familiar landmarks retain recognizable silhouettes across revisions. A village after a flood should preserve the old bell tower's position while showing the waterline, empty foundations, and relocated activity.

Setting and tone influence approved palettes, motifs, portrait treatments, audio, and language. A shared visual grammar keeps paths, hazards, doors, and affordances readable across campaigns. Runtime variation must not become uncontrolled style drift. Establish asset rights and provenance before production reuse; the prototype uses original or licensed assets.

### A map-first interface

The world occupies most of the screen. A compact edge HUD shows health, essential supplies, campaign time, and one pinned intention. Hover or inspect reveals target names and relevant actions. A small DM caption area shows short responses, with longer dialogue and history available in a collapsible panel. Keep the movement destination and character unobscured by repositioning contextual panels.

The intention composer has text entry, microphone, selected target chips, a transcript preview, and a submission state. Show costs and uncertainty when relevant. Separate **suggested intention**, **committed result**, and **character speech** so narration cannot be mistaken for a completed action. Pending interpretation must not resemble a finished result.

The journal offers People, Places, Commitments, and Timeline views with a search field. The map distinguishes seen terrain, old observations, and reported locations through labels and patterns as well as color. A location history view lets the player compare visits without revealing unlearned events.

Settings include text size, captions, narration volume, speech speed, remapping, reduced motion, contrast options, and adjustable camera movement. Important information cannot rely only on pixel detail or color. Provide readable UI text at native resolution, focus states, controller navigation, and screen-readable descriptions of selected entities. Full spatial screen-reader navigation is a separate accessibility design effort to validate; do not claim it solely because buttons have labels.

Menus pause campaign time by default. A save indicator confirms a completed write. Loading and service failures use plain language, preserve the player's input, and provide a clear next action. Debug identifiers and generation parameters belong in a developer overlay, not ordinary play.

## 15. Technical architecture, uncertainties, and cost

Use five logical components: a local simulation and renderer; a state store with event ledger; a generation scheduler and validator; an AI director service; and an asset cache. They can start in a small application rather than separate deployed services. The director service holds provider credentials, enforces request limits, and returns structured proposals. The simulation commits accepted results. A browser implementation can use a local persistent store and a thin server; a native implementation can use an embedded database. Engine choice remains open until a short rendering and persistence spike.

An action travels from input to intent interpretation, rule validation, deterministic resolution, atomic commit, and grounded narration. A region request travels from constrained context to a semantic plan, assembly, validation, and versioned scene. Both include request IDs, expected state revisions, and cancellation state. No model response can directly execute arbitrary code or write unrestricted database fields.

| Uncertainty | Why it matters | Prototype investigation and fallback |
| --- | --- | --- |
| Generation tail latency | Average latency can hide boundary stalls | Record p50/p95/p99, inject 30–60 second delays, test ready-region fallbacks |
| Creative action coverage | A narrow verb set may feel like disguised buttons | Test unseen compound intentions; expose valid partial plans and expand affordances from observed demand |
| Semantic/art agreement | Valid JSON can still produce misleading scenery | Automated footprint checks plus human navigation tests; curated kit remains baseline |
| Long-term memory | Summaries may omit promises or leak secrets | Multi-session scripted histories, entity-based retrieval, knowledge-bound context |
| Causal credibility | Players may attribute arbitrary change to rerolling | Test evidence comprehension and counterfactual outcomes; reduce change frequency if necessary |
| Simulation growth | An unbounded world increases storage and dependencies | Lazy regional simulation, disk snapshots, bounded active area; retain consequential history |
| Voice recognition | Names and ambiguous transcripts can trigger wrong actions | Transcript review and target confirmation; text remains fully supported |
| Generation cost | Many speculative neighbors may be discarded | Measure cost per hour and unused plans; cap concurrency, cache, and use deterministic terrain |
| Save durability | Crashes and migrations can corrupt continuity | Fault injection around transactions, backup restoration, versioned export/import |

Instrument model calls and tokens by purpose, region-preparation time, canceled work, asset bytes, cache hit rate, frame time, commit conflicts, validation failures, and cost per player-hour. Set a product cost budget after measured prototype sessions; no dollar estimate is asserted here. Narration and simple conversation can use smaller contexts; expensive planning should be amortized over useful play. Do not make every footstep, idle NPC, or ordinary interaction an inference request.

Observability should preserve action and event IDs without requiring raw voice recordings. Keep debug traces out of player exports by default. A development replay can substitute recorded model responses to reproduce a state defect. Treat model upgrades as content-generation version changes and test against the continuity suite before enabling them in existing campaigns.

## 16. Focused first playable prototype

Build a **25–40 minute exploration-and-return slice**, not an infinite world. Its purpose is to prove that direct movement, creative intentions, and a remembered changing location reinforce one another.

### Included scope

- One frontier-fantasy content pack; player-defined setting details, tone, premise, and character within its supported limits.
- Three connected 128 × 128 outdoor regions with small enterable points of interest, generated or assembled ahead of travel.
- One settlement, six persistent named NPCs, roughly a dozen consequential objects, and several environmental clues.
- One primary local problem with at least three supported approaches, plus two optional discoveries and one personal lead.
- One short turn-based encounter that allows avoidance or escape.
- Text intentions covering investigation, conversation, social influence, manipulation, resource use, and tactics.
- One causally simulated return, with three possible settlement outcomes: recovery activity, evacuation, or a largely stable village with smaller changes.
- Persistent inventory, relationships, quest predicates, world events, journal history, and manual/autosaves.
- Curated pixel-art assets with generated layouts and content; complete boundary, collision, and revision checks.

Add push-to-talk after text interactions pass the same test suite; voice does not gate the core slice. No multiplayer, fully generated scene images, unrestricted construction, simulated continental economy, procedural voice acting, or arbitrary genre asset generation is required for this prototype.

### Implementation order and exit gates

1. **Movement and semantic scene.** Hand-assemble a representative region, render it from semantic data, and prove collision, selection, occlusion, and saving without any AI dependency.
2. **Bounded DM actions.** Implement structured interpretation, a small affordance system, state validation, and grounded outcomes. Demonstrate a useful unexpected solution.
3. **Ahead-of-player preparation.** Assemble the other regions, reconcile seams, prefetch, and exercise latency and cancellation fallbacks.
4. **Persistent people and quests.** Add relationships, knowledge provenance, commitments, and journal history. Test relocation and item loss.
5. **The return.** Advance time, resolve one causal event chain, commit a transformed settlement, and let the player investigate it.
6. **Playtest and harden.** Run the acceptance suite, fix critical integrity defects, then consider voice and additional content.

Keep a developer panel for forcing time, events, delayed responses, failures, and scene revisions. The same authored seeds and choices should produce a reproducible test baseline even when narrative wording varies. A small independent playtest must precede expansion to more biomes or unlimited regions.

## 17. Success criteria and validation plan

The targets below are proposed acceptance gates. Declare a reference machine, display, renderer build, model configuration, and network profile before measurement. Report both ordinary sessions and injected-failure tests; do not average away fallback behavior.

| Area | Acceptance target | How to test |
| --- | --- | --- |
| Responsive movement | 60 FPS target; input-to-visible movement p95 under 50 ms; no AI-dependent movement lock | Instrument reference hardware during normal play and active generation; capture frame and input traces |
| Region continuity | At least 95% of 100 ordinary boundary crossings enter ready playable content without blocking load | Mix direct routes, reversals, repeated returns, and rapid changes of direction |
| Honest delays | Local action acknowledgment within 150 ms; routine interpretation p95 within 5 seconds as an initial service budget | Inject 30–60 second delays and failures; verify pending feedback, cancellation, safe return, and continued local controls |
| Player freedom | At least 80% of 40 independently authored in-scope intentions receive a specific valid execution or useful composable partial plan | Include manipulation, deception, investigation, traversal, and tactics; generic refusal does not count as success |
| Meaningful approaches | Testers discover at least three mechanically distinct ways to address the local problem | Verify different resource use, relationships, or downstream consequences rather than different narration alone |
| Visual/state separation | Five presentation regenerations per region produce zero semantic changes | Compare terrain, exits, object IDs, inventories, inhabitants, and quest predicates |
| Causal continuity | Every semantic difference on return traces to a committed event with valid prerequisites and time | Audit snapshot diffs against the event ledger, including player-caused and independent events |
| Quest and item integrity | Zero duplicate unique items, duplicate rewards, dangling quest targets, or unexplained resets | Test death, relocation, ownership changes, fire damage, and lost objects |
| Knowledge integrity | Zero hidden-fact leaks across 20 controlled witness and rumor scenarios | Test delayed reports, deliberate lies, outdated beliefs, and corrections |
| Save durability | Exact canonical state round-trip across save/reload and crash recovery checkpoints | Save before, during, and after evolution; compare IDs, inventory, quests, clock, and committed event hashes |
| Race safety | Zero stale actions or scenes mutate the active revision | Force late results after movement, target replacement, cancellation, and loading a different save |
| Compelling exploration | At least 4 of 5 initial testers independently pursue an optional curiosity and can recall two distinct discoveries | Observe behavior without DM or facilitator prompting; ask an open-ended recall question afterward |
| Legible transformation | At least 4 of 5 testers explain what changed, identify an in-world clue, and connect a choice to a consequence | Interview after the return, before showing the internal event ledger |

The five-player usability thresholds are an early qualitative gate, not a statistically established retention result. Follow with a larger test if the slice succeeds. Record why players explore, whether they feel railroaded, whether pauses interrupt their intention, and whether they trust the journal. Do not optimize for map area traveled or quantity of generated text at the expense of memorable discoveries.

Integrity failures block expansion even if the story is entertaining. If creative freedom feels narrow, add affordances before more scenery. If returns feel arbitrary, improve causes and evidence before increasing transformation frequency. If latency misses the budget, rely more on local rules and prepared terrain before making the world larger.

## 18. Example session: the village at the waterline

### Day 1: a place worth remembering

The player creates a wistful marsh-frontier campaign and a surveyor looking for a missing mentor. Beyond the starting reed path, a bell tower rises above low roofs. The next region has already been prepared; the player walks into **Bellwether** without a loading stop.

The village's geography is concrete: an eastern causeway, a bridge beside the bell tower, a low workshop district, and an old spillway leading toward a disused western basin. An inspectable flood gauge bears the mentor's initials. Mara, the ferrymaker, explains that the spillway is jammed. Halen, a farmer, fears opening it will flood his stored grain. Neither knows whether the approaching rain will become a severe storm.

The player has several leads: attempt a repair, seek help at the upland pumping station, bargain for a boat, or follow the mentor's marks elsewhere. They type: “Could we open the old channel just enough to relieve the pressure and move Halen's grain first?”

The DM identifies a feasible combination of labor, clearance, negotiation, and controlled release. The engine checks the channel, tools, blocked mechanism, and NPC willingness. Moving the grain takes four hours and requires Halen's cooperation; clearing the channel needs Mara's chain winch. The player agrees to those costs, persuades Halen by showing the gauge readings, and helps clear the obstruction.

The committed outcome opens part of the spillway and moves the grain to higher storage. Water begins running west through a visible channel. Mara's trust rises because the player listened to both households. Halen owes a favor, although he remains uneasy about lost planting ground. The journal records the promise and repair as completed work, not a promise that flooding can never happen.

### Days 2–5: the world beyond Bellwether

The player follows a survey marker north. They inspect a collapsed shrine, find a short route through raised stonework, and negotiate with scavengers at the pumping station rather than fight them. An old field book suggests that the mentor traveled east. These discoveries remain useful even if the village's problem is never revisited.

Travel, a long repair task, and two rests advance campaign time. Reading the book and composing dialogue do not. During that interval, a scheduled storm reaches the marsh. Its cause is independent of the player. The opened spillway reduces the peak near the houses but sends water through the old basin. The low workshop district is damaged; the raised grain store survives. Mara moves her workbench uphill, and a displaced basin family arrives seeking shelter.

The event resolver records the storm, water routing, property damage, movements, and new shelter arrangement. The village revision updates while unloaded. The existing bridge and bell tower retain their coordinates. A caravan encountered on the road still says Bellwether is quiet: its information predates the storm. The player has reason to investigate, not an automatic omniscient update.

### Day 6: a recognizable place, a new situation

Returning over the eastern causeway, the player sees the same bell tower and bridge. Below them, the workshop windows are dark and boards mark the waterline. A workbench stands beside the high storehouse. Two unfamiliar children carry bedding through the square. The region's new visuals, collision, and inhabitants all come from the same committed revision.

The player can keep walking, inspect the damage, compare the journal's prior sketch, or seek Mara. No narration forces an explanation. A dated notice names the households moved uphill. Mud in the old workshop and the surviving grain store give physical evidence of the flood's uneven impact.

Mara remembers the winch and the shared repair. She explains that the channel helped save the houses, but that water reached the basin sooner. The new family confirms that they fled from there. Halen credits the player for moving his grain and offers it for shared meals; his opinion reflects the actual earlier negotiation. The same people retain their inventories, relationships, and histories rather than being replaced by newly generated versions of their roles.

The player types: “I want to check whether our diversion made the basin flood worse, and help that family if it did.” The DM turns this into an investigation using the gauge, the basin route, and witness accounts. It cannot declare guilt or innocence without evidence. The player may inspect the channel, compare measurements, ask the family about timing, or organize repairs. The old completed quest stays completed; a new responsibility has emerged from its consequences.

Had the spillway remained blocked, the same storm could have forced a larger evacuation under the simulation's rules. Had the player spent additional days securing embankments, damage could have been smaller. With no storm or other qualifying event, the return might have revealed only a repaired sign and new travelers. These alternatives come from time and conditions, not a reroll at the boundary.

The session ends with the player choosing to escort the family back toward the basin. The mentor's trail remains open. Their skills, equipment, promises, old observations, and current world state are saved. Bellwether is still Bellwether, but knowing what it used to be has become part of the adventure.

<!-- END OF DESIGN DOCUMENT -->

