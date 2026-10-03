/* AeroPulse · KPI côté application.
 * Même définition que la fonction SQL public.kpi_summary (voir docs/kpi-definitions.md).
 * Le test tests/parity.test.mjs vérifie que les deux donnent les mêmes valeurs. */
(function (root) {
  "use strict";
  var MIN = 60000;
  function ms(v) { return v == null ? null : (typeof v === "number" ? v : Date.parse(v)); }
  function round(x, d) { if (x == null || !isFinite(x)) return null; var k = Math.pow(10, d); return Math.round(x * k) / k; }
  function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

  /** Début et fin du jour local `day` (YYYY-MM-DD) dans le fuseau `tz`, en millisecondes UTC. */
  function dayBounds(day, tz) {
    function offsetAt(utcMs) {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(utcMs)).reduce(function (o, x) { o[x.type] = x.value; return o; }, {});
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
    }
    function localMidnight(d) {
      var parts = d.split("-").map(Number), guess = Date.UTC(parts[0], parts[1] - 1, parts[2]);
      var t = guess - offsetAt(guess);
      return guess - offsetAt(t);
    }
    var next = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1)).toISOString().slice(0, 10);
    return { d0: localMidnight(day), d1: localMidnight(next), localMidnight: localMidnight };
  }
  function atLocal(day, hhmm, tz) {
    var b = dayBounds(day, tz), h = hhmm.split(":");
    return b.d0 + (+h[0] * 60 + +h[1]) * MIN;
  }

  function actualOff(f) { var a = ms(f.atd); if (a != null) return a; var t = ms(f.takeoff); return t == null ? null : t - 10 * MIN; }
  function actualIn(f) { var a = ms(f.ata); if (a != null) return a; var l = ms(f.landing); return l == null ? null : l + 5 * MIN; }

  /**
   * @param flights lignes de la table flights (dates ISO)
   * @param o { airport, day, tz, at (ms ou ISO), curfew (objet ou null), airline (optionnel) }
   */
  function summary(flights, o) {
    var b = dayBounds(o.day, o.tz), at = ms(o.at), d0 = b.d0, d1 = b.d1;
    var fl = flights.filter(function (f) { return !o.airline || f.airline_iata === o.airline; });
    var dep = fl.filter(function (f) { var s = ms(f.std); return f.dep_airport === o.airport && s != null && s >= d0 && s < d1; });
    var arr = fl.filter(function (f) { var s = ms(f.sta); return f.arr_airport === o.airport && s != null && s >= d0 && s < d1; });
    var depDone = dep.filter(function (f) { var a = actualOff(f); return f.status !== "cancelled" && a != null && a <= at; });
    var arrDone = arr.filter(function (f) { var a = actualIn(f); return f.status !== "cancelled" && f.status !== "diverted" && a != null && a <= at; });
    var sched = dep.filter(function (f) { return ms(f.std) <= at; }).concat(arr.filter(function (f) { return ms(f.sta) <= at; }));
    var depDelay = depDone.map(function (f) { return Math.max(0, (actualOff(f) - ms(f.std)) / MIN); });
    var depOnTime = depDone.filter(function (f) { return actualOff(f) - ms(f.std) <= 15 * MIN; }).length;
    var arrOnTime = arrDone.filter(function (f) { return actualIn(f) - ms(f.sta) <= 15 * MIN; }).length;
    var taxiOut = depDone.filter(function (f) { return f.takeoff && f.atd; }).map(function (f) { return (ms(f.takeoff) - ms(f.atd)) / MIN; });
    var taxiIn = arrDone.filter(function (f) { return f.ata && f.landing; }).map(function (f) { return (ms(f.ata) - ms(f.landing)) / MIN; });
    var doneAll = depDone.concat(arrDone);
    var withPax = doneAll.filter(function (f) { return f.pax != null; });
    var withPaxSeats = withPax.filter(function (f) { return f.seats != null; });
    var seatSum = withPaxSeats.reduce(function (s, f) { return s + f.seats; }, 0);
    var codes = {};
    depDone.forEach(function (f) { (f.delay_codes || []).forEach(function (c) { codes[c.code] = (codes[c.code] || 0) + Number(c.min); }); });
    Object.keys(codes).forEach(function (k) { codes[k] = round(codes[k], 1); });

    var cf = null;
    if (o.curfew) {
      var cfOff = atLocal(o.day, o.curfew.last_offblock, o.tz), cfLand = atLocal(o.day, o.curfew.last_landing, o.tz);
      cf = dep.filter(function (f) {
        var a = actualOff(f), s = ms(f.std);
        return f.status !== "cancelled" && (a == null || a > at) && at > s - 120 * MIN && ms(f.atd || f.etd || f.std) > cfOff;
      }).length + arr.filter(function (f) {
        var a = actualIn(f), ref = f.std ? ms(f.std) : ms(f.sta) - 180 * MIN;
        return f.status !== "cancelled" && f.status !== "diverted" && (a == null || a > at) && ms(f.ata || f.eta || f.sta) > cfLand && at > ref - 60 * MIN;
      }).length;
    }
    var cancelled = sched.filter(function (f) { return f.status === "cancelled"; }).length;
    return {
      dep_scheduled: dep.filter(function (f) { return ms(f.std) <= at; }).length,
      dep_done: depDone.length,
      dep_on_time: depOnTime,
      otp_dep: depDone.length ? round(depOnTime / depDone.length, 4) : null,
      arr_done: arrDone.length,
      arr_on_time: arrOnTime,
      otp_arr: arrDone.length ? round(arrOnTime / arrDone.length, 4) : null,
      movements: depDone.length + arrDone.length,
      scheduled: sched.length,
      cancelled: cancelled,
      regularity: sched.length ? round(1 - cancelled / sched.length, 4) : null,
      delay_minutes: round(depDelay.reduce(function (s, x) { return s + x; }, 0), 1),
      avg_delay_per_dep: round(avg(depDelay), 2),
      taxi_out_avg: round(avg(taxiOut), 2),
      taxi_in_avg: round(avg(taxiIn), 2),
      pax: withPax.length ? withPax.reduce(function (s, f) { return s + f.pax; }, 0) : null,
      load_factor: seatSum ? round(withPaxSeats.reduce(function (s, f) { return s + f.pax; }, 0) / seatSum, 4) : null,
      delay_by_code: codes,
      curfew_risk: cf
    };
  }

  var api = { summary: summary, dayBounds: dayBounds, atLocal: atLocal, actualOff: actualOff, actualIn: actualIn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AeroKPI = api;
})(typeof self !== "undefined" ? self : this);
