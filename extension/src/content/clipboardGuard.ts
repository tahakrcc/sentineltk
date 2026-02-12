// ─── Clipboard Guard — Link Safety Check on Copy ──────────────
// Checks if copied text contains a URL and queries the backend for risk

import { BACKEND_URL } from '../shared/constants';

let toastEl: HTMLElement | null = null;
let isEnabled = true;

export function initClipboardGuard() {
    chrome.storage.local.get('clipboardGuardEnabled', (result) => {
        isEnabled = result.clipboardGuardEnabled !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.clipboardGuardEnabled) {
            isEnabled = changes.clipboardGuardEnabled.newValue !== false;
        }
    });

    document.addEventListener('copy', onCopy);
    console.log('[SentinelTK] Clipboard Guard initialized');
}

function onCopy() {
    if (!isEnabled) return;

    // Small delay to let the clipboard populate
    setTimeout(async () => {
        try {
            const text = window.getSelection()?.toString()?.trim() || '';
            if (!text) return;

            // Check if the copied text looks like a URL
            const urlMatch = text.match(/https?:\/\/[^\s]+/i);
            if (!urlMatch) return;

            const url = urlMatch[0];
            let hostname: string;
            try {
                hostname = new URL(url).hostname;
            } catch { return; }

            // Don't check the current page's own domain
            if (hostname === window.location.hostname) return;

            // Query backend
            const res = await fetch(`${BACKEND_URL}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: hostname }),
            });
            const data = await res.json();

            if (data.score && data.score > 30) {
                showClipboardToast(hostname, data.score);
            }
        } catch {
            // Silently fail — clipboard access may be blocked
        }
    }, 100);
}

function showClipboardToast(hostname: string, score: number) {
    if (toastEl) toastEl.remove();

    toastEl = document.createElement('div');
    toastEl.setAttribute('data-sentinel-clipboard', '');
    const color = score > 69 ? '#ef4444' : '#f59e0b';
    const label = score > 69 ? '🚨 Tehlikeli' : '⚠️ Şüpheli';

    toastEl.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        background: linear-gradient(135deg, #1e1b4b, #0f172a); color: #e5e7eb;
        padding: 12px 18px; border-radius: 12px; font-family: system-ui, sans-serif;
        font-size: 13px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        border-left: 4px solid ${color}; display: flex; align-items: center; gap: 10px;
        animation: stk-slideIn 0.3s ease-out;
        max-width: 360px;
    `;

    toastEl.innerHTML = `
        <div>
            <div style="font-weight:700;color:${color};margin-bottom:2px">${label} Link Kopyalandı</div>
            <div style="font-size:11px;color:#94a3b8">${hostname} — Risk: ${score}/100</div>
        </div>
        <span style="cursor:pointer;font-size:18px;color:#6b7280;margin-left:auto" data-close>✕</span>
    `;

    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `@keyframes stk-slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);

    document.body.appendChild(toastEl);

    toastEl.querySelector('[data-close]')?.addEventListener('click', () => {
        toastEl?.remove();
        toastEl = null;
    });

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        toastEl?.remove();
        toastEl = null;
    }, 5000);
}
