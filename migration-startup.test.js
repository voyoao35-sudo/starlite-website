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

test('launcher link keeps subscription checks and returns a URL without placing a session in it', () => {
    const env = { ...process.env, STARLITE_REQUIRE_MONGO: '1', STARLITE_DOWNLOAD_MODE: 'external',
        STARLITE_LAUNCHER_URL: 'https://github.com/voyoao35-sudo/starlite-website/releases/download/test/Starlite.exe' };
    delete env.MONGODB_URI;
    delete env.MONGO_URL;
    const script = `
        const assert = require('node:assert/strict');
        const db = require('./database');
        db.isReady = () => true;
        db.findUserByToken = token => token === 'subscribed' ? {role:'user',subscription:{active:true}} :
            token === 'expired' ? {role:'user',subscription:{active:false}} : null;
        const {app} = require('./server');
        const server = app.listen(0, '127.0.0.1', async () => {
            try {
                const url = 'http://127.0.0.1:' + server.address().port + '/api/launcher/download';
                assert.equal((await fetch(url)).status, 401);
                assert.equal((await fetch(url, {headers:{Authorization:'Bearer expired'}})).status, 403);
                const response = await fetch(url, {headers:{Authorization:'Bearer subscribed'}});
                assert.equal(response.status, 200);
                assert.equal(response.headers.get('cache-control'), 'no-store');
                const body = await response.json();
                assert.equal(body.url, process.env.STARLITE_LAUNCHER_URL);
                assert.equal(new URL(body.url).search, '');
                server.close();
            } catch(error) { console.error(error); server.close(); process.exitCode = 1; }
        });
    `;
    const result = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, env,
        encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
});
