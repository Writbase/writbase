import pc from 'picocolors';

export function success(msg: string) {
  console.log(pc.green('✓ ') + msg);
}

export function error(msg: string) {
  console.error(pc.red('✗ ') + msg);
}

export function warn(msg: string) {
  console.log(pc.yellow('⚠ ') + msg);
}

export function info(msg: string) {
  console.log(pc.cyan('ℹ ') + msg);
}

export function table(headers: string[], rows: string[][]) {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const sep = colWidths.map((w) => '─'.repeat(w + 2)).join('┼');
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell ?? '').padEnd(colWidths[i])} `).join('│');

  console.log(pc.bold(formatRow(headers)));
  console.log(sep);
  for (const row of rows) {
    console.log(formatRow(row));
  }
}
