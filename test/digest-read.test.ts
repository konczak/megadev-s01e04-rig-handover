import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import type { NightResult } from '../src/digest/types.js';

type Night = Extract<NightResult, { kind: 'night' }>;

const asNight = (result: NightResult): Night => {
  if (result.kind !== 'night') throw new Error(`expected a night, got ${result.kind}`);
  return result;
};

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('builds one row per job, counts the bad line, keeps times verbatim', async () => {
    const night = asNight(await readNight('runs', '2026-10-28'));
    expect(night.night).toBe('2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);

    const byJob = new Map(night.rows.map((r) => [r.job, r]));
    expect(byJob.get('digest/render')?.owner).toBeNull();
    expect(byJob.get('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(byJob.get('fixtures/refresh')).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob.get('lane/sync')).toMatchObject({ lastStatus: 'ok', lastError: 'lock held' });

    const { ok, retry, fail } = night.counts;
    expect(ok + retry + fail).toBe(night.rows.reduce((n, r) => n + r.runs, 0));
    expect(retry).toBe(night.rows.reduce((n, r) => n + r.retries, 0));
  });
});

describe('readNight on synthetic nights', () => {
  let dir = '';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
    await writeFile(join(dir, '2026-01-01.jsonl'), '');
    await writeFile(
      join(dir, '2026-01-02.jsonl'),
      [
        '',
        '{"at":"2026-01-02T01:00:00-05:00","job":"b/job","status":"retry","owner":"amy","error":"boom"}',
        '   ',
        '{"at":"2026-01-02T01:05:00-05:00","job":"b/job","status":"ok","owner":null}',
        '{"at":"2026-01-02T02:00:00-05:00","job":"a/job","status":"fail","owner":"bob"}',
        '{"at":"x","job":"c/job","status":"weird","owner":"bob"}',
        '{"at":"x","job":"c/job","status":"ok"}',
        '[1,2]',
        '',
        '',
      ].join('\r\n'),
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a night with no file is missing', async () => {
    expect(await readNight(dir, '2026-02-30')).toEqual({ kind: 'missing', night: '2026-02-30' });
  });

  it('an invalid night is missing, even when a matching file exists', async () => {
    await writeFile(join(dir, 'not-a-night.jsonl'), '{"at":"x","job":"j","status":"ok","owner":null}');
    expect(await readNight(dir, 'not-a-night')).toEqual({ kind: 'missing', night: 'not-a-night' });
    expect(await readNight(dir, '../2026-01-01')).toEqual({ kind: 'missing', night: '../2026-01-01' });
  });

  it('an empty file is a night with nothing in it', async () => {
    expect(await readNight(dir, '2026-01-01')).toEqual({
      kind: 'night',
      night: '2026-01-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('ignores blank lines, counts invalid ones, handles CRLF and a trailing newline', async () => {
    const night = asNight(await readNight(dir, '2026-01-02'));
    expect(night.badLines).toBe(3);
    expect(night.counts).toEqual({ ok: 1, retry: 1, fail: 1 });
    expect(night.rows).toEqual([
      {
        job: 'a/job',
        owner: 'bob',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: null,
        firstAt: '2026-01-02T02:00:00-05:00',
        lastAt: '2026-01-02T02:00:00-05:00',
      },
      {
        job: 'b/job',
        owner: null,
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'boom',
        firstAt: '2026-01-02T01:00:00-05:00',
        lastAt: '2026-01-02T01:05:00-05:00',
      },
    ]);
  });
});
