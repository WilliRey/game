import type { ScreenId } from './store';
import type { ItemStack } from './types';

/** Every event that crosses a system boundary. Payload types are the contract. */
export interface GameEvents {
  // zone / world
  'zone:entered': { zoneId: string };
  'zone:exited': { zoneId: string };
  'zone:reached': { zoneId: string; areaId: string };
  'world:nodeUnlocked': { nodeId: string };
  'travel:started': { from: string; to: string; mode: 'foot' | 'vehicle' };
  'travel:event': { eventId: string };
  'travel:arrived': { nodeId: string; mode: 'foot' | 'vehicle' };
  'save:written': { slot: string; auto: boolean };
  // combat
  'enemy:killed': { enemyType: string; enemyId: string; zoneId: string; sneak: boolean; weaponId?: string };
  'enemy:damaged': { enemyId: string; amount: number; x: number; y: number; crit: boolean };
  'player:damaged': { amount: number; source: string };
  'player:died': { cause: string };
  'weapon:fired': { itemId: string; x: number; y: number };
  'weapon:broken': { itemId: string };
  /** The class ability (Q) was used. */
  'ability:used': { classId: string; kind: string };
  'noise:emitted': { x: number; y: number; radius: number; source: string; byPlayer: boolean };
  // items
  'item:acquired': { itemId: string; qty: number; source: string };
  'item:removed': { itemId: string; qty: number; reason: string };
  'item:used': { itemId: string };
  'item:crafted': { itemId: string; qty: number; recipeId: string };
  'item:equipped': { itemId: string; slot: string };
  'container:searched': { containerId: string; zoneId: string; containerType: string };
  'lock:opened': { targetId: string; method: 'lockpick' | 'crowbar' | 'key' };
  'note:read': { noteId: string };
  'blueprint:learned': { recipeId: string };
  // interaction
  interact: { targetId: string; kind: string; zoneId: string };
  'door:changed': { doorId: string; open: boolean; broken: boolean };
  // npc / quest / story
  'npc:talked': { npcId: string };
  'dialogue:node': { npcId: string; nodeId: string };
  'quest:started': { questId: string };
  'quest:advanced': { questId: string; stage: number };
  'quest:completed': { questId: string; outcome: string };
  'quest:failed': { questId: string };
  'objective:progress': { questId: string; objectiveId: string; current: number; target: number };
  'flag:set': { key: string; value: boolean | number | string };
  'reputation:changed': { delta: number; total: number };
  'xp:gained': { amount: number; total: number; source: string };
  'level:up': { level: number };
  'radio:broadcast': { broadcastId: string };
  'trade:completed': { traderId: string; given: ItemStack[]; taken: ItemStack[] };
  // survival
  'effect:added': { effect: string };
  'effect:removed': { effect: string };
  'need:low': { need: 'hunger' | 'thirst' };
  'time:hour': { hour: number; day: number };
  'time:night': { night: boolean };
  'player:slept': { hours: number };
  // save
  'save:loaded': { slot: string };
  // hints / UI
  'hint:show': { hintId: string };
  'ui:toast': { text: string; kind?: 'info' | 'warn' | 'good' };
  'ui:textCard': { title: string; body: string; durationMs?: number };
  'ui:refresh': Record<string, never>;
  'ui:open': { screen: ScreenId; props?: Record<string, unknown> };
  'base:changed': Record<string, never>;
  'sim:spawn': { enemyType: string; count: number; near?: string };
  'session:started': { loaded: boolean };
  'session:ended': Record<string, never>;
  'session:reset': Record<string, never>;
  'zone:loaded': { zoneId: string };
  'travel:zone': { zoneId: string; entry?: string };
  'base:collectWater': Record<string, never>;
  'ui:loadLatest': Record<string, never>;
  // fx consumed by the Phaser scene
  'fx:shake': { intensity: number; durationMs: number };
  'fx:damageNumber': { x: number; y: number; amount: number; crit: boolean };
  /** A flashbang went off: a blinding burst of light at (x, y). */
  'fx:flashbang': { x: number; y: number; radius: number };
  'fx:hitstop': { ms: number };
  'fx:pan': { objectId?: string; x?: number; y?: number; seconds: number; caption?: string };
  'fx:muzzle': { x: number; y: number; angle: number; small: boolean };
  'fx:spark': { x: number; y: number };
  /** A melee swing connected: impact sparks/blood, camera nudge along `angle` (player → target). */
  'fx:meleeHit': { x: number; y: number; angle: number; heavy: boolean; count: number };
  /** A melee swing started (the renderer animates wind-up → follow-through over `windup + recovery`). */
  'fx:swing': { angle: number; windup: number; recovery: number; heavy: boolean };
  'fx:explosion': { x: number; y: number; radius: number };
  'sfx:play': { key: string; x?: number; y?: number; volume?: number };
}

export type EventName = keyof GameEvents;
export type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();
  private anyHandlers = new Set<(name: EventName, payload: unknown) => void>();
  /** Recent events ring buffer for the debug overlay. */
  readonly log: { name: EventName; payload: unknown; t: number }[] = [];

  on<K extends EventName>(name: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as Handler<EventName>);
    return () => this.off(name, handler);
  }

  once<K extends EventName>(name: K, handler: Handler<K>): () => void {
    const off = this.on(name, (p) => {
      off();
      handler(p);
    });
    return off;
  }

  off<K extends EventName>(name: K, handler: Handler<K>): void {
    this.handlers.get(name)?.delete(handler as Handler<EventName>);
  }

  onAny(handler: (name: EventName, payload: unknown) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    if (this.log.length > 200) this.log.shift();
    this.log.push({ name, payload, t: Date.now() });
    const set = this.handlers.get(name);
    if (set) for (const h of [...set]) h(payload);
    for (const h of [...this.anyHandlers]) h(name, payload);
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}
