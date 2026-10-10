const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256(file) {
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(1024 * 1024);
    const fd = fs.openSync(file, 'r');
    try {
        let count;
        while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
    } finally { fs.closeSync(fd); }
    return hash.digest('hex');
}

function createDownloads(directory, fetchFile = globalThis.fetch) {
    let verified = null;
    let pending = null;
    let pendingHash = null;
    function manifest() {
        const release = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
        if (release.schema !== 1 || !release.bundle || !/^[a-f0-9]{64}$/.test(release.bundle.sha256)) {
            throw new Error('Invalid release manifest');
        }
        return release;
    }
    function remoteUrl(kind) {
        const item = manifest()[kind];
        if (!item || !item.url) return null;
        const url = new URL(item.url);
        const prefix = '/voyoao35-sudo/starlite-website/releases/download/';
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
            !url.pathname.startsWith(prefix) || url.username || url.password || url.search || url.hash) {
            throw new Error('Invalid release download URL');
        }
        return url.href;
    }
    function partUrl(value) {
        const url = new URL(value);
        const allowed = url.hostname === 'github.com'
            ? url.pathname.startsWith('/voyoao35-sudo/starlite-website/releases/download/')
            : url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/voyoao35-sudo/starlite-website/');
        if (url.protocol !== 'https:' || !allowed || url.username || url.password || url.search || url.hash) throw new Error('Invalid release part URL');
        return url.href;
    }
    function prepare() {
        const release = manifest();
        if (pending && pendingHash === release.bundle.sha256) return pending;
        pendingHash = release.bundle.sha256;
        pending = (async () => {
            if (remoteUrl('bundle')) return null;
            const target = path.join(directory, 'starlite-bundle.zip');
            if (fs.existsSync(target) && fs.statSync(target).size === release.bundle.size && sha256(target) === release.bundle.sha256) return assemble();
            const queue = [];
            for (const part of release.bundle.parts) {
                if (!/^bundle_part[1-9][0-9]*\.dat$/.test(part.name) || !Number.isInteger(part.size) || part.size <= 0 || part.size > 16 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(part.sha256)) throw new Error('Invalid release part');
                const file = path.join(directory, part.name);
                if (fs.existsSync(file) && fs.statSync(file).size === part.size && sha256(file) === part.sha256) continue;
                if (!part.url) continue; // Local-only manifests are validated by assemble().
                queue.push({ part, file, url: partUrl(part.url) });
            }
            const results = await Promise.allSettled(Array.from({ length: Math.min(4, queue.length) }, async () => {
                while (queue.length) {
                    const { part, file, url } = queue.shift();
                    const response = await fetchFile(url, { signal: AbortSignal.timeout(120000) });
                    if (!response.ok) throw new Error(`Release part download failed: ${part.name}`);
                    const content = Buffer.from(await response.arrayBuffer());
                    if (content.length !== part.size || crypto.createHash('sha256').update(content).digest('hex') !== part.sha256) throw new Error(`Corrupt remote release part: ${part.name}`);
                    fs.writeFileSync(file + '.tmp', content);
                    fs.renameSync(file + '.tmp', file);
                }
            }));
            const failure = results.find(result => result.status === 'rejected');
            if (failure) throw failure.reason;
            return assemble();
        })();
        pending.catch(() => { pending = null; });
        return pending;
    }
    function assemble() {
        if (remoteUrl('bundle')) return null;
        const release = manifest();
        const target = path.join(directory, 'starlite-bundle.zip');
        if (fs.existsSync(target)) {
            const stat = fs.statSync(target);
            const key = `${release.bundle.sha256}:${stat.size}:${stat.mtimeMs}`;
            if (verified === key) return target;
            if (stat.size === release.bundle.size && sha256(target) === release.bundle.sha256) {
                verified = key;
                return target;
            }
        }
        const temp = target + '.tmp';
        const out = fs.openSync(temp, 'w');
        try {
            for (const part of release.bundle.parts) {
                if (!/^bundle_part[1-9][0-9]*\.dat$/.test(part.name)) throw new Error('Invalid bundle part name');
                const file = path.join(directory, part.name);
                if (fs.statSync(file).size !== part.size || sha256(file) !== part.sha256) throw new Error(`Corrupt bundle part: ${part.name}`);
                const content = fs.readFileSync(file);
                let written = 0;
                while (written < content.length) written += fs.writeSync(out, content, written, content.length - written);
            }
        } finally { fs.closeSync(out); }
        if (fs.statSync(temp).size !== release.bundle.size || sha256(temp) !== release.bundle.sha256) {
            fs.unlinkSync(temp);
            throw new Error('Assembled bundle checksum mismatch');
        }
        if (fs.existsSync(target)) fs.unlinkSync(target);
        fs.renameSync(temp, target);
        verified = null;
        return assemble();
    }
    return { manifest, assemble, remoteUrl, prepare };
}
module.exports = { createDownloads, sha256 };
