/**
 * Save/load round-trip (brief §8 unit tests): everything the brief lists survives a save — the player and
 * inventory, time, zone states (containers, doors, dropped items, cleared nests, zombies mid-visit),
 * quests and flags, traders, the base, the vehicle and the RNG — and the loaded game keeps running.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '@/core/rng';
import { emptyInput } from '@/sim/player';
import { getLayout } from '@/sim/layout';
import { stepZone } from '@/sim/step';
import { dropItem } from '@/systems/inventory';
import { createStack } from '@/systems/items';
import { passTime } from '@/systems/clock';
import { saveBlocker, saveGame } from '@/systems/persistence';
import {
  SaveError,
  deleteSave,
  deserializeState,
  exportSave,
  importSave,
  latestSave,
  loadSlot,
  memoryStorage,
  migrate,
  parseSaveFile,
  readMeta,
  serializeState,
  setSaveStorage,
  writeSave,
  type SaveFile,
} from '@/systems/save';
import { restockIfDue } from '@/systems/trade';
import { enterZone } from '@/systems/zones';
import { addZombie, content, makeCtx } from './helpers';

beforeEach(() => setSaveStorage(memoryStorage()));

function playedGame() {
  const { store, ctx } = makeCtx({ setup: true, seed: 'save-test' });
  const s = ctx.state;
  // Some history: another zone visited and remembered, items, time, quests, traders, base, vehicle.
  enterZone(ctx, 'firehouse9');
  restockIfDue(ctx, 'gus', true);
  s.traders.gus!.credit = 7;
  s.reputation = 37;
  s.base.workbenchTier = 2;
  s.base.stash.push(createStack(s, ctx.content, 'scrap_metal', 3));
  s.vehicle.owned = true;
  s.vehicle.fuel = 23.5;
  s.flags.test_flag = 'yes';
  enterZone(ctx, 'maple_court');
  passTime(ctx, 95);
  const zone = s.zone!;
  // Mid-visit changes: a door opened, a container searched, an item dropped, a zombie hurt, player moved.
  const door = Object.values(zone.doors)[0]!;
  door.open = !door.open;
  const cont = Object.values(zone.containers)[0]!;
  cont.searched = true;
  cont.rolled = true;
  cont.items = [createStack(s, ctx.content, 'bandage', 2)];
  const bottle = s.player.inventory.find((x) => x.itemId === 'glass_bottle')!;
  dropItem(ctx, bottle.uid, 1);
  const z = addZombie(ctx, zone, 'walker', zone.player.x + 8, zone.player.y);
  z.hp = 9;
  zone.player.x += 0.75;
  zone.player.facing = 1.2;
  zone.explored.fill(1, 0, 200);
  return { store, ctx };
}

describe('save round-trip', () => {
  it('restores the full state, including the zone mid-visit', () => {
    const { ctx } = playedGame();
    const before = serializeState(ctx.state);
    writeSave(ctx.content, ctx.state, 'slot1', 1000);
    const loaded = loadSlot(ctx.content, 'slot1');
    expect(serializeState(loaded)).toEqual(before);

    const layout = getLayout(ctx.content, 'maple_court');
    expect(loaded.zone!.tiles).toEqual(layout.tiles);
    expect(loaded.zone!.explored).toEqual(ctx.state.zone!.explored);
    expect(loaded.player.inventory).toEqual(ctx.state.player.inventory);
    expect(loaded.time).toEqual(ctx.state.time);
    expect(loaded.traders.gus).toEqual(ctx.state.traders.gus);
    expect(loaded.base).toEqual(ctx.state.base);
    expect(loaded.vehicle).toEqual({ owned: true, fuel: 23.5, maxFuel: ctx.state.vehicle.maxFuel });
    expect(loaded.zones.firehouse9).toEqual(ctx.state.zones.firehouse9);
    expect(loaded.zone!.zombies.find((z) => z.hp === 9)).toBeDefined();
    expect(loaded.zone!.items.some((i) => i.stack.itemId === 'glass_bottle')).toBe(true);
  });

  it('continues the same random stream after loading', () => {
    const { ctx } = playedGame();
    writeSave(ctx.content, ctx.state, 'slot2');
    const loaded = loadSlot(ctx.content, 'slot2');
    const a = [ctx.rng.next(), ctx.rng.next(), ctx.rng.next()];
    const r = new Rng(loaded.rng);
    expect([r.next(), r.next(), r.next()]).toEqual(a);
  });

  it('a loaded game keeps simulating', () => {
    const { store, ctx } = playedGame();
    writeSave(ctx.content, ctx.state, 'slot1');
    store.setState(loadSlot(ctx.content, 'slot1'));
    for (let i = 0; i < 30; i++) stepZone(store.ctx, emptyInput(), 1 / 60);
    expect(store.state.zone!.time).toBeGreaterThan(0.4);
  });

  it('fills fields missing from older saves with defaults', () => {
    const { ctx } = playedGame();
    const raw = serializeState(ctx.state);
    delete raw.broadcastsHeard;
    delete (raw.base as Record<string, unknown>).rainCollector;
    const s = deserializeState(ctx.content, raw);
    expect(s.broadcastsHeard).toEqual([]);
    expect(s.base.rainCollector).toEqual({ built: false, stored: 0, lastTickMinutes: 0 });
    expect(s.base.workbenchTier).toBe(2);
  });
});

describe('migrations and files', () => {
  const file = (version: number, state: Record<string, unknown> = {}): SaveFile => ({
    format: 'holdout-save',
    version,
    meta: {} as SaveFile['meta'],
    state,
  });

  it('runs migrations in order up to the current version', () => {
    const table = {
      0: (f: SaveFile) => ({ ...f, version: 1, state: { ...f.state, renamed: f.state.old, old: undefined } }),
      1: (f: SaveFile) => ({ ...f, version: 2, state: { ...f.state, added: true } }),
    };
    const out = migrate(file(0, { old: 5 }), table, 2);
    expect(out.version).toBe(2);
    expect(out.state).toMatchObject({ renamed: 5, added: true });
  });

  it('rejects saves from newer versions and gaps in the migration table', () => {
    expect(() => migrate(file(99))).toThrow(SaveError);
    expect(() => migrate(file(0), {}, 1)).toThrow(SaveError);
  });

  it('rejects files that are not saves', () => {
    expect(() => parseSaveFile('not json')).toThrow(SaveError);
    expect(() => parseSaveFile('{"hello":1}')).toThrow(SaveError);
  });

  it('exports and imports a save file', () => {
    const { ctx } = playedGame();
    writeSave(ctx.content, ctx.state, 'slot1', 5000);
    const exported = exportSave('slot1')!;
    expect(exported.filename).toMatch(/^holdout-slot1-day\d+\.json$/);
    deleteSave('slot1');
    expect(readMeta('slot1')).toBeNull();
    const meta = importSave(content(), exported.text, 'slot3', 9000);
    expect(meta.slot).toBe('slot3');
    expect(meta.savedAt).toBe(5000);
    expect(serializeState(loadSlot(ctx.content, 'slot3'))).toEqual(serializeState(ctx.state));
  });

  it('picks the most recent save for "load last save"', () => {
    const { ctx } = playedGame();
    writeSave(ctx.content, ctx.state, 'slot2', 100);
    writeSave(ctx.content, ctx.state, 'auto', 300);
    writeSave(ctx.content, ctx.state, 'slot1', 200);
    expect(latestSave()?.slot).toBe('auto');
  });
});

describe('when saving is allowed', () => {
  it('blocks saving while hunted or travelling, allows it otherwise', () => {
    const { store, ctx } = makeCtx({ setup: true });
    expect(saveBlocker(ctx)).toBeNull();
    const zone = ctx.state.zone!;
    const z = addZombie(ctx, zone, 'walker', zone.player.x + 3, zone.player.y);
    z.mode = 'chase';
    expect(saveBlocker(ctx)).toMatch(/hunting/);
    expect(saveGame(store, 'slot1')).toBe(false);
    z.mode = 'idle';
    expect(saveGame(store, 'slot1')).toBe(true);
    ctx.state.travel = { from: 'a', to: 'b', mode: 'foot', km: 1, minutes: 1, fuel: 0 };
    expect(saveBlocker(ctx)).toMatch(/travelling/);
  });
});
