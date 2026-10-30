'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sources } = require('./download-delivery');
const item = {
    sha256: 'a'.repeat(64), size: 12,
    url: 'https://github.com/voyoao35-sudo/starlite-website/releases/download/test/core.jar'
};
test('deduplicates approved external sources', () => {
    assert.deepEqual(sources({ ...item, urls: [item.url] }), [item.url]);
});
test('refuses insecure URLs and unrelated repositories', () => {
    for (const url of [
        'http://github.com/voyoao35-sudo/starlite-website/releases/download/a/x',
        'https://github.com.evil.test/voyoao35-sudo/starlite-website/releases/download/a/x',
        'https://github.com/other/repo/releases/download/a/x',
        'https://user:pw@github.com/voyoao35-sudo/starlite-website/releases/download/a/x',
        'https://github.com/voyoao35-sudo/starlite-website/releases/download/a/x?token=private'
    ]) assert.throws(() => sources({ ...item, url }));
});
test('multipart bundles do not require an assembled archive in the website', () => {
    assert.deepEqual(sources({ sha256: item.sha256, size: 12, parts: [] }), []);
});

test('published channels provide a full bundle URL for installed single-archive launchers', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    for (const channel of ['', '1.21.11/']) {
        const release = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/downloads', channel, 'release.json'), 'utf8'));
        assert.ok(sources(release.bundle).length > 0, `Missing full bundle source for ${channel || '1.16.5'}`);
        assert.equal(release.bundle.parts.reduce((total, part) => total + part.size, 0), release.bundle.size);
    }
});
test('refuses invalid integrity metadata before redirecting', () => {
    for (const bad of [{ size: -1 }, { size: 1.2 }, { sha256: 'oops' }]) {
        assert.throws(() => sources({ ...item, ...bad }));
    }
});
test('configured mirror prefixes do not allow neighboring project paths', () => {
    process.env.STARLITE_MIRROR_PREFIXES = 'https://gitlab.com/api/v4/projects/123/packages/generic/starlite/';
    try {
        assert.equal(sources({ ...item, urls: ['https://gitlab.com/api/v4/projects/123/packages/generic/starlite/1/x'] }).length, 2);
        assert.throws(() => sources({ ...item, url: 'https://gitlab.com/api/v4/projects/124/packages/generic/starlite/1/x' }));
    } finally { delete process.env.STARLITE_MIRROR_PREFIXES; }
});
