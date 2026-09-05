import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Read-only preflight for switching, updating or publishing the derived checkout. */
export function assertCleanWorktree(root) {
    const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
        cwd: root,
        encoding: 'utf8',
    });
    if (status.length !== 0) {
        throw new Error('Worktree has staged, unstaged or untracked changes. Preserve and review them before switching or updating; no files were changed.');
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 2) throw new Error('This preflight accepts no options or alternate target.');
    assertCleanWorktree(fileURLToPath(new URL('../../', import.meta.url)));
    console.log('Worktree is clean. This read-only check does not fetch, switch, merge, install or publish.');
}
