import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const NORMAL = '2026-01-10';
const EMPTY = '2026-01-11';
const BAD = '2026-01-12';
const NONE = '2026-01-13';

const line = (o: Record<string, unknown>) => JSON.stringify(o);

// File order deliberately differs from the sorted job order.
const normalLines = [
  line({ at: '2026-01-10T01:30:00+01:00', job: 'lane/sync', status: 'retry', owner: 'ana', error: 'timeout' }),
  line({ at: '2026-01-10T01:31:00+01:00', job: 'lane/sync', status: 'ok', owner: 'ana' }),
  line({ at: '2026-01-10T01:32:00+01:00', job: 'digest/render', status: 'ok', owner: null }),
  line({ at: '2026-01-10T01:33:00+01:00', job: 'lane/backup', status: 'fail', owner: 'bo', error: 'disk full' }),
];
const badNightLines = [
  line({ at: '2026-01-12T02:00:00+01:00', job: 'lane/sync', status: 'ok', owner: 'ana' }),
  line({ at: '2026-01-12T02:01:00+01:00', job: 'lane/backup', status: 'ok', owner: 'bo' }),
  '{"at":"2026-01-12T02:02:00+01:00","job":"lane/trunc',
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
  await writeFile(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  await writeFile(join(runsDir, `${EMPTY}.jsonl`), '');
  await writeFile(join(runsDir, `${BAD}.jsonl`), badNightLines.join('\n') + '\n');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(async () => {
  await rm(runsDir, { recursive: true, force: true });
});

type NightJson = { kind: 'night'; night: string; rows: DigestRow[]; badLines: number };

const page = (night: string) => app.request(`/digest/${night}`);
const api = (night: string) => app.request(`/api/digest/${night}`);

describe('GET /digest/:night', () => {
  it('renders a normal night with its jobs', async () => {
    const res = await page(NORMAL);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['digest/render', 'lane/backup', 'lane/sync']) expect(html).toContain(job);
    expect(html).not.toContain('nothing ran');
  });

  it('lists jobs in reader order', async () => {
    const html = await (await page(NORMAL)).text();
    const pos = ['digest/render', 'lane/backup', 'lane/sync'].map((j) => html.indexOf(j));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });

  it('shows a null owner as an em dash', async () => {
    const html = await (await page(NORMAL)).text();
    expect(html).toContain('—');
  });

  it('404 for a night with no file', async () => {
    expect((await page(NONE)).status).toBe(404);
  });

  it('404 for an invalid night', async () => {
    expect((await page('not-a-night')).status).toBe(404);
  });

  it('says "nothing ran" for an empty file', async () => {
    const res = await page(EMPTY);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good rows when a line is bad', async () => {
    const res = await page(BAD);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
    expect(html).toContain('lane/backup');
    expect(html).not.toContain('lane/trunc');
    expect(html).not.toContain('nothing ran');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON', async () => {
    const res = await api(NORMAL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightJson;
    expect(body.kind).toBe('night');
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/backup', 'lane/sync']);
    const sync = body.rows.find((r) => r.job === 'lane/sync');
    expect(sync).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });

  it('404 JSON for a night with no file', async () => {
    const res = await api(NONE);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toBeDefined();
  });

  it('404 JSON for an invalid night', async () => {
    const res = await api('not-a-night');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('returns no rows for an empty file', async () => {
    const res = await api(EMPTY);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightJson;
    expect(body).toMatchObject({ kind: 'night', night: EMPTY, rows: [], badLines: 0 });
  });

  it('counts a truncated line as bad and keeps the rest', async () => {
    const res = await api(BAD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/backup', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it.each([NORMAL, BAD])('same jobs in the same order for %s', async (night) => {
    const body = (await (await api(night)).json()) as NightJson;
    const html = await (await page(night)).text();
    const jobs = body.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const pos = jobs.map((j) => html.indexOf(j));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });
});
