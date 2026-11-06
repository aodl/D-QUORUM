export function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; }
export function safeHttpsLink(label, url) { const parsed = new URL(url); if (parsed.protocol !== "https:") throw new TypeError("Only HTTPS links are permitted."); const a = element("a", label); a.href = parsed.href; a.rel = "noopener noreferrer"; return a; }
export function clear(node) { node.replaceChildren(); }

