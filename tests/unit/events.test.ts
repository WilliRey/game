import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';

describe('EventBus', () => {
  it('delivers typed payloads and unsubscribes', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.on('enemy:killed', fn);
    bus.emit('enemy:killed', { enemyType: 'walker', enemyId: 'z1', zoneId: 'maple_court', sneak: false });
    expect(fn).toHaveBeenCalledWith({
      enemyType: 'walker',
      enemyId: 'z1',
      zoneId: 'maple_court',
      sneak: false,
    });
    off();
    bus.emit('enemy:killed', { enemyType: 'walker', enemyId: 'z2', zoneId: 'maple_court', sneak: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('once fires a single time', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('npc:talked', fn);
    bus.emit('npc:talked', { npcId: 'ruth' });
    bus.emit('npc:talked', { npcId: 'ruth' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handlers may unsubscribe during emit', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const offA = bus.on('flag:set', () => {
      calls.push('a');
      offA();
    });
    bus.on('flag:set', () => calls.push('b'));
    bus.emit('flag:set', { key: 'k', value: true });
    bus.emit('flag:set', { key: 'k', value: true });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
