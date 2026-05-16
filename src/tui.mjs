/**
 * tui.mjs — Zero-dependency terminal UI renderer for the dual-brain CLI.
 * All functions return strings; callers use console.log to print.
 */

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ─── Unicode / ASCII mode ─────────────────────────────────────────────────────

export const useUnicode =
  process.env.DUALBRAIN_ASCII !== '1' && process.stdout.isTTY !== false;

const CH = useUnicode
  ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║', ts: '╠', te: '╣', fill: '█', empty: '░' }
  : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', ts: '+', te: '+', fill: '#', empty: '.' };

// ─── ANSI / emoji helpers ─────────────────────────────────────────────────────

/** Strip ANSI escape codes from a string. */
export function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}

/**
 * Visible display length of a string.
 * Strips ANSI codes and counts each emoji as 2 columns wide.
 */
export function visibleLength(str) {
  const plain = stripAnsi(String(str));
  let len = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    // Emoji / wide symbol ranges (covers most common emoji)
    if (
      (cp >= 0x1f300 && cp <= 0x1faff) || // Misc symbols, emoji
      (cp >= 0x2600  && cp <= 0x27bf)  || // Misc symbols
      (cp >= 0xfe00  && cp <= 0xfe0f)  || // Variation selectors
      (cp >= 0x1f1e0 && cp <= 0x1f1ff) || // Flags
      cp === 0x20e3                        // Combining enclosing keycap
    ) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

/**
 * Right-pad `str` with spaces so that its visible width equals `width`.
 * Accounts for emoji (2-wide) and ANSI codes.
 */
export function pad(str, width) {
  const vl = visibleLength(str);
  const spaces = Math.max(0, width - vl);
  return String(str) + ' '.repeat(spaces);
}

// ─── box ─────────────────────────────────────────────────────────────────────

/**
 * Renders a Unicode (or ASCII) box with a title bar.
 * @param {string} title
 * @param {string[]} lines
 * @param {{ width?: number }} opts
 * @returns {string}
 */
export function box(title, lines = [], opts = {}) {
  const inner = opts.width ?? 56;
  const total = inner + 2; // 2 spaces padding on each side counted inside border

  const top    = CH.tl + CH.h.repeat(total) + CH.tr;
  const divider = CH.ts + CH.h.repeat(total) + CH.te;
  const bottom = CH.bl + CH.h.repeat(total) + CH.br;

  // Title row: 2-space left pad
  const titleContent = '  ' + title;
  const titleRow = CH.v + pad(titleContent, total) + CH.v;

  const bodyRows = lines.map(line => {
    const content = '  ' + line;
    return CH.v + pad(content, total) + CH.v;
  });

  return [top, titleRow, divider, ...bodyRows, bottom].join('\n');
}

// ─── bar ─────────────────────────────────────────────────────────────────────

/**
 * Renders a percentage bar.
 * @param {number} percent  0–100
 * @param {number} width    bar width in chars (default 20)
 * @param {{ label?: string }} opts
 * @returns {string}
 */
export function bar(percent, width = 20, opts = {}) {
  const pct = Math.max(0, Math.min(100, percent));
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;

  const track = CH.fill.repeat(filled) + CH.empty.repeat(empty);
  const pctStr = String(Math.round(pct)).padStart(3) + '%';
  const label  = opts.label ? `  ${opts.label}` : '';

  return `${track}  ${pctStr}${label}`;
}

// ─── badge ────────────────────────────────────────────────────────────────────

/**
 * Returns a status badge emoji/symbol.
 * @param {string} status
 * @returns {string}
 */
export function badge(status) {
  const map = {
    healthy:   '🟢',
    degraded:  '🟡',
    hot:       '🔴',
    probing:   '🟠',
    connected: '✅',
    missing:   '❌',
    warning:   '⚠️',
  };
  return map[status] ?? '❓';
}

// ─── separator ───────────────────────────────────────────────────────────────

/**
 * Returns a section separator line.
 * @param {string} label
 * @returns {string}
 */
export function separator(label = '') {
  const dash = useUnicode ? '─' : '-';
  return label
    ? `  ${dash}${dash}${dash} ${label}`
    : `  ${dash}${dash}${dash}`;
}

// ─── menu ────────────────────────────────────────────────────────────────────

/**
 * Renders a numbered/lettered menu grouped by section.
 * @param {{ key: string, label: string, section?: string }[]} options
 * @param {object} opts  (reserved)
 * @returns {string}
 */
export function menu(options, opts = {}) {
  const rows = [];
  let lastSection = Symbol('none');

  for (const opt of options) {
    const section = opt.section ?? '';
    if (section !== lastSection) {
      if (section) {
        rows.push(separator(section));
      } else {
        rows.push(separator());
      }
      lastSection = section;
    }
    rows.push(`  [${opt.key}] ${opt.label}`);
  }

  return rows.join('\n');
}

// ── Modern box rendering with rounded corners ────────────────────────────────

const ROUNDED = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', ml: '├', mr: '┤' };

export function panel(title, content, opts = {}) {
  const { width = 70, titleColor = '\x1b[36m', borderColor = '\x1b[2m', reset = '\x1b[0m' } = opts;
  const lines = [];
  const innerW = width - 2;

  // Top border with title
  if (title) {
    const titleStr = ` ${title} `;
    const remaining = innerW - titleStr.length - 1;
    lines.push(`${borderColor}${ROUNDED.tl}${ROUNDED.h} ${titleColor}${title}${borderColor} ${ROUNDED.h.repeat(Math.max(0, remaining))}${ROUNDED.tr}${reset}`);
  } else {
    lines.push(`${borderColor}${ROUNDED.tl}${ROUNDED.h.repeat(innerW)}${ROUNDED.tr}${reset}`);
  }

  // Content lines
  const contentLines = (typeof content === 'string' ? content.split('\n') : content);
  for (const line of contentLines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = Math.max(0, innerW - stripped.length);
    lines.push(`${borderColor}${ROUNDED.v}${reset} ${line}${' '.repeat(pad)}${borderColor}${ROUNDED.v}${reset}`);
  }

  // Bottom border
  lines.push(`${borderColor}${ROUNDED.bl}${ROUNDED.h.repeat(innerW)}${ROUNDED.br}${reset}`);

  return lines.join('\n');
}

export function divider(width = 70) {
  const borderColor = '\x1b[2m';
  const reset = '\x1b[0m';
  return `${borderColor}${ROUNDED.ml}${ROUNDED.h.repeat(width - 2)}${ROUNDED.mr}${reset}`;
}

export function statusChip(label, healthy, opts = {}) {
  const green = '\x1b[32m';
  const red = '\x1b[31m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  const icon = healthy ? `${green}●${reset}` : `${red}●${reset}`;
  return `${icon} ${dim}${label}${reset}`;
}

export function headerBar(left, right, width = 70) {
  const leftStripped = left.replace(/\x1b\[[0-9;]*m/g, '');
  const rightStripped = right.replace(/\x1b\[[0-9;]*m/g, '');
  const gap = Math.max(1, width - leftStripped.length - rightStripped.length);
  return `${left}${' '.repeat(gap)}${right}`;
}

export function prompt(text = '> task or /help') {
  const cyan = '\x1b[36m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';
  return `${cyan}>${reset} ${dim}${text.replace(/^>\s*/, '')}${reset}`;
}

export function signalLine(type, text, meta = '') {
  const green = '\x1b[32m';
  const yellow = '\x1b[33m';
  const dim = '\x1b[2m';
  const reset = '\x1b[0m';

  let icon;
  switch (type) {
    case 'success': icon = `${green}✓${reset}`; break;
    case 'warning': icon = `${yellow}!${reset}`; break;
    case 'info': icon = `${dim}·${reset}`; break;
    default: icon = `${dim}·${reset}`;
  }

  const metaStr = meta ? `${dim}${meta}${reset}` : '';
  return `${icon}  ${text}${metaStr ? '  ' + metaStr : ''}`;
}

// ─── Self-test ────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Read version dynamically from package.json
  let selfTestVersion = '0.0.0';
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    selfTestVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  } catch { /* fallback to 0.0.0 */ }

  console.log(box(`🧠 Dual-Brain v${selfTestVersion}`, [
    '🟢 Claude ✅  🟢 OpenAI ✅',
    '🌀 Replit + replit-tools',
  ]));
  console.log(bar(75, 20, { label: 'Claude' }));
  console.log(bar(25, 20, { label: 'OpenAI' }));
  console.log(menu([
    { key: 'c', label: 'Continue last session', section: 'Sessions' },
    { key: 'n', label: 'New session',           section: 'Sessions' },
    { key: 'a', label: 'Auth management',       section: 'Settings' },
    { key: 'p', label: 'Profile settings',      section: 'Settings' },
    { key: 's', label: 'Exit to shell',         section: '' },
  ]));
}
