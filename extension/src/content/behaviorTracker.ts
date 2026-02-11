// ─── Behavior Tracker ───────────────────────────────────────────
import { COOKIE_CONSENT_PATTERNS } from '../shared/constants';

export interface BehaviorSignals {
    hasRightClickBlock: boolean;
    hasFocusTrap: boolean;
    hasPopupSpam: boolean;
    hasScrollLock: boolean;
    hasPasteBlock: boolean;
}

/**
 * Monitors page for scam-like behavioral patterns.
 * Runs once after DOM settles and returns accumulated signals.
 */
export function detectBehavioralSignals(): BehaviorSignals {
    const signals: BehaviorSignals = {
        hasRightClickBlock: false,
        hasFocusTrap: false,
        hasPopupSpam: false,
        hasScrollLock: false,
        hasPasteBlock: false,
    };

    // 1. Right-click blocking
    try {
        const bodyAttrs = document.body?.getAttribute('oncontextmenu') || '';
        if (bodyAttrs.includes('return false') || bodyAttrs.includes('preventDefault')) {
            signals.hasRightClickBlock = true;
        }
        const scripts = document.querySelectorAll('script:not([src])');
        scripts.forEach(s => {
            const code = s.textContent || '';
            if (code.includes('contextmenu') && (code.includes('preventDefault') || code.includes('return false'))) {
                signals.hasRightClickBlock = true;
            }
        });
    } catch { /* ignore */ }

    // Fix #3: Focus trap detection — only flag aggressive patterns, not normal beforeunload
    try {
        const scripts = document.querySelectorAll('script:not([src])');
        scripts.forEach(s => {
            const code = s.textContent || '';
            if (code.includes('onbeforeunload') || code.includes('beforeunload')) {
                // Only flag if it's aggressive (not a simple "unsaved changes" dialog)
                const isAggressive =
                    (code.includes('history.pushState') && code.includes('popstate')) || // Back button hijacking
                    (code.includes('window.open') && code.includes('beforeunload')) ||   // Open popup on leave
                    code.includes('location.href') && code.includes('beforeunload');     // Redirect on leave
                if (isAggressive) {
                    signals.hasFocusTrap = true;
                }
            }
        });
    } catch { /* ignore */ }

    // 3. Popup spam (multiple window.open calls in scripts)
    try {
        const scripts = document.querySelectorAll('script:not([src])');
        let windowOpenCount = 0;
        scripts.forEach(s => {
            const code = s.textContent || '';
            const matches = code.match(/window\.open/g);
            if (matches) windowOpenCount += matches.length;
        });
        if (windowOpenCount >= 2) {
            signals.hasPopupSpam = true;
        }
    } catch { /* ignore */ }

    // Fix #2: Scroll lock — exclude cookie consent / KVKK banners
    try {
        const bodyStyle = window.getComputedStyle(document.body);
        const htmlStyle = window.getComputedStyle(document.documentElement);
        if (bodyStyle.overflow === 'hidden' || htmlStyle.overflow === 'hidden') {
            const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
            let isCookieConsent = false;

            overlays.forEach(overlay => {
                const el = overlay as HTMLElement;
                const combined = (el.id + ' ' + el.className + ' ' + el.getAttribute('aria-label')).toLowerCase();
                if (COOKIE_CONSENT_PATTERNS.some(pat => combined.includes(pat))) {
                    isCookieConsent = true;
                }
            });

            if (overlays.length > 0 && !isCookieConsent) {
                signals.hasScrollLock = true;
            }
        }
    } catch { /* ignore */ }

    // 5. Paste blocking
    try {
        const inputs = document.querySelectorAll('input');
        inputs.forEach(input => {
            const onPaste = input.getAttribute('onpaste');
            if (onPaste && (onPaste.includes('return false') || onPaste.includes('preventDefault'))) {
                signals.hasPasteBlock = true;
            }
        });
    } catch { /* ignore */ }

    return signals;
}

/**
 * Start a live monitor for dynamic behavior changes.
 */
export function startBehaviorMonitor(callback: (signals: BehaviorSignals) => void): void {
    // Re-check every 3 seconds for the first 15 seconds
    let checks = 0;
    const interval = setInterval(() => {
        checks++;
        const signals = detectBehavioralSignals();
        callback(signals);
        if (checks >= 5) clearInterval(interval);
    }, 3000);
}
