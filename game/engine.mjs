/** The Long Return: deterministic, local-first rules for the playable slice.
 * Objects use top-left tile coordinates; actors use center coordinates.
 * All exported readers are pure. Mutations happen only in movePlayer/executeAction.
 */
export const SAVE_VERSION = 1;
const WIDTH = 64, HEIGHT = 48, SPEED = 3, REACH = 2.7;
const REGIONS = ['reedway', 'bellwether', 'uplands'];
const CACHE = new Map();
const names = { reedway: 'The Reedway', bellwether: 'Bellwether', uplands: 'Upland Station' };
const choice = (id, label, targetId) => ({ id, label, ...(targetId === undefined ? {} : { targetId }) });
const result = (title, text, choices = []) => ({ title, text, choices });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const finite = n => typeof n === 'number' && Number.isFinite(n);

function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function roll(state, low, high) {
  let n = state.rngState >>> 0;
  n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  state.rngState = n >>> 0 || 1;
  return low + state.rngState % (high - low + 1);
}
function addItem(state, item) { if (!state.inventory.includes(item)) state.inventory.push(item); }
function record(state, id, title, text, type = 'discovery', causes = [], occurredAt = null) {
  if (state.history.some(e => e.id === id)) return false;
  state.revision++;
  const event = { id, day: occurredAt?.day ?? state.day, minutes: occurredAt?.minutes ?? state.minutes, title, text, type, causes, revision: state.revision };
  state.history.push(event);
  state.journal.push({ id, day: state.day, title, text });
  return true;
}
function time(state, minutes) {
  state.minutes += minutes;
  while (state.minutes >= 1440) { state.minutes -= 1440; state.day++; }
}
function objective(state) {
  if (state.flags.stormOccurred) {
    state.objective = state.flags.floodInvestigated
      ? (state.flags.familyHelped ? 'Your return is complete. Keep exploring, or start a different campaign to change Bellwether’s future.' : 'Find the displaced family near the storehouse and decide how to help.')
      : 'Investigate Bellwether’s changes. Read the flood notice and speak with familiar people.';
  } else if (state.flags.visitedUplands) {
    const nights = Math.max(0, 3 - (state.day - state.flags.firstUplandsDay));
    state.objective = nights ? `Explore the station. Rest ${nights} more night${nights === 1 ? '' : 's'} at camp, then return west to Bellwether.` : 'Return west to Bellwether and discover what changed.';
  } else if (state.regionId === 'bellwether') {
    state.objective = 'Meet Mara and Halen. Decide what to do about the spillway and grain, then follow the road east.';
  } else {
    state.objective = 'Follow the road east to Bellwether. Inspect the survey marker or flowers along the way.';
  }
}

export function createCampaign(input = {}) {
  const clean = (value, fallback, max = 400) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
  const campaign = {
    name: clean(input.name, 'The Long Return', 80),
    setting: clean(input.setting, 'A marsh frontier of old flood engines and quiet villages'),
    tone: clean(input.tone, 'Wistful, mysterious, hopeful', 160),
    premise: clean(input.premise, 'A wandering surveyor follows the trail of a missing mentor'),
    seed: clean(String(input.seed ?? 'bellwether-1'), 'bellwether-1', 80),
  };
  const state = {
    version: SAVE_VERSION, campaign, player: { x: 7, y: 24, hp: 24, maxHp: 24 },
    regionId: 'reedway', day: 1, minutes: 480, inventory: ['Surveyor’s compass', 'Walking staff', 'Field rations'],
    flags: { villagePhase: 'before', maraTrust: 0, halenTrust: 0 },
    journal: [], history: [], objective: '', revision: 1, rngState: hash(campaign.seed) || 1, combat: null,
  };
  record(state, 'arrival', 'A path into the marsh', `Your journey begins on the Reedway. ${campaign.premise}. Bellwether lies east, beyond the reeds.`);
  objective(state);
  return state;
}

function object(id, type, x, y, w, h, label, solid, description, interactive = true) {
  return { id, type, x, y, w, h, label, solid, description, interactive };
}
function buildRegion(state) {
  const id = state.regionId, phase = state.flags.villagePhase;
  const seed = hash(`${state.campaign.seed}:${id}`);
  const tiles = Array(WIDTH * HEIGHT).fill('grass');
  const paint = (x, y, w, h, tile) => { for (let j = Math.max(0, y); j < Math.min(HEIGHT, y + h); j++) for (let i = Math.max(0, x); i < Math.min(WIDTH, x + w); i++) tiles[j * WIDTH + i] = tile; };
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const n = hash(`${seed}/${x}/${y}`) % 100;
    if (n < 3) tiles[y * WIDTH + x] = 'flowers';
  }
  paint(0, 22, WIDTH, 5, 'path');
  const objects = [], npcs = [];
  let description = '';
  if (id === 'reedway') {
    description = 'Reeds give way to an old survey road. Bellwether’s bell tower stands to the east.';
    for (let x = 0; x < 29; x++) paint(x, 36 + Math.floor(Math.sin(x / 7) * 3), 1, 12, 'water');
    paint(16, 17, 3, 7, 'path'); paint(37, 24, 3, 9, 'path');
    objects.push(
      object('reedway-sign', 'sign', 10, 20, 1, 1, 'Road sign', false, 'BELLWETHER → · UPLAND STATION →→'),
      object('survey-marker', 'ruin', 16, 16, 3, 2, 'Old survey marker', true, 'Initials scratched into the stone match your mentor’s field notes.'),
      object('marsh-herbs', 'flowers', 27, 28, 2, 2, state.flags.herbsCollected ? 'Picked marsh flowers' : 'Silver marsh herbs', false, 'Silver leaves grow above the waterline. A small harvest could treat an injury.'),
      object('reedway-camp', 'camp', 37, 31, 3, 2, 'Roadside camp', false, 'A dry fire circle and a bed of reeds. Rest advances one night and restores health.'),
      object('reedway-crate', 'crate', 43, 18, 2, 2, 'Weathered supply box', true, 'An empty surveyor’s box, dated a season ago.'),
    );
  } else if (id === 'bellwether') {
    description = phase === 'before' ? 'A small village works around a failing spillway. The road runs east toward the old pumping station.' : 'The bell tower is familiar. The waterline, people, and work around it have changed.';
    paint(47, 0, 5, HEIGHT, 'water'); paint(46, 0, 1, HEIGHT, 'sand'); paint(52, 0, 1, HEIGHT, 'sand');
    paint(47, 22, 5, 5, 'path');
    paint(20, 17, 3, 15, 'path'); paint(30, 20, 3, 14, 'path'); paint(42, 25, 3, 11, 'path');
    objects.push(
      object('village-sign', 'sign', 8, 20, 1, 1, 'Bellwether notice board', false, 'A charcoal map shows the old channel, low workshops, and the high grain store.'),
      object('storehouse', 'house', 17, 12, 8, 7, 'High storehouse', true, state.flags.grainMoved ? 'Halen’s grain is safe on these high shelves.' : 'A raised storehouse with room for the grain from the low sheds.'),
      object('bell-tower', 'tower', 30, 14, 3, 7, 'Bell tower', true, 'The oldest landmark in Bellwether. Its carved foundation marks historic floods.'),
      object('village-house', 'house', 35, 12, 7, 6, phase === 'evacuated' ? 'Shuttered home' : 'Village home', true, 'A whitewashed house beneath the bell tower.'),
      object('workshop', 'house', 37, 32, 8, 6, phase === 'before' ? 'Mara’s workshop' : 'Flooded workshop', true, phase === 'before' ? 'Boat frames hang above a low workbench.' : 'Mud stains the windows. Mara’s old bench has been moved uphill.'),
      object('grain', 'crate', 20, 29, 2, 2, state.flags.grainMoved ? 'Empty grain pallet' : 'Halen’s grain', true, state.flags.grainMoved ? 'Tracks lead uphill to the storehouse.' : 'Grain sacks sit dangerously close to the old flood line.'),
      object('well', 'well', 29, 29, 2, 2, 'Village well', true, 'A shallow stone well. The gauge beside it records rising pressure.'),
      object('gauge', 'sign', 33, 28, 1, 1, 'Flood gauge', false, 'Your mentor marked safe and dangerous water levels here.'),
      object('bridge', 'bridge', 47, 22, 5, 5, 'Stone bridge', false, 'The bridge is raised above the channel and still carries the eastern road.', false),
      object('sluice', 'sluice', 44, 30, 3, 2, state.flags.sluiceRepaired ? 'Open spillway' : 'Jammed spillway', true, state.flags.sluiceRepaired ? 'The chain winch holds the old channel partly open.' : 'A chain winch could clear the jam and divert high water west.'),
      object('bellwether-camp', 'camp', 8, 31, 3, 2, 'Village traveler’s camp', false, 'A sheltered patch beside the village. Rest until morning.'),
    );
    npcs.push(
      { id: 'mara', name: 'Mara', x: phase === 'before' ? 42 : 26, y: phase === 'before' ? 29 : 20, color: '#d9875e', role: 'Ferrymaker' },
      { id: 'halen', name: 'Halen', x: phase === 'before' ? 23 : 20, y: phase === 'before' ? 30 : 20, color: '#a8b576', role: 'Grain farmer' },
    );
    if (phase !== 'before') {
      paint(35, 34, 12, 8, 'water'); paint(35, 31, 12, 3, 'sand');
      objects.push(object('flood-notice', 'sign', 27, 24, 1, 1, 'Dated flood notice', false, `Day ${state.flags.stormDay}: low workshops closed; displaced households shelter at the high store.`));
      objects.push(object('moved-workbench', 'crate', 26, 18, 2, 1, 'Mara’s relocated workbench', true, 'The same scratched workbench, carried up from the low workshop.'));
      if (phase === 'evacuated') { paint(13, 28, 10, 8, 'sand'); description = 'Shuttered houses and muddy paths show a hurried evacuation. Mara and Halen remain to organize the return.'; }
      npcs.push({ id: 'elin', name: 'Elin', x: 34, y: 20, color: '#b6a3d2', role: 'Displaced basin resident' });
      objects.push(object('refugee-camp', 'camp', 36, 19, 3, 2, 'Family shelter', false, 'Bedding and a child’s carved boat rest beside the high storehouse.'));
    }
  } else {
    description = 'Wind moves through the old pumping station. A scavenger keeps watch near the road; the northern archive holds a survey book.';
    paint(36, 10, 19, 11, 'stone'); paint(44, 19, 3, 8, 'path'); paint(15, 25, 3, 9, 'path');
    paint(0, 39, 23, 9, 'stone');
    objects.push(
      object('uplands-sign', 'sign', 8, 20, 1, 1, 'Station waypost', false, '← BELLWETHER · ARCHIVE ↑ · DRY CAMP ↓'),
      object('station-ruin', 'ruin', 37, 10, 15, 4, 'Old pumping station', true, 'Rusting pumps stand inside roofless walls. The archive survives on the southern terrace.'),
      object('survey-book', 'crate', 45, 17, 2, 1, state.flags.bookRead ? 'Read survey archive' : 'Survey archive', true, 'A sealed folio carries your mentor’s initials and a map of the western basin.'),
      object('uplands-camp', 'camp', 15, 32, 3, 2, 'Upland dry camp', false, 'A safe camp above the marsh. Rest here three nights, then return west to Bellwether.'),
      object('uplands-shrine', 'ruin', 28, 34, 3, 3, 'Roadkeeper’s shrine', true, 'The stone roadkeeper holds a fragment of an old raised-road map.'),
    );
    if (!state.flags.scavengerDefeated) npcs.push({ id: 'scavenger', name: 'Rook', x: 30, y: 24, color: '#b88471', role: state.flags.negotiated ? 'Station salvager · friendly' : 'Station salvager' });
  }
  // A restrained seeded set of trees leaves roads and authored interaction spaces clear.
  for (let i = 0; i < 100; i++) {
    const x = 3 + hash(`${seed}-tx${i}`) % 57, y = 3 + hash(`${seed}-ty${i}`) % 40;
    if (y > 18 && y < 30 || tiles[y * WIDTH + x] !== 'grass') continue;
    if (objects.some(o => x > o.x - 3 && x < o.x + o.w + 3 && y > o.y - 3 && y < o.y + o.h + 3)) continue;
    if (npcs.some(n => Math.hypot(n.x - x, n.y - y) < 4)) continue;
    objects.push(object(`${id}-tree-${i}`, 'tree', x, y, 1, 1, 'Marsh pine', true, 'A wind-shaped tree.', false));
  }
  return { id, name: names[id], description, width: WIDTH, height: HEIGHT, tiles, objects, npcs };
}

export function getRegion(state) {
  const key = `${state.campaign.seed}|${state.regionId}|${state.flags.villagePhase}|${!!state.flags.herbsCollected}|${!!state.flags.grainMoved}|${!!state.flags.sluiceRepaired}|${!!state.flags.bookRead}|${!!state.flags.scavengerDefeated}|${!!state.flags.negotiated}|${state.flags.stormDay ?? ''}`;
  if (!CACHE.has(key)) { if (CACHE.size > 80) CACHE.clear(); CACHE.set(key, buildRegion(state)); }
  return CACHE.get(key);
}
function distanceTo(player, target) {
  if (target.type === 'npc') return Math.hypot(player.x - target.x, player.y - target.y);
  return Math.hypot(player.x - clamp(player.x, target.x, target.x + target.w), player.y - clamp(player.y, target.y, target.y + target.h));
}
function targets(state) {
  const region = getRegion(state);
  return [...region.objects.filter(o => o.interactive).map(o => ({ ...o, name: o.label })), ...region.npcs.map(n => ({ ...n, type: 'npc', label: n.name, description: n.role, interactive: true }))];
}
export function nearbyTargets(state) {
  return targets(state).map(t => ({ ...t, distance: distanceTo(state.player, t) })).filter(t => t.distance <= REACH).sort((a, b) => a.distance - b.distance);
}
function findNearby(state, id) { return nearbyTargets(state).find(t => t.id === id); }
function walkable(state, x, y) {
  if (x < .3 || x > WIDTH - .3 || y < .3 || y > HEIGHT - .3) return false;
  const region = getRegion(state), radius = .23;
  for (const ox of [-radius, radius]) for (const oy of [-radius, radius]) {
    if (region.tiles[Math.floor(y + oy) * WIDTH + Math.floor(x + ox)] === 'water') return false;
  }
  return !region.objects.some(o => o.solid && x + radius > o.x && x - radius < o.x + o.w && y + radius > o.y && y - radius < o.y + o.h);
}
function evolveVillage(state) {
  if (state.flags.stormOccurred || !state.flags.visitedUplands || state.day - state.flags.firstUplandsDay < 3) return;
  // This slice materializes the storm at a return boundary. Its earliest date is
  // a milestone, not permission to contradict a later unchanged visit. Place it
  // within the latest absence, after every action the player actually witnessed.
  const now = (state.day - 1) * 1440 + state.minutes;
  const departure = state.flags.lastVillageDepartureDay === undefined ? now
    : (state.flags.lastVillageDepartureDay - 1) * 1440 + state.flags.lastVillageDepartureMinutes;
  const planned = (state.flags.firstUplandsDay + 1) * 1440 + 480;
  const occurred = Math.max(planned, departure + Math.min(1, Math.max(0, now - departure) / 2));
  const occurredAt = { day: Math.floor(occurred / 1440) + 1, minutes: occurred % 1440 };
  state.flags.stormOccurred = true;
  state.flags.stormDay = occurredAt.day;
  state.flags.villagePhase = state.flags.sluiceRepaired ? 'recovering' : state.flags.grainMoved ? 'sheltered' : 'evacuated';
  const account = state.flags.sluiceRepaired
    ? 'The opened spillway relieved pressure near the houses. The low workshop flooded, and a family from the western basin moved uphill.'
    : state.flags.grainMoved ? 'The jammed spillway forced households uphill. The grain you moved supplies the shelter.' : 'The jammed spillway sent water through the low homes and grain sheds. Most households left; Mara and Halen coordinate a return.';
  record(state, 'storm', 'Bellwether after the storm', `A storm reached the marsh on Day ${state.flags.stormDay}. ${account}`, 'world-event', ['scheduled-marsh-storm', ...(state.flags.sluiceRepaired ? ['repair-sluice'] : []), ...(state.flags.grainMoved ? ['move-grain'] : [])], occurredAt);
  objective(state);
}
function enterRegion(state, id, x) {
  if (state.regionId === 'bellwether' && id !== 'bellwether') {
    state.flags.lastVillageDepartureDay = state.day;
    state.flags.lastVillageDepartureMinutes = state.minutes;
  }
  state.regionId = id; state.player.x = x; state.player.y = clamp(state.player.y, 22.5, 26.5);
  if (id === 'uplands' && !state.flags.visitedUplands) { state.flags.visitedUplands = true; state.flags.firstUplandsDay = state.day; }
  if (id === 'bellwether') evolveVillage(state);
  record(state, `visit-${id}`, names[id], id === 'uplands' ? 'A dry camp lies south of the road. The archive is northeast. Rest three nights and return west to see how Bellwether fares.' : getRegion(state).description);
  state.revision++; objective(state);
}

export function movePlayer(state, dx, dy, dt) {
  if (!finite(dx) || !finite(dy) || !finite(dt) || dt <= 0 || state.combat) return { changedRegion: false };
  const length = Math.hypot(dx, dy); if (!length) return { changedRegion: false };
  const duration = Math.min(dt, .5), amount = SPEED * duration;
  const steps = Math.max(1, Math.ceil(amount / .15));
  const sx = dx / length * amount / steps, sy = dy / length * amount / steps;
  let moved = false, changedRegion = false;
  for (let i = 0; i < steps; i++) {
    const x = state.player.x + sx, y = state.player.y + sy;
    if ((x < .31 || x > WIDTH - .31) && state.player.y >= 22.5 && state.player.y <= 26.5) {
      const index = REGIONS.indexOf(state.regionId) + (x < .31 ? -1 : 1);
      if (index >= 0 && index < REGIONS.length) { enterRegion(state, REGIONS[index], x < .31 ? WIDTH - 1 : 1); changedRegion = true; moved = true; break; }
    }
    if (walkable(state, x, state.player.y)) { state.player.x = x; moved = true; }
    if (walkable(state, state.player.x, y)) { state.player.y = y; moved = true; }
  }
  // Position is checked again when an action commits. Walking does not invalidate
  // a pending DM response by itself; semantic changes and region entry do.
  if (moved) { time(state, duration); objective(state); }
  return { changedRegion };
}

function combatMenu(state, text = 'Rook has committed to the fight. Each attack or guard resolves one turn. You can always flee.') {
  const choices = [choice('attack', 'Attack with walking staff'), choice('guard', 'Guard and recover your footing'), choice('flee', 'Flee west along the road')];
  if (state.inventory.includes('Marsh herbs')) choices.push(choice('use_herbs', 'Use marsh herbs'));
  return result(`Rook · ${state.combat?.enemyHp ?? 14} health`, text, choices.map(c => ({ ...c, targetId: 'scavenger' })));
}
export function interact(state, targetId) {
  const response = interactionMenu(state, targetId);
  return { ...response, choices: response.choices.map(c => ({ ...c, targetId: c.targetId ?? targetId })) };
}
function interactionMenu(state, targetId) {
  if (state.combat) return combatMenu(state);
  const target = findNearby(state, targetId);
  if (!target) return result('A little closer', 'Move within a few steps of that person or object to interact.');
  const f = state.flags;
  if (targetId.endsWith('-camp')) return result(target.label, 'Rest until the next morning, restore your health, and advance the world by one night. Server delays and reading do not advance the clock.', [choice('rest', 'Rest until morning')]);
  switch (targetId) {
    case 'mara':
      if (f.stormOccurred) return result('Mara remembers', `${f.sluiceRepaired ? '“Your work on the spillway saved the houses. I kept the winch you helped rig.”' : '“The spillway stayed jammed. The low homes took the worst of it.”'} ${f.grainMoved ? '“And moving Halen’s grain gave us food to share.”' : '“We lost the grain from the low sheds.”'} My workshop is gone for now. Elin’s family came from the basin.`, [choice('investigate_flood', 'Ask what happened during the storm')]);
      return result('Mara · ferrymaker', `${f.sluiceRepaired ? '“The winch is holding. Thank you for helping.”' : '“The old spillway is jammed. My chain winch can clear it, but opening the channel sends high water toward the western basin.”'} ${f.grainMoved ? 'Halen’s grain is already safe.' : 'Halen’s grain could be moved uphill before we work.'}`, [...(!f.sluiceRepaired ? [choice('repair_sluice', 'Help clear the spillway · 4 hours')] : []), ...(!f.grainMoved ? [choice('move_grain', 'Arrange to move the grain first · 4 hours')] : []), choice('leave_spillway', 'Leave the spillway as it is')]);
    case 'halen':
      return f.stormOccurred
        ? result('Halen · grain farmer', f.grainMoved ? '“You insisted we move the grain. I doubted you, but those sacks are feeding everyone at the high store. I owe you.”' : '“The grain was still in the low sheds when the water came. I’m trying to salvage what I can.”', [choice('investigate_flood', 'Ask about the waterline')])
        : result('Halen · grain farmer', f.grainMoved ? '“The sacks are on high shelves. Thank you. I’ll keep your favor in mind.”' : '“Moving all these sacks costs half a working day. Show me the gauge and help carry them, and I’ll agree.”', f.grainMoved ? [] : [choice('move_grain', 'Read the gauge together and move the grain · 4 hours')]);
    case 'sluice': return result(target.label, target.description, !f.stormOccurred && !f.sluiceRepaired ? [choice('repair_sluice', 'Clear the spillway with Mara · 4 hours'), choice('leave_spillway', 'Leave it closed')] : [choice('investigate_flood', 'Study the channel and flood marks')]);
    case 'grain': return result(target.label, target.description, !f.grainMoved && !f.stormOccurred ? [choice('move_grain', 'Move the grain to high ground · 4 hours')] : []);
    case 'gauge': return result('Flood gauge', 'The scratched measurements are readable. Your mentor marked the western basin as a release channel.', [choice('inspect_gauge', 'Read and record the measurements')]);
    case 'survey-marker': return result(target.label, target.description, [choice('inspect_marker', 'Trace the old survey marks')]);
    case 'marsh-herbs': return result(target.label, target.description, f.herbsCollected ? [] : [choice('collect_herbs', 'Gather a small medicinal bundle')]);
    case 'survey-book': return result('Survey archive', 'A folio has survived beneath oilcloth. The surviving notes connect the old basin to Bellwether’s spillway.', [choice('read_book', f.bookRead ? 'Review the field book' : 'Read the field book · 6 hours')]);
    case 'uplands-shrine': return result(target.label, target.description, [choice('inspect_marker', 'Record the raised-road map')]);
    case 'scavenger': return f.negotiated ? result('Rook · station salvager', '“The archive is yours to read. I’ve no quarrel with travelers who ask. Camp is dry; weather below is turning.”') : result('Rook · station salvager', '“Those pumps are my salvage. The old papers? Ask before you touch them.” You can talk, start a fight, or simply keep your distance.', [choice('negotiate', 'Offer to share your survey findings'), choice('attack', 'Attack Rook with your staff')]);
    case 'flood-notice': return result('Dated flood notice', target.description, [choice('investigate_flood', 'Compare this visit with your earlier notes')]);
    case 'elin': return result('Elin · basin resident', f.familyHelped ? '“We have what we need to begin again. Thank you for listening before deciding what our story meant.”' : '“Water reached our home before dawn. We left by the raised road. We need supplies and a way back.”', [choice('investigate_flood', 'Ask about the timing and route'), ...(!f.familyHelped ? [choice('help_refugees', f.grainMoved ? 'Arrange a share of the saved grain · 2 hours' : 'Help salvage dry supplies · 4 hours')] : [])]);
    default: return result(target.label, target.description);
  }
}

function available(state) {
  if (state.combat) return combatMenu(state).choices.map(c => ({ ...c, targetId: 'scavenger', targetIds: ['scavenger'], description: c.label }));
  const list = [];
  for (const target of nearbyTargets(state)) for (const c of interact(state, target.id).choices) {
    if (!list.some(a => a.id === c.id && a.targetId === target.id)) list.push({ ...c, targetId: target.id, targetIds: [target.id], description: c.label });
  }
  if (state.inventory.includes('Marsh herbs') && state.player.hp < state.player.maxHp) list.push({ id: 'use_herbs', label: 'Treat your injuries with marsh herbs', description: 'Restore 10 health; consumes your herbs', targetId: null, targetIds: [] });
  return list;
}

export function executeAction(state, actionId, targetId) {
  const allowed = available(state).find(a => a.id === actionId && (targetId == null || a.targetId === targetId));
  if (!allowed) return result('That action is not available here', 'Move close to the relevant person or object. Actions depend on the current place, resources, and history.');
  targetId = allowed.targetId;
  const f = state.flags;
  switch (actionId) {
    case 'rest': {
      const previous = state.day; state.day++; state.minutes = 480; state.player.hp = state.player.maxHp;
      record(state, `rest-${state.day}-${state.history.length}`, 'A night on the road', `Rested at ${names[state.regionId]} from Day ${previous} to Day ${state.day}.`, 'rest');
      objective(state);
      return result(`Day ${state.day} · rested`, `${state.flags.visitedUplands && state.day - f.firstUplandsDay >= 3 ? (state.regionId === 'bellwether' ? 'Three nights have passed since you first reached the uplands. Storm clouds gather over the marsh; this visit remains part of the village’s history.' : 'Three nights have passed since you reached the uplands. Rain clouds have crossed the marsh. Return west to Bellwether to discover what happened.') : 'You wake with full health. The world has had another night to change.'}`, [choice('rest', 'Rest another night', targetId)]);
    }
    case 'repair_sluice':
      f.sluiceRepaired = true; f.maraTrust += 2; time(state, 240);
      record(state, 'repair-sluice', 'The spillway opens', 'With Mara’s chain winch, you cleared the old spillway. Water can now escape toward the western basin. Mara remembers your help.', 'decision', ['spillway-jam']);
      objective(state); return result('The old channel runs again', 'Four hours of work free the mechanism. Mara’s trust grows. The village is better protected, but diverted water may reach the basin sooner.');
    case 'move_grain':
      f.grainMoved = true; f.halenTrust += 2; time(state, 240);
      record(state, 'move-grain', 'Grain on high ground', 'You showed Halen the gauge and spent four hours moving his grain into the high storehouse. He owes you a favor.', 'decision');
      objective(state); return result('The sacks are safe', 'Halen locks the high storehouse. Four hours have passed; the grain and your new relationship will persist when you leave.');
    case 'leave_spillway':
      if (!f.sluiceRepaired) f.spillwayLeft = true;
      record(state, 'leave-spillway', 'A decision deferred', 'You chose to leave the spillway as it was. You may still return and help before the storm.', 'decision');
      return result('The road remains open', 'You can head east to Upland Station, or reconsider while the village is still unchanged.');
    case 'inspect_gauge':
      f.gaugeRead = true; record(state, 'gauge', 'Your mentor’s water marks', 'The gauge marks show that the old spillway protects the low houses by releasing water toward the western basin.');
      return result('A connected landscape', 'The marks make the tradeoff clear: opening the spillway reduces village pressure, but the western basin receives the release. Your journal keeps the measurements.');
    case 'inspect_marker': {
      const shrine = targetId === 'uplands-shrine';
      record(state, shrine ? 'shrine' : 'marker', shrine ? 'The raised-road route' : 'A familiar hand', shrine ? 'A carved map records an elevated route from the western basin to Bellwether.' : 'Your mentor’s initials point east toward the Upland Station archive.');
      addItem(state, shrine ? 'Raised-road tracing' : 'Mentor’s survey rubbing');
      return result(shrine ? 'A route worth keeping' : 'The trail continues east', shrine ? 'You copy the raised-road map. It could help a displaced family return home.' : 'The rubbing reveals your mentor’s next stop: the station archive. This discovery is recorded only once.');
    }
    case 'collect_herbs':
      f.herbsCollected = true; addItem(state, 'Marsh herbs'); record(state, 'herbs', 'A useful discovery', 'Gathered a medicinal bundle of marsh herbs. It restores health when used.');
      return result('Marsh herbs gathered', 'One careful harvest leaves the roots intact. Your inventory now holds a bundle that restores 10 health.');
    case 'read_book':
      if (!f.bookRead) { f.bookRead = true; time(state, 360); addItem(state, 'Mentor’s field book'); record(state, 'book', 'The mentor’s field book', 'The notes trace an elevated basin route and warn that releasing the spillway protects Bellwether while sending water west. Your mentor continued east.'); }
      objective(state); return result('The basin is connected', 'The field book confirms your mentor traveled east. Its diagrams connect Bellwether’s spillway to the basin. Rest at the southern camp for three nights, then return to see what happened.');
    case 'negotiate':
      f.negotiated = true; addItem(state, 'Rook’s station sketch'); time(state, 30); record(state, 'rook-peace', 'A shared survey', 'Rook agreed to share the station after you offered to copy your measurements. You gained a sketch without a fight.', 'relationship');
      return result('A practical agreement', '“Keep the papers. Leave me the iron.” Rook gives you a station sketch. The archive and camp remain open.');
    case 'attack': {
      if (!state.combat) { state.combat = { enemyHp: 14, maxHp: 14, turn: 0 }; record(state, 'rook-fight', 'A fight at the station', 'You attacked Rook over the old station. The road behind you remains an escape.', 'combat'); }
      const dealt = roll(state, 4, 7); state.combat.enemyHp -= dealt; state.combat.turn++;
      if (state.combat.enemyHp <= 0) { state.combat = null; f.scavengerDefeated = true; time(state, 10); record(state, 'rook-defeated', 'The station falls quiet', 'Rook yielded and left the station. The archive remains accessible, but a possible ally has been lost.', 'combat'); return result('Rook yields', `Your blow dealt ${dealt} damage. Rook retreats across the stonework. You keep your equipment, but he will remember the attack.`); }
      const taken = roll(state, 2, 5); state.player.hp -= taken; state.revision++;
      return finishCombatTurn(state, `You deal ${dealt} damage; Rook counters for ${taken}.`);
    }
    case 'guard': {
      const taken = roll(state, 0, 2); state.player.hp = Math.min(state.player.maxHp, state.player.hp + 1) - taken; state.combat.turn++; state.revision++;
      return finishCombatTurn(state, `You brace behind your staff and regain 1 health. Rook’s guarded strike deals ${taken}.`);
    }
    case 'flee':
      state.combat = null; state.player.x = 24; state.player.y = 24; time(state, 15); state.revision++;
      return result('You break away', 'You retreat west to the open road. Rook holds the station but does not pursue. You can still take the northern path to the archive.');
    case 'use_herbs':
      state.inventory.splice(state.inventory.indexOf('Marsh herbs'), 1); state.player.hp = Math.min(state.player.maxHp, state.player.hp + 10); state.revision++;
      return state.combat ? combatMenu(state, 'You bind the wound with marsh herbs and restore 10 health. The bundle is consumed.') : result('Injuries treated', 'The marsh herbs restore 10 health. The bundle is consumed.');
    case 'investigate_flood': {
      if (!f.stormOccurred) return result('Before the storm', 'The channel and gauge show where water will go. Return after spending three nights in the uplands to learn what actually happened.');
      f.floodInvestigated = true;
      record(state, 'flood-investigation', 'Tracing the waterline', `Dated notices, water marks, and witness accounts confirm the storm arrived on Day ${f.stormDay}. ${f.sluiceRepaired ? 'Your opened spillway relieved the village but accelerated water into the basin.' : 'The closed spillway kept pressure near the low village.'} ${f.grainMoved ? 'The grain survived on high shelves.' : 'The low grain stores were lost.'}`, 'investigation', ['storm']);
      objective(state); return result('A history you can follow', `${f.sluiceRepaired ? 'Your diversion helped save the houses and sent water west sooner.' : 'With the spillway closed, water remained high around the village.'} ${f.grainMoved ? 'Moving the grain gave the shelter a food reserve.' : 'The sacks left on the low pallet were lost.'} Elin’s family reached the village along the raised road. The journal preserves both your old visit and this one.`);
    }
    case 'help_refugees':
      f.familyHelped = true; time(state, f.grainMoved ? 120 : 240); f.maraTrust++;
      record(state, 'help-family', 'A beginning after the water', f.grainMoved ? 'Halen honored your favor and shared the saved grain with Elin’s family.' : 'You helped Elin salvage dry supplies and mark a safe route back toward the basin.', 'relationship', ['storm', ...(f.grainMoved ? ['move-grain'] : [])]);
      objective(state); return result('Something to return for', `${f.grainMoved ? 'Halen shares the saved grain. Your earlier work has become a meal for the shelter.' : 'A few hours of salvage provide dry tools and supplies. Elin can begin again.'} ${state.inventory.includes('Raised-road tracing') ? 'Your tracing helps the family plan their journey home.' : 'Elin marks the raised road in your journal.'} Your equipment, discoveries, and relationships remain with you. This completes the return story; the world remains open to explore.`);
    default: return result('No matching rule', 'This action has no supported rule in the current slice.');
  }
}
function finishCombatTurn(state, text) {
  if (state.player.hp > 0) return combatMenu(state, text);
  state.combat = null; state.player.hp = Math.ceil(state.player.maxHp / 2); state.player.x = 16; state.player.y = 30; time(state, 240);
  record(state, `defeat-${state.history.length}`, 'A costly retreat', 'You escaped to the dry camp injured. Four hours passed, but your possessions remain yours.', 'combat');
  return result('Forced to retreat', `${text} You retreat to the dry camp. Four hours pass and you recover to half health. Your possessions are safe; rest to recover fully.`);
}

export function interpretLocalIntent(state, text) {
  const input = String(text ?? '').trim().toLowerCase();
  if (!input) return result('What would you like to try?', 'Describe an action, or approach an object and use its interaction menu.');
  const actions = available(state);
  let id;
  if (/\b(flee|run away|retreat|escape)\b/.test(input)) id = 'flee';
  else if (/\b(guard|defend|block)\b/.test(input)) id = 'guard';
  else if (/\b(attack|hit|fight|strike)\b/.test(input)) id = 'attack';
  else if (/\b(heal|bandage|use.*herb|treat.*wound)\b/.test(input)) id = 'use_herbs';
  else if (/\b(rest|sleep|camp|wait.*night)\b/.test(input)) id = 'rest';
  else if (/grain|sacks/.test(input) && /move|carry|save|protect|store|help/.test(input)) id = 'move_grain';
  else if (/sluice|spillway|channel|winch/.test(input) && /repair|fix|open|clear|help/.test(input)) id = 'repair_sluice';
  else if (/leave|ignore/.test(input) && /sluice|spillway|village/.test(input)) id = 'leave_spillway';
  else if (/grain|supplies|family|refugee|elin/.test(input) && /share|help|give|salvage/.test(input)) id = state.flags.stormOccurred ? 'help_refugees' : 'move_grain';
  else if (/gauge|measurement/.test(input)) id = 'inspect_gauge';
  else if (/book|archive|folio/.test(input)) id = 'read_book';
  else if (/herbs|flower|leaves/.test(input)) id = 'collect_herbs';
  else if (/marker|shrine|rubbing|tracing/.test(input)) id = 'inspect_marker';
  else if (/negotiate|bargain|share.*survey|offer.*findings|talk.*rook/.test(input)) id = 'negotiate';
  else if (/flood|storm|what.*happen|waterline|changed|diversion/.test(input)) id = 'investigate_flood';
  const action = actions.find(a => a.id === id);
  if (action) return { actionId: action.id, targetId: action.targetId };
  const person = nearbyTargets(state).find(t => t.type === 'npc' && input.includes(t.name.toLowerCase()));
  if (person && /talk|ask|speak|hello/.test(input)) return interact(state, person.id);
  if (id) return result('Approach the relevant place', 'That intention has a local rule, but its target is not within reach or its conditions are not met. Approach the person or object and inspect the available actions.', actions.slice(0, 4).map(a => choice(a.id, a.label, a.targetId)));
  return result('Local intention rules', 'This playable slice recognizes nearby actions such as moving grain, opening the spillway, negotiating with Rook, reading the archive, gathering herbs, resting, and investigating the flood. Your idea needs a supported world action. With a connected AI dungeon master, you can also phrase these intentions freely.', actions.slice(0, 4).map(a => choice(a.id, a.label, a.targetId)));
}

export function summarizeForDM(state) {
  const region = getRegion(state);
  return {
    campaign: { ...state.campaign }, region: { id: region.id, name: region.name, description: region.description }, revision: state.revision,
    day: state.day, minutes: Math.floor(state.minutes), player: { ...state.player }, inventory: [...state.inventory],
    knownFlags: { ...state.flags }, currentObjective: state.objective,
    nearbyTargets: nearbyTargets(state).map(t => ({ id: t.id, name: t.label, type: t.type, description: t.description })),
    availableActions: available(state), recentJournal: state.journal.slice(-8).map(e => ({ ...e })),
    rules: 'This is a finite, local-rule prototype. Select only an available action. Narrative does not commit effects. Do not invent unobserved NPC knowledge, terrain changes, inventory, or completed outcomes.',
  };
}

export function validateSave(raw) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw)); } catch { throw new Error('This file is not a valid campaign save.'); }
  const fail = () => { throw new Error('This campaign save is incomplete or incompatible. Your current campaign was not changed.'); };
  const text = (v, max = 2000) => typeof v === 'string' && v.length <= max;
  const integer = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  if (!value || value.version !== SAVE_VERSION || !REGIONS.includes(value.regionId)) fail();
  if (!value.campaign || !['name', 'setting', 'tone', 'premise', 'seed'].every(k => text(value.campaign[k], 1000))) fail();
  if (!value.player || !finite(value.player.x) || !finite(value.player.y) || value.player.x < .3 || value.player.x > WIDTH - .3 || value.player.y < .3 || value.player.y > HEIGHT - .3) fail();
  if (!integer(value.player.maxHp, 1, 1000) || !integer(value.player.hp, 1, value.player.maxHp) || !integer(value.day, 1, 365000) || !finite(value.minutes) || value.minutes < 0 || value.minutes >= 1440) fail();
  if (!integer(value.revision, 1, Number.MAX_SAFE_INTEGER) || !integer(value.rngState, 1, 4294967295)) fail();
  if (!Array.isArray(value.inventory) || value.inventory.length > 128 || !value.inventory.every(i => text(i, 160)) || new Set(value.inventory).size !== value.inventory.length) fail();
  if (!value.flags || !['before', 'recovering', 'sheltered', 'evacuated'].includes(value.flags.villagePhase)) fail();
  const bools = ['herbsCollected', 'grainMoved', 'sluiceRepaired', 'bookRead', 'scavengerDefeated', 'negotiated', 'visitedUplands', 'stormOccurred', 'floodInvestigated', 'familyHelped', 'spillwayLeft', 'gaugeRead'];
  for (const k of bools) if (value.flags[k] !== undefined && typeof value.flags[k] !== 'boolean') fail();
  for (const k of ['maraTrust', 'halenTrust']) if (!integer(value.flags[k], 0, 1000)) fail();
  if (value.flags.visitedUplands && !integer(value.flags.firstUplandsDay, 1, value.day)) fail();
  if (value.flags.lastVillageDepartureDay !== undefined && (!integer(value.flags.lastVillageDepartureDay, 1, value.day) || !finite(value.flags.lastVillageDepartureMinutes) || value.flags.lastVillageDepartureMinutes < 0 || value.flags.lastVillageDepartureMinutes >= 1440)) fail();
  if (value.flags.stormOccurred && (!value.flags.visitedUplands || !integer(value.flags.stormDay, 1, value.day) || value.flags.villagePhase === 'before')) fail();
  if (!value.flags.stormOccurred && value.flags.villagePhase !== 'before') fail();
  if (!Array.isArray(value.journal) || !Array.isArray(value.history) || value.journal.length > 10000 || value.history.length > 10000) fail();
  const validEntry = e => e && text(e.id, 160) && integer(e.day, 1, value.day) && text(e.title, 300) && text(e.text, 6000);
  if (!value.journal.every(validEntry) || !value.history.every(e => validEntry(e) && finite(e.minutes) && e.minutes >= 0 && e.minutes < 1440 && text(e.type, 100) && Array.isArray(e.causes) && e.causes.every(c => text(c, 160)) && integer(e.revision, 1, value.revision))) fail();
  if (new Set(value.history.map(e => e.id)).size !== value.history.length || new Set(value.journal.map(e => e.id)).size !== value.journal.length) fail();
  if (value.combat !== null && (!value.combat || value.regionId !== 'uplands' || !integer(value.combat.enemyHp, 1, 14) || value.combat.maxHp !== 14 || !integer(value.combat.turn, 0, 10000))) fail();
  const base = createCampaign(value.campaign);
  const state = { ...base, regionId: value.regionId, player: { x: value.player.x, y: value.player.y, hp: value.player.hp, maxHp: value.player.maxHp }, day: value.day, minutes: value.minutes, inventory: [...value.inventory], flags: {}, journal: value.journal.map(e => ({ id: e.id, day: e.day, title: e.title, text: e.text })), history: value.history.map(e => ({ id: e.id, day: e.day, minutes: e.minutes, title: e.title, text: e.text, type: e.type, causes: [...e.causes], revision: e.revision })), revision: value.revision, rngState: value.rngState, combat: value.combat ? { ...value.combat } : null };
  for (const k of [...bools, 'villagePhase', 'maraTrust', 'halenTrust', 'firstUplandsDay', 'stormDay', 'lastVillageDepartureDay', 'lastVillageDepartureMinutes']) if (value.flags[k] !== undefined) state.flags[k] = value.flags[k];
  if (!walkable(state, state.player.x, state.player.y)) fail();
  objective(state);
  return state;
}
