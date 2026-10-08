/**
 * Saves (brief §5): versioned JSON in localStorage — three manual slots plus an autosave — with a
 * migration hook, and export/import as files.
 *
 * A save is the whole `GameState`. The live zone is stored as a compact snapshot: tiles come back from
 * the zone's layout, the explored bitmap is run-length encoded, and transient things (tracers, noise
 * records, half-finished actions, zombie paths) are dropped. Missing fields in older saves are filled
 * from a fresh state, so adding a field doesn't need a migration; renaming or reshaping one does.
 */
import type { Difficulty } from '@/config/balance';
import type { Content } from '@/content';
import { dayOf, formatClock } from '@/core/time';
import type { GameState } from '@/core/types';
import { decodeRle, encodeRle } from '@/sim/build';
import { getLayout } from '@/sim/layout';
import type { ZoneState } from '@/sim/types';
import { SAVE_VERSION, newGameState } from './session';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: readonly SlotId[] = ['auto', 'slot1', 'slot2', 'slot3'];
export const MANUAL_SLOTS: readonly SlotId[] = ['slot1', 'slot2', 'slot3'];

export interface SaveMeta {
  slot: SlotId;
  version: number;
  /** Real time of the save (epoch ms). */
  savedAt: number;
  day: number;
  clock: string;
  location: string;
  level: number;
  difficulty: Difficulty;
  playSeconds: number;
  quest?: string;
}

export interface SaveFile {
  format: 'holdout-save';
  version: number;
  meta: SaveMeta;
  state: Record<string, unknown>;
}

export class SaveError extends Error {}

// ---------------------------------------------------------------- storage

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): SaveStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function defaultStorage(): SaveStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('holdout.probe', '1');
      localStorage.removeItem('holdout.probe');
      return localStorage;
    }
  } catch {
    /* blocked (private mode, sandboxed iframe): fall back to memory */
  }
  return memoryStorage();
}

let storage: SaveStorage | null = null;
function disk(): SaveStorage {
  return (storage ??= defaultStorage());
}
/** Swap the storage backend (tests use `memoryStorage()`). */
export function setSaveStorage(s: SaveStorage): void {
  storage = s;
}

const fileKey = (slot: SlotId) => `holdout.save.${slot}`;
const metaKey = (slot: SlotId) => `holdout.meta.${slot}`;

// ---------------------------------------------------------------- (de)serialization

type ZoneSnapshot = Omit<ZoneState, 'tiles' | 'explored'> & { explored: string };

function snapshotZone(z: ZoneState): ZoneSnapshot {
  const { tiles: _tiles, explored, ...rest } = z;
  return {
    ...rest,
    explored: encodeRle(explored),
    tracers: [],
    noises: [],
    player: { ...z.player, action: null },
    zombies: z.zombies.map((zb) => ({ ...zb, path: null, pathIndex: 0, repathIn: 0 })),
  };
}

/** Rebuild a live zone from its snapshot, or null if the zone's map no longer matches. */
function restoreZone(content: Content, snap: ZoneSnapshot): ZoneState | null {
  if (!content.zones[snap.zoneId]) return null;
  const layout = getLayout(content, snap.zoneId);
  if (layout.w !== snap.w || layout.h !== snap.h) return null;
  return { ...snap, tiles: [...layout.tiles], explored: decodeRle(snap.explored, snap.w * snap.h) };
}

/** A JSON-ready copy of the state. */
export function serializeState(state: GameState): Record<string, unknown> {
  const out = { ...state, zone: state.zone ? snapshotZone(state.zone) : null };
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Copy keys that exist in `defaults` but not in `target`, recursively through plain objects. */
export function fillDefaults(target: Record<string, unknown>, defaults: Record<string, unknown>): void {
  for (const [k, dv] of Object.entries(defaults)) {
    const tv = target[k];
    if (tv === undefined) target[k] = structuredClone(dv);
    else if (isPlainObject(tv) && isPlainObject(dv)) fillDefaults(tv, dv);
  }
}

/** Turn a parsed, migrated save back into a playable state. */
export function deserializeState(content: Content, raw: Record<string, unknown>): GameState {
  const s = structuredClone(raw);
  if (!isPlainObject(s.player) || !isPlainObject(s.time) || !isPlainObject(s.world))
    throw new SaveError('The save is missing the player, the clock or the world.');
  const difficulty = (['story', 'survivor', 'hardcore'] as const).includes(s.difficulty as Difficulty)
    ? (s.difficulty as Difficulty)
    : 'survivor';
  const zoneSnap = s.zone as ZoneSnapshot | null;
  s.zone = null;
  fillDefaults(
    s,
    newGameState(content, difficulty, String(s.seed ?? 'restored')) as unknown as Record<string, unknown>,
  );
  const state = s as unknown as GameState;
  state.version = SAVE_VERSION;
  state.zone = zoneSnap ? restoreZone(content, zoneSnap) : null;
  return state;
}

// ---------------------------------------------------------------- migrations

export type Migration = (file: SaveFile) => SaveFile;

/**
 * Save migrations, keyed by the version they upgrade *from*. Each returns the file one version newer.
 * Example for a future v2 that renames `reputation` to `campStanding`:
 *   1: (f) => { const { reputation, ...rest } = f.state; return { ...f, version: 2, state: { ...rest, campStanding: reputation } }; }
 */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrate(
  file: SaveFile,
  table: Record<number, Migration> = MIGRATIONS,
  target = SAVE_VERSION,
): SaveFile {
  let f = file;
  if (f.version > target) throw new SaveError('This save was made by a newer version of the game.');
  while (f.version < target) {
    const m = table[f.version];
    if (!m) throw new SaveError(`Saves from version ${f.version} can't be loaded any more.`);
    const next = m(f);
    if (next.version <= f.version)
      throw new SaveError(`Migration from version ${f.version} did not advance.`);
    f = next;
  }
  return f;
}

/** Parse and sanity-check save text (from storage or an imported file). */
export function parseSaveFile(text: string): SaveFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError("That file isn't a HOLDOUT save (not valid JSON).");
  }
  if (!isPlainObject(raw) || raw.format !== 'holdout-save')
    throw new SaveError("That file isn't a HOLDOUT save.");
  if (typeof raw.version !== 'number' || !isPlainObject(raw.state) || !isPlainObject(raw.meta))
    throw new SaveError('The save file is damaged.');
  return raw as unknown as SaveFile;
}

// ---------------------------------------------------------------- slots

export function describeState(content: Content, state: GameState, slot: SlotId, now = Date.now()): SaveMeta {
  const zoneId = state.zone?.zoneId;
  const node = content.worldNodes[state.world.currentNode];
  const tracked = state.trackedQuest ? content.quests[state.trackedQuest]?.name : undefined;
  return {
    slot,
    version: SAVE_VERSION,
    savedAt: now,
    day: dayOf(state.time.minutes),
    clock: formatClock(state.time.minutes),
    location: (zoneId && content.zones[zoneId]?.name) || node?.name || state.world.currentNode,
    level: state.player.level,
    difficulty: state.difficulty,
    playSeconds: Math.round(state.stats.playSeconds),
    quest: tracked,
  };
}

/** Write the state to a slot. Throws if storage is full or unavailable. */
export function writeSave(content: Content, state: GameState, slot: SlotId, now = Date.now()): SaveMeta {
  const meta = describeState(content, state, slot, now);
  const file: SaveFile = {
    format: 'holdout-save',
    version: SAVE_VERSION,
    meta,
    state: serializeState(state),
  };
  disk().setItem(fileKey(slot), JSON.stringify(file));
  disk().setItem(metaKey(slot), JSON.stringify(meta));
  return meta;
}

export function readSaveText(slot: SlotId): string | null {
  return disk().getItem(fileKey(slot));
}

/** Load a slot into a fresh GameState (throws SaveError on a missing, damaged or too-new save). */
export function loadSlot(content: Content, slot: SlotId): GameState {
  const text = readSaveText(slot);
  if (!text) throw new SaveError('That slot is empty.');
  return deserializeState(content, migrate(parseSaveFile(text)).state);
}

export function readMeta(slot: SlotId): SaveMeta | null {
  const m = disk().getItem(metaKey(slot));
  if (m) {
    try {
      return JSON.parse(m) as SaveMeta;
    } catch {
      /* fall through to the file */
    }
  }
  const text = readSaveText(slot);
  if (!text) return null;
  try {
    return { ...parseSaveFile(text).meta, slot };
  } catch {
    return null;
  }
}

export function listSaves(): { slot: SlotId; meta: SaveMeta | null }[] {
  return SLOTS.map((slot) => ({ slot, meta: readMeta(slot) }));
}

export function latestSave(): SaveMeta | null {
  let best: SaveMeta | null = null;
  for (const { meta } of listSaves()) if (meta && (!best || meta.savedAt > best.savedAt)) best = meta;
  return best;
}

export function deleteSave(slot: SlotId): void {
  disk().removeItem(fileKey(slot));
  disk().removeItem(metaKey(slot));
}

/** The save as a downloadable file. */
export function exportSave(slot: SlotId): { filename: string; text: string } | null {
  const text = readSaveText(slot);
  const meta = readMeta(slot);
  if (!text || !meta) return null;
  return { filename: `holdout-${slot}-day${meta.day}.json`, text };
}

/** Validate an imported file fully (it must load) and store it in `slot`. */
export function importSave(content: Content, text: string, slot: SlotId, now = Date.now()): SaveMeta {
  const file = migrate(parseSaveFile(text));
  const state = deserializeState(content, file.state);
  // Keep the original save time so "load latest" after a death still prefers newer saves.
  const savedAt = typeof file.meta.savedAt === 'number' && file.meta.savedAt <= now ? file.meta.savedAt : now;
  return writeSave(content, state, slot, savedAt);
}
