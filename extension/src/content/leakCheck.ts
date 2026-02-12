// ─── Password Leak Check (HaveIBeenPwned k-Anonymity) ──────────
// Checks if passwords have been leaked using SHA-1 k-Anonymity model.
// Only the first 5 characters of the SHA-1 hash are sent — the full
// password NEVER leaves the browser.

let isEnabled = true;
const checkedFields = new WeakSet<HTMLInputElement>();

export function initLeakCheck() {
    chrome.storage.local.get('leakCheckEnabled', (result) => {
        isEnabled = result.leakCheckEnabled !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.leakCheckEnabled) {
            isEnabled = changes.leakCheckEnabled.newValue !== false;
        }
    });

    // Watch for password fields via event delegation
    document.addEventListener('focusout', onPasswordBlur, true);
    console.log('[SentinelTK] Leak Check initialized');
}

async function onPasswordBlur(e: Event) {
    if (!isEnabled) return;

    const input = e.target as HTMLInputElement;
    if (!input || input.type !== 'password') return;
    if (checkedFields.has(input)) return;
    if (!input.value || input.value.length < 6) return;

    checkedFields.add(input);

    try {
        // SHA-1 hash of the password
        const encoder = new TextEncoder();
        const data = encoder.encode(input.value);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        const prefix = hashHex.substring(0, 5);
        const suffix = hashHex.substring(5);

        // Query HIBP with k-Anonymity (only prefix sent)
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        if (!res.ok) return;

        const text = await res.text();
        const lines = text.split('\n');

        let breachCount = 0;
        for (const line of lines) {
            const [hashSuffix, count] = line.split(':');
            if (hashSuffix.trim() === suffix) {
                breachCount = parseInt(count.trim(), 10);
                break;
            }
        }

        if (breachCount > 0) {
            showLeakWarning(input, breachCount);
        }
    } catch {
        // Network error or crypto failure — silently ignore
    }
}

function showLeakWarning(input: HTMLInputElement, breachCount: number) {
    // Don't show twice
    if (input.parentElement?.querySelector('[data-sentinel-leak-warning]')) return;

    const warning = document.createElement('div');
    warning.setAttribute('data-sentinel-leak-warning', '');

    const formatted = breachCount > 1000000
        ? `${(breachCount / 1000000).toFixed(1)}M`
        : breachCount > 1000
            ? `${(breachCount / 1000).toFixed(0)}K`
            : `${breachCount}`;

    warning.style.cssText = `
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; padding: 6px 10px; border-radius: 6px;
        background: linear-gradient(135deg, #7f1d1d, #991b1b);
        border: 1px solid #dc2626; color: #fca5a5;
        margin-top: 4px; font-family: system-ui, sans-serif;
        animation: stk-leakFade 0.3s ease-out;
        max-width: 320px;
    `;

    warning.innerHTML = `
        <span style="font-size:14px">🔓</span>
        <div>
            <div style="font-weight:700;color:#fecaca">Bu şifre sızdırılmış!</div>
            <div style="font-size:10px;color:#f87171">${formatted} kez veri ihlallerinde görüldü. Lütfen farklı şifre kullanın.</div>
        </div>
        <span data-close style="cursor:pointer;color:#6b7280;font-size:16px;margin-left:auto">✕</span>
    `;

    // Add animation
    if (!document.querySelector('[data-sentinel-leak-style]')) {
        const style = document.createElement('style');
        style.setAttribute('data-sentinel-leak-style', '');
        style.textContent = `@keyframes stk-leakFade { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`;
        document.head.appendChild(style);
    }

    input.parentElement?.appendChild(warning);

    warning.querySelector('[data-close]')?.addEventListener('click', () => {
        warning.remove();
    });
}
