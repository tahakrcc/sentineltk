// ─── Full Risk Scoring Engine ────────────────────────────────────
import type { ScoreResult, ScoreFactor, PageSignals } from '../shared/types';
import { WEIGHTS, TOP_DOMAINS, TRUSTED_DOMAINS, UNTRUSTED_SUBDOMAINS, FP_MITIGATION, SCORE_SAFE_MAX, SCORE_SUSPICIOUS_MAX, BACKEND_URL } from '../shared/constants';
import { levenshtein, clamp, getBaseDomain } from '../shared/utils';
import { StorageManager } from './storage';

export class RiskEngine {
    constructor(private storage: StorageManager) { }

    /**
     * Analyze domain-level signals (called on navigation start).
     */
    async analyzeDomain(hostname: string): Promise<ScoreResult> {
        const domain = getBaseDomain(hostname);
        const factors: ScoreFactor[] = [];
        let rawScore = 0;

        // Fix #1: Untrusted subdomains check FIRST (sites.google.com etc.)
        const hostingMatch = UNTRUSTED_SUBDOMAINS.find(
            us => hostname === us || hostname.endsWith('.' + us) || hostname.includes(us)
        );
        const isUntrustedHosting = !!hostingMatch;

        // 0. Trusted domain check (but NOT hosting subdomains)
        if (!isUntrustedHosting && TRUSTED_DOMAINS.some(td => domain === td || domain.endsWith('.' + td))) {
            return this.buildResult(0, [{ signal: 'trusted_domain', weight: 0, description: 'Güvenilir site (bilinen domain)' }]);
        }

        // If it IS an untrusted hosting subdomain, add a note
        if (isUntrustedHosting) {
            rawScore += 10;
            factors.push({ signal: 'hosting_subdomain', weight: 10, description: `Ücretsiz hosting servisi: ${hostingMatch}` });
        }

        // 1. Whitelist check
        if (await this.storage.isWhitelisted(domain)) {
            return this.buildResult(0, [{ signal: 'whitelisted', weight: 0, description: 'Kullanıcı beyaz listesinde' }]);
        }

        // 2. Subdomain depth
        const parts = hostname.split('.');
        if (parts.length > 3) {
            rawScore += WEIGHTS.SUBDOMAIN_DEPTH;
            factors.push({ signal: 'subdomain_depth', weight: WEIGHTS.SUBDOMAIN_DEPTH, description: `${parts.length} seviye alt alan adı` });
        }

        // 3. Suspicious keywords in domain
        const suspiciousKeywords = ['login', 'verify', 'secure', 'update', 'confirm', 'account', 'banking', 'doğrula', 'giriş', 'guvenlik', 'dogrulama'];
        for (const kw of suspiciousKeywords) {
            if (domain.includes(kw)) {
                rawScore += WEIGHTS.SUSPICIOUS_KEYWORD;
                factors.push({ signal: 'suspicious_keyword', weight: WEIGHTS.SUSPICIOUS_KEYWORD, description: `Alan adında şüpheli kelime: "${kw}"` });
                break;
            }
        }

        // 4. Typosquatting detection
        const typoResult = this.checkTyposquatting(domain);
        if (typoResult) {
            rawScore += WEIGHTS.TYPOSQUAT;
            factors.push({ signal: 'typosquat', weight: WEIGHTS.TYPOSQUAT, description: `"${typoResult}" alan adına çok benzer (typosquatting)` });
        }

        // Fix #5: Homograph/Unicode detection
        const homographTarget = this.checkHomographAttack(hostname);
        if (homographTarget) {
            rawScore += WEIGHTS.HOMOGRAPH;
            factors.push({
                signal: 'homograph',
                weight: WEIGHTS.HOMOGRAPH,
                description: homographTarget === 'UNKNOWN'
                    ? 'Unicode/homograph saldırısı şüphesi (sahte karakterler)'
                    : `Homograph saldırısı: "${homographTarget}" taklidi`
            });
        }

        // 5. Try backend API for domain reputation
        try {
            const apiResult = await this.fetchBackendScore(domain);
            if (apiResult && apiResult.score > 0) {
                rawScore += apiResult.score;
                factors.push({ signal: 'backend_reputation', weight: apiResult.score, description: 'Sunucu itibar puanı' });
            }
        } catch {
            // Backend offline - continue with local analysis only
        }

        // 6. False positive mitigations
        const visitReduction = await this.storage.getFrequentVisitReduction(domain);
        if (visitReduction < 0) {
            rawScore += visitReduction;
            factors.push({ signal: 'frequent_visitor', weight: visitReduction, description: 'Sık ziyaret edilen site' });
        }

        // Fix #13: .com.tr / .gov.tr trust bonus
        if (domain.endsWith('.com.tr') || domain.endsWith('.gov.tr') || domain.endsWith('.edu.tr') || domain.endsWith('.org.tr')) {
            rawScore += FP_MITIGATION.TR_TLD_BONUS;
            factors.push({ signal: 'tr_tld_bonus', weight: FP_MITIGATION.TR_TLD_BONUS, description: '.tr TLD güven bonusu (kayıt doğrulamalı)' });
        }

        return this.buildResult(clamp(rawScore, 0, 100), factors);
    }


    /**
     * Recalculate risk with page-level signals from content script.
     */
    recalculateWithSignals(currentScore: ScoreResult, signals: Partial<PageSignals>): ScoreResult {
        // Fix duplication: Remove all previous content-based signals before adding new ones
        const contentSignals = new Set([
            'fake_badge', 'sensitive_cc', 'sensitive_id', 'sensitive_pass',
            'urgency_text', 'countdown', 'right_click_block', 'focus_trap',
            'popup_spam', 'scroll_lock', 'paste_block', 'rapid_redirect',
            'redirect_chain', 'fake_contact', 'country_mismatch'
        ]);

        let factors = currentScore.factors.filter(f => !contentSignals.has(f.signal));

        // IMPORTANT: Calculate base score from remaining factors (domain-level only)
        // This prevents score inflation from previous runs
        let rawScore = factors.reduce((sum, f) => sum + f.weight, 0);

        // Fix False Positives: If domain is TRUSTED or WHITELISTED, ignore content noise
        // (Google, Amazon etc. use urgency/badges legitimatey)
        const isTrusted = factors.some(f => f.signal === 'trusted_domain' || f.signal === 'whitelisted');
        if (isTrusted) {
            // Only allow critical technical signals for trusted domains (like redirections if extreme)
            // But generally, trust overrides content heuristics
            return this.buildResult(rawScore, factors);
        }

        // ── Content Signals ──
        if (signals.hasFakeBadge) {
            rawScore += WEIGHTS.FAKE_BADGE;
            factors.push({ signal: 'fake_badge', weight: WEIGHTS.FAKE_BADGE, description: `Sahte güven rozeti tespit edildi (${signals.fakeBadgeCount || 1} adet)` });
        }

        if (signals.hasSensitiveInput) {
            const types = signals.sensitiveInputTypes || [];
            if (types.includes('credit_card') || types.includes('cvv') || types.includes('iban')) {
                rawScore += WEIGHTS.SENSITIVE_INPUT_CC;
                factors.push({ signal: 'sensitive_cc', weight: WEIGHTS.SENSITIVE_INPUT_CC, description: 'Kredi kartı / IBAN girişi tespit edildi' });
            }
            if (types.includes('identity')) {
                rawScore += WEIGHTS.SENSITIVE_INPUT_ID;
                factors.push({ signal: 'sensitive_id', weight: WEIGHTS.SENSITIVE_INPUT_ID, description: 'TC Kimlik / Kimlik No girişi tespit edildi' });
            }
            if (types.includes('password') && WEIGHTS.SENSITIVE_INPUT_PASS > 0) {
                rawScore += WEIGHTS.SENSITIVE_INPUT_PASS;
                factors.push({ signal: 'sensitive_pass', weight: WEIGHTS.SENSITIVE_INPUT_PASS, description: 'Şifre girişi tespit edildi' });
            }
        }

        // ── Behavior Signals ──
        if (signals.hasUrgencyText) {
            const urgencyWeight = Math.min(WEIGHTS.URGENCY_TEXT * (signals.urgencyScore || 1), 25);
            rawScore += urgencyWeight;
            factors.push({ signal: 'urgency_text', weight: urgencyWeight, description: 'Aciliyet / tehdit dili tespit edildi' });
        }

        // Fix #10: Countdown timer only counts if OTHER scam signals present
        if (signals.hasCountdownTimer && rawScore >= 15) {
            rawScore += WEIGHTS.COUNTDOWN_TIMER;
            factors.push({ signal: 'countdown', weight: WEIGHTS.COUNTDOWN_TIMER, description: 'Şüpheli geri sayım sayacı tespit edildi' });
        }

        if (signals.hasRightClickBlock) {
            rawScore += WEIGHTS.RIGHT_CLICK_BLOCK;
            factors.push({ signal: 'right_click_block', weight: WEIGHTS.RIGHT_CLICK_BLOCK, description: 'Sağ tık engeli tespit edildi' });
        }

        if (signals.hasFocusTrap) {
            rawScore += WEIGHTS.FOCUS_TRAP;
            factors.push({ signal: 'focus_trap', weight: WEIGHTS.FOCUS_TRAP, description: 'Sayfa odak tuzağı tespit edildi' });
        }

        if (signals.hasPopupSpam) {
            rawScore += WEIGHTS.POPUP_SPAM;
            factors.push({ signal: 'popup_spam', weight: WEIGHTS.POPUP_SPAM, description: 'Popup spam tespit edildi' });
        }

        if (signals.hasScrollLock) {
            rawScore += WEIGHTS.SCROLL_LOCK;
            factors.push({ signal: 'scroll_lock', weight: WEIGHTS.SCROLL_LOCK, description: 'Scroll kilidi tespit edildi' });
        }

        if (signals.hasPasteBlock) {
            rawScore += WEIGHTS.PASTE_BLOCK;
            factors.push({ signal: 'paste_block', weight: WEIGHTS.PASTE_BLOCK, description: 'Yapıştırma engeli tespit edildi' });
        }

        // ── Redirect Signals ── Fix #11
        if (signals.rapidRedirect) {
            rawScore += WEIGHTS.RAPID_REDIRECT;
            factors.push({ signal: 'rapid_redirect', weight: WEIGHTS.RAPID_REDIRECT, description: 'Hızlı yönlendirme tespit edildi' });
        }

        if ((signals.redirectCount || 0) > 2) {
            rawScore += WEIGHTS.REDIRECT_CHAIN;
            factors.push({ signal: 'redirect_chain', weight: WEIGHTS.REDIRECT_CHAIN, description: `${signals.redirectCount} yönlendirme zinciri` });
        }

        // ── Contact Info Signals ──
        if (signals.contactInfo?.suspicious) {
            rawScore += WEIGHTS.FAKE_CONTACT;
            factors.push({ signal: 'fake_contact', weight: WEIGHTS.FAKE_CONTACT, description: 'Ücretsiz e-posta iletişim adresi' });
        }
        if (signals.contactInfo?.countryMismatch) {
            rawScore += WEIGHTS.COUNTRY_MISMATCH;
            factors.push({ signal: 'country_mismatch', weight: WEIGHTS.COUNTRY_MISMATCH, description: 'Ülke uyumsuzluğu tespit edildi' });
        }

        return this.buildResult(clamp(rawScore, 0, 100), factors);
    }

    /**
     * Check for typosquatting similarity.
     */
    private checkTyposquatting(domain: string): string | null {
        const baseDomain = domain.split('.').slice(0, -1).join('.');
        for (const top of TOP_DOMAINS) {
            const topBase = top.split('.').slice(0, -1).join('.');
            if (baseDomain === topBase) continue; // exact match = legit
            const dist = levenshtein(baseDomain, topBase);
            if (dist > 0 && dist <= 2) return top;
        }
        return null;
    }

    /**
     * Fix #5: Detect homograph/IDN attacks (Punycode domains with unicode lookalikes).
     * Returns the target domain if detected, 'UNKNOWN' if generic suspicious chars, or null if safe.
     */
    private checkHomographAttack(hostname: string): string | null {
        // Check for Punycode (xn--) prefixed labels
        if (hostname.includes('xn--')) return 'UNKNOWN';

        // Check for non-ASCII characters in hostname
        // eslint-disable-next-line no-control-regex
        const nonAscii = /[^\x00-\x7F]/;
        if (nonAscii.test(hostname)) return 'UNKNOWN';

        // Common lookalike substitutions: 0↔o, 1↔l, rn↔m
        const base = hostname.split('.')[0];
        if (/[0-9]/.test(base)) {
            // Check if replacing digits gives a known domain
            const normalized = base.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's');
            for (const top of TOP_DOMAINS) {
                const topBase = top.split('.')[0];
                if (normalized === topBase && base !== topBase) return top;
            }
        }

        return null;
    }

    /**
     * Fetch score from backend API.
     */
    private async fetchBackendScore(domain: string): Promise<{ score: number } | null> {
        try {
            const resp = await fetch(`${BACKEND_URL}/score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain }),
            });
            if (!resp.ok) return null;
            return await resp.json();
        } catch {
            return null;
        }
    }

    /**
     * Build a ScoreResult from raw score and factors.
     */
    private buildResult(score: number, factors: ScoreFactor[]): ScoreResult {
        const level = score <= SCORE_SAFE_MAX ? 'safe'
            : score <= SCORE_SUSPICIOUS_MAX ? 'suspicious'
                : 'danger';
        return { score, level, factors, timestamp: Date.now() };
    }
}
