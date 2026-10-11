import Phaser from 'phaser';
import { ARENA_H, BattleScene, GAME_W, PANEL_H } from './scenes/BattleScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1d2a17',
  width: GAME_W,
  height: ARENA_H + PANEL_H,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BattleScene],
});

// Handy for poking at the running game from the browser console.
(window as unknown as { game: Phaser.Game }).game = game;
