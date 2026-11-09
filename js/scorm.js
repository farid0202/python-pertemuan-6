/* Pembungkus sederhana SCORM 1.2 — aman dijalankan di luar LMS (mode pratinjau). */
var SCORM = (function () {
  var api = null, active = false, finished = false;

  function findAPI(win) {
    var tries = 0;
    while (win && !win.API && win.parent && win.parent !== win && tries < 10) {
      tries++; win = win.parent;
    }
    return win && win.API ? win.API : null;
  }
  function getAPI() {
    var a = null;
    try { a = findAPI(window); } catch (e) {}
    if (!a) { try { if (window.opener) a = findAPI(window.opener); } catch (e) {} }
    return a;
  }

  return {
    init: function () {
      api = getAPI();
      if (!api) return false;
      try { active = String(api.LMSInitialize("")) === "true"; } catch (e) { active = false; }
      if (active) {
        var st = this.get("cmi.core.lesson_status");
        if (st === "not attempted" || st === "") this.set("cmi.core.lesson_status", "incomplete");
        this.commit();
      }
      return active;
    },
    isActive: function () { return active; },
    get: function (k) { if (!active) return ""; try { return String(api.LMSGetValue(k)); } catch (e) { return ""; } },
    set: function (k, v) { if (!active) return false; try { return String(api.LMSSetValue(k, String(v))) === "true"; } catch (e) { return false; } },
    commit: function () { if (!active) return false; try { return String(api.LMSCommit("")) === "true"; } catch (e) { return false; } },
    finish: function () {
      if (!active || finished) return;
      finished = true;
      try { api.LMSCommit(""); api.LMSFinish(""); } catch (e) {}
    }
  };
})();
