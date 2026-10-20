'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('production startup refuses missing credentials without exposing a default database', () => {
    const env = { ...process.env, STARLITE_REQUIRE_MONGO: '1', STARLITE_DOWNLOAD_MODE: 'external' };
    delete env.MONGODB_URI;
    delete env.MONGO_URL;
    const result = spawnSync(process.execPath, [path.join(__dirname, 'server.js')], {
        env, encoding: 'utf8', timeout: 10000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /server was not started/);
    assert.doesNotMatch(result.stdout, /running!|Seeding/);
});
