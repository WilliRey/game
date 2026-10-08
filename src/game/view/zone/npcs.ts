/**
 * Survivors at the camp: the same rig as Sam with their own jacket colours, breathing, glancing around and
 * turning to face you when you come close. Hidden when out of sight, like everything that moves.
 */
import { Group, MeshLambertMaterial } from 'three';
import type { Content } from '@/content';
import { isVisible } from '@/sim/fov';
import type { ZoneRuntime } from '@/sim/runtime';
import type { NpcEntity, ZoneState } from '@/sim/types';
import { bodyParts } from '../../art/models';
import { patchWorld } from '../worldMaterial';
import { Rig, turnToward } from './rig';

interface NpcView {
  rig: Rig;
  yaw: number;
  phase: number;
}

export class NpcLayer {
  readonly group = new Group();
  private views = new Map<string, NpcView>();
  private mat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  private t = 0;
  showAll = false;

  constructor(private content: Content) {
    this.group.name = 'npcs';
  }

  private make(n: NpcEntity): NpcView {
    const def = this.content.npcs[n.npcId];
    const color = def?.color ?? '#9bbcd1';
    const parts = bodyParts('survivor', {
      skin: n.npcId === 'doc_ama' || n.npcId === 'ruth' ? '#7a5a42' : '#a98466',
      top: color,
      topDark: color,
      legs: '#2e3238',
      shoes: '#211c18',
      hair: n.npcId === 'gus' ? '#8a8a84' : '#2a221c',
    });
    const rig = new Rig('survivor', parts, this.mat);
    // Jackets read a bit darker than the name-tag colour.
    this.group.add(rig.root);
    return { rig, yaw: -n.facing, phase: Math.random() * 6 };
  }

  update(zone: ZoneState, rt: ZoneRuntime, dt: number): void {
    this.t += dt;
    const p = zone.player;
    const seen = new Set<string>();
    for (const n of zone.npcs) {
      seen.add(n.id);
      let v = this.views.get(n.id);
      if (!v) {
        v = this.make(n);
        this.views.set(n.id, v);
      }
      const r = v.rig;
      r.root.visible = this.showAll || isVisible(rt, n.x, n.y);
      if (!r.root.visible) continue;
      r.neutral();
      const near = Math.hypot(p.x - n.x, p.y - n.y) < 4;
      const want = near
        ? -Math.atan2(p.y - n.y, p.x - n.x)
        : -n.facing + Math.sin(this.t * 0.3 + v.phase) * 0.4;
      v.yaw = turnToward(v.yaw, want, dt * 4);
      r.root.position.set(n.x, 0, n.y);
      r.root.rotation.y = v.yaw;
      const breathe = Math.sin(this.t * 1.6 + v.phase);
      r.torso.scale.set(1, 1 + breathe * 0.012, 1 + breathe * 0.02);
      r.armL.rotation.z = 0.12 + breathe * 0.03;
      r.armR.rotation.z = 0.12 - breathe * 0.03;
      r.armL.rotation.x = 0.08;
      r.armR.rotation.x = -0.08;
      r.head.rotation.y = Math.sin(this.t * 0.5 + v.phase * 2) * 0.35;
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.group.remove(v.rig.root);
      this.views.delete(id);
    }
  }

  dispose(): void {
    this.mat.dispose();
  }
}
