const { createHash } = require('node:crypto');

// Exact public/scripts/tool-calling.js delta from upstream commit
// 814734d4afc33530df65a75880518dbe986b3872. The fixed file is not a dependency
// on an unpublished Git object: this source-checked patch reconstructs it from
// the published 8172dcd baseline and verifies both complete source hashes.
module.exports = function applyToolDeltaFix(source) {
    const hash = value => createHash('sha256').update(value).digest('hex');
    if (hash(source) !== '6935ec69f247f5fbb4d58f09355ee1084a2032b2a80355acd06cd70dda4e62b0') throw new Error('Upstream tool-delta preimage drift');
    const before = "            if (typeof deltaValue === 'string') {\n                if (typeof targetValue === 'string') {";
    const after = "            if (typeof deltaValue === 'string') {\n                // `id`, `name`, `type` are sent in full by some providers on every\n                // streaming chunk; concatenating them would duplicate the value.\n                if (key === 'id' || key === 'name' || key === 'type') {\n                    if (!targetValue) {\n                        target[key] = deltaValue;\n                    }\n                } else if (typeof targetValue === 'string') {";
    const fixed = source.replace(before, after);
    if (hash(fixed) !== 'a6e81cecdcb68efd56ccf7e51cdb5a4d32852d0216751c956dd2e769f21d6a51') throw new Error('Upstream tool-delta postimage drift');
    return fixed;
};
