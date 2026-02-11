// ─── DOM Scanner (Badges, Structure, Contact Info, Fingerprint) ─
import type { ContactInfo } from '../shared/types';

/**
 * Scan for fake trust badges (SSL Secure, Verified, etc.)
 * Validates against actual page context — not just text presence.
 */
export function scanForFakeBadges(): { hasFakeBadge: boolean; fakeBadgeCount: number } {
    const badgeKeywords = [
        'verified', 'secure', 'trusted', 'güvenli', 'doğrulanmış', 'onaylanmış',
        'ssl secure', 'norton secured', 'mcafee secure', '3d secure', 'verified by visa',
        'mastercard securecode', 'güvenli alışveriş',
    ];

    let fakeBadgeCount = 0;

    // Check images
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        const text = (img.alt + ' ' + img.src + ' ' + img.title).toLowerCase();
        for (const kw of badgeKeywords) {
            if (text.includes(kw)) {
                // Heuristic: real badges link to verification endpoints
                const parent = img.closest('a');
                const href = parent?.getAttribute('href') || '';
                const isReal = href.includes('norton.com') || href.includes('mcafee.com')
                    || href.includes('visa.com') || href.includes('mastercard.com')
                    || href.includes('ssl.com') || href.includes('comodo.com');
                if (!isReal) {
                    fakeBadgeCount++;
                }
                break;
            }
        }
    });

    // Check divs/spans with badge-like text
    const allText = document.querySelectorAll('div, span, p, small');
    allText.forEach(el => {
        const txt = (el as HTMLElement).innerText?.toLowerCase() || '';
        if (txt.length < 100) { // Short text snippets
            for (const kw of badgeKeywords) {
                if (txt.includes(kw) && (txt.includes('✓') || txt.includes('✔') || txt.includes('🔒') || txt.includes('🛡'))) {
                    fakeBadgeCount++;
                    break;
                }
            }
        }
    });

    return { hasFakeBadge: fakeBadgeCount > 0, fakeBadgeCount };
}

/**
 * Scan for urgency / threat language.
 * Fix #4: Removed overly broad words like "derhal"
 * Fix #8: Excludes text inside <article>, <main> tags (news content)
 */
export function scanForUrgencyText(): { hasUrgencyText: boolean; urgencyScore: number } {
    // Fix #8: Get page text EXCLUDING news article content
    const bodyText = getTextExcludingArticles();

    const urgencyPatterns = [
        // English
        /your account (has been|will be) (suspended|closed|limited)/i,
        /unauthorized (access|activity|transaction)/i,
        /verify your (identity|account|information)/i,
        /expires? in \d/i,
        /act (now|fast|immediately)/i,
        /limited time/i,
        /last chance/i,
        /security alert/i,
        /click (here|now) to/i,
        // Turkish — Fix #4: removed /derhal/i (too broad for news)
        /hesabınız (kapatılacak|kısıtlandı|askıya alındı)/i,
        /yetkisiz (erişim|işlem)/i,
        /kimliğinizi doğrulayın/i,
        /süre doluyor/i,
        /son şans/i,
        /acil (işlem|güncelleme)/i,
        /güvenlik uyarısı/i,
        /hemen tıklayın/i,
    ];

    let urgencyScore = 0;
    for (const pattern of urgencyPatterns) {
        if (pattern.test(bodyText)) {
            urgencyScore++;
        }
    }

    return { hasUrgencyText: urgencyScore >= 2, urgencyScore };
}

/**
 * Fix #8: Get page text but exclude <article> and <main> content
 * to avoid false positives from news articles about scams.
 */
function getTextExcludingArticles(): string {
    // Clone body to manipulate
    const clone = document.body?.cloneNode(true) as HTMLElement;
    if (!clone) return '';

    // Remove article/news content
    const articles = clone.querySelectorAll('article, [role="article"], main, .article-body, .post-content, .entry-content');
    articles.forEach(el => el.remove());

    return clone.innerText?.toLowerCase() || '';
}

/**
 * Detect fake countdown timers.
 */
export function scanForCountdownTimers(): boolean {
    const timePatterns = /\d{1,2}\s*:\s*\d{2}\s*:\s*\d{2}|\d{1,2}\s*(saat|hour|min|dk|saniye|sec)/i;
    const bodyText = document.body?.innerText || '';

    if (timePatterns.test(bodyText)) {
        const scripts = document.querySelectorAll('script:not([src])');
        let hasIntervalTimer = false;
        scripts.forEach(s => {
            const code = s.textContent || '';
            if ((code.includes('setInterval') || code.includes('countdown') || code.includes('timer'))
                && (code.includes('1000') || code.includes('1e3'))) {
                hasIntervalTimer = true;
            }
        });
        return hasIntervalTimer;
    }
    return false;
}

/**
 * Extract and analyze contact information.
 * Fix #9: Free email detection less aggressive
 */
export function scanContactInfo(): ContactInfo {
    const bodyText = document.body?.innerText || '';
    const bodyHtml = document.body?.innerHTML || '';

    // Extract phone numbers
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{2,4}/g;
    const phones = [...new Set((bodyText.match(phoneRegex) || []).filter(p => p.replace(/\D/g, '').length >= 10))];

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = [...new Set(bodyText.match(emailRegex) || [])];

    // Extract WhatsApp links
    const waRegex = /wa\.me\/\d+|api\.whatsapp\.com\/send\?phone=\d+/g;
    const whatsappLinks = [...new Set(bodyHtml.match(waRegex) || [])];

    // Fix #9: Only flag free email if it's the ONLY contact method and site looks commercial
    const freeEmailProviders = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'yandex.com'];
    const hasFreeEmail = emails.some(e => freeEmailProviders.some(p => e.endsWith(p)));
    const hasNoProperContact = phones.length === 0 && whatsappLinks.length === 0;
    const suspicious = hasFreeEmail && hasNoProperContact && emails.length > 0;

    // Country mismatch: check if phone country code doesn't match TLD
    const hostname = window.location.hostname;
    const isTR = hostname.endsWith('.tr') || hostname.includes('.com.tr');
    const hasNonTRPhone = phones.some(p => {
        const digits = p.replace(/\D/g, '');
        return digits.startsWith('1') || digits.startsWith('44') || digits.startsWith('91');
    });
    const countryMismatch = isTR && hasNonTRPhone;

    return {
        phones,
        emails,
        whatsappLinks,
        suspicious,
        countryMismatch,
    };
}

/**
 * Generate a structural fingerprint hash of the page.
 */
export function generateFingerprint(): string {
    const elements = document.querySelectorAll('div, form, input, button, a, img, iframe');
    const structure = Array.from(elements).slice(0, 50).map(el => {
        return `${el.tagName}:${el.className?.toString().slice(0, 20) || ''}`;
    }).join('|');

    let hash = 0;
    for (let i = 0; i < structure.length; i++) {
        const chr = structure.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}
