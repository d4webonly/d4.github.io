export function sendAnalyticsTrigger(triggerId) {
  if (!triggerId) return;
  if (typeof gtag === "function") {
    gtag("event", triggerId);
  } else {
    console.log("[analytics]", triggerId);
  }
}

window.sendAnalyticsTrigger = sendAnalyticsTrigger;
