# Bug War

A Clash Royale-style lane battler set in a backyard garden. Player vs. AI in the browser.

Play: https://werdna1976.github.io/BugWars/

## How to play

An 8-second countdown starts each match so you can read your cards. The left panel shows the card you hover or hold; the right panel lists the AI's deck (hover a row for details). Click anywhere to start the music; the button at bottom left turns it off.

Your Nectar refills over time. Tap a card, then tap your half of the field to drop it there, or drag the card onto the field. Hover a card (or tap it) to see what the bug does. Ground bugs walk around the puddles through the two dry crossings; flyers go straight over. Knock down the enemy Nest to win, or take more towers than the AI in 3 minutes. Nectar refills twice as fast in the last minute. A tie goes to one minute of sudden-death overtime, then to whoever's weakest tower has more health.

Both sides use fixed 10-card decks (`src/data/decks.ts`). A deck may contain up to three cards twice, so at least seven different bugs.

## Run locally

```
npm install
npm run dev
```

Then open the URL Vite prints. `npm test` runs the simulation tests. `npx vite-node scripts/simulate.ts 50` plays 50 AI-vs-AI matches and prints win rates. `npx vite-node scripts/benchmark.ts` drops each bug alone against an undefended Outpost and prints how much damage it gets in.

## Layout

- `src/sim/` game rules: a fixed 20-tick-per-second simulation with no rendering code, so it can later drive a headless AI-vs-AI balance simulator.
- `src/data/` tower and unit stats. Balance changes go here, not in code.
- `src/scenes/` Phaser rendering and input.
