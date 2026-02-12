// ─── Content Script Main Entry ──────────────────────────────────
import type { PageSignals, RiskAction } from '../shared/types';
import { DEBOUNCE_DOM_SCAN_MS } from '../shared/constants';
import { scanForFakeBadges, scanForUrgencyText, scanForCountdownTimers, scanContactInfo, generateFingerprint } from './domScanner';
import { scanInputFields, monitorPasteOnSensitiveFields } from './inputWatcher';
import { detectBehavioralSignals, startBehaviorMonitor } from './behaviorTracker';
import { applyRiskAction, showPasteWarning, showAutofillWarning, showDownloadWarning } from './formProtection';
import { initLinkPreview } from './linkPreview';
import { initClipboardGuard } from './clipboardGuard';
import { initEmailScanner } from './emailScanner';
import { initLeakCheck } from './leakCheck';

console.log('[SentinelTK] Content script loaded');

// Initialize modules
initLinkPreview();
initClipboardGuard();
initEmailScanner();
initLeakCheck();

// ═══════════════════════════════════════════════════════════════
// 1. INITIAL SCAN (debounced after DOM settles)
// ═══════════════════════════════════════════════════════════════

let currentRiskLevel: RiskAction = 'NONE';

setTimeout(() => {
    runFullAnalysis();
}, DEBOUNCE_DOM_SCAN_MS);

// Also re-scan when DOM changes significantly
const observer = new MutationObserver(() => {
    clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => runFullAnalysis(), 1000);
});
let rescanTimer: ReturnType<typeof setTimeout>;

observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
});

// Stop observing after 15 seconds to save resources
setTimeout(() => observer.disconnect(), 15000);

// ═══════════════════════════════════════════════════════════════
// 2. FULL ANALYSIS
// ═══════════════════════════════════════════════════════════════

function runFullAnalysis() {
    // DOM Scanning
    const badges = scanForFakeBadges();
    const urgency = scanForUrgencyText();
    const hasCountdown = scanForCountdownTimers();
    const contactInfo = scanContactInfo();
    const fingerprint = generateFingerprint();

    // Input scanning
    const inputs = scanInputFields();

    // Behavior scanning
    const behavior = detectBehavioralSignals();

    // Assemble signals
    const signals: Partial<PageSignals> = {
        ...badges,
        ...urgency,
        hasCountdownTimer: hasCountdown,
        ...inputs,
        ...behavior,
        contactInfo,
        fingerprintHash: fingerprint,
    };

    // Send to background
    chrome.runtime.sendMessage({ type: 'PAGE_SIGNALS', data: signals });
}

// ═══════════════════════════════════════════════════════════════
// 3. BEHAVIOR MONITORING (live, for dynamic changes)
// ═══════════════════════════════════════════════════════════════

startBehaviorMonitor((signals) => {
    chrome.runtime.sendMessage({
        type: 'PAGE_SIGNALS',
        data: signals,
    });
});

// ═══════════════════════════════════════════════════════════════
// 4. PASTE MONITORING
// ═══════════════════════════════════════════════════════════════

monitorPasteOnSensitiveFields(() => {
    // Show warning only if current risk is elevated
    if (currentRiskLevel === 'WARN' || currentRiskLevel === 'BLOCK_FORM' || currentRiskLevel === 'FULL_BLOCK') {
        showPasteWarning();
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. AUTOFILL DETECTION
// ═══════════════════════════════════════════════════════════════

(function initAutofillDetection() {
    let autofillEnabled = true;
    chrome.storage.local.get('autofillWarningEnabled', (result) => {
        autofillEnabled = result.autofillWarningEnabled !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.autofillWarningEnabled) {
            autofillEnabled = changes.autofillWarningEnabled.newValue !== false;
        }
    });

    // Detect autofill: multiple inputs filled within a very short time
    let autofillChangeCount = 0;
    let autofillTimer: ReturnType<typeof setTimeout> | null = null;

    document.addEventListener('change', (e) => {
        if (!autofillEnabled) return;
        if (currentRiskLevel === 'NONE') return; // Only warn on risky sites

        const input = e.target as HTMLInputElement;
        if (!input || input.tagName !== 'INPUT') return;

        autofillChangeCount++;
        if (autofillTimer) clearTimeout(autofillTimer);
        autofillTimer = setTimeout(() => {
            if (autofillChangeCount >= 2) {
                // Multiple fields changed nearly simultaneously = likely autofill
                showAutofillWarning();
            }
            autofillChangeCount = 0;
        }, 50); // 50ms window — autofill fills all fields almost instantly
    }, true);
})();

// ═══════════════════════════════════════════════════════════════
// 6. MESSAGE HANDLING FROM BACKGROUND
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'RISK_ACTION') {
        currentRiskLevel = message.action as RiskAction;
        applyRiskAction(message.action, message.score);
    }

    if (message.type === 'DOWNLOAD_WARNING') {
        showDownloadWarning(message.filename, message.domain, message.score);
    }
});

