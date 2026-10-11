import Phaser from 'phaser';
import { CardDef, KEYWORDS, Keyword, RANGE_LABEL, SPEED_LABEL } from '../data/cards';

export const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

export function kwColor(kw: Keyword): number {
  switch (kw) {
    case 'Tank': return 0xc9a46a;
    case 'Swarm': return 0xe08a5a;
    case 'Flying': return 0x8ec5ea;
    case 'Ranged': return 0xb7d98a;
    case 'Melee': return 0xd8cfb8;
    case 'Buildings only': return 0xe3b04b;
    case 'Air first': return 0x9fd6f0;
    case 'Ambush': return 0xd9a0e0;
    default: return 0xcfd8c0;
  }
}

const TARGETS_LABEL = { ground: 'Ground bugs', air: 'Flyers', both: 'Ground and air', buildings: 'Towers only' } as const;

// Large card readout for the side panels: icon, name, keyword chips, a stat
// table, and plain-language notes. Returns the content height.
export function drawCardDetails(
  scene: Phaser.Scene,
  into: Phaser.GameObjects.Container,
  card: CardDef,
  width: number,
): number {
  into.removeAll(true);
  const u = card.unit;
  const add = <T extends Phaser.GameObjects.GameObject>(o: T) => {
    into.add(o);
    return o;
  };
  let y = 0;

  const tex = scene.textures.get(u.id).getSourceImage();
  add(scene.add.rectangle(0, y, 92, 92, 0x3a5230).setOrigin(0, 0).setStrokeStyle(2, 0x1d2a17));
  add(scene.add.image(46, y + 46, u.id).setScale(Math.min(2.2, 84 / Math.max(tex.width, tex.height))).setRotation(-Math.PI / 2));
  const name = add(scene.add.text(106, y + 2, card.name, {
    fontFamily: FONT, fontSize: '24px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: width - 106 },
  }));
  add(scene.add.text(106, y + name.height + 8, `${card.cost} Nectar`, {
    fontFamily: FONT, fontSize: '18px', color: '#ffe9a8', fontStyle: 'bold',
  }));
  y += 104;

  // Keyword chips, wrapping across lines.
  let cx = 0;
  for (const kw of card.keywords) {
    const label = scene.add.text(0, 0, kw, { fontFamily: FONT, fontSize: '15px', color: '#1d2a17', fontStyle: 'bold' });
    const cw = label.width + 16;
    if (cx + cw > width) {
      cx = 0;
      y += 30;
    }
    add(scene.add.rectangle(cx, y, cw, 26, kwColor(kw)).setOrigin(0, 0));
    add(label.setPosition(cx + 8, y + 4));
    cx += cw + 6;
  }
  y += 40;

  const dps = Math.round(u.damage / u.hitSpeed);
  const rows: [string, string][] = [
    ['Health', card.count > 1 ? `${u.hp} each × ${card.count}` : String(u.hp)],
    ['Damage', u.firstStrikeMult ? `${u.damage} (first hit ${u.damage * u.firstStrikeMult})` : String(u.damage)],
    ['Hits every', `${u.hitSpeed}s`],
    ['Damage/sec', card.count > 1 ? `${dps} each, ${dps * card.count} total` : String(dps)],
    ['Range', RANGE_LABEL(u.range) + (u.range > 1 ? ` (${u.range} tiles)` : '')],
    ['Speed', SPEED_LABEL(u.speed)],
    ['Attacks', TARGETS_LABEL[u.targets]],
  ];
  for (const [label, value] of rows) {
    add(scene.add.text(0, y, label, { fontFamily: FONT, fontSize: '16px', color: '#9fb08a' }));
    add(scene.add.text(118, y, value, {
      fontFamily: FONT, fontSize: '17px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: width - 118 },
    }));
    y += 26;
  }
  y += 10;

  const blurb = add(scene.add.text(0, y, card.blurb, {
    fontFamily: FONT, fontSize: '16px', color: '#f4ecd8', wordWrap: { width },
  }));
  y += blurb.height + 12;

  for (const kw of card.keywords) {
    const line = add(scene.add.text(0, y, `${kw}: ${KEYWORDS[kw]}`, {
      fontFamily: FONT, fontSize: '14px', color: '#d8d0bc', wordWrap: { width },
    }));
    y += line.height + 5;
  }
  if (card.comingLater) {
    y += 6;
    const later = add(scene.add.text(0, y, `Coming later: ${card.comingLater}`, {
      fontFamily: FONT, fontSize: '14px', color: '#9fb08a', fontStyle: 'italic', wordWrap: { width },
    }));
    y += later.height;
  }
  return y;
}
