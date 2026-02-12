// ─── Link Hover Preview System ──────────────────────────────────
// Shows a rich tooltip when hovering over links with:
// - Destination URL with favicon
// - Risk score from backend
// - Favicon-based preview card (iframe as bonus)

import { BACKEND_URL } from '../shared/constants';

// ═══════════════════════════════════════════════════════════════
// CACHE & STATE
// ═══════════════════════════════════════════════════════════════

interface CachedScore {
    score: number;
    category: string;
    source: string;
    timestamp: number;
}

const scoreCache = new Map<string, CachedScore>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const HOVER_DELAY = 300; // ms before showing tooltip

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let currentTooltip: HTMLElement | null = null;
let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let isEnabled = true;

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

export function initLinkPreview() {
    // Check stored setting
    chrome.storage.local.get('linkPreviewEnabled', (result) => {
        isEnabled = result.linkPreviewEnabled !== false;
    });

    // Listen for setting changes in real-time
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.linkPreviewEnabled) {
            isEnabled = changes.linkPreviewEnabled.newValue !== false;
            if (!isEnabled) hideTooltip();
        }
    });

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('scroll', hideTooltip, { passive: true });
    console.log('[SentinelTK] Link Preview initialized');
}

// ═══════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

function onMouseOver(e: MouseEvent) {
    if (!isEnabled) return;

    const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
    }

    try {
        const linkUrl = new URL(href);
        const currentUrl = new URL(window.location.href);
        if (linkUrl.origin === currentUrl.origin && linkUrl.pathname === currentUrl.pathname) return;
    } catch { return; }

    if (hoverTimer) clearTimeout(hoverTimer);

    hoverTimer = setTimeout(() => {
        showTooltip(href, e);
    }, HOVER_DELAY);
}

function onMouseOut(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest('a[href]');
    if (!anchor) return;

    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (relatedTarget === shadowHost || shadowHost?.contains(relatedTarget))) {
        return;
    }

    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }

    setTimeout(() => {
        if (currentTooltip && !currentTooltip.matches(':hover') && !shadowHost?.matches(':hover')) {
            hideTooltip();
        }
    }, 200);
}

// ═══════════════════════════════════════════════════════════════
// TOOLTIP CREATION & POSITIONING
// ═══════════════════════════════════════════════════════════════

function ensureShadowHost(): ShadowRoot {
    if (shadowRoot) return shadowRoot;

    shadowHost = document.createElement('sentinel-link-preview');
    shadowHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getTooltipStyles();
    shadowRoot.appendChild(style);

    return shadowRoot;
}

function showTooltip(href: string, e: MouseEvent) {
    hideTooltip();
    const root = ensureShadowHost();

    let hostname = '';
    let pathname = '';
    let protocol = 'https';
    try {
        const url = new URL(href);
        hostname = url.hostname;
        pathname = url.pathname + url.search;
        protocol = url.protocol.replace(':', '');
        if (pathname.length > 60) pathname = pathname.substring(0, 57) + '...';
    } catch {
        hostname = href;
    }

    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
    const displayUrl = href.length > 55 ? href.substring(0, 52) + '...' : href;

    const tooltip = document.createElement('div');
    tooltip.className = 'stk-tooltip';
    tooltip.style.pointerEvents = 'auto';
    tooltip.innerHTML = `
        <div class="stk-header">
            <div class="stk-url-section">
                <img class="stk-favicon" src="${faviconUrl}" alt="" width="18" height="18" />
                <div class="stk-url-info">
                    <span class="stk-hostname">${escapeHtml(hostname)}</span>
                    <span class="stk-path">${escapeHtml(pathname || '/')}</span>
                </div>
            </div>
        </div>
        <div class="stk-preview-container">
            <div class="stk-preview-card">
                <img class="stk-preview-favicon-large" src="${faviconUrl}" alt="" />
                <div class="stk-preview-site-info">
                    <span class="stk-preview-site-name">${escapeHtml(hostname)}</span>
                    <span class="stk-preview-protocol">
                        <span class="stk-protocol-dot ${protocol === 'https' ? 'stk-dot-green' : 'stk-dot-red'}"></span>
                        ${protocol.toUpperCase()}
                    </span>
                </div>
                <div class="stk-preview-url-bar">${escapeHtml(displayUrl)}</div>
            </div>
        </div>
        <div class="stk-score-section">
            <div class="stk-score-loading">
                <div class="stk-spinner-small"></div>
                <span>Risk analizi yapılıyor...</span>
            </div>
        </div>
    `;

    root.appendChild(tooltip);
    currentTooltip = tooltip;
    positionTooltip(tooltip, e);

    tooltip.addEventListener('mouseleave', () => hideTooltip());

    // Try iframe in background (bonus — works for some sites)
    tryIframePreview(tooltip, href);

    // Fetch risk score
    fetchScore(tooltip, hostname);
}

function positionTooltip(tooltip: HTMLElement, e: MouseEvent) {
    const PAD = 12;
    const W = 320;
    const H = 300;

    let x = e.clientX + PAD;
    let y = e.clientY + PAD;

    if (x + W > window.innerWidth - PAD) x = e.clientX - W - PAD;
    if (y + H > window.innerHeight - PAD) y = e.clientY - H - PAD;
    x = Math.max(PAD, x);
    y = Math.max(PAD, y);

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function hideTooltip() {
    if (currentTooltip && shadowRoot) {
        currentTooltip.classList.add('stk-fade-out');
        const el = currentTooltip;
        setTimeout(() => el.remove(), 150);
        currentTooltip = null;
    }
}

// ═══════════════════════════════════════════════════════════════
// IFRAME PREVIEW (bonus — many sites block this)
// ═══════════════════════════════════════════════════════════════

function tryIframePreview(tooltip: HTMLElement, url: string) {
    const container = tooltip.querySelector('.stk-preview-container');
    if (!container) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'stk-iframe';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');

    // If iframe loads real content, show it over the card
    iframe.onload = () => {
        try {
            const doc = iframe.contentDocument;
            if (doc && doc.body && doc.body.children.length > 0) {
                // Same-origin with content — overlay iframe
                const card = container.querySelector('.stk-preview-card') as HTMLElement;
                if (card) card.style.display = 'none';
                iframe.style.opacity = '1';
            }
        } catch {
            // Cross-origin — can't check, keep card visible
        }
    };

    iframe.src = url;
    container.appendChild(iframe);
}

// ═══════════════════════════════════════════════════════════════
// RISK SCORE FETCH
// ═══════════════════════════════════════════════════════════════

async function fetchScore(tooltip: HTMLElement, hostname: string) {
    const scoreSection = tooltip.querySelector('.stk-score-section');
    if (!scoreSection) return;

    const cached = scoreCache.get(hostname);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        renderScore(scoreSection as HTMLElement, cached);
        return;
    }

    try {
        const res = await fetch(`${BACKEND_URL}/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: hostname }),
        });
        const data = await res.json();

        const result: CachedScore = {
            score: data.score || 0,
            category: data.category || 'unknown',
            source: data.source || 'unknown',
            timestamp: Date.now(),
        };

        scoreCache.set(hostname, result);
        renderScore(scoreSection as HTMLElement, result);
    } catch {
        scoreSection.innerHTML = `<div class="stk-score-error"><span>⚠️ Skor alınamadı</span></div>`;
    }
}

function renderScore(container: HTMLElement, data: CachedScore) {
    const { score, category } = data;
    let color = '#22c55e';
    let label = 'Güvenli';
    let icon = '✅';

    if (score > 69) {
        color = '#ef4444'; label = 'Tehlikeli'; icon = '🚨';
    } else if (score > 39) {
        color = '#f59e0b'; label = 'Şüpheli'; icon = '⚠️';
    }

    let catText = '';
    if (category === 'phishing') catText = '🎣 Bilinen phishing sitesi';
    else if (category === 'scam') catText = '🚫 Bilinen dolandırıcılık sitesi';
    else if (category === 'reported' || category === 'community_reported') catText = '🚩 Topluluk tarafından raporlanmış';

    container.innerHTML = `
        <div class="stk-score-result">
            <div class="stk-score-main">
                <span class="stk-score-icon">${icon}</span>
                <span class="stk-score-badge" style="color:${color}">Risk: ${score}/100</span>
                <span class="stk-score-label" style="color:${color}">${label}</span>
            </div>
            ${catText ? `<div class="stk-score-category">${catText}</div>` : ''}
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

function getTooltipStyles(): string {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }

        .stk-tooltip {
            position: fixed;
            width: 320px;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 20px rgba(99,102,241,0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #e5e7eb;
            font-size: 12px;
            overflow: hidden;
            animation: stk-fade-in 0.2s ease-out;
            z-index: 2147483647;
        }
        .stk-tooltip.stk-fade-out {
            animation: stk-fade-out 0.15s ease-in forwards;
        }
        @keyframes stk-fade-in {
            from { opacity: 0; transform: translateY(4px) scale(0.98); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes stk-fade-out {
            from { opacity: 1; }
            to   { opacity: 0; transform: scale(0.96); }
        }

        /* Header */
        .stk-header {
            padding: 10px 12px;
            border-bottom: 1px solid rgba(71, 85, 105, 0.3);
        }
        .stk-url-section {
            display: flex; align-items: center; gap: 8px;
        }
        .stk-favicon {
            border-radius: 4px; flex-shrink: 0;
        }
        .stk-url-info {
            display: flex; flex-direction: column; gap: 2px; min-width: 0;
        }
        .stk-hostname {
            font-weight: 700; font-size: 13px; color: #f1f5f9;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .stk-path {
            font-size: 11px; color: #64748b;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Preview Card */
        .stk-preview-container {
            position: relative;
            width: 100%;
            height: 140px;
            background: #0a0e1a;
            overflow: hidden;
        }
        .stk-preview-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 8px;
            padding: 16px;
            background: linear-gradient(135deg, #0f172a, #1a1040);
            position: relative;
            z-index: 1;
        }
        .stk-preview-favicon-large {
            width: 40px; height: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .stk-preview-site-info {
            display: flex; align-items: center; gap: 8px;
        }
        .stk-preview-site-name {
            font-size: 14px; font-weight: 700; color: #e2e8f0;
        }
        .stk-preview-protocol {
            font-size: 10px; color: #94a3b8;
            display: flex; align-items: center; gap: 4px;
            background: rgba(255,255,255,0.06);
            padding: 2px 6px; border-radius: 4px;
        }
        .stk-protocol-dot {
            width: 6px; height: 6px; border-radius: 50%;
        }
        .stk-dot-green { background: #22c55e; }
        .stk-dot-red { background: #ef4444; }
        .stk-preview-url-bar {
            font-size: 10px; color: #475569;
            background: rgba(255,255,255,0.04);
            padding: 4px 10px; border-radius: 4px;
            max-width: 100%;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Iframe overlay */
        .stk-iframe {
            position: absolute;
            top: 0; left: 0;
            width: 200%; height: 200%;
            border: none;
            transform: scale(0.5);
            transform-origin: top left;
            pointer-events: none;
            z-index: 2;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        /* Score */
        .stk-score-section {
            padding: 10px 12px;
            border-top: 1px solid rgba(71, 85, 105, 0.3);
        }
        .stk-score-loading {
            display: flex; align-items: center; gap: 8px;
            color: #64748b; font-size: 11px;
        }
        .stk-score-result { border-radius: 6px; }
        .stk-score-main {
            display: flex; align-items: center; gap: 8px;
        }
        .stk-score-icon { font-size: 16px; }
        .stk-score-badge { font-weight: 700; font-size: 13px; }
        .stk-score-label {
            font-size: 11px; font-weight: 600;
            padding: 2px 8px; border-radius: 4px;
            background: rgba(255,255,255,0.05);
        }
        .stk-score-category {
            margin-top: 6px; font-size: 11px; color: #94a3b8; padding-left: 24px;
        }
        .stk-score-error { color: #f59e0b; font-size: 11px; }

        /* Spinners */
        .stk-spinner-small {
            width: 14px; height: 14px;
            border: 2px solid #1e293b;
            border-top: 2px solid #6366f1;
            border-radius: 50%;
            animation: stk-spin 0.8s linear infinite;
        }
        @keyframes stk-spin { to { transform: rotate(360deg); } }
    `;
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
