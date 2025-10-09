// assets/js/comments.js
import { apiGet, apiPost, $, $$, throttle, timeAgo, escapeHTML } from "./utils.js";


if (!window.__commentsWS) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.addEventListener("message", (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg && msg.type === "comment.created") {
      window.dispatchEvent(new CustomEvent("ws:comment.created", { detail: msg.data }));
    }
  });
  ws.addEventListener("close", () => setTimeout(() => (window.__commentsWS = null), 1000));
  window.__commentsWS = ws;
}

// Mount once after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const root = $("#postsSection");
  if (!root) return;

  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".comment-toggle-btn");
    if (!btn) return;
    const postId = parseInt(btn.dataset.id, 10);
    const section = root.querySelector(`.comment-section[data-id="${postId}"]`);

    // Close others
    $$(".comment-section").forEach(s => { if (s !== section) s.style.display = "none"; });

    const nowOpen = section.style.display !== "flex";
    section.style.display = nowOpen ? "flex" : "none";

    if (nowOpen) {
      if (!section.dataset.bound) {
        mountCommentPane(section, postId); // sets up scroll + submit once
        section.dataset.bound = "1";
      }
      // ALWAYS trigger initial load if never done
      const list = section.querySelector(".comments-list");
      if (!list.dataset.loadedOnce) {
        section.dispatchEvent(new CustomEvent("comments:load-initial", { bubbles: false }));
      }
    }
  });
});

function mountCommentPane(section, postId) {
  const input = section.querySelector("input[type='text']");
  const list  = section.querySelector(".comments-list");

  const state = {
    loading: false,
    done: false,
    cursor: 0,
    pageSize: 10,
    firstLoad: true,
    boundScroll: false,
  };

  // Initial-load trigger (idempotent)
  section.addEventListener("comments:load-initial", async () => {
    if (state.loading) return;
    // If this pane opens fresh, ensure cursors are reset
    if (!list.dataset.loadedOnce) { state.cursor = 0; state.done = false; }
    await fetchBatch(false); // last 10 newest
  });

  // --- Robust "Enter to send" ---
  let composing = false; // for IMEs
  let sending   = false; // prevent double submits

  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend",  () => { composing = false; });

  input.addEventListener("keydown", async (e) => {
    // Submit on Enter; allow Shift+Enter to be a newline if you switch to <textarea> later
    if (e.key !== "Enter" || e.shiftKey) return;
    if (composing) return;        
    e.preventDefault();

    const content = input.value.trim();
    if (!content || sending) return;

    sending = true;
    input.disabled = true;

    try {
      const res = await apiPost(`/api/posts/${postId}/comments`, { content });
      if (res && res.success) {
        // Clear and reload newest batch
        input.value = "";
        list.innerHTML = "";
        state.cursor = 0;
        state.done = false;
        await fetchBatch(false);
      } else {
        // optional: show an inline error, e.g., toast.err("Failed to post comment");
        console.warn("Failed to post comment:", res);
      }
    } catch (err) {
      console.error("Error posting comment:", err);
    } finally {
      sending = false;
      input.disabled = false;
      input.focus();
    }
  });

  // --- Load older on scroll-to-top (throttled) ---
  if (!state.boundScroll) {
    list.addEventListener("scroll", throttle(() => {
      if (state.loading || state.done) return;
      if (list.scrollTop <= 0) fetchBatch(true);
    }, 250));
    state.boundScroll = true;
  }

  async function fetchBatch(older) {
    state.loading = true;
    const prevH = list.scrollHeight;

    const params = new URLSearchParams({ limit: String(state.pageSize) });
    if (state.cursor > 0) params.set("before_id", String(state.cursor));

    try {
      const res = await apiGet(`/api/posts/${postId}/comments?` + params.toString());
      const items = (res && res.data) || [];
      prependComments(list, items);

      const next = (res && res.nextCursor) || 0;
      state.cursor = next;
      if (items.length < state.pageSize) state.done = true;

      if (older) {
        const diff = list.scrollHeight - prevH;
        list.scrollTop = diff;          // keep anchor when prepending
      } else {
        list.scrollTop = list.scrollHeight; // jump to newest on first load
      }

      list.dataset.loadedOnce = "1";
    } finally {
      state.loading = false;
    }
  }
  // --- Realtime append for this post's pane ---
const onLiveComment = (e) => {
  const d = e.detail || {};
  if (!d || d.post_id !== postId) return;

  // If this comment is already in the list, skip (dedupe)
  if (list.querySelector(`.comment-row[data-id="${d.comment_id}"]`)) return;

  // If user is at bottom, keep them pinned; otherwise don't jump
  const nearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 60;

  const row = document.createElement("div");
  row.className = "comment-row";
  row.dataset.id = d.comment_id; // so dedupe works later
  row.style.cssText = "display:flex; flex-direction:column; gap:2px; padding:6px 4px; border-bottom:1px solid #222;";
  row.innerHTML = `
    <div style="display:flex; gap:6px; color:#9aa; font-size:12px;">
      <b>@${escapeHTML(d.username || "user")}</b>
      <span>•</span>
      <span>${timeAgo(d.created_at || Date.now())}</span>
    </div>
    <div style="color:#000000; font-size:14px;">${escapeHTML(d.content || "")}</div>
    <div style="display:flex; gap:8px; color:#9aa; font-size:12px;">
      <span>👍 0</span>
      <span>👎 0</span>
    </div>
  `;
  list.appendChild(row);

  if (nearBottom) list.scrollTop = list.scrollHeight;
  list.dataset.loadedOnce = "1";
  };


  window.addEventListener("ws:comment.created", onLiveComment);
  }

function prependComments(container, comments) {
  const frag = document.createDocumentFragment();
  comments.forEach(c => {
    const row = document.createElement("div");
    row.className = "comment-row";
    row.dataset.id = c.comment_id; 
    row.style.cssText = "display:flex; flex-direction:column; gap:2px; padding:6px 4px; border-bottom:1px solid #222;";
    row.innerHTML = `
      <div style="display:flex; gap:6px; color:#9aa; font-size:12px;">
        <b>@${escapeHTML(c.username)}</b>
        <span>•</span>
        <span>${timeAgo(c.created_at || c.createdAt)}</span>
      </div>
      <div style="color:#000000; font-size:14px;">${escapeHTML(c.content)}</div>
      <div style="display:flex; gap:8px; color:#9aa; font-size:12px;">
        <span>👍 ${c.likes}</span>
        <span>👎 ${c.dislikes}</span>
      </div>
    `;
    frag.appendChild(row);
  });
  if (container.firstChild) {
    container.insertBefore(frag, container.firstChild);
  } else {
    container.appendChild(frag);
  }
}

