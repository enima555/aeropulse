/* Faux client Supabase pour le test navigateur : sert tests/e2e/fixture.json (injecté dans window.__FIX). */
(function () {
  var FIX = window.__FIX, session = window.__SESSION || null;
  var TABLES = {
    tenants: [FIX.tenant],
    memberships: [{ tenant_id: FIX.tenant.id, user_id: "u1", role: "editor" }],
    delay_codes: FIX.delay, airports: FIX.airports, flights: FIX.flights, metar_latest: FIX.metar
  };
  function builder(table) {
    var rows = (TABLES[table] || []).slice(), single = false, rng = null;
    var b = {
      select: function () { return b; }, order: function () { return b; }, or: function () { return b; },
      eq: function (c, v) { rows = rows.filter(function (r) { return r[c] === v; }); return b; },
      in: function (c, list) { rows = rows.filter(function (r) { return list.indexOf(r[c]) >= 0; }); return b; },
      range: function (a, z) { rng = [a, z]; return b; },
      single: function () { single = true; return b; },
      then: function (res, rej) {
        var d = rng ? rows.slice(rng[0], rng[1] + 1) : rows;
        return Promise.resolve({ data: single ? d[0] : d, error: null }).then(res, rej);
      }
    };
    return b;
  }
  window.supabase = { createClient: function () {
    return {
      from: builder,
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: session } }); },
        signInWithPassword: function (o) {
          if (o.password !== "bon-mot-de-passe") return Promise.resolve({ data: {}, error: { message: "Invalid login credentials" } });
          session = { access_token: "jeton", user: { id: "u1", email: o.email } };
          return Promise.resolve({ data: { session: session }, error: null });
        },
        signInWithOtp: function () { return Promise.resolve({ error: null }); },
        signOut: function () { session = null; return Promise.resolve({}); }
      }
    };
  } };
})();
