/* Apple Health bridge — write path.

   A web app cannot talk to HealthKit. The only on-device route that needs no
   server, no account and no API key is a companion Shortcut: we hand it a
   small JSON summary over the documented `shortcuts://` URL scheme, and it
   calls Health's own "Log Workout" action.

   What crosses the bridge is a SUMMARY — type, start, end, duration, and a few
   numbers for the notification text. Per-set detail stays in this app, the
   same as every other strength app.

   Deliberately NOT used: x-callback-url. Coming back from Shortcuts can land
   in Safari rather than the installed app, which would look like data loss
   even though nothing was lost. Instead the app asks you what happened and
   only records a success you actually confirm. It never claims a result it
   cannot observe. */

window.App = window.App || {};
(function () {
  var M = App.model, U = App.util;

  var MIN_MINUTES = 5;
  var MAX_MINUTES = 240;

  function workingSetsOf(session) {
    var n = 0, volume = 0;
    (session.entries || []).forEach(function (en) {
      M.workingSets(en.sets).forEach(function (s) {
        n++; volume += (s.weightKg || 0) * (s.reps || 0);
      });
    });
    return { sets: n, volumeKg: Math.round(volume) };
  }

  // Minutes between the session's own timestamps, clamped to something a
  // gym session can plausibly be. A draft left open overnight shouldn't
  // write a 14-hour workout into Health.
  function suggestedMinutes(session) {
    if (!session.startedAt || !session.endedAt) return 60;
    var mins = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
    if (!isFinite(mins) || mins < MIN_MINUTES) return MIN_MINUTES;
    if (mins > MAX_MINUTES) return MAX_MINUTES;
    return mins;
  }
  function wasClamped(session) {
    if (!session.startedAt || !session.endedAt) return false;
    var mins = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000);
    return !isFinite(mins) || mins < MIN_MINUTES || mins > MAX_MINUTES;
  }

  /* The summary handed to the Shortcut. `end` is derived from the chosen
     duration rather than the raw timestamp, so what Health records matches
     what you confirmed on screen. */
  function payload(state, session, minutes) {
    var mins = minutes == null ? suggestedMinutes(session) : minutes;
    var counts = workingSetsOf(session);
    var start = session.startedAt || new Date().toISOString();
    var end = new Date(new Date(start).getTime() + mins * 60000).toISOString();
    return {
      v: 1,
      type: "Functional Strength Training",
      sessionId: session.id,
      day: session.dayName || "Training",
      date: session.date,
      start: start,
      end: end,
      durationMin: mins,
      exercises: (session.entries || []).filter(function (e) { return e.sets.length; }).length,
      sets: counts.sets,
      volumeKg: counts.volumeKg
    };
  }

  function payloadText(p) { return JSON.stringify(p); }

  function shortcutURL(shortcutName, p) {
    return "shortcuts://run-shortcut" +
      "?name=" + encodeURIComponent(shortcutName || "Log Strength Workout") +
      "&input=text" +
      "&text=" + encodeURIComponent(payloadText(p));
  }

  // Shortcuts only exists on Apple platforms. Everywhere else the button
  // should explain rather than fail silently.
  function isSupported() {
    return App.env && App.env.isIOS ? App.env.isIOS() : false;
  }

  function open(url) {
    // location.href keeps the current page, so returning from Shortcuts comes
    // back to the app rather than a blank tab
    window.location.href = url;
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  App.health = {
    MIN_MINUTES: MIN_MINUTES,
    MAX_MINUTES: MAX_MINUTES,
    suggestedMinutes: suggestedMinutes,
    wasClamped: wasClamped,
    workingSetsOf: workingSetsOf,
    payload: payload,
    payloadText: payloadText,
    shortcutURL: shortcutURL,
    isSupported: isSupported,
    open: open,
    copy: copy
  };
})();
