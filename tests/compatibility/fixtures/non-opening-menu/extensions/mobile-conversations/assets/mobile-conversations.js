// Regression fixture: render the entry contract but deliberately do not open
// the documented menu when the harness exercises the context-menu gesture.
(() => {
  window.HermesMobileConversationsExtension = { version: "0.1.1" };
  const install = () => {
    const shell = document.querySelector(".messages-shell");
    if (!shell) return;
    const button = document.createElement("button");
    button.id = "mobileConversationsBtn";
    button.type = "button";
    button.dataset.hwxMobileConversations = "1";
    button.setAttribute("aria-label", "Open conversations");
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    shell.appendChild(button);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
