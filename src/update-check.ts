import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getLocalVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    return pkg.version;
  } catch { return null; }
}

export function getLatestVersion(): string | null {
  try {
    const result = execSync('npm view dual-brain version 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    return result.trim();
  } catch { return null; }
}

export function checkForUpdate(): { updateAvailable: boolean; local: string | null; latest: string | null } {
  const local = getLocalVersion();
  const latest = getLatestVersion();
  if (!local || !latest) return { updateAvailable: false, local, latest };

  const localParts = local.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  const updateAvailable = latestParts[0] > localParts[0]
    || (latestParts[0] === localParts[0] && latestParts[1] > localParts[1])
    || (latestParts[0] === localParts[0] && latestParts[1] === localParts[1] && latestParts[2] > localParts[2]);

  return { updateAvailable, local, latest };
}
