const U = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = 'dk815:players';
const TTL = 15000;
const mem = global.__dk815 || (global.__dk815 = new Map());

async function redis(cmds) {
  const r = await fetch(U + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + T, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('redis http ' + r.status);
  const bad = Array.isArray(j) && j.find((x) => x && x.error);
  if (bad) throw new Error('redis: ' + bad.error);
  return j;
}

function clean(p) {
  return {
    n: String(p.n || '').replace(/[<>&"]/g, '').slice(0, 14),
    s: +p.s | 0,
    g: Math.max(0, Math.min(100, +p.g | 0)),
    r: p.r === 'ok' || p.r === 'late' ? p.r : null,
    l: Math.max(0, Math.min(60, +p.l || 0)),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const now = Date.now();
  try {
    if (req.query && req.query.debug) {
      let ping = 'chua-dung-redis';
      if (U && T) {
        try { await redis([['PING']]); ping = 'redis-ok'; } catch (e) { ping = String(e.message); }
      }
      return res.status(200).json({ redisConfigured: !!(U && T), ping });
    }
    const b = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
    const rec = id && b.p && b.p.n ? JSON.stringify({ p: clean(b.p), t: now }) : null;
    const all = {};
    if (U && T) {
      const cmds = [];
      if (rec) cmds.push(['HSET', KEY, id, rec], ['EXPIRE', KEY, 7200]);
      cmds.push(['HGETALL', KEY]);
      const out = await redis(cmds);
      const arr = out[out.length - 1].result || [];
      for (let i = 0; i < arr.length; i += 2) all[arr[i]] = arr[i + 1];
    } else {
      if (rec) mem.set(id, rec);
      mem.forEach((v, k) => (all[k] = v));
    }
    const peers = [], stale = [];
    for (const k of Object.keys(all)) {
      try {
        const o = JSON.parse(all[k]);
        if (now - o.t > TTL) stale.push(k); else peers.push({ id: k, p: o.p });
      } catch (e) { stale.push(k); }
    }
    if (stale.length) {
      if (U && T) redis([['HDEL', KEY, ...stale]]).catch(() => {});
      else stale.forEach((k) => mem.delete(k));
    }
    res.status(200).json({ peers });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
