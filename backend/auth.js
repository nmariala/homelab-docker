const crypto = require('crypto');

// Session: 8 jam, cookie name hl_session
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = 'hl_session';

// Rate limit sederhana: 5 percobaan gagal per 5 menit per IP
const RATE_MAX_FAILURES = 5;
const RATE_WINDOW_MS = 5 * 60 * 1000;

// In-memory store. Akan hilang saat Node.js restart.
const sessions = new Map();
const rateLimits = new Map();

function hasCredentialsConfigured() {
    return Boolean(
        process.env.DASHBOARD_USERNAME &&
        process.env.DASHBOARD_PASSWORD
    );
}

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));

    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
}

function verifyCredentials(username, password) {
    if (!hasCredentialsConfigured()) {
        return false;
    }

    const userOk = safeEqual(username, process.env.DASHBOARD_USERNAME);
    const passOk = safeEqual(password, process.env.DASHBOARD_PASSWORD);

    return userOk && passOk;
}

function createSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_TTL_MS;

    sessions.set(token, { username, expiresAt });

    return token;
}

function deleteSession(token) {
    sessions.delete(token);
}

function logout(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];

    if (token) {
        deleteSession(token);
    }
}

function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];

    if (!token) {
        return null;
    }

    const session = sessions.get(token);

    if (!session) {
        return null;
    }

    if (Date.now() >= session.expiresAt) {
        deleteSession(token);
        return null;
    }

    return session;
}

function parseCookies(header) {
    const cookies = {};

    if (!header) {
        return cookies;
    }

    for (const part of header.split(';')) {
        const idx = part.indexOf('=');

        if (idx === -1) {
            continue;
        }

        const name = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();

        if (name) {
            cookies[name] = value;
        }
    }

    return cookies;
}

function getSetCookie(token) {
    const secure = process.env.SESSION_COOKIE_SECURE === 'true';

    const parts = [
        `${SESSION_COOKIE}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    ];

    if (secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function getClearCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function checkRateLimit(ip) {
    const now = Date.now();
    const entry = rateLimits.get(ip);

    if (!entry || now >= entry.resetAt) {
        rateLimits.set(ip, {
            count: 0,
            resetAt: now + RATE_WINDOW_MS
        });

        return true;
    }

    return entry.count < RATE_MAX_FAILURES;
}

function recordFailure(ip) {
    const now = Date.now();
    const entry = rateLimits.get(ip);

    if (!entry || now >= entry.resetAt) {
        rateLimits.set(ip, {
            count: 1,
            resetAt: now + RATE_WINDOW_MS
        });

        return;
    }

    entry.count += 1;
}

function clearFailures(ip) {
    rateLimits.delete(ip);
}

function prune() {
    const now = Date.now();

    for (const [token, session] of sessions) {
        if (now >= session.expiresAt) {
            deleteSession(token);
        }
    }

    for (const [ip, entry] of rateLimits) {
        if (now >= entry.resetAt) {
            rateLimits.delete(ip);
        }
    }
}

setInterval(prune, 10 * 60 * 1000).unref();

module.exports = {
    SESSION_TTL_MS,
    verifyCredentials,
    createSession,
    logout,
    getSession,
    getSetCookie,
    getClearCookie,
    checkRateLimit,
    recordFailure,
    clearFailures
};