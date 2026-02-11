import { SENSITIVE_PATTERNS } from "/src/shared/constants.ts.js";
export function scanInputFields() {
  const inputs = document.querySelectorAll("input, textarea, select");
  const detectedTypes = /* @__PURE__ */ new Set();
  let sensitiveCount = 0;
  inputs.forEach((el) => {
    const input = el;
    const name = input.name || "";
    const id = input.id || "";
    const placeholder = input.placeholder || "";
    const type = input.type || "";
    const autocomplete = input.autocomplete || "";
    const maxLength = input.maxLength;
    let labelText = "";
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      labelText = label?.innerText?.toLowerCase() || "";
    }
    const combined = `${name} ${id} ${placeholder} ${type} ${autocomplete} ${labelText}`.toLowerCase();
    if (SENSITIVE_PATTERNS.CREDIT_CARD.test(combined) || type === "tel" && maxLength >= 13 && maxLength <= 19) {
      detectedTypes.add("credit_card");
      sensitiveCount++;
    }
    if (SENSITIVE_PATTERNS.CVV.test(combined) || (maxLength === 3 || maxLength === 4) && /\d/.test(placeholder)) {
      detectedTypes.add("cvv");
      sensitiveCount++;
    }
    if (SENSITIVE_PATTERNS.IBAN.test(combined)) {
      detectedTypes.add("iban");
      sensitiveCount++;
    }
    if (SENSITIVE_PATTERNS.IDENTITY.test(combined) || maxLength === 11 && type === "text") {
      detectedTypes.add("identity");
      sensitiveCount++;
    }
    if (SENSITIVE_PATTERNS.OTP.test(combined) || maxLength === 6 && type === "text") {
      detectedTypes.add("otp");
      sensitiveCount++;
    }
    if (SENSITIVE_PATTERNS.PASSWORD.test(combined) || type === "password") {
      detectedTypes.add("password");
      sensitiveCount++;
    }
  });
  return {
    hasSensitiveInput: sensitiveCount > 0,
    sensitiveInputCount: sensitiveCount,
    sensitiveInputTypes: [...detectedTypes]
  };
}
export function monitorPasteOnSensitiveFields(onPasteDetected) {
  document.addEventListener("paste", (e) => {
    const target = e.target;
    if (!target || target.tagName !== "INPUT") return;
    const combined = `${target.name} ${target.id} ${target.placeholder} ${target.type}`.toLowerCase();
    const isSensitive = Object.values(SENSITIVE_PATTERNS).some((p) => p.test(combined));
    if (isSensitive) {
      console.log("[SentinelTK] Paste detected on sensitive field (content NOT read)");
      onPasteDetected();
    }
  });
}
