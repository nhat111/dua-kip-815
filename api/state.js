const U = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = 'dk815:players', GK = 'dk815:game';
const L = ['dk815:lane:0', 'dk815:lane:1', 'dk815:lane:2'];
const TTL = 15000;
const CLAIM = "for i=1,3 do if redis.call('GET',KEYS[i])==ARGV[1] then redis.call('PEXPIRE',KEYS[i],ARGV[2]) return i-1 end end for i=1,3 do if redis.call('SET',KEYS[i],ARGV[1],'NX','PX',ARGV[2]) then return i-1 end end return -1";
const REL = "for i=1,3 do if redis.call('GET',KEYS[i])==ARGV[1] then redis.call('DEL',KEYS[i]) end end return 1";

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
const pairs = (a) => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };

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
    if (!(U && T)) return res.status(500).json({ error: 'Chua cau hinh Redis' });
    if (req.query && req.query.debug) {
      let ping = 'redis-ok';
      try { await redis([['PING']]); } catch (e) { ping = String(e.message); }
      return res.status(200).json({ redisConfigured: true, ping });
    }
    const b = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
    const act = String(b.a || '');
    const rec = id && b.p && b.p.n ? JSON.stringify({ p: clean(b.p), t: now }) : null;
    const c = [], ix = {};
    if (rec) c.push(['HSET', KEY, id, rec], ['EXPIRE', KEY, 7200]);
    if (act === 'start' && (!process.env.ADMIN_KEY || String(b.key || '') === process.env.ADMIN_KEY)) {
      c.push(['HINCRBY', GK, 'round', 1], ['HSET', GK, 'phase', 'run', 'startAt', now + 5500], ['EXPIRE', GK, 86400], ['DEL', KEY, ...L]);
    }
    if (id && act === 'claim') { ix.claim = c.length; c.push(['EVAL', CLAIM, 3, ...L, id, 8000]); }
    if (id && act === 'release') c.push(['EVAL', REL, 3, ...L, id]);
    ix.pl = c.length; c.push(['HGETALL', KEY]);
    ix.g = c.length; c.push(['HGETALL', GK]);
    ix.l = c.length; c.push(['MGET', ...L]);
    const out = await redis(c);
    const all = pairs(out[ix.pl].result);
    const g = pairs(out[ix.g].result);
    const peers = [], stale = [];
    for (const k of Object.keys(all)) {
      try {
        const o = JSON.parse(all[k]);
        if (now - o.t > TTL) stale.push(k); else peers.push({ id: k, p: o.p });
      } catch (e) { stale.push(k); }
    }
    if (stale.length) redis([['HDEL', KEY, ...stale]]).catch(() => {});
    const resp = {
      peers, now,
      game: { phase: g.phase || 'lobby', startAt: +g.startAt || 0, round: +g.round || 0 },
      lanes: out[ix.l].result || [null, null, null],
    };
    if (ix.claim !== undefined) resp.lane = Number(out[ix.claim].result);
    res.status(200).json(resp);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
