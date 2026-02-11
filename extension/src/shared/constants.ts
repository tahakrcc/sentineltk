// ─── Constants & Configuration ──────────────────────────────────

// Production URL'i Railway deploy sonrası buraya yapıştırın
// Örnek: 'https://sentineltk-backend-production.up.railway.app/api/v1'
export const BACKEND_URL = 'http://127.0.0.1:3000/api/v1';

// Score thresholds
export const SCORE_SAFE_MAX = 39;
export const SCORE_SUSPICIOUS_MAX = 69;

// Weights for risk scoring
export const WEIGHTS = {
    // Domain signals (40% of total)
    DOMAIN_FRESH_30D: 15,
    DOMAIN_FRESH_7D: 25,
    TYPOSQUAT: 20,
    SSL_DV_FREE: 5,
    SSL_MISSING: 35,
    REDIRECT_CHAIN: 12,
    RAPID_REDIRECT: 15,
    SUBDOMAIN_DEPTH: 8,
    SUSPICIOUS_KEYWORD: 5,

    // Content signals (40% of total)
    FAKE_BADGE: 25,
    SENSITIVE_INPUT_CC: 8,
    SENSITIVE_INPUT_ID: 15,
    SENSITIVE_INPUT_PASS: 5,
    SCAM_LAYOUT_MATCH: 30,
    OFFSITE_FAVICON: 8,

    // Behavior signals (20% of total)
    URGENCY_TEXT: 12,
    COUNTDOWN_TIMER: 10,
    RIGHT_CLICK_BLOCK: 8,
    PASTE_BLOCK: 5,
    FOCUS_TRAP: 15,
    POPUP_SPAM: 10,
    SCROLL_LOCK: 8,

    // Contact
    FAKE_CONTACT: 10,
    COUNTRY_MISMATCH: 8,
} as const;

// False positive mitigations
export const FP_MITIGATION = {
    TOP_1M_MAX_SCORE: 30,
    OV_EV_REDUCTION: -20,
    FREQUENT_VISIT_REDUCTION: -15,
    FREQUENT_VISIT_THRESHOLD: 5,
} as const;

// Debounce timings
export const DEBOUNCE_DOM_SCAN_MS = 300;
export const DEBOUNCE_SIGNAL_SEND_MS = 500;

// Cache durations
export const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

// Sensitive field patterns
export const SENSITIVE_PATTERNS = {
    CREDIT_CARD: /card|cc_num|cc-num|credit|kredi|kart/i,
    CVV: /cvv|cvc|csv|güvenlik.kodu/i,
    IBAN: /iban|banka|hesap/i,
    IDENTITY: /tc_?kimlik|tckn|ssn|identity|kimlik.no|id.num/i,
    OTP: /otp|sms.kod|doğrulama|verification/i,
    PASSWORD: /pass|şifre|parola/i,
    PHONE: /phone|telefon|gsm|cep/i,
} as const;

// Urgency words (Turkish + English)
export const URGENCY_WORDS_TR = [
    'hemen', 'acil', 'süre doluyor', 'son şans', 'hesabınız kapatılacak',
    'güvenlik uyarısı', 'doğrulama gerekli', 'hesabınız kısıtlandı',
    'derhal', 'yetkisiz erişim', 'şimdi tıklayın', 'kaçırmayın',
];

export const URGENCY_WORDS_EN = [
    'immediately', 'urgent', 'expires in', 'last chance', 'account suspended',
    'security alert', 'verify now', 'account limited', 'unauthorized access',
    'click now', 'act fast', 'limited time', 'your account will be closed',
];

// Top domains for typosquatting detection
export const TOP_DOMAINS = [
    'google.com', 'facebook.com', 'youtube.com', 'twitter.com', 'instagram.com',
    'linkedin.com', 'amazon.com', 'apple.com', 'microsoft.com', 'netflix.com',
    'paypal.com', 'ebay.com', 'whatsapp.com', 'telegram.org', 'reddit.com',
    'github.com', 'stackoverflow.com', 'wikipedia.org',
    // Turkish banks & services
    'garanti.com.tr', 'akbank.com', 'isbank.com.tr', 'yapikredi.com.tr',
    'ziraatbank.com.tr', 'halkbank.com.tr', 'vakifbank.com.tr', 'qnb.com.tr',
    'denizbank.com', 'ingbank.com.tr', 'teb.com.tr', 'hsbc.com.tr',
    'turkiye.gov.tr', 'ptt.gov.tr', 'e-devlet.gov.tr',
    'trendyol.com', 'hepsiburada.com', 'n11.com', 'sahibinden.com',
    'binance.com', 'btcturk.com', 'paribu.com',
];
