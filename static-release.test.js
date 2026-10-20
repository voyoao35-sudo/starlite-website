'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('static release routes publish exact manifests independently of backend availability', () => {
    execFileSync(process.execPath, ['prepare-static-host.js'], { cwd: __dirname });
    const output = path.join(__dirname, 'static-host');
    const rules = fs.readFileSync(path.join(output, '_redirects'), 'utf8').split('\n');
    for (const channel of ['', '1.21.11/']) {
        const relative = 'downloads/' + channel + 'release.json';
        const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', relative)));
        const published = JSON.parse(fs.readFileSync(path.join(output, relative)));
        assert.deepEqual(published, expected);
        assert.ok(rules.includes(`/download/${channel}manifest /${relative} 200!`));
        assert.ok(rules.includes(`/download/${channel}core ${expected.core.url} 302!`));
    }
    assert.ok(rules[0].startsWith('/api/* https://starlite-production.up.railway.app/api/'));
    assert.match(fs.readFileSync(path.join(output, '_headers'), 'utf8'), /Cache-Control: no-store/);
    assert.equal(rules.filter(r => r.includes('manifest https://')).length, 0);
});
