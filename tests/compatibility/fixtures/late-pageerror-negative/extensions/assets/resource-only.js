window.__hermesCompatibilityResourceOnlyLoaded = true;
// Fire the error late enough that it lands AFTER the first (boot) health check
// but before the negative-path final re-check. The first check runs shortly
// after a 1s settle (~1.5s in); the final re-check runs only after the 4s
// negative-entry wait (~5.5s in). A 3s delay sits squarely in that window, so
// the first check is provably clean and only the final re-check catches it —
// which is what makes that final re-check load-bearing rather than redundant.
setTimeout(() => {
  throw new Error("compatibility late pageerror fixture");
}, 3000);
