import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/read.js';
import type { Counts } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

// `counts` is null when the night can't be read (missing): the board shows `—`.
export type NightLine = { night: string; counts: Counts | null };

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightLine[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readStatus(config: RigConfig): Promise<Status> {
  const nights = await Promise.all(
    nightsOnDisk(config.runsDir).map(async (night): Promise<NightLine> => {
      const result = await readNight(config.runsDir, night);
      return { night, counts: result.kind === 'night' ? result.counts : null };
    }),
  );
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
  };
}
