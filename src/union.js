// The Austin Union's motions in the panel: step through past motions, vote Aye or No, see the running
// tally. The chamber mirrors it (banner and lecterns, surface.js); tallies live in Supabase (votes.js).
import { UNION_MOTIONS } from "./content.js";
import { tallies, vote, myVote, rotation } from "./votes.js";

const N = UNION_MOTIONS.length;
let index = null, counts = null, failed = false, rejected = false, pending = null, root = null, chamber = null;

export const voteHTML = () => `<div class="vote" id="vote" aria-live="polite"></div>`;

// This visit's motion (the sign on the plaza and the panel open on the same one).
export function motionIndex() {
  if (index === null) index = rotation(N);
  return index;
}

export function mountVote(el, ch) {
  root = el; chamber = ch;
  motionIndex();
  root.addEventListener("click", onClick);
  render();
  tallies().then((t) => { counts = t; failed = false; render(); }).catch(() => { failed = true; render(); });
}

export function unmountVote() {
  chamber?.hide();
  root = chamber = null;
}

function render() {
  if (!root) return;
  const m = UNION_MOTIONS[index];
  const c = counts?.[m.id] || { ayes: 0, noes: 0 };
  const total = c.ayes + c.noes, mine = pending || myVote(m.id), share = total ? (c.ayes / total) * 100 : 50;
  const off = pending || failed || !counts ? "disabled" : "";
  const status = failed ? "The tally is unavailable right now."
    : !counts ? "Loading the tally…"
    : rejected ? "Your vote didn't go through. Try again in a moment."
    : total ? `${c.ayes} aye · ${c.noes} no` : "No votes yet. Cast the first.";
  root.innerHTML = `
    <div class="vote-head mono">
      <span>The House debates · ${index + 1} of ${N}</span>
      <span class="vote-steps"><button class="link" data-step="-1" aria-label="Previous motion">←</button><button class="link" data-step="1" aria-label="Next motion">→</button></span>
    </div>
    <h3 class="vote-title serif">${m.title}</h3>
    <div class="vote-btns">
      <button class="vote-btn aye${mine === "aye" ? " on" : ""}" data-side="aye" ${off}>Aye</button>
      <button class="vote-btn no${mine === "no" ? " on" : ""}" data-side="no" ${off}>No</button>
    </div>
    <div class="vote-bar${total ? "" : " empty"}"><i style="width:${share.toFixed(1)}%"></i></div>
    <p class="vote-count mono">${status}${mine ? ` · You voted ${mine === "aye" ? "Aye" : "No"}` : ""}</p>`;
  chamber?.show({ title: m.title, ayes: c.ayes, noes: c.noes, known: !!counts });
}

async function onClick(e) {
  const step = e.target.closest("[data-step]");
  if (step && !pending) { index = (index + Number(step.dataset.step) + N) % N; rejected = false; render(); return; }
  const btn = e.target.closest("[data-side]");
  if (!btn || pending || failed || !counts) return;
  const m = UNION_MOTIONS[index], side = btn.dataset.side, before = myVote(m.id);
  if (side === before) return;
  // Show the vote at once; the server's count replaces it a moment later.
  const prev = { ...(counts[m.id] || { ayes: 0, noes: 0 }) }, next = { ...prev };
  if (before) next[before === "aye" ? "ayes" : "noes"]--;
  next[side === "aye" ? "ayes" : "noes"]++;
  counts[m.id] = next;
  pending = side;
  rejected = false;
  render();
  try {
    counts[m.id] = await vote(m.id, side);
  } catch {
    counts[m.id] = prev;
    rejected = true;
  }
  pending = null;
  render();
}
