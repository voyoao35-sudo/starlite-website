'use strict';
const crypto = require('node:crypto');

const noticePattern = /^Starlite · запуск клиента\nUID: \d{1,12}\nЛогин: [^\r\n]{1,64}\nВерсия: (?:1\.16\.5|1\.21\.11)\nВремя \(UTC\): [0-9T:.Z-]{20,30}\nСессия: [a-f0-9]{32}\nПользователь подтвердил журнал запусков\.$/u;
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

function createHandler(env = process.env, fetchImpl = globalThis.fetch, now = Date.now) {
    return async event => {
        if (event.httpMethod !== 'POST') return reply(405, { ok: false });
        const key = env.STARLITE_TELEGRAM_RELAY_KEY;
        if (!/^[a-f0-9]{64}$/.test(key || '') || !env.STARLITE_TELEGRAM_TOKEN || !/^\d+$/.test(env.STARLITE_TELEGRAM_CHAT_ID || '')) return reply(503, { ok: false });
        if (event.isBase64Encoded || typeof event.body !== 'string' || Buffer.byteLength(event.body) > 2048) return reply(400, { ok: false });
        const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
        const timestamp = headers['x-starlite-time'];
        const signature = headers['x-starlite-signature'];
        if (!/^\d{13}$/.test(timestamp || '') || Math.abs(now() - Number(timestamp)) > 60000 || !/^[a-f0-9]{64}$/.test(signature || '')) return reply(401, { ok: false });
        const expected = crypto.createHmac('sha256', key).update(timestamp + '\n' + event.body).digest();
        if (!crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return reply(401, { ok: false });
        let payload;
        try { payload = JSON.parse(event.body); } catch { return reply(400, { ok: false }); }
        if (!payload || typeof payload.text !== 'string' || Object.keys(payload).some(k => k !== 'text') || !noticePattern.test(payload.text)) return reply(400, { ok: false });
        try {
            const response = await fetchImpl(`https://api.telegram.org/bot${env.STARLITE_TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: env.STARLITE_TELEGRAM_CHAT_ID, text: payload.text }),
                signal: AbortSignal.timeout(10000)
            });
            const result = await response.json();
            if (!response.ok || !result.ok) return reply(502, { ok: false });
            return reply(200, { ok: true, result: { message_id: result.result.message_id } });
        } catch { return reply(502, { ok: false }); }
    };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
