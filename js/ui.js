/* Small DOM toolkit: el() builder, the inline icon set, a bottom sheet,
   and a toast. No framework. */

window.App = window.App || {};
(function () {

  // el("div", { class:"card", onclick:fn, text:"hi" }, [childNode, "string", null])
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" || typeof c === "number"
        ? document.createTextNode(String(c)) : c);
    });
    return n;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  function icon(name, size) {
    var s = size || 24;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ic");
    svg.setAttribute("width", s);
    svg.setAttribute("height", s);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  var SPRITE =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<symbol id="i-dumbbell" viewBox="0 0 24 24"><path d="M6.5 8.5v7M4 10.2v3.6M17.5 8.5v7M20 10.2v3.6M7 12h10"/></symbol>' +
    '<symbol id="i-cal" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3.2"/><path d="M4 10h16M9 3v4M15 3v4"/></symbol>' +
    '<symbol id="i-scale" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4.2"/><circle cx="12" cy="13" r="2.4"/><path d="M12 10.6V8"/></symbol>' +
    '<symbol id="i-fork" viewBox="0 0 24 24"><path d="M7 3v6a2.2 2.2 0 0 0 4.4 0V3M9.2 15.2V21M16 3c-1.7 0-2.7 2.6-2.7 5.4 0 2.1 1 3.3 2.7 3.5V21"/></symbol>' +
    '<symbol id="i-more" viewBox="0 0 24 24"><circle class="fill" cx="5" cy="12" r="1.6"/><circle class="fill" cx="12" cy="12" r="1.6"/><circle class="fill" cx="19" cy="12" r="1.6"/></symbol>' +
    '<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></symbol>' +
    '<symbol id="i-minus" viewBox="0 0 24 24"><path d="M6 12h12"/></symbol>' +
    '<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></symbol>' +
    '<symbol id="i-chev" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></symbol>' +
    '<symbol id="i-up" viewBox="0 0 24 24"><path d="M12 19V6M6 12l6-6 6 6"/></symbol>' +
    '<symbol id="i-trophy" viewBox="0 0 24 24"><path d="M7 4h10v3.2a5 5 0 0 1-10 0zM7 6H4.6A2.5 2.5 0 0 0 7 9.6M17 6h2.4A2.5 2.5 0 0 1 17 9.6M10 12.4h4M9 20h6M12 12.4V20"/></symbol>' +
    '<symbol id="i-warn" viewBox="0 0 24 24"><path d="M12 4l9 15H3zM12 10v4M12 17h.01"/></symbol>' +
    '<symbol id="i-swap" viewBox="0 0 24 24"><path d="M7 4L4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7"/></symbol>' +
    '<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>' +
    '</defs></svg>';

  function mountSprite() {
    var host = el("div");
    host.innerHTML = SPRITE;
    document.body.appendChild(host.firstChild);
  }

  // Bottom sheet. Returns { body, open, close }.
  function sheet(title) {
    var body = el("div", { class: "sheet-body" });
    var panel = el("div", { class: "sheet-panel" }, [
      el("div", { class: "sheet-grip" }),
      title ? el("div", { class: "sheet-title", text: title }) : null,
      body
    ]);
    var back = el("div", { class: "sheet-backdrop" }, [panel]);
    function close() {
      back.classList.remove("in");
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 260);
    }
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    function open() {
      // only ever one sheet at a time — a stacked sheet hides the one beneath it
      [].forEach.call(document.querySelectorAll(".sheet-backdrop"), function (n) {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add("in"); });
    }
    return { body: body, open: open, close: close, panel: panel };
  }

  function toast(msg) {
    var t = el("div", { class: "toast", text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("in"); });
    setTimeout(function () {
      t.classList.remove("in");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2200);
  }

  App.ui = { el: el, icon: icon, sheet: sheet, toast: toast, mountSprite: mountSprite };
})();
