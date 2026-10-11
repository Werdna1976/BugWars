# Bug War

A Clash Royale-style lane battler set in a backyard garden. Player vs. AI in the browser.

Play: https://werdna1976.github.io/BugWars/

## Run locally

```
npm install
npm run dev
```

Then open the URL Vite prints. `npm test` runs the simulation tests.

## Layout

- `src/sim/` game rules: a fixed 20-tick-per-second simulation with no rendering code, so it can later drive a headless AI-vs-AI balance simulator.
- `src/data/` tower and unit stats. Balance changes go here, not in code.
- `src/scenes/` Phaser rendering and input.
