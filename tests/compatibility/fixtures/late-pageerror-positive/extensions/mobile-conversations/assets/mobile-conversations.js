// Minimal extension contract used only to exercise the late-pageerror path.
(() => {
  const install = () => {
    const shell = document.querySelector(".messages-shell");
    if (!shell) return;
    const button = document.createElement("button");
    button.id = "mobileConversationsBtn";
    button.type = "button";
    button.dataset.hwxMobileConversations = "1";
    button.setAttribute("aria-label", "Open conversations");
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "Conversation shortcuts");
      ["New conversation", "Open sidebar", "Go to top", "Go to last message"].forEach((label) => {
        const item = document.createElement("button");
        item.setAttribute("role", "menuitem");
        item.textContent = label;
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      setTimeout(() => {
        throw new Error("compatibility late pageerror fixture");
      }, 0);
    });
    shell.appendChild(button);
    window.HermesMobileConversationsExtension = { version: "0.1.1" };
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
