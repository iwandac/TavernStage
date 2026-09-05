import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { assertCleanWorktree } from '../../scripts/tavernstage/check-worktree.mjs';

test('preflight rejects every dirty state without modifying the checkout', () => {
    const output = fileURLToPath(new URL('../output/', import.meta.url));
    mkdirSync(output, { recursive: true });
    const root = mkdtempSync(resolve(output, 'worktree-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    const file = resolve(root, 'tracked.txt');
    try {
        git('init', '-q');
        writeFileSync(file, 'original');
        git('add', 'tracked.txt');
        git('-c', 'user.name=TavernStage test', '-c', 'user.email=test@invalid', 'commit', '-qm', 'fixture');
        const originalHead = git('rev-parse', 'HEAD');
        assert.doesNotThrow(() => assertCleanWorktree(root));
        writeFileSync(file, 'unstaged');
        assert.throws(() => assertCleanWorktree(root), /Worktree has/);
        assert.equal(readFileSync(file, 'utf8'), 'unstaged');
        git('add', 'tracked.txt');
        assert.throws(() => assertCleanWorktree(root), /Worktree has/);
        assert.equal(git('show', ':tracked.txt'), 'unstaged');
        writeFileSync(file, 'original');
        git('add', 'tracked.txt');
        writeFileSync(resolve(root, 'untracked.txt'), 'keep me');
        assert.throws(() => assertCleanWorktree(root), /Worktree has/);
        assert.equal(readFileSync(resolve(root, 'untracked.txt'), 'utf8'), 'keep me');
        assert.equal(git('rev-parse', 'HEAD'), originalHead);
    } finally {
        // Only remove the exact newly-created test repository, never the project root.
        if (!root.startsWith(resolve(output) + '\\') && !root.startsWith(resolve(output) + '/')) {
            throw new Error('Test cleanup escaped its output directory');
        }
        rmSync(root, { recursive: true, force: true });
    }
});
