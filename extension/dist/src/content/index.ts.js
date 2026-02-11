import { DEBOUNCE_DOM_SCAN_MS } from "/src/shared/constants.ts.js";
import { scanForFakeBadges, scanForUrgencyText, scanForCountdownTimers, scanContactInfo, generateFingerprint } from "/src/content/domScanner.ts.js";
import { scanInputFields, monitorPasteOnSensitiveFields } from "/src/content/inputWatcher.ts.js";
import { detectBehavioralSignals, startBehaviorMonitor } from "/src/content/behaviorTracker.ts.js";
import { applyRiskAction, showPasteWarning } from "/src/content/formProtection.ts.js";
console.log("[SentinelTK] Content script loaded");
let currentRiskLevel = "NONE";
setTimeout(() => {
  runFullAnalysis();
}, DEBOUNCE_DOM_SCAN_MS);
const observer = new MutationObserver(() => {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => runFullAnalysis(), 1e3);
});
let rescanTimer;
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
setTimeout(() => observer.disconnect(), 15e3);
function runFullAnalysis() {
  const badges = scanForFakeBadges();
  const urgency = scanForUrgencyText();
  const hasCountdown = scanForCountdownTimers();
  const contactInfo = scanContactInfo();
  const fingerprint = generateFingerprint();
  const inputs = scanInputFields();
  const behavior = detectBehavioralSignals();
  const signals = {
    ...badges,
    ...urgency,
    hasCountdownTimer: hasCountdown,
    ...inputs,
    ...behavior,
    contactInfo,
    fingerprintHash: fingerprint
  };
  chrome.runtime.sendMessage({ type: "PAGE_SIGNALS", data: signals });
}
startBehaviorMonitor((signals) => {
  chrome.runtime.sendMessage({
    type: "PAGE_SIGNALS",
    data: signals
  });
});
monitorPasteOnSensitiveFields(() => {
  if (currentRiskLevel === "WARN" || currentRiskLevel === "BLOCK_FORM" || currentRiskLevel === "FULL_BLOCK") {
    showPasteWarning();
  }
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "RISK_ACTION") {
    currentRiskLevel = message.action;
    applyRiskAction(message.action, message.score);
  }
});
