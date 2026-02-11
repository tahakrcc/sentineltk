// ─── Behavior Tracker ───────────────────────────────────────────

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
        // Also check inline scripts
        const scripts = document.querySelectorAll('script:not([src])');
        scripts.forEach(s => {
            const code = s.textContent || '';
            if (code.includes('contextmenu') && (code.includes('preventDefault') || code.includes('return false'))) {
                signals.hasRightClickBlock = true;
            }
        });
    } catch { /* ignore */ }

    // 2. Focus trap detection (beforeunload / onbeforeunload)
    try {
        const scripts = document.querySelectorAll('script:not([src])');
        scripts.forEach(s => {
            const code = s.textContent || '';
            if (code.includes('onbeforeunload') || code.includes('beforeunload')) {
                // Check if it shows a confirmation dialog
                if (code.includes('returnValue') || code.includes('Are you sure') || code.includes('Emin misiniz')) {
                    signals.hasFocusTrap = true;
                }
            }
        });
        // Check body attribute
        if (document.body?.getAttribute('onbeforeunload')) {
            signals.hasFocusTrap = true;
        }
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

    // 4. Scroll lock
    try {
        const bodyStyle = window.getComputedStyle(document.body);
        const htmlStyle = window.getComputedStyle(document.documentElement);
        if (bodyStyle.overflow === 'hidden' || htmlStyle.overflow === 'hidden') {
            // Check if there's a modal-like overlay
            const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
            if (overlays.length > 0) {
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
