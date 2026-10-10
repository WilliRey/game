/**
 * Asset overrides (DESIGN decision 64): a character model override supplies rig parts by node name, in
 * each node's own space, with material colours baked into vertex colours; missing parts fall back to the
 * procedural placeholder.
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { overridePart, setOverrideModel } from '@/game/art/assets';
import { characterParts, type BodyColors } from '@/game/art/models';

const COLORS: BodyColors = {
  skin: '#a98466',
  top: '#3b4a5c',
  topDark: '#2c3846',
  legs: '#2e3238',
  shoes: '#211c18',
  hair: '#2a221c',
};

function model(): Group {
  const root = new Group();
  const torso = new Group();
  torso.name = 'torso';
  torso.position.set(0, 1, 0);
  const box = new Mesh(new BoxGeometry(0.4, 0.6, 0.3), new MeshStandardMaterial({ color: '#ff0000' }));
  box.position.set(0, 0.3, 0);
  torso.add(box);
  root.add(torso);
  return root;
}

describe('asset overrides', () => {
  it('extracts a rig part in the node’s space with baked colours', () => {
    setOverrideModel('test.body.a', model());
    const g = overridePart('test.body.a', 'torso');
    expect(g).toBeDefined();
    g!.computeBoundingBox();
    // The box sits 0.3 above the torso node's origin, regardless of where the node is in the model.
    expect(g!.boundingBox!.min.y).toBeCloseTo(0, 5);
    expect(g!.boundingBox!.max.y).toBeCloseTo(0.6, 5);
    const col = g!.getAttribute('color');
    expect(col.itemSize).toBe(3);
    expect(col.getX(0)).toBeCloseTo(1, 3);
    expect(col.getY(0)).toBeCloseTo(0, 3);
  });

  it('falls back to the procedural parts for parts the model lacks', () => {
    setOverrideModel('test.body.b', model());
    const parts = characterParts('test.body.b', 'survivor', COLORS);
    const placeholder = characterParts('test.body.none', 'survivor', COLORS);
    expect(parts.torso.getAttribute('position').count).toBe(36);
    expect(parts.head.getAttribute('position').count).toBe(placeholder.head.getAttribute('position').count);
    expect(overridePart('test.body.b', 'armL')).toBeUndefined();
  });
});

describe('geometry overrides', () => {
  it('any geometry key can be replaced by a loaded model', async () => {
    const { geometry } = await import('@/game/art/assets');
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#00ff00' })));
    setOverrideModel('test.weapon', root);
    const g = geometry('test.weapon', () => new BoxGeometry(5, 5, 5));
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(0.5, 5);
    expect(g.getAttribute('color').getY(0)).toBeCloseTo(1, 3);
  });
});
