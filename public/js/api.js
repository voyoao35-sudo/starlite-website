// Starlite API Client
const API_BASE = '/api';

class ApiClient {
    constructor() {
        this.token = localStorage.getItem('starlite_token') || null;
        this.user = null;
    }

    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('starlite_token', token);
        } else {
            localStorage.removeItem('starlite_token');
        }
    }

    async request(endpoint, options) {
        options = options || {};
        const headers = Object.assign({
            'Content-Type': 'application/json'
        }, options.headers || {});

        if (this.token) {
            headers['Authorization'] = 'Bearer ' + this.token;
        }

        try {
            const res = await fetch(API_BASE + endpoint, Object.assign({}, options, { headers: headers }));
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Ошибка запроса к серверу');
            }
            return data;
        } catch (err) {
            if (err.message && err.message.indexOf('Недействительный токен') !== -1) {
                this.setToken(null);
                window.location.reload();
            }
            throw err;
        }
    }

    // Auth
    async login(username, password) {
        const data = await this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: username, password: password })
        });
        this.setToken(data.token);
        this.user = data.user;
        return data;
    }

    async register(username, password, confirmPassword, email) {
        const data = await this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, confirmPassword, email })
        });
        this.setToken(data.token);
        this.user = data.user;
        return data;
    }

    async getMe() {
        if (!this.token) return null;
        try {
            const data = await this.request('/user/me');
            this.user = data.user;
            return data.user;
        } catch (e) {
            this.setToken(null);
            this.user = null;
            return null;
        }
    }

    async logout() {
        if (this.token) {
            try {
                await this.request('/auth/logout', { method: 'POST' });
            } catch (e) {}
        }
        this.setToken(null);
        this.user = null;
    }

    // User Operations
    async resetHwid() {
        const data = await this.request('/user/reset-hwid', { method: 'POST' });
        this.user = data.user;
        return data;
    }

    async redeemKey(key) {
        const data = await this.request('/user/redeem-key', {
            method: 'POST',
            body: JSON.stringify({ key: key })
        });
        this.user = data.user;
        return data;
    }

    async updateProfile(updates) {
        const data = await this.request('/user/profile', {
            method: 'POST',
            body: JSON.stringify(updates)
        });
        this.user = data.user;
        return data;
    }

    async uploadAvatar(avatarBase64) {
        const data = await this.request('/user/avatar', {
            method: 'POST',
            body: JSON.stringify({ avatarBase64 })
        });
        this.user = data.user;
        return data;
    }

    // Promo & Checkout
    async validatePromo(code, plan) {
        return await this.request('/promo/validate', {
            method: 'POST',
            body: JSON.stringify({ code: code, plan: plan })
        });
    }

    async createOrder(plan, promoCode, method) {
        return await this.request('/payment/create-order', {
            method: 'POST',
            body: JSON.stringify({ plan: plan, promoCode: promoCode, method: method })
        });
    }

    // Media
    async getMediaStats() {
        return await this.request('/media/stats');
    }

    // Public
    async getPublicStats() {
        return await this.request('/stats/public');
    }

    // Admin
    async adminGetStats() {
        return await this.request('/admin/stats');
    }

    async adminGetUsers() {
        return await this.request('/admin/users');
    }

    async adminGetKeys() {
        return await this.request('/admin/keys');
    }

    async adminGenerateKeys(count, duration, note) {
        return await this.request('/admin/keys/generate', {
            method: 'POST',
            body: JSON.stringify({ count: count, duration: duration, note: note })
        });
    }

    async adminDeleteKey(id) {
        return await this.request('/admin/keys/' + encodeURIComponent(id), { method: 'DELETE' });
    }

    async adminSetSubscription(uid, type, days) {
        return await this.request('/admin/users/' + encodeURIComponent(uid) + '/subscription', {
            method: 'POST',
            body: JSON.stringify({ type: type, days: days })
        });
    }

    async adminResetHwid(uid) {
        return await this.request('/admin/users/' + encodeURIComponent(uid) + '/reset-hwid', { method: 'POST' });
    }

    async adminToggleBan(uid, reason) {
        return await this.request('/admin/users/' + encodeURIComponent(uid) + '/ban', {
            method: 'POST',
            body: JSON.stringify({ reason: reason })
        });
    }

    async adminChangeRole(uid, role) {
        return await this.request('/admin/users/' + encodeURIComponent(uid) + '/role', {
            method: 'POST',
            body: JSON.stringify({ role: role })
        });
    }

    async adminGetPromos() {
        return await this.request('/admin/promos');
    }

    async adminCreatePromo(promoData) {
        return await this.request('/admin/promos/create', {
            method: 'POST',
            body: JSON.stringify(promoData)
        });
    }

    async adminDeletePromo(code) {
        return await this.request('/admin/promos/' + encodeURIComponent(code), { method: 'DELETE' });
    }
}

window.api = new ApiClient();
