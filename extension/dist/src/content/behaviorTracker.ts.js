export function detectBehavioralSignals() {
  const signals = {
    hasRightClickBlock: false,
    hasFocusTrap: false,
    hasPopupSpam: false,
    hasScrollLock: false,
    hasPasteBlock: false
  };
  try {
    const bodyAttrs = document.body?.getAttribute("oncontextmenu") || "";
    if (bodyAttrs.includes("return false") || bodyAttrs.includes("preventDefault")) {
      signals.hasRightClickBlock = true;
    }
    const scripts = document.querySelectorAll("script:not([src])");
    scripts.forEach((s) => {
      const code = s.textContent || "";
      if (code.includes("contextmenu") && (code.includes("preventDefault") || code.includes("return false"))) {
        signals.hasRightClickBlock = true;
      }
    });
  } catch {
  }
  try {
    const scripts = document.querySelectorAll("script:not([src])");
    scripts.forEach((s) => {
      const code = s.textContent || "";
      if (code.includes("onbeforeunload") || code.includes("beforeunload")) {
        if (code.includes("returnValue") || code.includes("Are you sure") || code.includes("Emin misiniz")) {
          signals.hasFocusTrap = true;
        }
      }
    });
    if (document.body?.getAttribute("onbeforeunload")) {
      signals.hasFocusTrap = true;
    }
  } catch {
  }
  try {
    const scripts = document.querySelectorAll("script:not([src])");
    let windowOpenCount = 0;
    scripts.forEach((s) => {
      const code = s.textContent || "";
      const matches = code.match(/window\.open/g);
      if (matches) windowOpenCount += matches.length;
    });
    if (windowOpenCount >= 2) {
      signals.hasPopupSpam = true;
    }
  } catch {
  }
  try {
    const bodyStyle = window.getComputedStyle(document.body);
    const htmlStyle = window.getComputedStyle(document.documentElement);
    if (bodyStyle.overflow === "hidden" || htmlStyle.overflow === "hidden") {
      const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"]');
      if (overlays.length > 0) {
        signals.hasScrollLock = true;
      }
    }
  } catch {
  }
  try {
    const inputs = document.querySelectorAll("input");
    inputs.forEach((input) => {
      const onPaste = input.getAttribute("onpaste");
      if (onPaste && (onPaste.includes("return false") || onPaste.includes("preventDefault"))) {
        signals.hasPasteBlock = true;
      }
    });
  } catch {
  }
  return signals;
}
export function startBehaviorMonitor(callback) {
  let checks = 0;
  const interval = setInterval(() => {
    checks++;
    const signals = detectBehavioralSignals();
    callback(signals);
    if (checks >= 5) clearInterval(interval);
  }, 3e3);
}
