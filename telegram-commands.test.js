'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('./netlify/functions/telegram-commands');
const key = 'c'.repeat(64);
function event(text, from = 123, chat = 123) {
    return { httpMethod: 'POST', headers: { 'x-telegram-bot-api-secret-token': key },
        body: JSON.stringify({ update_id: 1, message: { from: { id: from }, chat: { id: chat, type: 'private' }, text } }) };
}
function fixture() {
    const sent = [];
    const handle = createHandler({ STARLITE_TELEGRAM_RELAY_KEY: key, STARLITE_TELEGRAM_CHAT_ID: '123', STARLITE_TELEGRAM_TOKEN: 'test-token' },
        async (url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true }) }; });
    return { handle, sent };
}
test('owner gets help, status and honest unavailable online response', async () => {
    const { handle, sent } = fixture();
    for (const command of ['/help','/start','/status','/online','/HELP@Starlitelogs_bot','/unknown']) assert.equal((await handle(event(command))).statusCode, 200);
    assert.match(sent[0].text,/\/online/);
    assert.match(sent[2].text,/пока не подтверждена/);
    assert.match(sent[3].text,/не означает.*нулю/);
    assert.match(sent[5].text,/Неизвестная/);
    assert.ok(sent.every(item => item.chat_id === '123'));
});
test('forged webhook, nonowner, groups and ordinary messages cause no replies', async () => {
    const { handle, sent } = fixture();
    assert.equal((await handle({ ...event('/help'), headers: {} })).statusCode,401);
    assert.equal((await handle({ ...event('/help'), headers: { 'x-telegram-bot-api-secret-token': 'd'.repeat(64) } })).statusCode,401);
    for (const input of [event('/help',456),event('/help',123,456),event('hello'),{ ...event('/help'),body:'null' }]) assert.equal((await handle(input)).statusCode,200);
    assert.equal(sent.length,0);
});
test('Telegram failures are retriable and reveal no token', async () => {
    const handle = createHandler({ STARLITE_TELEGRAM_RELAY_KEY:key,STARLITE_TELEGRAM_CHAT_ID:'123',STARLITE_TELEGRAM_TOKEN:'private-token' }, async () => { throw new Error('private-token'); });
    const result=await handle(event('/help'));
    assert.equal(result.statusCode,502);
    assert.ok(!result.body.includes('private-token'));
});
