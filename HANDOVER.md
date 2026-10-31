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
## #6 Digest route tests

**What was done:** route tests for `GET /digest/:night` (#3) and `GET /api/digest/:night` (#4) via `app.request()`, against a temp runs dir (mkdtemp in the OS temp dir, removed in afterAll; `runs/` untouched). Synthetic nights: normal (3 jobs, file order differs from sorted order, one null owner, a retry-then-ok job), empty file, one truncated line, and one night with no file.

**Files:** `test/digest-routes.test.tsx` (new), `HANDOVER.md`.

**How to check:** `pnpm test`. Needs #2, #3 and #4 merged; before that the digest tests fail with 404. Covered: 200, 404 (missing and invalid night; the API 404 is application/json), empty night ("nothing ran" / `rows: []`), bad line (`badLines: 1`, good rows kept), and page and JSON list the same jobs in the same order. Markup is only asserted for job names, "nothing ran", the em dash and status codes.

**What the next part must know:** the tests set no env vars. They assume the reader's sorted job order (`digest/render`, `lane/backup`, `lane/sync`). Failure marking (retries >= 3 or fail) is not asserted because the markup is not fixed.

## #7 Preview for review

**What was done:** `pnpm preview:save [night] [--no-marker]` (`scripts/save-preview.ts`) builds the app with `createApp()`, calls `app.request('/digest/<night>')` (default `2026-10-28`), fails with exit 1 on a non-200, and writes the body to `var/preview/index.html`. No browser, no running server. It prints the path, the size and whether the banner shows a marker or "no marker set" (never the marker value). `LANE_MARKER` comes from the environment or `.env`; `--no-marker` deletes it before rendering.

**Files:** `scripts/save-preview.ts`, `package.json` (script `preview:save`), `HANDOVER.md`.

**Where the file goes:** `var/preview/index.html`, git-ignored. It never goes into the repo, issues or chat (ADR 0003). The file is one page with inline CSS: no `<script`, `<link`, `src=` or `http` in it (ADR 0001).

**Upload:** done by the orchestrator to Netlify after the human approves the preview, over one fixed link: https://megadev-s01e04-rig-preview.netlify.app (Netlify site `megadev-s01e04-rig-preview`, made public in the Netlify UI because new sites are private by default). Deployed with `netlify deploy --prod --dir var/preview --no-build`. The link and the repo were sent to the reviewer on 2026-10-31; the claim was accepted as a step and the review is pending.

**Watch out for #8:** Netlify also serves every deploy at its own permalink (`<deploy-id>--megadev-s01e04-rig-preview.netlify.app`), and that link is public too. After the clean re-upload, delete the marked deploy, or the marker stays on a public link.

**What the next part must know:** for plan § 4 run `pnpm preview:save -- --no-marker` (banner reads "no marker set"), then upload `var/preview/index.html` over the same link. Run plain `pnpm preview:save` to get the marked file again.

## #8 Remove marker from preview, archive plan

**What was done:** plan.md § 4. The page was saved again with `pnpm preview:save -- --no-marker` (banner reads "no marker set") and uploaded over the same link https://megadev-s01e04-rig-preview.netlify.app with `netlify deploy --prod --dir var/preview --site <site> --no-build`. The old marked deploy was deleted with `netlify api deleteDeploy`, because Netlify keeps every deploy on its own public permalink. The plan moved to `docs/plans/done/2026-10-31-morning-digest.md` (status `done`) with its issue list (#1-#8).

**Files:** `docs/plans/done/2026-10-31-morning-digest.md` (moved from `plan.md`), `HANDOVER.md`. `var/preview/` stays git-ignored.

**How to check:** `pnpm typecheck` and `pnpm exec vitest run --dir test` pass. Open the preview link: the banner reads "no marker set".

**What the next part must know:** every review preview on Netlify needs both steps: the re-upload over the fixed link and deleting the older deploys. Otherwise old content stays on its permalink. Nothing left on a public link carries the marker.