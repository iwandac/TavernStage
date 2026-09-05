const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

/** Git may materialize CRLF. No other whitespace or source differences are ignored. */
function sameSource(actual, expected) {
    return actual.replaceAll('\r\n', '\n') === expected.replaceAll('\r\n', '\n');
}

/** Invoke the shared read-only preflight before the generator writes any target. */
function assertWritable(root) {
    execFileSync(process.execPath, [resolve(root, 'scripts/tavernstage/check-worktree.mjs')], {
        cwd: root,
        stdio: 'pipe',
    });
}

module.exports = { sameSource, assertWritable };
