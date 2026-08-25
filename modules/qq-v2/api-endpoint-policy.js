const QQV2_INVALID_ENDPOINT_MESSAGE = 'QQ API 地址必须是有效的 HTTPS 地址，或本机/局域网 HTTP 地址';

function parseIpv4(hostname) {
    const parts = String(hostname ?? '').split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;

    const octets = parts.map(Number);
    return octets.some((octet) => octet > 255) ? null : octets;
}

function isAllowedHttpHost(hostname) {
    const normalized = String(hostname ?? '').toLowerCase();
    if (normalized === 'localhost' || normalized === '[::1]' || normalized === '::1') return true;

    const ipv4 = parseIpv4(normalized);
    if (!ipv4) return false;

    const [first, second] = ipv4;
    return first === 127
        || first === 10
        || (first === 172 && second >= 16 && second <= 31)
        || (first === 192 && second === 168);
}

function invalidEndpointError() {
    const error = new Error(QQV2_INVALID_ENDPOINT_MESSAGE);
    error.code = 'invalid_endpoint';
    return error;
}

/**
 * Normalize an OpenAI-compatible API base URL for SillyTavern's backend.
 * HTTP is limited to loopback and RFC1918 private IPv4 addresses.
 */
export function normalizeQQV2OpenAIBaseUrl(value) {
    let url;
    try {
        url = new URL(String(value ?? '').trim());
    } catch {
        throw invalidEndpointError();
    }

    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw invalidEndpointError();
    }
    if (url.protocol === 'http:' && !isAllowedHttpHost(url.hostname)) {
        throw invalidEndpointError();
    }

    let pathname = url.pathname.replace(/\/+$/, '');
    if (/\/(?:chat\/completions|models)$/i.test(pathname)) {
        pathname = pathname.replace(/\/(?:chat\/completions|models)$/i, '');
    }
    if (!/\/v\d+$/i.test(pathname)) pathname = `${pathname}/v1`;
    url.pathname = pathname.replace(/\/{2,}/g, '/');
    return url.toString().replace(/\/$/, '');
}
