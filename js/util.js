/* Tiny shared helpers. Loaded first so store.js and model.js can both use them. */

window.App = window.App || {};
(function () {

  function uid(prefix) {
    return (prefix || "id") + "-" +
      Date.now().toString(36) + "-" +
      Math.floor(Math.random() * 1e9).toString(36);
  }

  // A UTC instant, for timestamps ("when did this happen").
  function nowISO() { return new Date().toISOString(); }

  // A calendar date (YYYY-MM-DD) in Perth — for "which training day / week is this".
  // Perth is a fixed UTC+8 (no daylight saving), so this is stable.
  function perthDateISO(d) {
    d = d || new Date();
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit"
      }).format(d);
    } catch (e) {
      // very old engine without Intl tz support — fall back to +8 offset
      return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
    }
  }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  App.util = { uid: uid, nowISO: nowISO, perthDateISO: perthDateISO, deepCopy: deepCopy };
})();
