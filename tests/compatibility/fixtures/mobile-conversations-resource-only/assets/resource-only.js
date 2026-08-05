(() => {
  // The browser gate must observe this script as an injected resource while
  // still failing when the reference extension's entry is absent.
  window.__hermesCompatibilityResourceOnlyLoaded = true;
})();
