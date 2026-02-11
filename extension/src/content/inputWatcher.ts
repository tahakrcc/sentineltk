// ─── Input Watcher (Privacy-Safe Sensitive Field Detection) ─────
import { SENSITIVE_PATTERNS } from '../shared/constants';

export interface InputSignals {
    hasSensitiveInput: boolean;
    sensitiveInputCount: number;
    sensitiveInputTypes: string[];
}

/**
 * Scan all inputs on the page for sensitive field indicators.
 * NEVER reads the actual input value — only name/id/placeholder/type/maxlength.
 */
export function scanInputFields(): InputSignals {
    const inputs = document.querySelectorAll('input, textarea, select');
    const detectedTypes: Set<string> = new Set();
    let sensitiveCount = 0;

    inputs.forEach(el => {
        const input = el as HTMLInputElement;

        // Gather attributes (never the value!)
        const name = input.name || '';
        const id = input.id || '';
        const placeholder = input.placeholder || '';
        const type = input.type || '';
        const autocomplete = input.autocomplete || '';
        const maxLength = input.maxLength;

        // Nearby label text
        let labelText = '';
        if (input.id) {
            const label = document.querySelector(`label[for="${input.id}"]`);
            labelText = (label as HTMLElement)?.innerText?.toLowerCase() || '';
        }

        const combined = `${name} ${id} ${placeholder} ${type} ${autocomplete} ${labelText}`.toLowerCase();

        // Match against patterns
        if (SENSITIVE_PATTERNS.CREDIT_CARD.test(combined) || type === 'tel' && maxLength >= 13 && maxLength <= 19) {
            detectedTypes.add('credit_card');
            sensitiveCount++;
        }
        if (SENSITIVE_PATTERNS.CVV.test(combined) || (maxLength === 3 || maxLength === 4) && /\d/.test(placeholder)) {
            detectedTypes.add('cvv');
            sensitiveCount++;
        }
        if (SENSITIVE_PATTERNS.IBAN.test(combined)) {
            detectedTypes.add('iban');
            sensitiveCount++;
        }
        if (SENSITIVE_PATTERNS.IDENTITY.test(combined) || maxLength === 11 && type === 'text') {
            detectedTypes.add('identity');
            sensitiveCount++;
        }
        if (SENSITIVE_PATTERNS.OTP.test(combined) || maxLength === 6 && type === 'text') {
            detectedTypes.add('otp');
            sensitiveCount++;
        }
        if (SENSITIVE_PATTERNS.PASSWORD.test(combined) || type === 'password') {
            detectedTypes.add('password');
            sensitiveCount++;
        }
    });

    return {
        hasSensitiveInput: sensitiveCount > 0,
        sensitiveInputCount: sensitiveCount,
        sensitiveInputTypes: [...detectedTypes],
    };
}

/**
 * Monitor for paste events on sensitive fields.
 * Does NOT read clipboard content — only detects the event.
 */
export function monitorPasteOnSensitiveFields(onPasteDetected: () => void): void {
    document.addEventListener('paste', (e) => {
        const target = e.target as HTMLInputElement;
        if (!target || target.tagName !== 'INPUT') return;

        const combined = `${target.name} ${target.id} ${target.placeholder} ${target.type}`.toLowerCase();

        const isSensitive = Object.values(SENSITIVE_PATTERNS).some(p => p.test(combined));
        if (isSensitive) {
            // DO NOT read e.clipboardData — privacy rule
            console.log('[SentinelTK] Paste detected on sensitive field (content NOT read)');
            onPasteDetected();
        }
    });
}
