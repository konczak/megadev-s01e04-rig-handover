# Handover

Each issue adds its own section: what was done, files, how to check, what the next part must know.

## #1 Digest types contract (src/digest/types.ts)

**What was done:** the contract for the morning digest (plan.md § 1). Types only, no reader.

**Files:** `src/digest/types.ts` (new), `HANDOVER.md` (new).

**How to check:** `pnpm typecheck` passes. Nothing imports the file yet.

**What the next parts must know.** Exports from `src/digest/types.ts`:

- `RunStatus = 'ok' | 'retry' | 'fail'`.
- `NIGHT_PATTERN = /^\d{4}-\d{2}-\d{2}$/`: validate `:night` with it before reading.
- `DigestRow`: `{ job, owner, runs, retries, lastStatus, lastError, firstAt, lastAt }`.
  - `owner: string | null`: owner of the job's last valid line. Views show `null` as `—`.
  - `runs`: number of valid lines for the job (every status counts, >= 1).
  - `retries`: number of valid lines for the job with status `retry`.
  - `lastStatus`: status of the job's last valid line (file order).
  - `lastError: string | null`: error of the most recent line for the job that had one,
    `null` if none had one. It can be set while `lastStatus` is `ok`.
  - `firstAt` / `lastAt`: `at` of the first / last valid line (file order), verbatim ISO
    string with its offset. Never converted to UTC.
- `Counts = Record<RunStatus, number>`: lines per status over the night's valid lines.
  `ok + retry + fail` equals the sum of `runs`; bad lines are not in it.
- `NightResult`:
  - `{ kind: 'missing', night }`: no file for the night. Routes return 404.
  - `{ kind: 'night', night, rows, counts, badLines }`: the file exists. `rows` sorted by
    `job` ascending (the reader sorts). An empty file is `rows: []` ("nothing ran").
    `badLines` = non-blank lines that don't parse or fail validation; blank lines are ignored.
- `ReadNight = (runsDir: string, night: string) => Promise<NightResult>`.

Per part:

- **#2 reader:** implement `export const readNight: ReadNight` in `src/digest/read.ts`. Never
  throw on a bad line. Fixture: `runs/2026-10-28.jsonl` has 5 jobs, 1 bad line (the last line is
  truncated). `digest/render` has `owner: null`.
- **#3 page / #4 JSON:** call `readNight(config.runsDir, night)`; 404 on `missing` or on a night
  that fails `NIGHT_PATTERN`. JSON = the `night` result as is, so page and JSON can't disagree.
- **#5 board:** use `counts` for the ok / retry / fail numbers beside each night.
- **#6 tests:** use a temp runs dir, never `runs/`.

## #2 Run log reader

**What was done:** `export const readNight: ReadNight` (plan.md § 1), per the #1 contract.
Lines are split on `\r?\n` (CRLF and a trailing newline are fine; a leading BOM is dropped).
Blank / whitespace-only lines are ignored. Every other line is `JSON.parse`d and validated
(object; string `at`, string `job`, `status` in `ok | retry | fail`, `owner` present and string or
`null`, `error` absent or string); anything else increments `badLines`, never throws. Rows are
sorted by `job` with a plain `<` compare. Times are copied verbatim.

**Files:** `src/digest/read.ts` (new), `test/digest-read.test.ts` (new), `HANDOVER.md`.

**How to check:** `pnpm typecheck` and `pnpm test` (7 tests in 2 files). The fixture test reads
`runs/2026-10-28.jsonl` (5 jobs, 1 bad line, `digest/render` owner `null`, `notes/backup` last
status `fail`, `fixtures/refresh` 3 retries). Synthetic cases use a temp dir from `os.tmpdir()`.

**What the next parts must know.**

- Import `readNight` from `src/digest/read.ts` (`'./digest/read.js'` from `src/app.tsx`).
- A `night` that fails `NIGHT_PATTERN` returns `{ kind: 'missing', night }` without building a
  path or touching the disk, so a route can 404 on `missing` alone. Validating first is still fine.
- `missing` means "no file" only (ENOENT / ENOTDIR). Other I/O errors (e.g. permissions) reject
  the promise; let Hono turn them into a 500.
- On `runs/2026-10-28.jsonl`: `lane/sync` ends `ok` with `lastError: 'lock held'`, and
  `fixtures/refresh` ends `ok` with `lastError: 'upstream 503'` (runs 4, retries 3).
- The result is plain JSON-safe data: #4 can `c.json(result)` as is.
