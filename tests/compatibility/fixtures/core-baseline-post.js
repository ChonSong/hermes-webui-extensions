// Regression fixture: an exact Core CDN URL with the wrong HTTP method.
// The browser guard must classify this as unexpected rather than spending the
// baseline allowance for the corresponding GET script request.
fetch("https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js", {
  method: "POST",
  mode: "no-cors",
  body: "compatibility-post-probe",
}).catch(() => {});
