// Controlled compatibility fixture: a non-baseline extension egress attempt.
// The browser harness must abort and record it, then fail the case rather than
// treating the rejected fetch as a successful smoke.
fetch("https://extension-phone-home.invalid/collect", { mode: "no-cors" }).catch(
  () => {}
);
