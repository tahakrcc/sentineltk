// ─── Form Protection & Warning Overlay ──────────────────────────
import type { RiskAction } from '../shared/types';

let overlayElement: HTMLElement | null = null;
let warningBannerElement: HTMLElement | null = null;

/**
 * Apply a risk action received from background.
 */
export function applyRiskAction(action: RiskAction, score: number): void {
    switch (action) {
        case 'NONE':
            removeOverlay();
            removeWarningBanner();
            unlockForms();
            break;

        case 'WARN':
            removeOverlay();
            showWarningBanner(score);
            break;

        case 'BLOCK_FORM':
            removeOverlay();
            showWarningBanner(score);
            lockForms();
            break;

        case 'FULL_BLOCK':
            lockForms();
            showBlockOverlay(score);
            break;
    }
}

// ═══════════════════════════════════════════════════════════════
// WARNING BANNER (Suspicious - 40-69)
// ═══════════════════════════════════════════════════════════════

function showWarningBanner(score: number): void {
    if (warningBannerElement) return;

    warningBannerElement = document.createElement('div');
    warningBannerElement.id = 'sentineltk-warning-banner';
    warningBannerElement.innerHTML = `
    <div style="
      position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000; padding: 10px 20px; font-family: -apple-system, sans-serif;
      font-size: 14px; display: flex; align-items: center; justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: sentineltk-slideDown 0.3s ease;
    ">
      <span>
        <strong>⚠️ SentinelTK:</strong> Bu site şüpheli olarak değerlendirildi (Risk Puanı: ${score}/100).
        Kişisel bilgilerinizi girerken dikkatli olun.
      </span>
      <button id="sentineltk-dismiss-warn" style="
        background: rgba(0,0,0,0.2); border: none; color: #000; padding: 4px 12px;
        border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;
      ">Kapat</button>
    </div>
  `;

    document.documentElement.appendChild(warningBannerElement);

    document.getElementById('sentineltk-dismiss-warn')?.addEventListener('click', () => {
        removeWarningBanner();
    });
}

function removeWarningBanner(): void {
    warningBannerElement?.remove();
    warningBannerElement = null;
}

// ═══════════════════════════════════════════════════════════════
// FULL BLOCK OVERLAY (Danger - 70+)
// ═══════════════════════════════════════════════════════════════

function showBlockOverlay(score: number): void {
    if (overlayElement) return;

    overlayElement = document.createElement('div');
    overlayElement.id = 'sentineltk-block-overlay';
    overlayElement.innerHTML = `
    <div style="
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(15,15,15,0.97); color: #fff;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: sentineltk-fadeIn 0.3s ease;
    ">
      <div style="text-align:center; max-width:500px; padding:40px;">
        <div style="font-size:72px; margin-bottom:20px;">🛡️</div>
        <h1 style="color:#ef4444; font-size:28px; margin:0 0 12px;">
          Yüksek Risk Tespit Edildi
        </h1>
        <p style="color:#d1d5db; font-size:16px; line-height:1.6; margin:0 0 8px;">
          SentinelTK bu sayfayı <strong style="color:#ef4444;">potansiyel dolandırıcılık</strong> olarak değerlendirdi.
        </p>
        <p style="
          background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px; padding: 12px; color: #fca5a5; font-size: 14px; margin: 16px 0;
        ">
          Risk Puanı: <strong>${score}/100</strong>
        </p>
        <p style="color:#9ca3af; font-size:13px; margin-bottom:24px;">
          Kişisel bilgilerinizi, kredi kartı numaranızı veya şifrelerinizi bu sayfaya girmeyin.
        </p>
        <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
          <button id="sentineltk-go-back" style="
            background:#ef4444; color:#fff; border:none; padding:12px 32px;
            border-radius:8px; font-size:15px; cursor:pointer; font-weight:600;
            transition: all 0.2s;
          ">← Geri Dön</button>
          <button id="sentineltk-override" style="
            background:transparent; color:#6b7280; border:1px solid #374151;
            padding:12px 24px; border-radius:8px; font-size:13px; cursor:pointer;
          ">Riski anlıyorum, devam et (3s basılı tut)</button>
        </div>
        <p style="color:#4b5563; font-size:11px; margin-top:20px;">
          SentinelTK • Kişisel verileriniz asla okunmaz veya kaydedilmez.
        </p>
      </div>
    </div>
  `;

    document.documentElement.appendChild(overlayElement);

    // Go back button
    document.getElementById('sentineltk-go-back')?.addEventListener('click', () => {
        history.back();
    });

    // Override button - requires 3 second hold
    const overrideBtn = document.getElementById('sentineltk-override');
    let holdTimer: ReturnType<typeof setTimeout> | null = null;

    overrideBtn?.addEventListener('mousedown', () => {
        overrideBtn.textContent = 'Basılı tutun... 3';
        let countdown = 3;
        holdTimer = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(holdTimer!);
                // Send override message to background
                chrome.runtime.sendMessage({ type: 'USER_OVERRIDE' });
                removeOverlay();
                unlockForms();
            } else {
                overrideBtn.textContent = `Basılı tutun... ${countdown}`;
            }
        }, 1000);
    });

    overrideBtn?.addEventListener('mouseup', () => {
        if (holdTimer) {
            clearInterval(holdTimer);
            holdTimer = null;
            overrideBtn.textContent = 'Riski anlıyorum, devam et (3s basılı tut)';
        }
    });

    overrideBtn?.addEventListener('mouseleave', () => {
        if (holdTimer) {
            clearInterval(holdTimer);
            holdTimer = null;
            overrideBtn.textContent = 'Riski anlıyorum, devam et (3s basılı tut)';
        }
    });
}

function removeOverlay(): void {
    overlayElement?.remove();
    overlayElement = null;
}

// ═══════════════════════════════════════════════════════════════
// FORM LOCKING
// ═══════════════════════════════════════════════════════════════

function lockForms(): void {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        if (form.dataset.sentineltkLocked) return;
        form.dataset.sentineltkLocked = 'true';

        // Disable submit buttons
        const submits = form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
        submits.forEach(btn => {
            (btn as HTMLButtonElement).disabled = true;
            (btn as HTMLElement).style.opacity = '0.4';
            (btn as HTMLElement).style.cursor = 'not-allowed';
        });

        // Add visual warning to form
        const warning = document.createElement('div');
        warning.className = 'sentineltk-form-warning';
        warning.style.cssText = `
      background: linear-gradient(135deg, #7f1d1d, #991b1b);
      color: #fca5a5; padding: 10px 14px; border-radius: 6px;
      font-size: 13px; font-family: -apple-system, sans-serif;
      margin-bottom: 8px; display: flex; align-items: center; gap: 8px;
      border: 1px solid rgba(239,68,68,0.3);
    `;
        warning.innerHTML = '🛡️ <strong>SentinelTK:</strong> Bu form şüpheli bir sayfada bulunuyor. Gönder butonu kilitlendi.';
        form.prepend(warning);

        // Block submit event
        form.addEventListener('submit', (e) => {
            if (form.dataset.sentineltkLocked === 'true') {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    });
}

function unlockForms(): void {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.dataset.sentineltkLocked = '';

        // Re-enable submit buttons
        const submits = form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
        submits.forEach(btn => {
            (btn as HTMLButtonElement).disabled = false;
            (btn as HTMLElement).style.opacity = '';
            (btn as HTMLElement).style.cursor = '';
        });

        // Remove warnings
        form.querySelectorAll('.sentineltk-form-warning').forEach(w => w.remove());
    });
}

// ═══════════════════════════════════════════════════════════════
// PASTE WARNING (only on high-risk sites)
// ═══════════════════════════════════════════════════════════════

export function showPasteWarning(): void {
    const existing = document.getElementById('sentineltk-paste-warning');
    if (existing) return;

    const toast = document.createElement('div');
    toast.id = 'sentineltk-paste-warning';
    toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
    background: rgba(239,68,68,0.95); color: #fff; padding: 12px 20px;
    border-radius: 8px; font-family: -apple-system, sans-serif;
    font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: sentineltk-slideUp 0.3s ease;
  `;
    toast.textContent = '⚠️ Yüksek riskli sitede yapıştırma işlemi algılandı!';

    document.documentElement.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

// CSS Animation injection
const style = document.createElement('style');
style.textContent = `
  @keyframes sentineltk-fadeIn { from { opacity:0 } to { opacity:1 } }
  @keyframes sentineltk-slideDown { from { transform:translateY(-100%) } to { transform:translateY(0) } }
  @keyframes sentineltk-slideUp { from { transform:translateY(100%); opacity:0 } to { transform:translateY(0); opacity:1 } }
`;
document.documentElement.appendChild(style);
