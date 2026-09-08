const localtunnel = require('localtunnel');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const SUBDOMAIN = 'starlite-client';
const URL_FILE = path.join(__dirname, 'permanent_url.txt');

let tunnelInstance = null;
let isConnecting = false;

async function connectTunnel() {
    if (isConnecting) return;
    isConnecting = true;

    try {
        console.log(`[Permanent Tunnel] Connecting to localtunnel with subdomain: "${SUBDOMAIN}"...`);
        
        const tunnel = await localtunnel({
            port: PORT,
            subdomain: SUBDOMAIN
        });

        tunnelInstance = tunnel;
        isConnecting = false;

        fs.writeFileSync(URL_FILE, tunnel.url, 'utf8');

        console.log('\n======================================================');
        console.log(`  🌟 ПОСТОЯННАЯ ССЫЛКА НА САЙТ (НЕ ЗАКРЫВАЕТСЯ):`);
        console.log(`  👉 ${tunnel.url}`);
        console.log('======================================================\n');

        tunnel.on('close', () => {
            console.log('[Permanent Tunnel] Connection closed. Auto-reconnecting in 3 seconds...');
            tunnelInstance = null;
            setTimeout(connectTunnel, 3000);
        });

        tunnel.on('error', (err) => {
            console.error('[Permanent Tunnel Error]:', err.message);
            try { tunnel.close(); } catch (e) {}
            tunnelInstance = null;
            setTimeout(connectTunnel, 3000);
        });

    } catch (err) {
        console.error('[Permanent Tunnel Connect Failed]:', err.message);
        isConnecting = false;
        setTimeout(connectTunnel, 5000);
    }
}

// Keep-alive heartbeat every 10 seconds so tunnel never goes to sleep
setInterval(() => {
    if (tunnelInstance && tunnelInstance.url) {
        const req = https.get(`${tunnelInstance.url}/api/stats/public`, {
            headers: { 'Bypass-Tunnel-Reminder': 'true' }
        }, (res) => {
            res.resume();
        });
        req.on('error', () => {});
    }
}, 10000);

connectTunnel();
