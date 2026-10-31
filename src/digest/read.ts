import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NIGHT_PATTERN, type Counts, type DigestRow, type ReadNight, type RunStatus } from './types.js';

/** One valid run-log line, after parsing at the edge. */
type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

const isRunStatus = (value: unknown): value is RunStatus =>
  value === 'ok' || value === 'retry' || value === 'fail';

/** Parses one non-blank line; `null` means a bad line. Never throws. */
const parseLine = (line: string): RunLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { at, job, status, owner, error } = record;
  if (typeof at !== 'string' || typeof job !== 'string' || !isRunStatus(status)) return null;
  if (!('owner' in record) || (owner !== null && typeof owner !== 'string')) return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return error === undefined ? { at, job, status, owner } : { at, job, status, owner, error };
};

/** File contents, or `null` when there is no file. Other I/O errors propagate. */
const readText = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
};

export const readNight: ReadNight = async (runsDir, night) => {
  // Validate before building any path from `night`.
  if (!NIGHT_PATTERN.test(night)) return { kind: 'missing', night };
  const text = await readText(join(runsDir, `${night}.jsonl`));
  if (text === null) return { kind: 'missing', night };

  const byJob = new Map<string, DigestRow>();
  const counts: Counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const run = parseLine(raw);
    if (run === null) {
      badLines += 1;
      continue;
    }
    counts[run.status] += 1;
    const retry = run.status === 'retry' ? 1 : 0;
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: retry,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
    } else {
      row.owner = run.owner;
      row.runs += 1;
      row.retries += retry;
      row.lastStatus = run.status;
      if (run.error !== undefined) row.lastError = run.error;
      row.lastAt = run.at;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { kind: 'night', night, rows, counts, badLines };
};
