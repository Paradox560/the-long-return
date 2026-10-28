import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, getRegion, movePlayer, nearbyTargets, interact, executeAction, interpretLocalIntent, summarizeForDM, validateSave } from './engine.mjs';

function at(state, regionId, x, y) { state.regionId = regionId; state.player.x = x; state.player.y = y; return state; }
function east(state) { for (let i = 0; i < 500; i++) if (movePlayer(state, 1, 0, .1).changedRegion) return; throw new Error('No east transition'); }
function west(state) { for (let i = 0; i < 500; i++) if (movePlayer(state, -1, 0, .1).changedRegion) return; throw new Error('No west transition'); }
function returnStory({ repair = false, grain = false } = {}) {
  const s = createCampaign({ seed: 'test' }); east(s);
  if (repair) { at(s, 'bellwether', 42, 29); executeAction(s, 'repair_sluice', 'mara'); }
  if (grain) { at(s, 'bellwether', 23, 30); executeAction(s, 'move_grain', 'halen'); }
  at(s, 'bellwether', 60, 24); east(s);
  at(s, 'uplands', 16, 30); for (let i = 0; i < 3; i++) executeAction(s, 'rest', 'uplands-camp');
  at(s, 'uplands', 3, 24); west(s); return s;
}

test('movement is normalized, collides with terrain and transitions through connected road', () => {
  const a = createCampaign(), b = createCampaign();
  movePlayer(a, 1, 0, .1); movePlayer(b, 1, 1, .1);
  assert.ok(Math.abs(Math.hypot(b.player.x - 7, b.player.y - 24) - .3) < 1e-8);
  assert.ok(Math.abs(a.player.x - 7.3) < 1e-8);
  at(a, 'bellwether', 16.5, 15); for (let i = 0; i < 15; i++) movePlayer(a, 1, 0, .1);
  assert.ok(a.player.x < 17, 'solid storehouse blocks entry');
  at(a, 'bellwether', 45, 7); for (let i = 0; i < 40; i++) movePlayer(a, 1, 0, .1);
  assert.ok(a.player.x < 47, 'river blocks movement outside bridge');
  at(a, 'bellwether', 45, 24); east(a); assert.equal(a.regionId, 'uplands');
  assert.ok(a.flags.visitedUplands);
});

test('every region has usable semantic geometry and stable seeded rendering', () => {
  const s = createCampaign({ seed: 'geometry' });
  for (const id of ['reedway', 'bellwether', 'uplands']) {
    s.regionId = id; const region = getRegion(s);
    assert.equal(region.tiles.length, 64 * 48); assert.equal(region.width, 64); assert.equal(region.height, 48);
    assert.equal(new Set(region.objects.map(o => o.id)).size, region.objects.length);
    assert.deepEqual(getRegion(s), region);
    assert.ok(region.objects.every(o => o.x >= 0 && o.y >= 0 && o.x + o.w <= 64 && o.y + o.h <= 48));
  }
});

test('out of range, unsupported and repeated actions cannot mutate resources', () => {
  const s = createCampaign(), old = JSON.stringify(s);
  executeAction(s, 'repair_sluice', 'mara'); executeAction(s, 'give-infinite-money');
  assert.equal(JSON.stringify(s), old);
  at(s, 'reedway', 27, 27); executeAction(s, 'collect_herbs', 'marsh-herbs');
  const once = JSON.stringify(s); executeAction(s, 'collect_herbs', 'marsh-herbs');
  assert.equal(JSON.stringify(s), once); assert.equal(s.inventory.filter(i => i === 'Marsh herbs').length, 1);
});

test('interaction and DM summarization are pure and expose only nearby actions', () => {
  const s = at(createCampaign(), 'bellwether', 42, 29), before = JSON.stringify(s);
  assert.ok(interact(s, 'mara').choices.some(c => c.id === 'repair_sluice'));
  const context = summarizeForDM(s);
  assert.ok(context.availableActions.some(a => a.id === 'repair_sluice' && a.targetId === 'mara'));
  assert.ok(!context.availableActions.some(a => a.id === 'rest'));
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(interpretLocalIntent(s, 'Please help clear the spillway'), { actionId: 'repair_sluice', targetId: 'mara' });
});

test('a causal revisit has distinct stable outcomes and preserves anchors and rewards', () => {
  for (const [choices, phase] of [[{ repair: true, grain: true }, 'recovering'], [{ grain: true }, 'sheltered'], [{}, 'evacuated']]) {
    const s = returnStory(choices);
    assert.equal(s.flags.villagePhase, phase); assert.equal(s.history.filter(e => e.id === 'storm').length, 1);
    assert.equal(getRegion(s).objects.find(o => o.id === 'bell-tower').x, 30);
    assert.ok(getRegion(s).npcs.some(n => n.id === 'mara')); assert.ok(getRegion(s).npcs.some(n => n.id === 'elin'));
    assert.equal(s.flags.grainMoved === true, choices.grain === true);
    at(s, 'bellwether', 60, 24); east(s); at(s, 'uplands', 3, 24); west(s);
    assert.equal(s.history.filter(e => e.id === 'storm').length, 1);
    at(s, 'bellwether', 27, 23); executeAction(s, 'investigate_flood', 'flood-notice');
    assert.ok(s.flags.floodInvestigated);
    at(s, 'bellwether', 34, 20); executeAction(s, 'help_refugees', 'elin');
    assert.ok(s.flags.familyHelped);
  }
});

test('short visits do not reroll the village and storms require the elapsed nights', () => {
  const s = createCampaign(); east(s); at(s, 'bellwether', 60, 24); east(s);
  at(s, 'uplands', 3, 24); west(s);
  assert.equal(s.flags.villagePhase, 'before'); assert.ok(!s.flags.stormOccurred);
});

test('a later unchanged visit prevents retroactively dating a storm before its causes', () => {
  const s = createCampaign(); east(s); at(s, 'bellwether', 60, 24); east(s);
  at(s, 'uplands', 3, 24); west(s);
  at(s, 'bellwether', 9, 30); for (let i = 0; i < 3; i++) executeAction(s, 'rest', 'bellwether-camp');
  assert.equal(s.day, 4); assert.ok(!s.flags.stormOccurred);
  at(s, 'bellwether', 42, 29); executeAction(s, 'repair_sluice', 'mara');
  const repair = s.history.find(e => e.id === 'repair-sluice');
  at(s, 'bellwether', 60, 24); east(s); at(s, 'uplands', 3, 24); west(s);
  const storm = s.history.find(e => e.id === 'storm');
  const absolute = e => (e.day - 1) * 1440 + e.minutes;
  assert.ok(absolute(storm) > absolute(repair), 'a repair cannot cause an earlier storm outcome');
  assert.equal(storm.day, 4); assert.equal(s.flags.villagePhase, 'recovering');
  assert.deepEqual(validateSave(JSON.stringify(s)), s);
  const committedStorm = JSON.stringify(storm);
  at(s, 'bellwether', 60, 24); east(s); at(s, 'uplands', 3, 24); west(s);
  assert.equal(JSON.stringify(s.history.find(e => e.id === 'storm')), committedStorm, 'later visits never rewrite the committed event');
});

test('combat is deterministic, bounded, avoidable and always escapable', () => {
  const a = at(createCampaign({ seed: 'combat' }), 'uplands', 29, 24), b = structuredClone(a);
  assert.deepEqual(executeAction(a, 'attack', 'scavenger'), executeAction(b, 'attack', 'scavenger'));
  assert.ok(a.combat); const position = { x: a.player.x, y: a.player.y };
  movePlayer(a, 1, 0, .5); assert.equal(a.player.x, position.x);
  executeAction(a, 'flee', 'scavenger'); assert.equal(a.combat, null); assert.equal(a.player.x, 24);
  const peaceful = at(createCampaign(), 'uplands', 29, 24); executeAction(peaceful, 'negotiate', 'scavenger');
  assert.equal(peaceful.combat, null); assert.ok(peaceful.flags.negotiated); assert.ok(peaceful.inventory.includes('Rook’s station sketch'));
});

test('save roundtrip retains causal state and malformed saves fail without mutation', () => {
  const s = returnStory({ repair: true, grain: true });
  assert.deepEqual(validateSave(JSON.stringify(s)), s);
  for (const mutate of [v => { v.player.x = NaN; }, v => { v.flags.villagePhase = 'invented'; }, v => { v.inventory.push(v.inventory[0]); }, v => { v.history.push(v.history[0]); }, v => { v.version = 99; }]) {
    const broken = structuredClone(s); mutate(broken); assert.throws(() => validateSave(broken));
  }
  assert.throws(() => validateSave('{not json'));
});
