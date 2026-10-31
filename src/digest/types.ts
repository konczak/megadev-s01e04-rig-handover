// Contract for the morning digest (plan.md § 1). Types only: the reader lives in
// src/digest/read.ts (#2); the page (#3), JSON (#4), board link (#5) and tests (#6)
// build against these names.

/** Status of one run-log line. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** `:night` in routes and `runs/<night>.jsonl` on disk: YYYY-MM-DD. */
export const NIGHT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One row per job for a night, built from the valid lines of `runs/<night>.jsonl`.
 * A valid line is a JSON object with string `at`, string `job`, `status` in
 * RunStatus, `owner` string or null, and optional string `error`. Anything else
 * is a bad line: counted in `NightResult.badLines`, never part of a row.
 *
 * Times are the log's `at` strings verbatim (ISO 8601 with offset, e.g.
 * "2026-10-29T01:30:00+01:00"). Never converted to UTC.
 */
export type DigestRow = {
  /** The `job` field, e.g. "lane/sync". Unique within a night. */
  job: string;
  /** `owner` of the job's last valid line. `null` is kept; views show it as `—`. */
  owner: string | null;
  /** Number of valid lines for this job (every status counts). Always >= 1. */
  runs: number;
  /** Number of valid lines for this job with status `retry`. */
  retries: number;
  /** `status` of the job's last valid line (file order). */
  lastStatus: RunStatus;
  /**
   * `error` of the most recent valid line for this job that carried one, or
   * `null` if no line for this job had an error. It can be set while
   * `lastStatus` is `ok` (e.g. retried, then succeeded).
   */
  lastError: string | null;
  /** `at` of the job's first valid line (file order), verbatim. */
  firstAt: string;
  /** `at` of the job's last valid line (file order), verbatim. */
  lastAt: string;
};

/**
 * Lines per status for a night: each valid line counts once under its own
 * status. Bad lines are not counted here (see `badLines`). Used by the board
 * link (§ 2c). Rows alone can't give it (they keep only the last status), so
 * the reader returns it. Invariant: ok + retry + fail === sum of rows' `runs`;
 * retry === sum of rows' `retries`.
 */
export type Counts = Record<RunStatus, number>;

/**
 * Result of reading one night.
 * - `missing`: no `runs/<night>.jsonl` file. Routes return 404.
 * - `night`: the file exists. An empty file (or one with only bad lines) is a
 *   `night` with `rows: []`; the page renders "nothing ran".
 */
export type NightResult =
  | { kind: 'missing'; night: string }
  | {
      kind: 'night';
      /** The night as asked, YYYY-MM-DD. */
      night: string;
      /** One row per job, sorted by `job` ascending (plain string compare). */
      rows: DigestRow[];
      /** Lines per status over all valid lines of the night. */
      counts: Counts;
      /** Non-blank lines that did not parse or failed validation. Blank lines are ignored. */
      badLines: number;
    };

/**
 * Reads `<runsDir>/<night>.jsonl`. Never throws for bad lines; a missing file is
 * `{ kind: 'missing' }`. Callers validate `night` with NIGHT_PATTERN first
 * (an invalid night may be treated as missing).
 */
export type ReadNight = (runsDir: string, night: string) => Promise<NightResult>;
