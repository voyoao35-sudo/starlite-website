const { TextDecoder } = require('util');
const utf8 = new TextDecoder('utf-8', { fatal: true });
const cp1251 = new TextDecoder('windows-1251');
const reverse = new Map();
for (let i = 0; i < 256; i++) reverse.set(cp1251.decode(Uint8Array.of(i)), i);
function damage(text) { return (text.match(/[РС][\u0080-\u04ff€™©®°±µ¶·]/g) || []).length; }
function repairActivityText(value) {
    let text = String(value || '');
    for (let attempt = 0; attempt < 3 && damage(text) >= 2; attempt++) {
        const bytes = [];
        for (const char of text) {
            if (!reverse.has(char)) return text;
            bytes.push(reverse.get(char));
        }
        let fixed;
        try { fixed = utf8.decode(Uint8Array.from(bytes)); } catch (_) { break; }
        if (damage(fixed) >= damage(text)) break;
        text = fixed;
    }
    return text;
}
module.exports = { repairActivityText };
