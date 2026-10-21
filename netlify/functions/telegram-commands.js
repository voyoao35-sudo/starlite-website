'use strict';
const crypto = require('node:crypto');
const reply = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
const help = 'Starlite · команды\n/help — список команд\n/status — состояние обработчика бота\n/online — доступность списка активных сессий';

function createHandler(env = process.env, fetchImpl = globalThis.fetch) {
    return async event => {
        if (event.httpMethod !== 'POST') return reply(405, { ok: false });
        const key = env.STARLITE_TELEGRAM_RELAY_KEY;
        const owner = env.STARLITE_TELEGRAM_CHAT_ID;
        if (!/^[a-f0-9]{64}$/.test(key || '') || !/^\d+$/.test(owner || '') || !env.STARLITE_TELEGRAM_TOKEN) return reply(503, { ok: false });
        const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(),v]));
        const secret = headers['x-telegram-bot-api-secret-token'];
        if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret) || !crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(key))) return reply(401, { ok: false });
        if (event.isBase64Encoded || typeof event.body !== 'string' || Buffer.byteLength(event.body) > 16384) return reply(400, { ok: false });
        let update;
        try { update = JSON.parse(event.body); } catch { return reply(400, { ok: false }); }
        const message = update?.message;
        if (!message || String(message.from?.id) !== owner || String(message.chat?.id) !== owner || message.chat?.type !== 'private' || typeof message.text !== 'string') return reply(200, { ok: true });
        const command = /^\/(\w+)(?:@Starlitelogs_bot)?(?:\s|$)/i.exec(message.text.trim())?.[1]?.toLowerCase();
        if (!command) return reply(200, { ok: true });
        const text = command === 'start' || command === 'help' ? help
            : command === 'status' ? 'Starlite · статус\nОбработчик команд на Netlify работает.\nПриём уведомлений готов. Автоматические события лаунчера ещё требуют обновления сервера Starlite; их работа пока не подтверждена.'
            : command === 'online' ? 'Starlite · онлайн\nПолучение активных сессий ещё не подключено: требуется обновление сервера Starlite.\nЭто не означает, что онлайн равен нулю.'
            : 'Неизвестная команда. Доступные команды: /help, /status, /online.';
        try {
            const response = await fetchImpl(`https://api.telegram.org/bot${env.STARLITE_TELEGRAM_TOKEN}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: owner, text }), signal: AbortSignal.timeout(10000)
            });
            const result = await response.json();
            return reply(response.ok && result.ok ? 200 : 502, { ok: !!(response.ok && result.ok) });
        } catch { return reply(502, { ok: false }); }
    };
}
exports.handler = createHandler();
exports.createHandler = createHandler;
