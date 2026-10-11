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
}
