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

## #3 Digest page GET /digest/:night

**What was done:** `GET /digest/:night` renders one night as a table (job, owner, runs, retries, last status, last error, first, last), rows in the order `readNight` returns (sorted by job). 404 when `:night` fails `NIGHT_PATTERN` or the result is `missing`. Empty night renders "nothing ran". `badLines > 0` shows "N line(s) could not be read". `null` owner / lastError render as `—`. Times verbatim. No client JS.

**Marking:** rows with `retries >= 3` or `lastStatus === 'fail'` get class `flag` (warn colour, bold) plus a visible `! ` before the job; `retries >= 3` also appends ` (many)` to the retries cell.

**Files:** `src/views/digest.tsx` (new), `src/app.tsx` (route + imports), `src/views/layout.tsx` (`tr.flag` style), `HANDOVER.md`.

**How to check:** `pnpm typecheck`, `pnpm test`; with #2 merged, `pnpm dev` and open `/digest/2026-10-28` (5 jobs, `digest/render` owner `—`, "1 line could not be read"). `/digest/nope` and a night without a file give 404.

**What the next parts must know:**
- `src/digest/read.ts` was NOT in this branch (a local stub was used and not committed); the route imports `readNight` from `./digest/read.js`, so it needs #2 merged to build.
- #6 tests: look for text `nothing ran`, `could not be read`, `—`, and `class="flag"` on flagged rows.
- The view is `DigestPage` in `src/views/digest.tsx`, props `{ night, rows, badLines }`.
## #4 Digest JSON GET /api/digest/:night

**What was done:** `GET /api/digest/:night` in `src/app.tsx`. It calls `readNight(config.runsDir, night)` and returns the `night` result as is: `{kind, night, rows, counts, badLines}`. Same rows, same order as the page, so they can't disagree. A night that fails `NIGHT_PATTERN` or reads as `missing` gives 404 with `{ "error": "no such night", "night": "<night>" }`.

**Files:** `src/app.tsx`, `HANDOVER.md`.

**How to check:** `pnpm typecheck` and `pnpm test`. With the app running, `curl localhost:8787/api/digest/2026-10-28` lists the same jobs, in the same order, as the page; `/api/digest/2026-01-01` and `/api/digest/nope` return 404. Depends on `readNight` from #2 (`src/digest/read.ts`); it was typechecked against a local stub that is not committed.

**What the next parts must know:** the route has no tests yet (#6: use a temp runs dir via `createApp({...config, runsDir})`). The 404 body is JSON, unlike the page's 404.
## #5 Board links each night to its digest, with counts

**What was done:** the status board (`GET /`) lists each night on disk as a link to `/digest/<night>` with `ok N · retry N · fail N` beside it, from `readNight(...).counts`. A `missing` result shows `—` for the three numbers. Server-rendered, no client JS.

**Files:** `src/status.ts` (`readStatus` is now async; `Status.nights` is `{ night, counts: Counts | null }[]`), `src/views/status.tsx`, `src/app.tsx` (`await readStatus`), `HANDOVER.md`.

**How to check:** `pnpm typecheck` and `pnpm test` pass; `GET /` shows `2026-10-28` as a link with counts. The link renders a page only once #3 lands.

**What the next part must know:** `src/status.ts` imports `readNight` from `./digest/read.js` (#2). `readStatus` callers must `await` it. #6 can assert the board counts against a temp runs dir.
