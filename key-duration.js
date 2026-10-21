'use strict';
function parseKeyDuration(value) {
    if (value === 'lifetime') return { duration: 'lifetime', days: null };
    if (typeof value !== 'string' || !/^[1-9]\d{0,4}d$/.test(value)) throw new Error('Срок ключа: от 1 до 36500 дней');
    const days = Number(value.slice(0, -1));
    if (days > 36500) throw new Error('Срок ключа: от 1 до 36500 дней');
    return { duration: `${days}d`, days };
}
module.exports = { parseKeyDuration };
