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

function createDownloads(directory) {
    let verified = null;
    function manifest() {
        const release = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
        if (release.schema !== 1 || !release.bundle || !/^[a-f0-9]{64}$/.test(release.bundle.sha256)) {
            throw new Error('Invalid release manifest');
        }
        return release;
    }
    function assemble() {
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
    return { manifest, assemble };
}
module.exports = { createDownloads, sha256 };
