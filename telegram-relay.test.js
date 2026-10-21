'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHandler } = require('./netlify/functions/telegram-relay');
const { createTelegram, loadTelegramConfig, startTelegramPolling } = require('./launch-audit');
const key = 'a'.repeat(64), time = 1800000000000;
const url = 'https://starlite-client.netlify.app/.netlify/functions/telegram-relay';
const text = 'Starlite · запуск клиента\nUID: 42\nЛогин: Test42\nВерсия: 1.21.11\nВремя (UTC): 2026-10-21T15:00:00.000Z\nСессия: ' + 'b'.repeat(32) + '\nПользователь подтвердил журнал запусков.';
function event(payload = { text }, timestamp = time) {
    const body = JSON.stringify(payload);
    return { httpMethod: 'POST', body, headers: { 'x-starlite-time': String(timestamp),
        'x-starlite-signature': crypto.createHmac('sha256', key).update(timestamp + '\n' + body).digest('hex') } };
}
function fixture() {
    const calls = [];
    const handle = createHandler({ STARLITE_TELEGRAM_RELAY_KEY: key, STARLITE_TELEGRAM_TOKEN: 'fixture-token', STARLITE_TELEGRAM_CHAT_ID: '123' },
        async (url, request) => { calls.push({ url, payload: JSON.parse(request.body) }); return { ok: true, json: async () => ({ ok: true, result: { message_id: 7 } }) }; }, () => time);
    return { handle, calls };
}
test('signed relay delivers minimal consent notice to fixed owner only', async () => {
    const { handle, calls } = fixture();
    assert.equal((await handle(event())).statusCode, 200);
    assert.deepEqual(calls[0].payload, { chat_id: '123', text });
});
test('unsigned, tampered, stale, oversized and expanded payloads never reach Telegram', async () => {
    const { handle, calls } = fixture();
    for (const invalid of [ { ...event(), headers: {} }, { ...event(), body: JSON.stringify({ text: text + 'x' }) },
        event({ text }, time - 61000), event({ text, chat_id: '456' }), event({ text: 'arbitrary message' }),
        event({ text: 'x'.repeat(3000) }), { ...event(), httpMethod: 'GET' } ]) {
        assert.ok((await handle(invalid)).statusCode >= 400);
    }
    assert.equal(calls.length, 0);
});
test('backend uses signed relay without disclosing token or enabling polling', async () => {
    const config = loadTelegramConfig('.', { STARLITE_TELEGRAM_RELAY_URL: url, STARLITE_TELEGRAM_RELAY_KEY: key });
    const { handle, calls } = fixture();
    const relay = createTelegram(config, async (destination, request) => {
        assert.equal(destination, url);
        assert.deepEqual(Object.keys(JSON.parse(request.body)), ['text']);
        const liveHandle = createHandler({ STARLITE_TELEGRAM_RELAY_KEY: key, STARLITE_TELEGRAM_TOKEN: 'fixture-token', STARLITE_TELEGRAM_CHAT_ID: '123' },
            async () => ({ ok: true, json: async () => ({ ok: true, result: { message_id: 7 } }) }));
        const result = await liveHandle({ httpMethod: 'POST', headers: request.headers, body: request.body });
        return { ok: result.statusCode === 200, json: async () => JSON.parse(result.body) };
    });
    assert.equal((await relay.call('sendMessage', { text, reply_markup: {} })).message_id, 7);
    await assert.rejects(relay.call('getUpdates', {}));
    startTelegramPolling(relay, {})();
    assert.equal(loadTelegramConfig('.', { STARLITE_TELEGRAM_RELAY_URL: 'https://example.com', STARLITE_TELEGRAM_RELAY_KEY: key }), null);
});
