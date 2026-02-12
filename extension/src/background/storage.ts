// ─── Storage Manager ────────────────────────────────────────────
import type { TabState, ScoreResult } from '../shared/types';
import { CACHE_DURATION_MS, FP_MITIGATION } from '../shared/constants';

interface CacheEntry {
    score: ScoreResult;
    timestamp: number;
}

interface VisitEntry {
    count: number;
    lastVisit: number;
}

export class StorageManager {
    // ── Whitelist ──
    async isWhitelisted(domain: string): Promise<boolean> {
        const data = await chrome.storage.local.get('whitelist');
        const whitelist: string[] = data.whitelist || [];
        return whitelist.includes(domain);
    }

    async addToWhitelist(domain: string): Promise<void> {
        const data = await chrome.storage.local.get('whitelist');
        const whitelist: string[] = data.whitelist || [];
        if (!whitelist.includes(domain)) {
            whitelist.push(domain);
            await chrome.storage.local.set({ whitelist });
        }
    }

    async removeFromWhitelist(domain: string): Promise<void> {
        const data = await chrome.storage.local.get('whitelist');
        const whitelist: string[] = (data.whitelist || []).filter((d: string) => d !== domain);
        await chrome.storage.local.set({ whitelist });
    }

    // ── Score Cache (LRU-ish, max 200 entries) ──
    async getCachedScore(domain: string): Promise<ScoreResult | null> {
        const data = await chrome.storage.local.get('scoreCache');
        const cache: Record<string, CacheEntry> = data.scoreCache || {};
        const entry = cache[domain];
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_DURATION_MS) {
            delete cache[domain];
            await chrome.storage.local.set({ scoreCache: cache });
            return null;
        }
        return entry.score;
    }

    async setCachedScore(domain: string, score: ScoreResult): Promise<void> {
        const data = await chrome.storage.local.get('scoreCache');
        const cache: Record<string, CacheEntry> = data.scoreCache || {};

        // LRU eviction: keep max 200
        const keys = Object.keys(cache);
        if (keys.length >= 200) {
            let oldest = keys[0];
            for (const k of keys) {
                if (cache[k].timestamp < cache[oldest].timestamp) oldest = k;
            }
            delete cache[oldest];
        }

        cache[domain] = { score, timestamp: Date.now() };
        await chrome.storage.local.set({ scoreCache: cache });
    }

    // ── Visit Tracking (for false-positive reduction) ──
    async recordVisit(domain: string): Promise<number> {
        const data = await chrome.storage.local.get('visits');
        const visits: Record<string, VisitEntry> = data.visits || {};
        const entry = visits[domain] || { count: 0, lastVisit: 0 };
        entry.count++;
        entry.lastVisit = Date.now();
        visits[domain] = entry;
        await chrome.storage.local.set({ visits });
        return entry.count;
    }

    async getVisitCount(domain: string): Promise<number> {
        const data = await chrome.storage.local.get('visits');
        const visits: Record<string, VisitEntry> = data.visits || {};
        return visits[domain]?.count || 0;
    }

    async getFrequentVisitReduction(domain: string): Promise<number> {
        const count = await this.getVisitCount(domain);
        return count >= FP_MITIGATION.FREQUENT_VISIT_THRESHOLD
            ? FP_MITIGATION.FREQUENT_VISIT_REDUCTION
            : 0;
    }

    // ── Tab State (in-memory via session storage) ──
    private tabStates: Map<number, TabState> = new Map();

    setTabState(tabId: number, state: TabState): void {
        this.tabStates.set(tabId, state);
    }

    getTabState(tabId: number): TabState | null {
        return this.tabStates.get(tabId) || null;
    }

    removeTabState(tabId: number): void {
        this.tabStates.delete(tabId);
    }

    // ── User Settings ──
    sensitivityLevel: 'low' | 'medium' | 'high' = 'medium';
    telemetryEnabled = false;

    async getSettings(): Promise<{
        sensitivityLevel: 'low' | 'medium' | 'high';
        telemetryEnabled: boolean;
    }> {
        const data = await chrome.storage.local.get('settings');
        return data.settings || { sensitivityLevel: 'medium', telemetryEnabled: false };
    }

    // ── Scan History ──
    async recordScanHistory(domain: string, score: number, level: string): Promise<void> {
        const data = await chrome.storage.local.get('scanHistory');
        const history: Array<{ domain: string; score: number; level: string; timestamp: number }> = data.scanHistory || [];
        history.unshift({ domain, score, level, timestamp: Date.now() });
        // Keep max 500 entries
        if (history.length > 500) history.length = 500;
        await chrome.storage.local.set({ scanHistory: history });
    }

    async getScanHistory(days: number = 7): Promise<Array<{ domain: string; score: number; level: string; timestamp: number }>> {
        const data = await chrome.storage.local.get('scanHistory');
        const history: Array<{ domain: string; score: number; level: string; timestamp: number }> = data.scanHistory || [];
        const cutoff = Date.now() - (days * 86400000);
        return history.filter(h => h.timestamp > cutoff);
    }
}
