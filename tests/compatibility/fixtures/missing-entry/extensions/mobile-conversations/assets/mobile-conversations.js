// Served-resource-only regression fixture.  It intentionally never creates
// the extension-owned entry, while still being a successful JavaScript load.
window.__hermesCompatibilityMissingEntryLoaded = true;
