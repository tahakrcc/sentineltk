// ─── Background Service Worker (Full Implementation) ────────────
import type { PageSignals, TabState, RiskAction } from '../shared/types';
import { SCORE_SAFE_MAX, SCORE_SUSPICIOUS_MAX, BACKEND_URL } from '../shared/constants';
import { RiskEngine } from './riskEngine';
import { RuleManager } from './ruleManager';
import { StorageManager } from './storage';
import { getBaseDomain } from '../shared/utils';

const storage = new StorageManager();
const ruleManager = new RuleManager();
const riskEngine = new RiskEngine(storage);

// Track redirect counts per tab
const redirectCounters: Map<number, { count: number; startTime: number }> = new Map();

// ═══════════════════════════════════════════════════════════════
// 1. NAVIGATION EVENTS
// ═══════════════════════════════════════════════════════════════

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    // Reset redirect counter on fresh navigation
    redirectCounters.set(details.tabId, { count: 0, startTime: Date.now() });
});

// Fix #11: Track actual HTTP redirects (301, 302, etc.)
chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId !== 0) return;
    const redirectData = redirectCounters.get(details.tabId);
    if (redirectData && redirectData.count > 2) {
        const state = storage.getTabState(details.tabId);
        if (state) {
            state.signals.redirectCount = redirectData.count;
            state.signals.rapidRedirect = (Date.now() - redirectData.startTime) < 3000;
            storage.setTabState(details.tabId, state);
        }
    }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (details.url.startsWith('chrome://') || details.url.startsWith('chrome-extension://')) return;

    const tabId = details.tabId;

    try {
        const url = new URL(details.url);
        const hostname = getBaseDomain(url.hostname);

        console.log(`[SentinelTK] Navigation: ${hostname}`);

        // Track redirects
        const redirectData = redirectCounters.get(tabId);
        if (redirectData) {
            redirectData.count++;
            // Check if this is a rapid redirect (multiple commits within 2 seconds)
            const isRapid = redirectData.count > 1 && (Date.now() - redirectData.startTime < 2000);

            if (isRapid) {
                console.log(`[SentinelTK] Rapid redirect detected: ${redirectData.count} in ${Date.now() - redirectData.startTime}ms`);
            }
        }

        // Initialize tab state
        const tabState: TabState = {
            tabId,
            url: details.url,
            hostname,
            score: null,
            signals: {},
            safeStartActive: true,
            userOverride: false,
            timestamp: Date.now(),
        };
        storage.setTabState(tabId, tabState);

        // Enable Safe-Start quarantine
        await ruleManager.enableSafeStart(tabId);

        // Record visit
        await storage.recordVisit(hostname);

        // Check cache first
        const cachedScore = await storage.getCachedScore(hostname);
        if (cachedScore && cachedScore.level === 'safe') {
            // Cached as safe → release immediately
            await ruleManager.disableSafeStart(tabId);
            tabState.safeStartActive = false;
            tabState.score = cachedScore;
            storage.setTabState(tabId, tabState);
            updateBadge(tabId, cachedScore.score);
            return;
        }

        // Perform domain analysis
        const domainScore = await riskEngine.analyzeDomain(hostname);
        tabState.score = domainScore;
        storage.setTabState(tabId, tabState);

        // Decide action based on domain score alone
        await applyRiskAction(tabId, domainScore.score, tabState);

        // Cache it
        await storage.setCachedScore(hostname, domainScore);
    } catch (err) {
        console.warn('[SentinelTK] Navigation handler error:', err);
        // On error, release Safe-Start to avoid breaking the page
        await ruleManager.disableSafeStart(tabId);
    }
});

// ═══════════════════════════════════════════════════════════════
// 2. MESSAGE HANDLING (from content scripts)
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    switch (message.type) {
        case 'PAGE_SIGNALS':
            if (tabId) handlePageSignals(tabId, message.data);
            break;

        case 'GET_TAB_STATE':
            if (tabId) {
                const state = storage.getTabState(tabId);
                sendResponse({ type: 'TAB_STATE_RESPONSE', data: state });
            }
            return true; // async response

        case 'USER_OVERRIDE':
            if (tabId) handleUserOverride(tabId);
            break;

        case 'REPORT_SITE':
            reportSite(message.domain, message.reason);
            break;

        case 'ADD_WHITELIST':
            storage.addToWhitelist(message.domain);
            if (tabId) {
                ruleManager.disableSafeStart(tabId);
                updateBadge(tabId, 0);
            }
            break;

        case 'REDIRECT_DETECTED':
            if (tabId) {
                const state = storage.getTabState(tabId);
                if (state) {
                    state.signals.redirectCount = message.count;
                    state.signals.rapidRedirect = message.rapid;
                    storage.setTabState(tabId, state);
                }
            }
            break;
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. SIGNAL PROCESSING
// ═══════════════════════════════════════════════════════════════

async function handlePageSignals(tabId: number, signals: Partial<PageSignals>) {
    const tabState = storage.getTabState(tabId);
    if (!tabState || tabState.userOverride) return;

    // Merge new signals with existing
    tabState.signals = { ...tabState.signals, ...signals };
    storage.setTabState(tabId, tabState);

    // Recalculate risk with all signals
    if (tabState.score) {
        const newScore = riskEngine.recalculateWithSignals(tabState.score, tabState.signals);
        tabState.score = newScore;
        storage.setTabState(tabId, tabState);

        // Update cache
        await storage.setCachedScore(tabState.hostname, newScore);

        // Apply action
        await applyRiskAction(tabId, newScore.score, tabState);
    }
}

// ═══════════════════════════════════════════════════════════════
// 4. RISK ACTIONS
// ═══════════════════════════════════════════════════════════════

async function applyRiskAction(tabId: number, score: number, state: TabState) {
    updateBadge(tabId, score);

    if (score <= SCORE_SAFE_MAX) {
        // SAFE → release everything
        await ruleManager.disableSafeStart(tabId);
        state.safeStartActive = false;
        storage.setTabState(tabId, state);
        sendToTab(tabId, { type: 'RISK_ACTION', action: 'NONE', score });
    } else if (score <= SCORE_SUSPICIOUS_MAX) {
        // SUSPICIOUS → release network but warn
        await ruleManager.disableSafeStart(tabId);
        state.safeStartActive = false;
        storage.setTabState(tabId, state);
        sendToTab(tabId, { type: 'RISK_ACTION', action: 'WARN', score });
    } else {
        // DANGER → keep blocks, inject overlay
        state.safeStartActive = true;
        storage.setTabState(tabId, state);
        sendToTab(tabId, { type: 'RISK_ACTION', action: 'FULL_BLOCK', score });
    }
}

function handleUserOverride(tabId: number) {
    const state = storage.getTabState(tabId);
    if (!state) return;
    state.userOverride = true;
    storage.setTabState(tabId, state);
    ruleManager.disableSafeStart(tabId);
    updateBadge(tabId, state.score?.score || 0);
    sendToTab(tabId, { type: 'RISK_ACTION', action: 'NONE', score: state.score?.score || 0 });
}

// ═══════════════════════════════════════════════════════════════
// 5. BADGE & UI
// ═══════════════════════════════════════════════════════════════

function updateBadge(tabId: number, score: number) {
    if (score <= SCORE_SAFE_MAX) {
        chrome.action.setBadgeText({ tabId, text: '' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#22c55e' });
    } else if (score <= SCORE_SUSPICIOUS_MAX) {
        chrome.action.setBadgeText({ tabId, text: `${score}` });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#f59e0b' });
    } else {
        chrome.action.setBadgeText({ tabId, text: `${score}` });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
    }
}

function sendToTab(tabId: number, message: { type: string; action: RiskAction; score: number }) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
        // Content script not yet loaded — ignore
    });
}

// ═══════════════════════════════════════════════════════════════
// 6. COMMUNITY REPORTING
// ═══════════════════════════════════════════════════════════════

async function reportSite(domain: string, reason: string) {
    try {
        await fetch(`${BACKEND_URL}/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, reason }),
        });
        console.log(`[SentinelTK] Reported: ${domain}`);
    } catch {
        console.warn('[SentinelTK] Report failed (backend offline)');
    }
}

// ═══════════════════════════════════════════════════════════════
// 7. TAB CLEANUP
// ═══════════════════════════════════════════════════════════════

chrome.tabs.onRemoved.addListener((tabId) => {
    storage.removeTabState(tabId);
    ruleManager.cleanupTab(tabId);
    redirectCounters.delete(tabId);
});

// ═══════════════════════════════════════════════════════════════
// 8. INSTALL
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onInstalled.addListener(() => {
    console.log('[SentinelTK] Extension installed / updated');
});
