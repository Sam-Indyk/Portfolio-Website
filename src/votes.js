// Austin Union votes, kept in Supabase (see supabase/migrations). The anon key is public by design:
// the database exposes nothing to it but two functions, union_tallies and union_vote.
const API = "https://irvdhvnisargckhgpaxx.supabase.co/rest/v1/rpc/";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlydmRodm5pc2FyZ2NraGdwYXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NjM0OTksImV4cCI6MjEwOTEzOTQ5OX0.dcHwOfK--pdBAInEM_7UsTHZHhvNJRmrtFxozGhRFBo";

async function call(fn, body) {
  const r = await fetch(API + fn, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status}`);
  return r.json();
}

// Browser storage can be missing (private windows) or throw; voting still works without it.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not kept */ } },
};
let voter = store.get("au-voter");
if (!voter) { voter = crypto.randomUUID(); store.set("au-voter", voter); }

export const myVote = (motion) => store.get(`au-vote:${motion}`);

// { motionId: { ayes, noes } }
export async function tallies() {
  const rows = await call("union_tallies", {});
  return Object.fromEntries(rows.map((r) => [r.motion, { ayes: Number(r.ayes), noes: Number(r.noes) }]));
}

export async function vote(motion, side) {
  const [r] = await call("union_vote", { p_motion: motion, p_voter: voter, p_side: side });
  store.set(`au-vote:${motion}`, side);
  return { ayes: Number(r.ayes), noes: Number(r.noes) };
}

// Which motion this visit opens on: the next one after last visit's.
export function rotation(n) {
  const last = store.get("au-motion");
  const i = last === null ? 0 : (Number(last) + 1) % n;
  store.set("au-motion", String(i));
  return i;
}
