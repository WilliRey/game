/**
 * The player's carried items: weight, stacking, equipment and quick slots. All functions take the
 * GameContext and mutate `state.player`, emitting item events for quests and the UI.
 */
import { BALANCE } from '@/config/balance';
import type { Content } from '@/content';
import type { GameContext } from '@/core/store';
import type { EquipSlot, ItemStack, Uid, WeaponSlot } from '@/core/types';
import { EQUIP_SLOTS, QUICK_SLOT_COUNT } from '@/core/types';
import {
  canMerge,
  cloneStack,
  createStack,
  itemDef,
  listWeight,
  matchesItem,
  weaponStats,
  type StackOptions,
} from './items';

export function inventory(ctx: GameContext): ItemStack[] {
  return ctx.state.player.inventory;
}

export function findStack(ctx: GameContext, uid: Uid | null | undefined): ItemStack | undefined {
  if (!uid) return undefined;
  return ctx.state.player.inventory.find((s) => s.uid === uid);
}

export function carriedWeight(ctx: GameContext): number {
  return listWeight(ctx.content, ctx.state.player.inventory);
}

export function carryCapacity(ctx: GameContext): number {
  const bp = findStack(ctx, ctx.state.player.equipment.backpack);
  const bonus = bp ? (ctx.content.items[bp.itemId]?.backpack?.capacityBonus ?? 0) : 0;
  return BALANCE.carry.base + bonus;
}

export function isEncumbered(ctx: GameContext): boolean {
  return carriedWeight(ctx) > carryCapacity(ctx) + 1e-6;
}

export function countItem(ctx: GameContext, matcher: string): number {
  return countIn(ctx.content, ctx.state.player.inventory, matcher);
}

export function countIn(content: Content, list: readonly ItemStack[], matcher: string): number {
  let n = 0;
  for (const s of list) if (matchesItem(content, s.itemId, matcher)) n += s.qty;
  return n;
}

export function hasTool(
  ctx: GameContext,
  flag: 'lockpick' | 'crowbar' | 'hose' | 'cutter' | 'flashlight',
): boolean {
  return ctx.state.player.inventory.some((s) => {
    const t = ctx.content.items[s.itemId]?.tool;
    return !!t && !!t[flag] && (s.durability === undefined || s.durability > 0);
  });
}

/** A key item that opens `keyId`, or a `key:<id>` flag learned from a note. */
export function hasKey(ctx: GameContext, keyId: string | undefined): boolean {
  if (!keyId) return false;
  if (ctx.state.flags[`key:${keyId}`]) return true;
  return ctx.state.player.inventory.some((s) => ctx.content.items[s.itemId]?.tool?.keyFor?.includes(keyId));
}

// ---------------------------------------------------------------- list helpers (inventory, stash, loot)

/** Put a stack into a list, merging into existing stacks up to the item's stack size. Returns what was added. */
export function mergeInto(ctx: GameContext, list: ItemStack[], stack: ItemStack): ItemStack[] {
  const def = itemDef(ctx.content, stack.itemId);
  const touched: ItemStack[] = [];
  let remaining = stack.qty;
  if (def.stack > 1) {
    for (const s of list) {
      if (remaining <= 0) break;
      if (!canMerge(ctx.content, s, stack) || s.qty >= def.stack) continue;
      const take = Math.min(def.stack - s.qty, remaining);
      s.qty += take;
      remaining -= take;
      touched.push(s);
    }
  }
  let first = true;
  while (remaining > 0) {
    const qty = Math.min(def.stack, remaining);
    const s = first ? stack : cloneStack(ctx.state, stack, qty);
    s.qty = qty;
    first = false;
    list.push(s);
    touched.push(s);
    remaining -= qty;
  }
  return touched;
}

/** Remove up to `qty` of matching items from a list. Returns the removed stacks (split as needed). */
export function takeFromList(
  ctx: GameContext,
  list: ItemStack[],
  matcher: string,
  qty: number,
  protect: Set<Uid> = new Set(),
): ItemStack[] {
  const out: ItemStack[] = [];
  let need = qty;
  // Prefer unprotected (unequipped) and the most worn instances first.
  const candidates = list
    .filter((s) => matchesItem(ctx.content, s.itemId, matcher))
    .sort(
      (a, b) =>
        Number(protect.has(a.uid)) - Number(protect.has(b.uid)) || (a.durability ?? 0) - (b.durability ?? 0),
    );
  for (const s of candidates) {
    if (need <= 0) break;
    const take = Math.min(s.qty, need);
    if (take === s.qty) {
      list.splice(list.indexOf(s), 1);
      out.push(s);
    } else {
      s.qty -= take;
      out.push(cloneStack(ctx.state, s, take));
    }
    need -= take;
  }
  return out;
}

/** Remove a specific stack (or part of it) from a list by uid. */
export function takeStackFromList(
  ctx: GameContext,
  list: ItemStack[],
  uid: Uid,
  qty?: number,
): ItemStack | null {
  const i = list.findIndex((s) => s.uid === uid);
  if (i < 0) return null;
  const s = list[i]!;
  const take = Math.min(qty ?? s.qty, s.qty);
  if (take >= s.qty) {
    list.splice(i, 1);
    return s;
  }
  s.qty -= take;
  return cloneStack(ctx.state, s, take);
}

// ---------------------------------------------------------------- player inventory

/** Add a new item to the player's inventory (merging), auto-equipping into an empty fitting slot. */
export function addItem(
  ctx: GameContext,
  itemId: string,
  qty = 1,
  source = 'other',
  opts: StackOptions = {},
): ItemStack[] {
  if (qty <= 0) return [];
  const stack = createStack(ctx.state, ctx.content, itemId, qty, opts);
  return addStack(ctx, stack, source);
}

/** Move an existing stack instance into the player's inventory. */
export function addStack(ctx: GameContext, stack: ItemStack, source = 'other'): ItemStack[] {
  const qty = stack.qty;
  const touched = mergeInto(ctx, ctx.state.player.inventory, stack);
  for (const s of touched) autoEquip(ctx, s);
  ctx.bus.emit('item:acquired', { itemId: stack.itemId, qty, source });
  return touched;
}

/** Remove `qty` items matching `matcher`. Returns false (and removes nothing) if there aren't enough. */
export function removeItem(ctx: GameContext, matcher: string, qty = 1, reason = 'used'): boolean {
  if (countItem(ctx, matcher) < qty) return false;
  const equipped = new Set(Object.values(ctx.state.player.equipment).filter((u): u is string => !!u));
  const removed = takeFromList(ctx, ctx.state.player.inventory, matcher, qty, equipped);
  for (const s of removed) {
    clearReferences(ctx, s.uid);
    ctx.bus.emit('item:removed', { itemId: s.itemId, qty: s.qty, reason });
  }
  return true;
}

/** Remove a specific stack (or part of it). */
export function removeStack(ctx: GameContext, uid: Uid, qty?: number, reason = 'used'): ItemStack | null {
  const s = takeStackFromList(ctx, ctx.state.player.inventory, uid, qty);
  if (!s) return null;
  if (!findStack(ctx, uid)) clearReferences(ctx, uid);
  ctx.bus.emit('item:removed', { itemId: s.itemId, qty: s.qty, reason });
  return s;
}

function clearReferences(ctx: GameContext, uid: Uid): void {
  const p = ctx.state.player;
  for (const slot of EQUIP_SLOTS) if (p.equipment[slot] === uid) delete p.equipment[slot];
  p.quickSlots = p.quickSlots.map((q) => (q === uid ? null : q));
}

// ---------------------------------------------------------------- equipment

/** The equipment slot an item naturally goes in (firearms prefer an empty firearm slot). */
export function slotFor(ctx: GameContext, s: ItemStack): EquipSlot | null {
  const def = ctx.content.items[s.itemId];
  if (!def) return null;
  if (def.armor) return def.armor.slot;
  if (def.backpack) return 'backpack';
  const w = def.weapon;
  if (!w) return null;
  if (w.kind === 'melee') return 'melee';
  if (w.kind === 'throwable') return 'throwable';
  const eq = ctx.state.player.equipment;
  if (!eq.firearm1 || eq.firearm1 === s.uid) return 'firearm1';
  if (!eq.firearm2 || eq.firearm2 === s.uid) return 'firearm2';
  return 'firearm1';
}

function slotAccepts(ctx: GameContext, slot: EquipSlot, s: ItemStack): boolean {
  const def = ctx.content.items[s.itemId];
  if (!def) return false;
  switch (slot) {
    case 'head':
    case 'torso':
      return def.armor?.slot === slot;
    case 'backpack':
      return !!def.backpack;
    case 'melee':
      return def.weapon?.kind === 'melee';
    case 'throwable':
      return def.weapon?.kind === 'throwable';
    case 'firearm1':
    case 'firearm2':
      return def.weapon?.kind === 'firearm';
  }
}

export function equip(ctx: GameContext, uid: Uid, slot?: EquipSlot): boolean {
  const s = findStack(ctx, uid);
  if (!s) return false;
  const target = slot ?? slotFor(ctx, s);
  if (!target || !slotAccepts(ctx, target, s)) return false;
  const eq = ctx.state.player.equipment;
  for (const sl of EQUIP_SLOTS) if (eq[sl] === uid) delete eq[sl];
  eq[target] = uid;
  ctx.bus.emit('item:equipped', { itemId: s.itemId, slot: target });
  return true;
}

export function unequip(ctx: GameContext, slot: EquipSlot): void {
  delete ctx.state.player.equipment[slot];
  ctx.bus.emit('ui:refresh', {});
}

/** Equip into an empty slot that fits, so picking up a first weapon or backpack just works. */
function autoEquip(ctx: GameContext, s: ItemStack): void {
  const eq = ctx.state.player.equipment;
  if (Object.values(eq).includes(s.uid)) return;
  const slot = slotFor(ctx, s);
  if (slot && !eq[slot]) equip(ctx, s.uid, slot);
}

export function equippedIn(ctx: GameContext, slot: EquipSlot): ItemStack | undefined {
  return findStack(ctx, ctx.state.player.equipment[slot]);
}

export function isEquipped(ctx: GameContext, uid: Uid): boolean {
  return Object.values(ctx.state.player.equipment).includes(uid);
}

/** The weapon in the active slot, or null for fists / empty. */
export function activeWeapon(ctx: GameContext): ItemStack | null {
  return equippedIn(ctx, ctx.state.player.activeSlot) ?? null;
}

export function selectSlot(ctx: GameContext, slot: WeaponSlot): void {
  ctx.state.player.activeSlot = slot;
}

/** Cycle to the next weapon slot that holds something (mouse wheel). Melee is always selectable (fists). */
export function cycleSlot(ctx: GameContext, dir: 1 | -1): void {
  const order: WeaponSlot[] = ['firearm1', 'firearm2', 'melee', 'throwable'];
  let i = order.indexOf(ctx.state.player.activeSlot);
  for (let n = 0; n < order.length; n++) {
    i = (i + dir + order.length) % order.length;
    const slot = order[i]!;
    if (slot === 'melee' || ctx.state.player.equipment[slot]) {
      ctx.state.player.activeSlot = slot;
      return;
    }
  }
}

export function setQuickSlot(ctx: GameContext, index: number, uid: Uid | null): void {
  if (index < 0 || index >= QUICK_SLOT_COUNT) return;
  const q = ctx.state.player.quickSlots;
  if (uid) for (let i = 0; i < q.length; i++) if (q[i] === uid) q[i] = null;
  q[index] = uid;
}

/** Reserve rounds of an ammo type in the inventory (not counting loaded magazines). */
export function ammoReserve(ctx: GameContext, ammoType: string): number {
  let n = 0;
  for (const s of ctx.state.player.inventory)
    if (ctx.content.items[s.itemId]?.ammo?.type === ammoType) n += s.qty;
  return n;
}

export function ammoItemFor(ctx: GameContext, ammoType: string): string | undefined {
  return ctx.content.lists.items.find((i) => i.ammo?.type === ammoType)?.id;
}

/** Describe the active weapon for the HUD. */
export function activeWeaponSummary(ctx: GameContext): {
  name: string;
  ammo?: string;
  condition?: number;
  broken?: boolean;
} {
  const s = activeWeapon(ctx);
  if (!s) return { name: ctx.state.player.activeSlot === 'melee' ? 'Fists' : 'Empty' };
  const def = ctx.content.items[s.itemId]!;
  const st = weaponStats(ctx.content, s);
  const out: { name: string; ammo?: string; condition?: number; broken?: boolean } = { name: def.name };
  if (st?.kind === 'firearm') out.ammo = `${s.mag ?? 0} / ${ammoReserve(ctx, st.ammoType)}`;
  if (st?.kind === 'throwable') out.ammo = `×${s.qty}`;
  if (s.durability !== undefined && s.maxDurability) {
    out.condition = s.durability / s.maxDurability;
    out.broken = s.durability <= 0;
  }
  return out;
}
