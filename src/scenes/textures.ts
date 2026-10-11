import Phaser from 'phaser';

// Procedural placeholder art, drawn once into textures at boot.
// Bugs face right (angle 0) so sprites can rotate toward their heading.

export const TILE = 32;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function legs(g: Phaser.GameObjects.Graphics, cx: number, cy: number, spread: number, reach: number, color: number) {
  g.lineStyle(2, color, 1);
  for (const dx of [-spread, 0, spread]) {
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + dx, cy);
      g.lineTo(cx + dx + s * 2 - dx * 0.2, cy + s * reach * 0.6);
      g.lineTo(cx + dx + s * 1 - dx * 0.4, cy + s * reach);
      g.strokePath();
    }
  }
}

function antennae(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, color: number) {
  g.lineStyle(1.5, color, 1);
  g.beginPath().moveTo(x, y - 2).lineTo(x + len * 0.6, y - len * 0.5).lineTo(x + len, y - len * 0.6).strokePath();
  g.beginPath().moveTo(x, y + 2).lineTo(x + len * 0.6, y + len * 0.5).lineTo(x + len, y + len * 0.6).strokePath();
}

// Eight jointed legs radiating from a spider's body.
function spiderLegs(g: Phaser.GameObjects.Graphics, cx: number, cy: number, reach: number, color: number) {
  g.lineStyle(2.2, color, 1);
  const angles = [-2.4, -1.9, -1.3, -0.7];
  for (const s of [-1, 1]) {
    for (const a of angles) {
      const ang = s * -a;
      const kx = cx + Math.cos(ang) * reach * 0.6;
      const ky = cy + Math.sin(ang) * reach * 0.75;
      const fx = kx + Math.cos(ang + s * 0.5) * reach * 0.5;
      const fy = ky + Math.sin(ang + s * 0.5) * reach * 0.4;
      g.beginPath().moveTo(cx, cy).lineTo(kx, ky).lineTo(fx, fy).strokePath();
    }
  }
}

function shine(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
  g.fillStyle(0xffffff, 0.35).fillEllipse(x, y, w, h);
}

export function bakeTextures(scene: Phaser.Scene) {
  // Beetle: glossy shell split down the middle, stubby head and horn.
  bake(scene, 'beetle', 40, 40, (g) => {
    legs(g, 18, 20, 6, 15, 0x2b1d14);
    g.fillStyle(0x3a2a1c, 1).fillEllipse(31, 20, 10, 11); // head
    g.lineStyle(2, 0x2b1d14, 1).lineBetween(34, 20, 39, 17); // horn
    g.fillStyle(0x5b3b1f, 1).fillEllipse(17, 20, 26, 22); // shell
    g.fillStyle(0x7a5230, 1).fillEllipse(15, 15, 18, 8);
    g.fillStyle(0x7a5230, 1).fillEllipse(15, 25, 18, 8);
    g.lineStyle(1.5, 0x2b1d14, 1).lineBetween(5, 20, 28, 20);
    g.fillStyle(0xffffff, 0.35).fillEllipse(12, 13, 8, 3); // shine
  });

  // Wasp: striped abdomen, narrow waist, translucent wings.
  bake(scene, 'wasp', 40, 40, (g) => {
    legs(g, 20, 20, 4, 10, 0x1a1a1a);
    g.fillStyle(0xd8eefc, 0.55).fillEllipse(18, 9, 16, 10).fillEllipse(18, 31, 16, 10); // wings
    g.lineStyle(1, 0x9fbfd6, 0.8).strokeEllipse(18, 9, 16, 10).strokeEllipse(18, 31, 16, 10);
    g.fillStyle(0xf2c12e, 1).fillEllipse(10, 20, 18, 12); // abdomen
    g.fillStyle(0x1a1a1a, 1).fillRect(6, 15, 3, 10).fillRect(12, 15, 3, 10);
    g.fillStyle(0x1a1a1a, 1).fillTriangle(0, 20, 3, 18, 3, 22); // stinger
    g.fillStyle(0xf2c12e, 1).fillEllipse(23, 20, 9, 8); // thorax
    g.fillStyle(0x1a1a1a, 1).fillEllipse(30, 20, 8, 8); // head
    g.fillStyle(0x7a2e1a, 1).fillCircle(31, 17.5, 1.8).fillCircle(31, 22.5, 1.8); // eyes
  });

  // Nest: domed beehive skep seen from slightly above.
  bake(scene, 'nest', 4 * TILE, 4 * TILE, (g) => {
    const c = 2 * TILE;
    g.fillStyle(0x000000, 0.25).fillEllipse(c + 4, c + 8, 118, 110);
    const bands = [0xc8862a, 0xd99a3a, 0xc8862a, 0xe3ac4a, 0xd99a3a, 0xeebd5c];
    bands.forEach((col, i) => {
      const w = 116 - i * 17;
      const h = 108 - i * 16;
      g.fillStyle(col, 1).fillEllipse(c, c + 4 - i * 3, w, h);
      g.lineStyle(1.5, 0x8a5a1c, 0.8).strokeEllipse(c, c + 4 - i * 3, w, h);
    });
    g.fillStyle(0x3b2410, 1).fillEllipse(c, c + 40, 22, 12); // entrance
  });

  // Outpost: terracotta flowerpot with a sprout, seen from above.
  bake(scene, 'outpost', 3 * TILE, 3 * TILE, (g) => {
    const c = 1.5 * TILE;
    g.fillStyle(0x000000, 0.25).fillCircle(c + 3, c + 5, 44);
    g.fillStyle(0xb5562f, 1).fillCircle(c, c, 44); // rim
    g.fillStyle(0xd06a3c, 1).fillCircle(c, c, 39);
    g.fillStyle(0x4a3020, 1).fillCircle(c, c, 33); // soil
    g.fillStyle(0x5c3d28, 1).fillCircle(c - 8, c - 6, 10).fillCircle(c + 10, c + 8, 8);
    g.fillStyle(0x4f9a3a, 1).fillEllipse(c - 10, c - 4, 26, 12).fillEllipse(c + 10, c - 4, 26, 12); // leaves
    g.fillStyle(0x6fbf4f, 1).fillEllipse(c, c - 12, 12, 22);
    g.fillStyle(0xffffff, 0.25).fillEllipse(c - 26, c - 24, 16, 6); // rim glint
  });

  bake(scene, 'rubble', 3 * TILE, 3 * TILE, (g) => {
    const c = 1.5 * TILE;
    g.fillStyle(0x6b4a33, 1).fillCircle(c, c, 30);
    g.fillStyle(0xb5562f, 1).fillTriangle(c - 30, c - 4, c - 12, c - 20, c - 6, c + 2);
    g.fillStyle(0xd06a3c, 1).fillTriangle(c + 8, c + 14, c + 30, c + 6, c + 20, c + 26);
    g.fillStyle(0x8a5a1c, 1).fillTriangle(c - 4, c + 24, c + 6, c + 10, c - 18, c + 16);
  });

  bake(scene, 'seed', 10, 10, (g) => {
    g.fillStyle(0x3b2a14, 1).fillEllipse(5, 5, 9, 6);
    g.fillStyle(0xf3e3b0, 0.8).fillEllipse(4, 4, 4, 2);
  });

  bake(scene, 'puff', 16, 16, (g) => {
    g.fillStyle(0xe8dcc0, 1).fillCircle(8, 8, 8);
  });

  bake(scene, 'pillbug', 48, 48, (g) => {
    legs(g, 22, 24, 7, 14, 0x3a3a40);
    antennae(g, 37, 24, 9, 0x3a3a40);
    g.fillStyle(0x6d7078, 1).fillEllipse(22, 24, 32, 26);
    g.lineStyle(1.5, 0x44464d, 1);
    for (let i = 0; i < 6; i++) g.lineBetween(10 + i * 5, 13, 10 + i * 5, 35);
    g.fillStyle(0x55575e, 1).fillEllipse(37, 24, 8, 14);
    shine(g, 18, 16, 16, 4);
  });

  bake(scene, 'rhino', 56, 56, (g) => {
    legs(g, 24, 28, 8, 19, 0x1e140d);
    g.fillStyle(0x4a2414, 1).fillEllipse(22, 28, 32, 30); // wing cases
    g.lineStyle(1.5, 0x24120a, 1).lineBetween(7, 28, 37, 28);
    g.fillStyle(0x5e3018, 1).fillEllipse(38, 28, 16, 22); // thorax
    g.fillStyle(0x24120a, 1).fillTriangle(42, 25, 42, 31, 55, 22); // horn
    g.fillStyle(0x24120a, 1).fillTriangle(50, 23, 53, 21, 55, 14);
    shine(g, 18, 19, 16, 5);
    shine(g, 38, 22, 6, 3);
  });

  bake(scene, 'goliath', 72, 72, (g) => {
    legs(g, 32, 36, 11, 26, 0x111111);
    antennae(g, 60, 36, 8, 0x111111);
    g.fillStyle(0x6b4a2e, 1).fillEllipse(28, 36, 44, 42); // elytra
    g.fillStyle(0xd9d2c2, 1).fillEllipse(28, 28, 30, 8).fillEllipse(28, 44, 30, 8);
    g.lineStyle(2, 0x1a1a1a, 1).lineBetween(7, 36, 49, 36);
    g.fillStyle(0x1a1a1a, 1).fillEllipse(52, 36, 22, 30); // pronotum
    g.fillStyle(0xeeeeee, 1).fillRect(46, 28, 12, 3).fillRect(46, 34.5, 12, 3).fillRect(46, 41, 12, 3);
    g.fillStyle(0x1a1a1a, 1).fillEllipse(63, 36, 8, 12);
    shine(g, 22, 24, 20, 5);
  });

  bake(scene, 'fireant', 28, 28, (g) => {
    legs(g, 14, 14, 3, 9, 0x5a0f05);
    antennae(g, 22, 14, 6, 0x5a0f05);
    g.fillStyle(0xb7260f, 1).fillEllipse(7, 14, 11, 9); // gaster
    g.fillStyle(0xd23a1a, 1).fillEllipse(14, 14, 7, 5);
    g.fillStyle(0xb7260f, 1).fillEllipse(20, 14, 7, 7); // head
    shine(g, 6, 11, 5, 2);
  });

  bake(scene, 'mantis', 64, 64, (g) => {
    g.lineStyle(2, 0x3d7a28, 1);
    for (const s of [-1, 1]) {
      g.beginPath().moveTo(28, 32).lineTo(24, 32 + s * 14).lineTo(14, 32 + s * 20).strokePath();
      g.beginPath().moveTo(22, 32).lineTo(14, 32 + s * 12).lineTo(4, 32 + s * 14).strokePath();
      // folded raptorial forelegs
      g.lineStyle(3, 0x5aa83a, 1);
      g.beginPath().moveTo(42, 32 + s * 2).lineTo(50, 32 + s * 8).lineTo(56, 32 + s * 4).strokePath();
      g.lineStyle(2, 0x3d7a28, 1);
    }
    g.fillStyle(0x5aa83a, 1).fillEllipse(16, 32, 26, 13); // abdomen
    g.fillStyle(0x4c962f, 1).fillRect(28, 30, 18, 4); // long thorax
    g.fillStyle(0x6cc048, 1).fillTriangle(46, 25, 46, 39, 57, 32); // head
    g.fillStyle(0x2a4a14, 1).fillCircle(48, 27, 2.5).fillCircle(48, 37, 2.5);
    g.lineStyle(1, 0x3d7a28, 0.8).lineBetween(6, 32, 28, 32);
  });

  bake(scene, 'spitter', 48, 48, (g) => {
    spiderLegs(g, 26, 24, 20, 0x5c4126);
    g.fillStyle(0xb48a5a, 1).fillEllipse(16, 24, 22, 20); // abdomen
    g.fillStyle(0x5c4126, 1).fillCircle(11, 20, 2.5).fillCircle(17, 28, 2.5).fillCircle(20, 19, 2).fillCircle(11, 28, 2);
    g.fillStyle(0x9a7046, 1).fillEllipse(31, 24, 14, 14); // head
    g.fillStyle(0x111111, 1).fillCircle(36, 22, 1.5).fillCircle(36, 26, 1.5);
  });

  bake(scene, 'assassin', 56, 56, (g) => {
    g.lineStyle(1.5, 0x1a1a1a, 1);
    for (const dx of [-8, 0, 8]) {
      for (const s of [-1, 1]) {
        g.beginPath().moveTo(26 + dx, 28).lineTo(24 + dx, 28 + s * 13).lineTo(18 + dx, 28 + s * 20).strokePath();
      }
    }
    antennae(g, 44, 28, 10, 0x1a1a1a);
    g.fillStyle(0xd96a1c, 1).fillEllipse(20, 28, 28, 16); // abdomen
    g.fillStyle(0x1a1a1a, 1).fillEllipse(20, 28, 20, 9);
    g.fillStyle(0xd96a1c, 1).fillEllipse(34, 28, 10, 12); // thorax
    g.fillStyle(0x1a1a1a, 1).fillEllipse(42, 28, 10, 6); // head
    g.lineStyle(2, 0x1a1a1a, 1).lineBetween(46, 28, 55, 28); // beak
  });

  bake(scene, 'hornet', 52, 52, (g) => {
    legs(g, 26, 26, 5, 12, 0x2a1a0a);
    g.fillStyle(0xe6d2b8, 0.55).fillEllipse(24, 12, 20, 12).fillEllipse(24, 40, 20, 12);
    g.lineStyle(1, 0xa89680, 0.8).strokeEllipse(24, 12, 20, 12).strokeEllipse(24, 40, 20, 12);
    g.fillStyle(0xe8a417, 1).fillEllipse(13, 26, 22, 16); // abdomen
    g.fillStyle(0x3a2410, 1).fillRect(8, 19, 3, 14).fillRect(15, 19, 3, 14);
    g.fillStyle(0x3a2410, 1).fillTriangle(0, 26, 4, 23, 4, 29);
    g.fillStyle(0x7a3a14, 1).fillEllipse(29, 26, 12, 12); // thorax
    g.fillStyle(0xe8a417, 1).fillEllipse(38, 26, 11, 12); // head
    g.fillStyle(0x3a2410, 1).fillCircle(40, 22, 2.2).fillCircle(40, 30, 2.2);
  });

  bake(scene, 'dragonfly', 64, 64, (g) => {
    g.fillStyle(0xd8f0ff, 0.5);
    g.fillEllipse(40, 18, 10, 30).fillEllipse(40, 46, 10, 30).fillEllipse(32, 18, 9, 28).fillEllipse(32, 46, 9, 28);
    g.lineStyle(1, 0x8fb8d0, 0.8);
    g.strokeEllipse(40, 18, 10, 30).strokeEllipse(40, 46, 10, 30).strokeEllipse(32, 18, 9, 28).strokeEllipse(32, 46, 9, 28);
    g.fillStyle(0x1f7fbf, 1).fillRect(4, 30, 30, 4); // abdomen
    g.fillStyle(0x0f4f7f, 1);
    for (let x = 8; x < 34; x += 6) g.fillRect(x, 30, 1.5, 4);
    g.fillStyle(0x2a9fd6, 1).fillEllipse(38, 32, 12, 9); // thorax
    g.fillStyle(0x2a9fd6, 1).fillCircle(47, 32, 5);
    g.fillStyle(0x0b2f4a, 1).fillCircle(49, 28.5, 3).fillCircle(49, 35.5, 3);
  });

  bake(scene, 'termite', 30, 30, (g) => {
    legs(g, 14, 15, 3, 9, 0x8a7a5a);
    g.fillStyle(0xf0e6c8, 1).fillEllipse(10, 15, 14, 10);
    g.fillStyle(0xe2d4ad, 1).fillEllipse(17, 15, 6, 6);
    g.fillStyle(0xa0582a, 1).fillEllipse(23, 15, 8, 8); // head
    g.lineStyle(1.5, 0x3a1f0a, 1).lineBetween(26, 13, 29, 12).lineBetween(26, 17, 29, 18); // mandibles
  });

  bake(scene, 'bolas', 52, 52, (g) => {
    spiderLegs(g, 28, 26, 18, 0x6a4a2a);
    g.fillStyle(0xe8d6a0, 1).fillEllipse(17, 26, 26, 26); // fat abdomen
    g.fillStyle(0x8a5a2a, 1).fillEllipse(17, 26, 12, 16);
    g.fillStyle(0xe8d6a0, 1).fillEllipse(17, 26, 5, 8);
    g.fillStyle(0x7a5530, 1).fillEllipse(33, 26, 13, 13);
    g.lineStyle(1, 0xf4f4f4, 0.9).lineBetween(38, 26, 47, 14); // silk line
    g.fillStyle(0xfff6c0, 0.95).fillCircle(48, 12, 3.5); // sticky bola
  });

  bake(scene, 'spit', 10, 10, (g) => {
    g.fillStyle(0xe8f0d0, 1).fillCircle(5, 5, 4);
    g.fillStyle(0xffffff, 0.8).fillCircle(4, 4, 1.5);
  });

  // Dung beetle pushing its ball (ball sits in front, at the right).
  bake(scene, 'dung', 64, 56, (g) => {
    legs(g, 22, 28, 7, 17, 0x111111);
    g.fillStyle(0x1c1c22, 1).fillEllipse(20, 28, 28, 26);
    g.fillStyle(0x2c2c36, 1).fillEllipse(18, 22, 18, 8).fillEllipse(18, 34, 18, 8);
    g.lineStyle(1.5, 0x0a0a0a, 1).lineBetween(6, 28, 33, 28);
    g.fillStyle(0x111111, 1).fillEllipse(35, 28, 10, 14); // head
    g.fillStyle(0x6b4a2a, 1).fillCircle(51, 28, 12); // dung ball
    g.fillStyle(0x7d5934, 1).fillCircle(48, 24, 5).fillCircle(54, 32, 4);
    g.fillStyle(0x553a20, 1).fillCircle(53, 23, 2.5).fillCircle(46, 33, 2);
    shine(g, 15, 20, 12, 4);
  });

  bake(scene, 'bombardier', 52, 52, (g) => {
    legs(g, 24, 26, 6, 15, 0x1a1a1a);
    antennae(g, 39, 26, 9, 0x1a1a1a);
    g.fillStyle(0x1f2b4a, 1).fillEllipse(20, 26, 26, 22); // dark blue wing cases
    g.fillStyle(0xe8a33a, 1).fillEllipse(14, 21, 8, 5).fillEllipse(14, 31, 8, 5).fillEllipse(24, 26, 5, 9);
    g.lineStyle(1.5, 0x0f1526, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xd9762a, 1).fillEllipse(35, 26, 12, 13); // orange thorax and head
    g.fillStyle(0xe8873a, 1).fillCircle(42, 26, 5);
    g.fillStyle(0xfff0a0, 0.9).fillCircle(5, 26, 3); // hot spray nozzle
    shine(g, 17, 19, 12, 4);
  });

  bake(scene, 'spray', 14, 14, (g) => {
    g.fillStyle(0xff8a1f, 0.9).fillCircle(7, 7, 6);
    g.fillStyle(0xfff0a0, 1).fillCircle(6, 6, 3);
  });

  bake(scene, 'blast', 64, 64, (g) => {
    g.fillStyle(0xff7a1a, 0.55).fillCircle(32, 32, 32);
    g.fillStyle(0xffb347, 0.75).fillCircle(32, 32, 22);
    g.fillStyle(0xfff3b0, 0.95).fillCircle(32, 32, 11);
  });
}
