import type { DigestRow } from '../digest/types.js';

const dash = '—';

function flagged(row: DigestRow): boolean {
  return row.retries >= 3 || row.lastStatus === 'fail';
}

export function DigestPage(props: { night: string; rows: DigestRow[]; badLines: number }) {
  return (
    <>
      <h1>digest {props.night}</h1>
      {props.badLines > 0 && (
        <p class="warn">
          {props.badLines} {props.badLines === 1 ? 'line' : 'lines'} could not be read
        </p>
      )}
      {props.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr class={flagged(r) ? 'flag' : undefined}>
                <td>{flagged(r) ? <span class="flag-mark">! </span> : null}{r.job}</td>
                <td>{r.owner ?? dash}</td>
                <td>{r.runs}</td>
                <td>{r.retries}{r.retries >= 3 ? ' (many)' : ''}</td>
                <td>{r.lastStatus}</td>
                <td>{r.lastError ?? dash}</td>
                <td>{r.firstAt}</td>
                <td>{r.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
