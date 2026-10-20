'use strict';
const allowed = value => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.search || u.port) throw new Error('Invalid download URL');
    const configured = (process.env.STARLITE_MIRROR_PREFIXES || '').split(',').map(x => x.trim()).filter(Boolean);
    const prefixes = [
        'https://github.com/voyoao35-sudo/starlite-website/releases/download/',
        'https://raw.githubusercontent.com/voyoao35-sudo/starlite-downloads/', ...configured
    ];
    if (!prefixes.some(p => { const base = new URL(p.endsWith('/') ? p : p + '/'); return u.origin === base.origin && u.pathname.startsWith(base.pathname); })) throw new Error('Unapproved download origin');
    return u.href;
};
function sources(item) {
    if (!item || !Number.isSafeInteger(item.size) || item.size <= 0 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) throw new Error('Invalid artifact metadata');
    const values = [item.url, ...(Array.isArray(item.urls) ? item.urls : [])].filter(Boolean);
    return [...new Set(values.map(allowed))];
}
function launcherUrl(value) { return allowed(value); }
module.exports = { sources, launcherUrl };
