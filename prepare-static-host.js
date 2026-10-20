'use strict';
const fs = require('node:fs');
const path = require('node:path');
const delivery = require('./download-delivery');
const output = path.join(__dirname, 'static-host');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'favicon.ico', 'favicon.png', 'css', 'js', 'assets']) {
    fs.cpSync(path.join(__dirname, 'public', name), path.join(output, name), { recursive: true });
}
// Keep proxy rules and the SPA fallback in one file so the fallback cannot shadow the API.
const rules = [
    '/api/* https://starlite-production.up.railway.app/api/:splat 200!',
    '/healthz https://starlite-production.up.railway.app/healthz 200!',
    '/avatars/* https://starlite-production.up.railway.app/avatars/:splat 200!'
];
for (const channel of ['', '1.21.11/']) {
    const relative = 'downloads/' + channel + 'release.json';
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', relative), 'utf8'));
    fs.mkdirSync(path.dirname(path.join(output, relative)), { recursive: true });
    fs.writeFileSync(path.join(output, relative), JSON.stringify(manifest));
    rules.push(`/download/${channel}manifest https://starlite-production.up.railway.app/download/${channel}manifest 200!`);
    for (const [kind, key] of [['core', 'core'], ['assets', 'assets'], ['java21', 'java']]) {
        if (!manifest[key]) continue;
        const url = delivery.sources(manifest[key])[0];
        if (url) rules.push(`/download/${channel}${kind} ${url} 302!`);
    }
}
// Archive downloads must bypass the website host. Unmapped routes must not proxy archives.
rules.push('/* /index.html 200');
fs.writeFileSync(path.join(output, '_redirects'), rules.join('\n') + '\n');
console.log('Static host prepared: public UI and manifests only; no EXEs or game archives.');
