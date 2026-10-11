import { COLS, CROSSINGS, PUDDLE_ROWS, ROWS } from './constants';

export interface Tile {
  col: number;
  row: number;
}

// Garden bed after rain: a band of puddles across the middle that ground units
// can't wade through, with a wider pool in the center.
export function buildPuddleMap(): boolean[][] {
  const wet: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const inCrossing = (col: number) => CROSSINGS.some((c) => col >= c.fromCol && col <= c.toCol);

  for (const row of PUDDLE_ROWS) {
    for (let col = 0; col < COLS; col++) {
      if (!inCrossing(col)) wet[row][col] = true;
    }
  }
  // The center pool bulges one row into each half.
  for (let col = 7; col <= 10; col++) {
    wet[14][col] = true;
    wet[17][col] = true;
  }
  return wet;
}

export class Arena {
  readonly wet = buildPuddleMap();
  // Tiles covered by a standing tower. Cleared when the tower falls.
  readonly occupied: (number | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
  }

  isWet(col: number, row: number): boolean {
    return this.inBounds(col, row) && this.wet[row][col];
  }

  walkable(col: number, row: number, allowOccupant: number | null = null): boolean {
    if (!this.inBounds(col, row) || this.wet[row][col]) return false;
    const occ = this.occupied[row][col];
    return occ === null || occ === allowOccupant;
  }

  setFootprint(id: number, col: number, row: number, size: number, present: boolean) {
    for (let r = row; r < row + size; r++) {
      for (let c = col; c < col + size; c++) {
        this.occupied[r][c] = present ? id : null;
      }
    }
  }

  // A* over the tile grid with 8-way moves (no cutting corners past blocked tiles).
  // `goalOccupant` lets the path end inside the target tower's footprint.
  findPath(from: Tile, to: Tile, goalOccupant: number | null = null): Tile[] | null {
    const start = this.nearestWalkable(from, goalOccupant);
    if (!start) return null;
    const key = (c: number, r: number) => r * COLS + c;
    const goalKey = key(to.col, to.row);

    const g = new Map<number, number>([[key(start.col, start.row), 0]]);
    const came = new Map<number, number>();
    const open: { k: number; f: number }[] = [{ k: key(start.col, start.row), f: 0 }];
    const closed = new Set<number>();
    const h = (c: number, r: number) => {
      const dx = Math.abs(c - to.col);
      const dy = Math.abs(r - to.row);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };

    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
      const { k } = open.splice(best, 1)[0];
      if (closed.has(k)) continue;
      closed.add(k);
      const c = k % COLS;
      const r = Math.floor(k / COLS);
      if (k === goalKey) {
        const path: Tile[] = [];
        let cur: number | undefined = k;
        while (cur !== undefined) {
          path.push({ col: cur % COLS, row: Math.floor(cur / COLS) });
          cur = came.get(cur);
        }
        return path.reverse();
      }
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.walkable(nc, nr, goalOccupant)) continue;
          if (dc && dr && (!this.walkable(c + dc, r, goalOccupant) || !this.walkable(c, r + dr, goalOccupant))) continue;
          const nk = key(nc, nr);
          if (closed.has(nk)) continue;
          const ng = g.get(k)! + (dc && dr ? Math.SQRT2 : 1);
          if (ng < (g.get(nk) ?? Infinity)) {
            g.set(nk, ng);
            came.set(nk, k);
            open.push({ k: nk, f: ng + h(nc, nr) });
          }
        }
      }
    }
    return null;
  }

  private nearestWalkable(t: Tile, allow: number | null): Tile | null {
    for (let radius = 0; radius < 4; radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (this.walkable(t.col + dc, t.row + dr, allow)) return { col: t.col + dc, row: t.row + dr };
        }
      }
    }
    return null;
  }
}
