import assert from 'node:assert/strict';
import test from 'node:test';
import { sameSource } from '../../scripts/tavernstage/extraction-io.cjs';

test('extraction comparison accepts Git LF and CRLF worktree materializations only', () => {
    const lf = 'const value = 1;\nfunction read() {\n    return value;\n}\n';
    const crlf = lf.replaceAll('\n', '\r\n');
    assert.equal(sameSource(lf, lf), true);
    assert.equal(sameSource(crlf, lf), true);
    assert.equal(sameSource(lf, crlf), true);
    assert.equal(sameSource(crlf, crlf), true);
    assert.equal(sameSource(lf.replace('1', '2'), lf), false);
    assert.equal(sameSource(lf.replace('    ', '  '), lf), false);
    assert.equal(sameSource(lf.trimEnd(), lf), false);
    assert.equal(sameSource(lf.replace('\n', '\r'), lf), false);
});
