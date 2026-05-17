// fx.ts — zero-dependency animated shell effects for dual-brain CLI

const isTTY = process.stdout.isTTY && !process.env.CI;
const hasColor = isTTY && !process.env.NO_COLOR;
const isUnicode = process.platform !== 'win32' || !!process.env.WT_SESSION;

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  clearLine: '\x1b[2K',
  cursorUp: '\x1b[1A',
  cursorHide: '\x1b[?25l',
  cursorShow: '\x1b[?25h',
  saveCursor: '\x1b[s',
  restoreCursor: '\x1b[u'
} as const;

function color(text: string, ...styles: string[]): string {
  if (!hasColor) return text;
  return styles.join('') + text + c.reset;
}

export const colors = c;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clearScreen(): void {
  if (isTTY) process.stdout.write('\x1b[2J\x1b[H');
}

export function nl(n = 1): void {
  process.stdout.write('\n'.repeat(n));
}

export type FxMode = 'ci' | 'plain' | 'subtle' | 'full';

export function getMode(): FxMode {
  if (process.env.CI) return 'ci';
  if (!process.stdout.isTTY) return 'plain';
  if (process.env.DUAL_BRAIN_FX === 'subtle') return 'subtle';
  return 'full';
}

export interface Spinner {
  start(): Spinner;
  update(newText: string): Spinner;
  succeed(msg?: string): Spinner;
  fail(msg?: string): Spinner;
  warn(msg?: string): Spinner;
  stop(): Spinner;
}

export function spinner(text: string): Spinner {
  const frames = isUnicode ? ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'] : ['|','/','-','\\'];
  let i = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentText = text;

  return {
    start() {
      if (!isTTY) { process.stdout.write(currentText + '\n'); return this; }
      process.stdout.write(c.cursorHide);
      interval = setInterval(() => {
        process.stdout.write(`\r${c.clearLine}  ${color(frames[i % frames.length], c.cyan)} ${currentText}`);
        i++;
      }, 80);
      return this;
    },
    update(newText: string) { currentText = newText; return this; },
    succeed(msg?: string) {
      if (interval) clearInterval(interval);
      const sym = isUnicode ? '✓' : '+';
      process.stdout.write(`\r${c.clearLine}  ${color(sym, c.green)} ${msg || currentText}\n`);
      if (isTTY) process.stdout.write(c.cursorShow);
      return this;
    },
    fail(msg?: string) {
      if (interval) clearInterval(interval);
      const sym = isUnicode ? '✗' : 'x';
      process.stdout.write(`\r${c.clearLine}  ${color(sym, c.red)} ${msg || currentText}\n`);
      if (isTTY) process.stdout.write(c.cursorShow);
      return this;
    },
    warn(msg?: string) {
      if (interval) clearInterval(interval);
      const sym = isUnicode ? '⚠' : '!';
      process.stdout.write(`\r${c.clearLine}  ${color(sym, c.yellow)} ${msg || currentText}\n`);
      if (isTTY) process.stdout.write(c.cursorShow);
      return this;
    },
    stop() {
      if (interval) clearInterval(interval);
      process.stdout.write(`\r${c.clearLine}`);
      if (isTTY) process.stdout.write(c.cursorShow);
      return this;
    }
  };
}

export function progress(current: number, total: number, label = '', width = 30): void {
  const pct = Math.min(1, current / total);
  if (!isTTY) {
    process.stdout.write(`${Math.round(pct * 100)}% ${label}\n`);
    return;
  }
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = isUnicode
    ? color('█'.repeat(filled) + '░'.repeat(empty), c.cyan)
    : color('#'.repeat(filled) + '-'.repeat(empty), c.cyan);
  const pctStr = String(Math.round(pct * 100)).padStart(3) + '%';
  process.stdout.write(`\r${c.clearLine}  ${bar}  ${color(pctStr, c.bold)} ${label}`);
  if (current >= total) process.stdout.write('\n');
}

export function success(text: string): void {
  const sym = isUnicode ? '✓' : '+';
  process.stdout.write(`  ${color(sym, c.green)} ${text}\n`);
}

export function error(text: string): void {
  const sym = isUnicode ? '✗' : 'x';
  process.stdout.write(`  ${color(sym, c.red)} ${text}\n`);
}

export function warn(text: string): void {
  const sym = isUnicode ? '⚠' : '!';
  process.stdout.write(`  ${color(sym, c.yellow)} ${text}\n`);
}

export function info(text: string): void {
  const sym = isUnicode ? 'ℹ' : 'i';
  process.stdout.write(`  ${color(sym, c.blue)} ${text}\n`);
}

export function dim(text: string): void {
  process.stdout.write(`${color(text, c.gray)}\n`);
}

export function step(current: number, total: number, text: string): void {
  if (!isUnicode) {
    process.stdout.write(`  [${current}/${total}] ${text}\n`);
    return;
  }
  const dots: string[] = [];
  for (let i = 1; i <= total; i++) {
    if (i < current) dots.push(color('●', c.green));
    else if (i === current) dots.push(color('●', c.cyan));
    else dots.push(color('○', c.gray));
  }
  process.stdout.write(`  ${dots.join(' ')}  ${color(`Step ${current} of ${total}`, c.bold)} · ${text}\n`);
}

export function banner(text: string): void {
  const pkg = 'DUAL-BRAIN';
  const inner = `  ${isUnicode ? '🧠' : '**'}  ${pkg}  ${text}   `;
  const width = inner.length + 2;
  if (!isUnicode || !hasColor) {
    process.stdout.write(`\n  +${'='.repeat(width - 2)}+\n  | ${inner} |\n  +${'='.repeat(width - 2)}+\n\n`);
    return;
  }
  const top =    `  ╔${'═'.repeat(width)}╗`;
  const mid =    `  ║${inner}║`;
  const bot =    `  ╚${'═'.repeat(width)}╝`;
  process.stdout.write(`\n${color(top, c.cyan, c.bold)}\n${color(mid, c.cyan, c.bold)}\n${color(bot, c.cyan, c.bold)}\n\n`);
}

export interface BoxOptions {
  color?: keyof typeof c;
  padding?: number;
  title?: string;
}

export function box(content: string | string[], options: BoxOptions = {}): void {
  const { color: colorName = 'cyan', padding = 1, title = '' } = options;
  const ansiColor = c[colorName] || c.cyan;
  const lines = Array.isArray(content) ? content : content.split('\n');
  const innerWidth = Math.max(...lines.map(l => stripAnsi(l).length), title ? stripAnsi(title).length : 0) + padding * 2;

  function draw(text: string, ansi: string): string {
    if (!hasColor) return text;
    return ansi + text + c.reset;
  }

  const titleStr = title ? ` ${title} ` : '';
  const topFill = '─'.repeat(Math.max(0, innerWidth - stripAnsi(titleStr).length));
  const top = isUnicode
    ? draw(`┌${titleStr}${'─'.repeat(Math.floor(topFill.length / 2))}${'─'.repeat(Math.ceil(topFill.length / 2))}┐`, ansiColor)
    : draw(`+${titleStr}${'-'.repeat(topFill.length)}+`, ansiColor);
  const bot = isUnicode
    ? draw(`└${'─'.repeat(innerWidth)}┘`, ansiColor)
    : draw(`+${'-'.repeat(innerWidth)}+`, ansiColor);

  process.stdout.write(`  ${top}\n`);
  for (const line of lines) {
    const pad = ' '.repeat(padding);
    const visible = stripAnsi(line).length;
    const right = ' '.repeat(Math.max(0, innerWidth - padding - visible));
    const border = isUnicode ? draw('│', ansiColor) : draw('|', ansiColor);
    process.stdout.write(`  ${border}${pad}${line}${right}${border}\n`);
  }
  process.stdout.write(`  ${bot}\n`);
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export function gradient(text: string, fromColor = 196, toColor = 226): void {
  if (!hasColor) { process.stdout.write(text + '\n'); return; }
  const chars = [...text];
  const result = chars.map((ch, i) => {
    const t = chars.length <= 1 ? 0 : i / (chars.length - 1);
    const colorIdx = Math.round(fromColor + t * (toColor - fromColor));
    return `\x1b[38;5;${colorIdx}m${ch}`;
  }).join('') + c.reset;
  process.stdout.write(result + '\n');
}

export async function celebrate(text: string): Promise<void> {
  const sym = isUnicode ? '✨' : '*';
  if (!isTTY || getMode() === 'ci' || getMode() === 'plain') {
    process.stdout.write(`  ${sym} ${text} ${sym}\n`);
    return;
  }
  process.stdout.write(`\r${c.clearLine}  ${color(`${sym} ${text} ${sym}`, c.bgGreen, c.bold)}`);
  await sleep(100);
  process.stdout.write(`\r${c.clearLine}  ${color(`${sym} ${text} ${sym}`, c.green, c.bold)}\n`);
}

export interface LoadingStep {
  text: string;
  duration?: number;
  successText?: string;
}

export async function loadingSequence(steps: LoadingStep[]): Promise<void> {
  for (const s of steps) {
    const sp = spinner(s.text).start();
    await sleep(s.duration || 800);
    sp.succeed(s.successText || s.text);
  }
}

export async function agentDispatch(model: string, task: string): Promise<void> {
  const mode = getMode();
  if (mode === 'ci' || mode === 'plain') {
    process.stdout.write(`Dispatching ${model}...\n`);
    process.stdout.write(`Agent dispatched: ${task}\n`);
    return;
  }
  const sp = spinner(`Dispatching ${color(model, c.cyan)}...`).start();
  await sleep(mode === 'subtle' ? 0 : 600);
  sp.succeed(`Agent dispatched: ${task}`);
}

export async function thinkRound(round: number, provider: string, question: string): Promise<void> {
  const mode = getMode();
  const providerLabel = color(provider, c.magenta);
  const roundLabel = color(`Round ${round}`, c.bold);

  if (mode === 'ci' || mode === 'plain') {
    process.stdout.write(`Dual-Brain Think · ${roundLabel} · ${provider} analyzing: ${question}\n`);
    return;
  }

  const title = `Dual-Brain Think · ${roundLabel}`;
  const titleVisible = stripAnsi(title);
  const width = Math.max(titleVisible.length + 4, question.length + 4, 36);
  const topFill = '─'.repeat(Math.max(0, width - titleVisible.length - 2));

  if (isUnicode && hasColor) {
    process.stdout.write(`  ${color(`╭─ ${title} ${'─'.repeat(topFill.length)}╮`, c.cyan)}\n`);
    process.stdout.write(`  ${color('│', c.cyan)} ${isUnicode ? '🤖' : '>>'} ${providerLabel} analyzing...${' '.repeat(Math.max(0, width - 4 - stripAnsi(provider).length - 13))}${color('│', c.cyan)}\n`);
    process.stdout.write(`  ${color(`╰${'─'.repeat(width)}╯`, c.cyan)}\n`);
  } else {
    process.stdout.write(`  +-- ${title} --+\n`);
    process.stdout.write(`  | ${provider} analyzing: ${question}\n`);
    process.stdout.write(`  +${'─'.repeat(width + 2)}+\n`);
  }

  const sp = spinner(`${provider} thinking on: ${question}`).start();
  await sleep(mode === 'subtle' ? 0 : 900);
  sp.succeed(`${provider} analysis complete`);
}
