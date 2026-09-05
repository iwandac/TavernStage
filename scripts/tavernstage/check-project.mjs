import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const manifest = json('tavernstage.json');
const pkg = json('package.json');
const lock = json('package-lock.json');

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.name, 'TavernStage');
assert.equal(manifest.mainBranch, 'main');
assert.equal(manifest.repository, 'https://github.com/iwandac/TavernStage');
assert.equal(manifest.upstream.repository, 'https://github.com/SillyTavern/SillyTavern');
assert.equal(manifest.upstream.branch, 'release');
assert.equal(manifest.upstream.remote, 'upstream');
assert.equal(manifest.upstream.trackingRef, 'refs/remotes/upstream/release');
assert.equal(manifest.upstream.previewTrackingRef, 'refs/remotes/upstream/staging');
assert.ok(!Object.hasOwn(manifest.upstream, 'trackingBranch'), 'Do not reintroduce fork mirror branches.');
assert.deepEqual(manifest.evolutionPolicy, {
    ecosystemGoal: 'complete-st-ecosystem',
    upstreamUpdates: 'continuous-reviewed-integration',
    migrationCost: 'accepted-to-meet-host-requirements',
    scopeReductionRequiresOwnerDecision: true,
});
assert.match(manifest.upstream.commit, /^[0-9a-f]{40}$/);
assert.equal(manifest.stage, 'source-bootstrap', 'Update this gate with evidence when runtime extraction lands.');
assert.equal(manifest.runtimeAvailable, false);
assert.equal(manifest.runtimeVersion, null);
assert.equal(manifest.releaseTagPrefix, 'tavernstage-v');
assert.equal(pkg.name, 'tavernstage');
assert.equal(pkg.private, true, 'Do not publish the inherited server package as a new runtime.');
assert.equal(pkg.repository.url, `${manifest.repository}.git`);
assert.equal(pkg.license, 'AGPL-3.0');
assert.equal(pkg.version, manifest.upstream.packageVersion);
assert.equal(lock.name, pkg.name);
assert.equal(lock.packages[''].name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);

// Git history is the provenance authority. Normalise checkout line endings only.
git('merge-base', '--is-ancestor', manifest.upstream.commit, 'HEAD');
const normalise = (value) => value.replace(/\r\n/g, '\n');
assert.equal(normalise(read('LICENSE')), normalise(git('show', `${manifest.upstream.commit}:LICENSE`)));
const baselinePkg = JSON.parse(git('show', `${manifest.upstream.commit}:package.json`));
assert.equal(baselinePkg.version, manifest.upstream.packageVersion);
const baselineGithubPaths = git('ls-tree', '-r', '--name-only', manifest.upstream.commit, '--', '.github/').trim().split('\n');
for (const path of baselineGithubPaths) {
    const archive = path.replace(/^\.github\//, 'docs/upstream/github/');
    assert.equal(normalise(read(archive)), normalise(git('show', `${manifest.upstream.commit}:${path}`)), `Upstream archive differs: ${path}`);
}

assert.match(read('README.md'), /^# TavernStage/m);
const githubFiles = readdirSync(new URL('../../.github/', import.meta.url));
assert.ok(!githubFiles.some((name) => /^readme(?:\.|$)/i.test(name)), 'Root README must be the GitHub project entry.');
const workflows = readdirSync(new URL('../../.github/workflows/', import.meta.url)).sort();
assert.deepEqual(workflows, ['tavernstage-checks.yml'], 'Review inherited/new workflows before enabling them.');
const workflow = read('.github/workflows/tavernstage-checks.yml');
assert.ok(!/pull_request_target|\bwrite\b|secrets\.|npm publish/.test(workflow));
for (const path of ['CONTRIBUTING.md', 'SECURITY.md', 'docs/tavernstage/development.md', 'docs/upstream/README.md']) {
    assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), `Missing project document: ${path}`);
}
console.log('TavernStage bootstrap identity, provenance, lock and workflow checks passed. Runtime behavior was not tested.');
