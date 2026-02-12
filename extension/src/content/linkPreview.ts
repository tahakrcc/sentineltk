// ─── Link Hover Preview System ──────────────────────────────────
// Shows a rich tooltip when hovering over links with:
// - Destination URL
// - Risk score from backend
// - Live iframe preview of the target page

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

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════

export function initLinkPreview() {
    // Use event delegation on document for efficiency
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    // Also clean up if user scrolls
    document.addEventListener('scroll', hideTooltip, { passive: true });
    console.log('[SentinelTK] Link Preview initialized');
}

// ═══════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

function onMouseOver(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.href;
    if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
    }

    // Don't show tooltip for same-page anchors
    try {
        const linkUrl = new URL(href);
        const currentUrl = new URL(window.location.href);
        if (linkUrl.origin === currentUrl.origin && linkUrl.pathname === currentUrl.pathname) {
            return;
        }
    } catch { return; }

    // Clear any pending timer
    if (hoverTimer) clearTimeout(hoverTimer);

    // Debounce: wait 300ms before showing
    hoverTimer = setTimeout(() => {
        showTooltip(anchor, href, e);
    }, HOVER_DELAY);
}

function onMouseOut(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest('a[href]');
    if (!anchor) return;

    // Check if moving to tooltip itself
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (relatedTarget === shadowHost || shadowHost?.contains(relatedTarget))) {
        return;
    }

    if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }

    // Delay hiding so user can move to tooltip
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

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getTooltipStyles();
    shadowRoot.appendChild(style);

    return shadowRoot;
}

function showTooltip(_anchor: HTMLAnchorElement, href: string, e: MouseEvent) {
    hideTooltip();
    const root = ensureShadowHost();

    let hostname = '';
    let pathname = '';
    let fullUrl = href;
    try {
        const url = new URL(href);
        hostname = url.hostname;
        pathname = url.pathname + url.search;
        if (pathname.length > 60) pathname = pathname.substring(0, 57) + '...';
    } catch {
        hostname = href;
    }

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'stk-tooltip';
    tooltip.style.pointerEvents = 'auto';
    tooltip.innerHTML = `
        <div class="stk-header">
            <div class="stk-url-section">
                <span class="stk-icon">🔗</span>
                <div class="stk-url-info">
                    <span class="stk-hostname">${escapeHtml(hostname)}</span>
                    <span class="stk-path">${escapeHtml(pathname || '/')}</span>
                </div>
            </div>
        </div>
        <div class="stk-preview-container">
            <div class="stk-preview-loading">
                <div class="stk-spinner"></div>
                <span>Yükleniyor...</span>
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

    // Position tooltip
    positionTooltip(tooltip, e);

    // Keep tooltip visible on hover
    tooltip.addEventListener('mouseleave', () => {
        hideTooltip();
    });

    // Load preview iframe
    loadPreview(tooltip, fullUrl);

    // Fetch risk score
    fetchScore(tooltip, hostname);
}

function positionTooltip(tooltip: HTMLElement, e: MouseEvent) {
    const PADDING = 12;
    const TOOLTIP_WIDTH = 320;
    const TOOLTIP_MAX_HEIGHT = 340;

    let x = e.clientX + PADDING;
    let y = e.clientY + PADDING;

    // Check right edge
    if (x + TOOLTIP_WIDTH > window.innerWidth - PADDING) {
        x = e.clientX - TOOLTIP_WIDTH - PADDING;
    }
    // Check bottom edge
    if (y + TOOLTIP_MAX_HEIGHT > window.innerHeight - PADDING) {
        y = e.clientY - TOOLTIP_MAX_HEIGHT - PADDING;
    }
    // Ensure minimum bounds
    x = Math.max(PADDING, x);
    y = Math.max(PADDING, y);

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}

function hideTooltip() {
    if (currentTooltip && shadowRoot) {
        currentTooltip.classList.add('stk-fade-out');
        const el = currentTooltip;
        setTimeout(() => {
            el.remove();
        }, 150);
        currentTooltip = null;
    }
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW IFRAME
// ═══════════════════════════════════════════════════════════════

function loadPreview(tooltip: HTMLElement, url: string) {
    const container = tooltip.querySelector('.stk-preview-container');
    if (!container) return;

    const iframe = document.createElement('iframe');
    iframe.className = 'stk-iframe';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer');

    let loaded = false;
    const timeout = setTimeout(() => {
        if (!loaded) {
            showPreviewFallback(container as HTMLElement, url);
        }
    }, 4000);

    iframe.onload = () => {
        loaded = true;
        clearTimeout(timeout);
        const loadingEl = container.querySelector('.stk-preview-loading');
        if (loadingEl) loadingEl.remove();
    };

    iframe.onerror = () => {
        loaded = true;
        clearTimeout(timeout);
        showPreviewFallback(container as HTMLElement, url);
    };

    iframe.src = url;

    // Hide loading, show iframe
    container.appendChild(iframe);
}

function showPreviewFallback(container: HTMLElement, _url: string) {
    container.innerHTML = `
        <div class="stk-preview-fallback">
            <span class="stk-fallback-icon">🌐</span>
            <span class="stk-fallback-text">Önizleme mevcut değil</span>
            <span class="stk-fallback-hint">Bu site iframe yüklemeyi engelliyor</span>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════
// RISK SCORE FETCH
// ═══════════════════════════════════════════════════════════════

async function fetchScore(tooltip: HTMLElement, hostname: string) {
    const scoreSection = tooltip.querySelector('.stk-score-section');
    if (!scoreSection) return;

    // Check cache first
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
        scoreSection.innerHTML = `
            <div class="stk-score-error">
                <span>⚠️ Skor alınamadı</span>
            </div>
        `;
    }
}

function renderScore(container: HTMLElement, data: CachedScore) {
    const { score, category } = data;
    let color = '#22c55e';
    let label = 'Güvenli';
    let icon = '✅';
    let bgClass = 'stk-score-safe';

    if (score > 69) {
        color = '#ef4444'; label = 'Tehlikeli'; icon = '🚨'; bgClass = 'stk-score-danger';
    } else if (score > 39) {
        color = '#f59e0b'; label = 'Şüpheli'; icon = '⚠️'; bgClass = 'stk-score-warning';
    }

    let categoryText = '';
    if (category === 'phishing') categoryText = '🎣 Bilinen phishing sitesi';
    else if (category === 'scam') categoryText = '🚫 Bilinen dolandırıcılık sitesi';
    else if (category === 'reported') categoryText = '🚩 Topluluk tarafından raporlanmış';
    else if (category === 'community_reported') categoryText = '🚩 Çok sayıda rapor';
    else categoryText = '';

    container.innerHTML = `
        <div class="stk-score-result ${bgClass}">
            <div class="stk-score-main">
                <span class="stk-score-icon">${icon}</span>
                <span class="stk-score-badge" style="color:${color}">
                    Risk: ${score}/100
                </span>
                <span class="stk-score-label" style="color:${color}">${label}</span>
            </div>
            ${categoryText ? `<div class="stk-score-category">${categoryText}</div>` : ''}
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
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 0; transform: scale(0.96); }
        }

        /* ── Header ── */
        .stk-header {
            padding: 10px 12px;
            border-bottom: 1px solid rgba(71, 85, 105, 0.3);
        }

        .stk-url-section {
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .stk-icon {
            font-size: 14px;
            margin-top: 1px;
        }

        .stk-url-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }

        .stk-hostname {
            font-weight: 700;
            font-size: 13px;
            color: #f1f5f9;
            word-break: break-all;
        }

        .stk-path {
            font-size: 11px;
            color: #64748b;
            word-break: break-all;
            line-height: 1.3;
        }

        /* ── Preview ── */
        .stk-preview-container {
            position: relative;
            width: 100%;
            height: 180px;
            background: #0a0e1a;
            overflow: hidden;
        }

        .stk-iframe {
            width: 200%;
            height: 200%;
            border: none;
            transform: scale(0.5);
            transform-origin: top left;
            pointer-events: none;
        }

        .stk-preview-loading {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: #64748b;
            font-size: 11px;
            background: #0a0e1a;
        }

        .stk-preview-fallback {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            gap: 6px;
            color: #475569;
        }

        .stk-fallback-icon { font-size: 28px; opacity: 0.5; }
        .stk-fallback-text { font-size: 12px; font-weight: 600; color: #64748b; }
        .stk-fallback-hint { font-size: 10px; color: #475569; }

        /* ── Score ── */
        .stk-score-section {
            padding: 10px 12px;
            border-top: 1px solid rgba(71, 85, 105, 0.3);
        }

        .stk-score-loading {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #64748b;
            font-size: 11px;
        }

        .stk-score-result { border-radius: 6px; }

        .stk-score-main {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .stk-score-icon { font-size: 16px; }

        .stk-score-badge {
            font-weight: 700;
            font-size: 13px;
        }

        .stk-score-label {
            font-size: 11px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(255,255,255,0.05);
        }

        .stk-score-category {
            margin-top: 6px;
            font-size: 11px;
            color: #94a3b8;
            padding-left: 24px;
        }

        .stk-score-error {
            color: #f59e0b;
            font-size: 11px;
        }

        /* ── Spinners ── */
        .stk-spinner {
            width: 20px; height: 20px;
            border: 2px solid #1e293b;
            border-top: 2px solid #6366f1;
            border-radius: 50%;
            animation: stk-spin 0.8s linear infinite;
        }

        .stk-spinner-small {
            width: 14px; height: 14px;
            border: 2px solid #1e293b;
            border-top: 2px solid #6366f1;
            border-radius: 50%;
            animation: stk-spin 0.8s linear infinite;
        }

        @keyframes stk-spin {
            to { transform: rotate(360deg); }
        }
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
