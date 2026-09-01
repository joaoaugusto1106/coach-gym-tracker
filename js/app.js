/* Boot + hash router + tab bar. */

window.App = window.App || {};
(function () {
  var el = App.ui.el, icon = App.ui.icon;

  var TABS = [
    { route: "today",   label: "Today",   icon: "dumbbell" },
    { route: "history", label: "History", icon: "cal" },
    { route: "body",    label: "Body",    icon: "scale" },
    { route: "food",    label: "Food",    icon: "fork" },
    { route: "more",    label: "More",    icon: "more" }
  ];

  function tabbar(active) {
    return el("div", { class: "tabbar" }, TABS.map(function (t) {
      return el("a", {
        class: "tab" + (t.route === active ? " on" : ""),
        href: "#/" + t.route
      }, [icon(t.icon, 25), el("span", { text: t.label })]);
    }));
  }

  function parseHash() {
    var h = (location.hash || "#/today").replace(/^#\/?/, "");
    var parts = h.split("/");
    return { name: parts[0] || "today", arg: parts[1] || null };
  }

  function render() {
    var r = parseHash();
    var V = App.views;
    var node, tab = r.name;

    switch (r.name) {
      case "today":   node = V.Today(); break;
      case "session":
        if (r.arg) { node = V.SessionDetail(r.arg); tab = "history"; }
        else { node = V.Session(); tab = "today"; }
        break;
      case "history": node = V.History(); break;
      case "body":    node = V.Placeholder("Body", "Body-weight log and trend arrive in stage 9."); break;
      case "food":    node = V.Placeholder("Food", "Your six-meal checklist arrives in stage 5."); break;
      case "more":    node = V.More(); break;
      default:        node = V.Today(); tab = "today";
    }

    var app = document.getElementById("app");
    app.innerHTML = "";
    app.appendChild(node);
    app.appendChild(tabbar(tab));
    window.scrollTo(0, 0);
  }
  App.render = render;

  function applyTheme() {
    var t = (App.store.get().settings.theme) || "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  App.applyTheme = applyTheme;

  function boot() {
    App.ui.mountSprite();
    App.store.get();            // load or seed
    applyTheme();
    if (!location.hash) location.hash = "#/today";
    render();
    window.addEventListener("hashchange", render);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
