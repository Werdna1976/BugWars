import Phaser from 'phaser';
import { ARENA_H, ARENA_W, BattleScene, PANEL_H } from './scenes/BattleScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2a17',
  width: ARENA_W,
  height: ARENA_H + PANEL_H,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BattleScene],
});
