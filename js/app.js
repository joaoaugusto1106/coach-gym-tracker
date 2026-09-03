/* Boot + hash router + tab bar + global reliability banners. */

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
      return el("a", { class: "tab" + (t.route === active ? " on" : ""), href: "#/" + t.route },
        [icon(t.icon, 25), el("span", { text: t.label })]);
    }));
  }

  function parseHash() {
    var h = (location.hash || "#/today").replace(/^#\/?/, "");
    var parts = h.split("/");
    return { name: parts[0] || "today", arg: parts[1] || null };
  }

  // The route we last drew. render() is used for two different things: real
  // navigation (hashchange) and redrawing the screen in place after a state
  // change -- and views.js calls it after nearly every tap. Only the first kind
  // should jump to the top. Without this, logging a set on the third exercise
  // of a push day throws you back to the header, every single set.
  var lastRouteKey = null;

  function render() {
    var app = document.getElementById("app");

    if (App.store.migrationError) {
      app.innerHTML = "";
      app.appendChild(App.views.MigrationRecovery());
      return;
    }

    var r = parseHash();
    var routeKey = r.name + "/" + (r.arg || "");
    var keepScroll = routeKey === lastRouteKey;
    // Emptying #app collapses the page to zero height, which makes the browser
    // clamp the scroll offset -- so remember it before, and put it back after.
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;

    var V = App.views;
    var node, tab = r.name;

    switch (r.name) {
      case "today":   node = V.Today(); break;
      case "session":
        if (r.arg) { node = V.SessionDetail(r.arg); tab = "history"; }
        else { node = V.Session(); tab = "today"; }
        break;
      case "history": node = V.History(); break;
      case "exercise": node = V.ExerciseDetail(r.arg); tab = "history"; break;
      case "body":    node = V.Body(); break;
      case "food":    node = V.Food(); break;
      case "more":    node = V.More(); break;
      default:        node = V.Today(); tab = "today";
    }

    app.innerHTML = "";
    app.appendChild(node);
    app.appendChild(tabbar(tab));
    lastRouteKey = routeKey;

    if (!keepScroll) { window.scrollTo(0, 0); return; }
    // The redraw can leave the page shorter than it was (deleting a set, say),
    // so clamp rather than scrolling into empty space.
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(y, max));
  }
  App.render = render;

  function applyTheme() {
    var t = (App.store.get().settings.theme) || "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  App.applyTheme = applyTheme;

  // Persistent "not saving" banner, toggled by store.js on save success/failure.
  var banner = null;
  App.onSaveHealthChange = function (ok) {
    if (ok) { if (banner) { banner.remove(); banner = null; } return; }
    if (banner) return;
    banner = el("div", { class: "savebar bad" }, [
      icon("warn", 16),
      el("span", { text: "Not saving — storage is full or blocked. Export a backup from More now." })
    ]);
    document.body.appendChild(banner);
  };

  // ---- environment ---------------------------------------------------
  // Used for the honest "this isn't your logging device" warning and the
  // install instructions. Deliberately coarse — we only need Mac vs iPhone.
  function platform() {
    var ua = navigator.userAgent || "";
    var touch = (navigator.maxTouchPoints || 0) > 1;
    if (/iPhone|iPod/.test(ua)) return "iphone";
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return "ipad";
    if (/Macintosh|Mac OS X/.test(ua)) return "mac";
    if (/Android/.test(ua)) return "android";
    return "other";
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      navigator.standalone === true;
  }
  App.env = {
    platform: platform,
    isStandalone: isStandalone,
    isIOS: function () { var p = platform(); return p === "iphone" || p === "ipad"; },
    online: function () { return navigator.onLine !== false; },
    swSupported: function () { return "serviceWorker" in navigator; },
    swState: { registered: false, controlling: false, version: null, updateReady: false, failed: false }
  };

  // ---- service worker ------------------------------------------------
  var updateBar = null;
  function showUpdateBar(reg) {
    if (updateBar) return;
    App.env.swState.updateReady = true;
    var hasDraft = !App.store.migrationError && !!App.store.get().activeSession;
    updateBar = el("div", { class: "updatebar" }, [
      icon("up", 16),
      el("span", { text: hasDraft
        ? "Update ready. Your draft is saved — reloading is safe."
        : "A new version of Coach is ready." }),
      el("button", { class: "ub-btn", type: "button", onclick: function () {
        if (reg && reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        else location.reload();
      } }, ["Reload"]),
      el("button", { class: "ub-btn ghost", type: "button", "aria-label": "dismiss",
        onclick: function () { updateBar.remove(); updateBar = null; } }, [icon("x", 14)])
    ]);
    document.body.appendChild(updateBar);
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    // file:// has no SW; don't noisily fail
    if (location.protocol === "file:") return;

    navigator.serviceWorker.register("sw.js").then(function (reg) {
      App.env.swState.registered = true;
      App.env.swState.controlling = !!navigator.serviceWorker.controller;

      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg);

      reg.addEventListener("updatefound", function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", function () {
          // "installed" with an existing controller means this is an update,
          // not the very first install
          if (sw.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(reg);
        });
      });

      // ask the active worker what version it is, for the More screen
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "VERSION" });
      }
    })["catch"](function (e) {
      App.env.swState.failed = true;
      console.warn("Coach: service worker registration failed —", e);
      // the app still works fully; only offline launch is unavailable
      if (App.render) App.render();
    });

    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "VERSION") {
        App.env.swState.version = e.data.version;
      }
    });

    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  function boot() {
    App.ui.mountSprite();
    App.store.get();            // load + migrate (or set migrationError)
    if (!App.store.migrationError) {
      applyTheme();
      if (App.store.recoveredFromLKG) {
        setTimeout(function () { App.ui.toast("Recovered your data from the last good copy"); }, 400);
      }
    }
    if (!location.hash) location.hash = "#/today";
    render();
    window.addEventListener("hashchange", render);
    window.addEventListener("online", render);
    window.addEventListener("offline", render);

    // Text fields (session and exercise notes) write straight into the state
    // object as you type but only hit storage on blur -- so typing a note and
    // then swiping the app away loses it. Flush on the way out. Saving is
    // cheap and idempotent, and this is the last moment iOS gives us.
    function flush() {
      if (!App.store.migrationError) App.store.save();
    }
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });

    registerSW();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
