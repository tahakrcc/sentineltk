export const BACKEND_URL = "https://sentineltk-production.up.railway.app/api/v1";
export const SCORE_SAFE_MAX = 39;
export const SCORE_SUSPICIOUS_MAX = 69;
import { SMART_TOP_DOMAINS } from "/src/shared/smart_domains.ts.js";
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
  HOMOGRAPH: 15,
  // Fix #5: Unicode/homograph saldırısı
  // Content signals (40% of total)
  FAKE_BADGE: 25,
  SENSITIVE_INPUT_CC: 3,
  // Kart bilgisi normal (e-ticaret)
  SENSITIVE_INPUT_ID: 10,
  // TC Kimlik biraz şüpheli
  SENSITIVE_INPUT_PASS: 0,
  // Şifre alanı tamamen normal
  SCAM_LAYOUT_MATCH: 30,
  OFFSITE_FAVICON: 8,
  // Behavior signals (20% of total)
  URGENCY_TEXT: 12,
  COUNTDOWN_TIMER: 10,
  RIGHT_CLICK_BLOCK: 8,
  PASTE_BLOCK: 5,
  FOCUS_TRAP: 5,
  // Fix #3: 15→5 (beforeunload meşru kullanım çok)
  POPUP_SPAM: 10,
  SCROLL_LOCK: 8,
  // Contact
  FAKE_CONTACT: 3,
  // Fix #9: 10→3 (Gmail kullanan küçük işletmeler)
  COUNTRY_MISMATCH: 8
};
export const FP_MITIGATION = {
  TOP_1M_MAX_SCORE: 30,
  OV_EV_REDUCTION: -20,
  FREQUENT_VISIT_REDUCTION: -15,
  FREQUENT_VISIT_THRESHOLD: 5,
  TR_TLD_BONUS: -5
  // Fix #13: .com.tr / .gov.tr güven bonusu
};
export const DEBOUNCE_DOM_SCAN_MS = 300;
export const DEBOUNCE_SIGNAL_SEND_MS = 500;
export const CACHE_DURATION_MS = 4 * 60 * 60 * 1e3;
export const SENSITIVE_PATTERNS = {
  CREDIT_CARD: /card|cc_num|cc-num|credit|kredi|kart/i,
  CVV: /cvv|cvc|csv|güvenlik.kodu/i,
  IBAN: /iban|banka|hesap/i,
  IDENTITY: /tc_?kimlik|tckn|ssn|identity|kimlik.no|id.num/i,
  OTP: /otp|sms.kod|doğrulama|verification/i,
  PASSWORD: /pass|şifre|parola/i,
  PHONE: /phone|telefon|gsm|cep/i
};
export const URGENCY_WORDS_TR = [
  "hemen",
  "acil",
  "süre doluyor",
  "son şans",
  "hesabınız kapatılacak",
  "güvenlik uyarısı",
  "doğrulama gerekli",
  "hesabınız kısıtlandı",
  "yetkisiz erişim",
  "şimdi tıklayın",
  "kaçırmayın"
];
export const URGENCY_WORDS_EN = [
  "immediately",
  "urgent",
  "expires in",
  "last chance",
  "account suspended",
  "security alert",
  "verify now",
  "account limited",
  "unauthorized access",
  "click now",
  "act fast",
  "limited time",
  "your account will be closed"
];
export const TOP_DOMAINS = [
  ...SMART_TOP_DOMAINS
];
export const TRUSTED_DOMAINS = [
  ...SMART_TOP_DOMAINS
];
export const UNTRUSTED_SUBDOMAINS = [
  "sites.google.com",
  "docs.google.com/forms",
  "pages.github.io",
  "github.io",
  "netlify.app",
  "vercel.app",
  "herokuapp.com",
  "web.app",
  // Firebase hosting
  "firebaseapp.com",
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "weebly.com"
];
export const COOKIE_CONSENT_PATTERNS = [
  "cookie",
  "consent",
  "gdpr",
  "kvkk",
  "privacy",
  "onetrust",
  "cookiebot",
  "cc-window",
  "cc-banner",
  "cookie-notice",
  "cookie-law",
  "cookie-bar",
  "cookie-popup",
  "cerez"
];
