// ─── Shared Types ───────────────────────────────────────────────

export interface PageSignals {
    hasSensitiveInput: boolean;
    sensitiveInputCount: number;
    sensitiveInputTypes: string[];
    hasFakeBadge: boolean;
    fakeBadgeCount: number;
    fakeBadgeNames: string[];
    hasUrgencyText: boolean;
    urgencyScore: number;
    urgencyKeywords: string[];
    hasCountdownTimer: boolean;
    hasPopupSpam: boolean;
    hasScrollLock: boolean;
    hasFocusTrap: boolean;
    hasRightClickBlock: boolean;
    hasPasteBlock: boolean;
    redirectCount: number;
    rapidRedirect: boolean;
    contactInfo: ContactInfo;
    fingerprintHash: string;
    domainAge: number | null;
    sslState: SSLState;
}

export interface ContactInfo {
    phones: string[];
    emails: string[];
    whatsappLinks: string[];
    suspicious: boolean;
    countryMismatch: boolean;
}

export type SSLState = 'valid' | 'invalid' | 'missing' | 'dv' | 'ov' | 'ev' | 'unknown';

export interface ScoreResult {
    score: number;
    level: 'safe' | 'suspicious' | 'danger';
    factors: ScoreFactor[];
    timestamp: number;
}

export interface ScoreFactor {
    signal: string;
    weight: number;
    description: string;
}

export type RiskAction = 'NONE' | 'WARN' | 'BLOCK_FORM' | 'FULL_BLOCK';

export interface TabState {
    tabId: number;
    url: string;
    hostname: string;
    score: ScoreResult | null;
    signals: Partial<PageSignals>;
    safeStartActive: boolean;
    userOverride: boolean;
    timestamp: number;
}

export interface TechnicalAnalysis {
    ssl: {
        valid: boolean;
        issuedTo?: string;
        issuedBy?: string;
        expires?: string;
        daysRemaining?: number;
        error?: string;
    };
    dns: {
        aRecords: string[];
        mxRecords: string[];
        hasEmailServer: boolean;
    };
    server: {
        ip?: string;
        location?: string;
        headers?: Record<string, string>;
    };
}

// Messages between content script and background
export type MessageType =
    | { type: 'PAGE_SIGNALS'; data: Partial<PageSignals> }
    | { type: 'GET_TAB_STATE' }
    | { type: 'TAB_STATE_RESPONSE'; data: TabState | null }
    | { type: 'RISK_ACTION'; action: RiskAction; score: number }
    | { type: 'USER_OVERRIDE'; tabId: number }
    | { type: 'REPORT_SITE'; domain: string; reason: string }
    | { type: 'ADD_WHITELIST'; domain: string }
    | { type: 'REDIRECT_DETECTED'; count: number; rapid: boolean }
    | { type: 'LINK_PREVIEW_SCORE'; domain: string };
