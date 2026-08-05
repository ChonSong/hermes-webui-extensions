// Regression fixture: Playwright must mock this routed socket without dialing
// the external origin.  A mocked route still reaches the page's open event.
window.__hermesCompatibilityWebSocketState = "connecting";
const socket = new WebSocket("wss://extension-websocket.invalid/socket");
socket.addEventListener("open", () => {
  window.__hermesCompatibilityWebSocketState = "open";
});
socket.addEventListener("error", () => {
  window.__hermesCompatibilityWebSocketState = "error";
});
