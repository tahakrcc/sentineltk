// ─── Email Scanner — Scan links inside Gmail/Outlook webmail ───

let isEnabled = true;

export function initEmailScanner() {
    chrome.storage.local.get('emailScanEnabled', (result) => {
        isEnabled = result.emailScanEnabled !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.emailScanEnabled) {
            isEnabled = changes.emailScanEnabled.newValue !== false;
        }
    });

    const host = window.location.hostname;
    const isEmailHost = host.includes('mail.google.com') || host.includes('outlook.live.com') || host.includes('outlook.office.com');
    if (!isEmailHost) return;

    console.log('[SentinelTK] Email Scanner initialized for', host);

    // Use MutationObserver to detect email content loading
    const observer = new MutationObserver(() => {
        if (!isEnabled) return;
        scanEmailLinks();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial scan after delay
    setTimeout(() => {
        if (isEnabled) scanEmailLinks();
    }, 3000);
}

const scannedLinks = new WeakSet<HTMLAnchorElement>();

function scanEmailLinks() {
    const links = document.querySelectorAll('a[href]');
    links.forEach((link) => {
        const anchor = link as HTMLAnchorElement;
        if (scannedLinks.has(anchor)) return;
        scannedLinks.add(anchor);

        const href = anchor.href;
        if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) return;

        let hostname: string;
        try {
            hostname = new URL(href).hostname;
        } catch { return; }

        // Skip known safe email domains
        const safeDomains = ['google.com', 'mail.google.com', 'accounts.google.com',
            'outlook.live.com', 'microsoft.com', 'office.com', 'googleapis.com'];
        if (safeDomains.some(d => hostname.includes(d))) return;

        // Query backend for score
        checkLinkScore(anchor, hostname);
    });
}

async function checkLinkScore(anchor: HTMLAnchorElement, hostname: string) {
    try {
        const res = await chrome.runtime.sendMessage({
            type: 'LINK_PREVIEW_SCORE',
            domain: hostname,
        });

        if (res?.score && res.score > 30) {
            injectBadge(anchor, res.score);
        }
    } catch {
        // Background unavailable
    }
}

function injectBadge(anchor: HTMLAnchorElement, score: number) {
    // Don't inject twice
    if (anchor.querySelector('[data-sentinel-email-badge]')) return;

    const badge = document.createElement('span');
    badge.setAttribute('data-sentinel-email-badge', '');
    const color = score > 69 ? '#ef4444' : '#f59e0b';
    const icon = score > 69 ? '🚨' : '⚠️';

    badge.style.cssText = `
        display: inline-flex; align-items: center; gap: 3px;
        font-size: 10px; padding: 1px 5px; border-radius: 4px;
        background: ${color}22; border: 1px solid ${color}44;
        color: ${color}; font-weight: 600; margin-left: 4px;
        cursor: help; vertical-align: middle;
    `;
    badge.textContent = `${icon} ${score}`;
    badge.title = `SentinelTK: Bu link ${score}/100 risk skoru aldı`;

    anchor.appendChild(badge);
}
