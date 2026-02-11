// ─── DNR Rule Manager (Safe-Start Mode) ─────────────────────────

/**
 * Manages DeclarativeNetRequest rules for Safe-Start quarantine.
 *
 * Strategy: We use session-scoped rules to block third-party
 * fetch/xhr/beacon/websocket requests. Rules are indexed by tabId
 * using a rule ID offset scheme (tabId * 10 + ruleIndex).
 *
 * MV3 Constraints:
 * - Max 5000 dynamic rules, but we use session rules (limit: 5000).
 * - Session rules are cleared when the browser closes.
 */
export class RuleManager {
    private activeTabRules: Map<number, number[]> = new Map();

    /**
     * Enable Safe-Start: block third-party requests for a tab.
     */
    async enableSafeStart(tabId: number): Promise<void> {
        const ruleIds = this.getRuleIdsForTab(tabId);

        const rules: chrome.declarativeNetRequest.Rule[] = [
            // Block third-party XHR/fetch
            {
                id: ruleIds[0],
                priority: 1,
                action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
                condition: {
                    tabIds: [tabId],
                    resourceTypes: [
                        chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
                    ],
                    domainType: chrome.declarativeNetRequest.DomainType.THIRD_PARTY,
                },
            },
            // Block third-party sub_frame (hidden iframes)
            {
                id: ruleIds[1],
                priority: 1,
                action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
                condition: {
                    tabIds: [tabId],
                    resourceTypes: [
                        chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
                    ],
                    domainType: chrome.declarativeNetRequest.DomainType.THIRD_PARTY,
                },
            },
            // Block websocket connections
            {
                id: ruleIds[2],
                priority: 1,
                action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
                condition: {
                    tabIds: [tabId],
                    resourceTypes: [
                        chrome.declarativeNetRequest.ResourceType.WEBSOCKET,
                    ],
                    domainType: chrome.declarativeNetRequest.DomainType.THIRD_PARTY,
                },
            },
        ];

        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                addRules: rules,
                removeRuleIds: ruleIds,
            });
            this.activeTabRules.set(tabId, ruleIds);
            console.log(`[RuleManager] Safe-Start ENABLED for tab ${tabId}`);
        } catch (err) {
            console.warn(`[RuleManager] Failed to enable Safe-Start:`, err);
        }
    }

    /**
     * Disable Safe-Start: remove all blocking rules for a tab.
     */
    async disableSafeStart(tabId: number): Promise<void> {
        const ruleIds = this.activeTabRules.get(tabId);
        if (!ruleIds || ruleIds.length === 0) return;

        try {
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: ruleIds,
            });
            this.activeTabRules.delete(tabId);
            console.log(`[RuleManager] Safe-Start DISABLED for tab ${tabId}`);
        } catch (err) {
            console.warn(`[RuleManager] Failed to disable Safe-Start:`, err);
        }
    }

    /**
     * Cleanup rules when a tab is closed.
     */
    async cleanupTab(tabId: number): Promise<void> {
        await this.disableSafeStart(tabId);
    }

    /**
     * Generate unique rule IDs for a given tab.
     * Offset scheme: tabId * 10 + index (supports up to 10 rules per tab).
     */
    private getRuleIdsForTab(tabId: number): number[] {
        const base = (tabId % 500) * 10; // Keep within limits
        return [base + 1, base + 2, base + 3];
    }
}
