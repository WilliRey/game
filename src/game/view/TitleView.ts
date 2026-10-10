/**
 * Behind the main menu: a dark street of Harrow City at night in the rain. Silhouetted blocks with a few
 * lit windows, a flickering streetlamp, wet asphalt and a slow drift of the camera.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Scene,
} from 'three';
import { texture } from '../art/assets';
import { TEXTURES } from '../art/manifest';
import { skylineWindows, softDot } from '../art/textures';
import { VIEW_H, VIEW_W } from '../constants';

const DROPS = 900;

export class TitleView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(42, VIEW_W / VIEW_H, 0.5, 200);
  private rain: LineSegments;
  private rainPos: Float32Array;
  private lamp: PointLight;
  private glow: Mesh;
  private t = 0;
  private disposables: { dispose(): void }[] = [];

  constructor() {
    this.scene.background = new Color('#07080b');
    this.scene.fog = new FogExp2('#07080b', 0.028);
    this.scene.add(new HemisphereLight('#2a3348', '#0a0908', 0.9));

    const ground = new Mesh(new PlaneGeometry(200, 200), new MeshLambertMaterial({ color: '#16171a' }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.disposables.push(ground.geometry, ground.material as MeshLambertMaterial);

    // Blocks: three rows receding into the fog.
    const win = texture(TEXTURES.skyline, skylineWindows, true).clone();
    win.wrapS = win.wrapT = RepeatWrapping;
    win.repeat.set(2, 3);
    win.needsUpdate = true;
    const mat = new MeshLambertMaterial({
      color: '#15171c',
      emissive: '#ffcc88',
      emissiveMap: win,
      emissiveIntensity: 0.9,
    });
    const geo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const n = 60;
    const blocks = new InstancedMesh(geo, mat, n);
    const o = new Object3D();
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const row = i % 3;
      o.position.set(-60 + (i / n) * 120 + rnd() * 3, 0, -18 - row * 14 - rnd() * 6);
      o.scale.set(5 + rnd() * 7, 8 + rnd() * (row === 0 ? 14 : 30), 6 + rnd() * 4);
      o.updateMatrix();
      blocks.setMatrixAt(i, o.matrix);
    }
    this.scene.add(blocks);
    this.disposables.push(geo, mat, win);

    // A streetlamp in the foreground.
    const postMat = new MeshLambertMaterial({ color: '#202326' });
    const post = new Mesh(new BoxGeometry(0.25, 7, 0.25).translate(0, 3.5, 0), postMat);
    post.position.set(9, 0, -6);
    this.scene.add(post);
    this.lamp = new PointLight(0xffb060, 30, 26, 1.6);
    this.lamp.position.set(8.2, 6.6, -6);
    this.scene.add(this.lamp);
    this.glow = new Mesh(
      new PlaneGeometry(3, 3),
      new MeshBasicMaterial({
        map: texture(TEXTURES.dot, softDot, false),
        color: 0xffb060,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glow.position.copy(this.lamp.position);
    this.scene.add(this.glow);
    this.disposables.push(
      post.geometry,
      postMat,
      this.glow.geometry,
      this.glow.material as MeshBasicMaterial,
    );

    // Rain.
    this.rainPos = new Float32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) this.resetDrop(i, true);
    const rg = new BufferGeometry();
    rg.setAttribute('position', new BufferAttribute(this.rainPos, 3));
    this.rain = new LineSegments(
      rg,
      new LineBasicMaterial({ color: '#7d8a9a', transparent: true, opacity: 0.35 }),
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.disposables.push(rg, this.rain.material as LineBasicMaterial);

    this.camera.position.set(0, 3.2, 14);
    this.camera.lookAt(0, 6, -20);
  }

  private resetDrop(i: number, anywhere: boolean): void {
    const x = -30 + Math.random() * 60;
    const z = -25 + Math.random() * 38;
    const y = anywhere ? Math.random() * 22 : 22;
    const o = i * 6;
    this.rainPos[o] = x;
    this.rainPos[o + 1] = y;
    this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x - 0.06;
    this.rainPos[o + 4] = y + 0.55;
    this.rainPos[o + 5] = z;
  }

  update(dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.t += dt;
    this.camera.position.x = Math.sin(this.t * 0.03) * 6;
    this.camera.lookAt(this.camera.position.x * 0.4, 6, -20);
    const flick = Math.random() < 0.03 ? 0.15 : 1;
    this.lamp.intensity = 30 * flick;
    (this.glow.material as MeshBasicMaterial).opacity = 0.8 * flick;
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      const v = 24 * dt;
      this.rainPos[o + 1]! -= v;
      this.rainPos[o + 4]! -= v;
      this.rainPos[o]! -= v * 0.1;
      this.rainPos[o + 3]! -= v * 0.1;
      if (this.rainPos[o + 1]! < 0) this.resetDrop(i, false);
    }
    this.rain.geometry.attributes.position!.needsUpdate = true;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
