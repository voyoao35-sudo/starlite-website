(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AccountState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const DAY = 86400000;
    function expiry(value) {
        if (value === 'lifetime') return value;
        if (typeof value !== 'number' && typeof value !== 'string') return 0;
        if (typeof value === 'string' && !value.trim()) return 0;
        let number = Number(value);
        if (!Number.isFinite(number)) number = typeof value === 'string' ? Date.parse(value) : 0;
        if (!Number.isFinite(number) || number <= 0) return 0;
        // Older records may contain Unix seconds instead of JavaScript milliseconds.
        if (number < 100000000000) number *= 1000;
        return number <= 8640000000000000 ? number : 0;
    }
    function subscription(sub, now = Date.now()) {
        sub = sub || {};
        const expiresAt = expiry(sub.expiresAt);
        const active = Boolean(sub.active) && (expiresAt === 'lifetime' || expiresAt > now);
        return { active, type: sub.type || null, expiresAt,
            remainingDays: active ? (expiresAt === 'lifetime' ? null : Math.ceil((expiresAt - now) / DAY)) : 0 };
    }
    return { expiry, subscription };
});
