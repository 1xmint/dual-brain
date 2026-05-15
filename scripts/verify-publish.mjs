#!/usr/bin/env node
import { readFileSync } from 'fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const url = `https://registry.npmjs.org/dual-brain/${version}`;
const maxWait = 30000;
const start = Date.now();

async function check() {
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`✓ dual-brain@${version} verified on registry`);
      return;
    }
  } catch {}

  if (Date.now() - start > maxWait) {
    console.log(`⚠ dual-brain@${version} published but CDN propagation may take a moment`);
    return;
  }

  await new Promise(r => setTimeout(r, 3000));
  return check();
}

check();
