const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const URL_FILE = path.join(__dirname, 'current_url.txt');

function startTunnel() {
    console.log('[Tunnel] Starting SSH tunnel to localhost.run...');
    
    const ssh = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=10',
        '-o', 'ServerAliveCountMax=30',
        '-o', 'ExitOnForwardFailure=yes',
        '-R', '80:localhost:3000',
        'nokey@localhost.run'
    ]);

    let currentUrl = null;
    let pingInterval = null;

    ssh.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);

        const match = text.match(/https:\/\/[a-z0-9]+\.lhr\.life/);
        if (match && match[0] !== currentUrl) {
            currentUrl = match[0];
            fs.writeFileSync(URL_FILE, currentUrl, 'utf8');
            console.log(`\n========================================`);
            console.log(`[Tunnel Active URL] ${currentUrl}`);
            console.log(`========================================\n`);

            if (pingInterval) clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                if (currentUrl) {
                    https.get(`${currentUrl}/api/stats/public`, (res) => {
                        res.resume();
                    }).on('error', () => {});
                }
            }, 8000);
        }
    });

    ssh.stderr.on('data', (data) => {
        process.stderr.write(data.toString());
    });

    ssh.on('close', (code) => {
        console.log(`[Tunnel] SSH exited with code ${code}. Restarting in 3s...`);
        if (pingInterval) clearInterval(pingInterval);
        setTimeout(startTunnel, 3000);
    });

    ssh.on('error', (err) => {
        console.error('[Tunnel Error]:', err.message);
    });
}

startTunnel();
