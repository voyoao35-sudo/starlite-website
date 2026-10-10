const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createDownloads } = require('./downloads');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

test('release assets use only this repository; external URLs are rejected', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlite-release-'));
    try {
        const file = path.join(directory, 'release.json');
        const release = { schema: 1, bundle: { sha256: 'a'.repeat(64), url: 'https://github.com/voyoao35-sudo/starlite-website/releases/download/test/starlite-bundle.zip' } };
        fs.writeFileSync(file, JSON.stringify(release));
        const service = createDownloads(directory);
        assert.equal(service.remoteUrl('bundle'), release.bundle.url);
        assert.equal(service.assemble(), null);
        release.bundle.url = 'https://example.org/private.zip';
        fs.writeFileSync(file, JSON.stringify(release));
        assert.throws(() => service.remoteUrl('bundle'), /Invalid release download URL/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('small verified bundle assembles exactly declared parts; stale parts are ignored', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlite-release-'));
    try {
        const chunks = [Buffer.from('first'), Buffer.from('second')];
        const bytes = Buffer.concat(chunks);
        const parts = chunks.map((data, index) => {
            const name = `bundle_part${index + 1}.dat`;
            fs.writeFileSync(path.join(directory, name), data);
            return { name, size: data.length, sha256: hash(data) };
        });
        fs.writeFileSync(path.join(directory, 'bundle_part3.dat'), 'obsolete private data');
        fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify({ schema: 1, bundle: { size: bytes.length, sha256: hash(bytes), parts } }));
        fs.writeFileSync(path.join(directory, 'starlite-bundle.zip'), 'old release');
        const service = createDownloads(directory);
        assert.deepEqual(fs.readFileSync(service.assemble()), bytes);
        assert.deepEqual(fs.readFileSync(service.assemble()), bytes);
        fs.unlinkSync(path.join(directory, 'starlite-bundle.zip'));
        fs.writeFileSync(path.join(directory, parts[0].name), 'wrong');
        assert.throws(() => service.assemble(), /Corrupt bundle part/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('untrusted part path never reads outside downloads', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlite-release-'));
    try {
        fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify({ schema: 1, bundle: { size: 1, sha256: 'a'.repeat(64), parts: [{ name: '../secrets' }] } }));
        assert.throws(() => createDownloads(directory).assemble(), /Invalid bundle part name/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('remote parts are checked before assembling; concurrent callers share the same download', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starlite-release-'));
    try {
        const content = Buffer.from('new complete client');
        const release = { schema: 1, bundle: { size: content.length, sha256: hash(content), parts: [{ name: 'bundle_part1.dat', size: content.length, sha256: hash(content), url: 'https://github.com/voyoao35-sudo/starlite-website/releases/download/test/bundle_part1.dat' }] } };
        fs.writeFileSync(path.join(directory, 'release.json'), JSON.stringify(release));
        let requests = 0;
        const service = createDownloads(directory, async () => { requests++; return new Response(content); });
        const paths = await Promise.all([service.prepare(), service.prepare()]);
        assert.equal(requests, 1);
        assert.deepEqual(fs.readFileSync(paths[0]), content);
        assert.equal(paths[0], paths[1]);
        fs.unlinkSync(paths[0]);
        fs.unlinkSync(path.join(directory, 'bundle_part1.dat'));
        const invalid = createDownloads(directory, async () => new Response('bad'));
        await assert.rejects(invalid.prepare(), /Corrupt remote release part/);
        assert.equal(fs.existsSync(paths[0]), false);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
