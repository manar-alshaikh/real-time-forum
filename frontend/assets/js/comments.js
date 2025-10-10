
import { apiGet, apiPost, $, $$, throttle, timeAgo, escapeHTML } from "./utils.js";

if (!window.__commentsWS) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.addEventListener("message", (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg && msg.type === "comment.created") {
      window.dispatchEvent(new CustomEvent("ws:comment.created", { detail: msg.data }));
    }
    if (msg && msg.type === "comment.reaction") {
      window.dispatchEvent(new CustomEvent("ws:comment.reaction", { detail: msg.data }));
    }
  });
  ws.addEventListener("close", () => setTimeout(() => (window.__commentsWS = null), 1000));
  window.__commentsWS = ws;
}


document.addEventListener("DOMContentLoaded", () => {
  const root = $("#postsSection");
  if (!root) return;

  
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".comment-toggle-btn");
    if (!btn) return;
    
    const postId = parseInt(btn.dataset.id, 10);
    const section = root.querySelector(`.comment-section[data-id="${postId}"]`);
    
    if (!section) {
      console.log("Comment section not found for post:", postId);
      return;
    }

    
    $$(".comment-section").forEach(s => { 
      if (s !== section) s.style.display = "none"; 
    });

    const nowOpen = section.style.display !== "flex";
    section.style.display = nowOpen ? "flex" : "none";

    if (nowOpen) {
      if (!section.dataset.bound) {
        mountCommentPane(section, postId);
        section.dataset.bound = "1";
      }
      const list = section.querySelector(".comments-list");
      if (!list.dataset.loadedOnce) {
        section.dispatchEvent(new CustomEvent("comments:load-initial", { bubbles: false }));
      }
    }
  });

  
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest(".comment-react-btn");
    if (!btn) return;
    
    const commentId = parseInt(btn.dataset.id, 10);
    const type = btn.dataset.type; 

    console.log("Comment reaction clicked:", { commentId, type });

    const row = btn.closest(".comment-row");
    const likeBtn = row.querySelector(".comment-like-btn");
    const dislikeBtn = row.querySelector(".comment-dislike-btn");

    
    const wasLikeActive = likeBtn.classList.contains("is-active");
    const wasDislikeActive = dislikeBtn.classList.contains("is-active");
    const likeCountEl = likeBtn.querySelector(".count");
    const dislikeCountEl = dislikeBtn.querySelector(".count");
    let likeCount = parseInt(likeCountEl.textContent, 10);
    let dislikeCount = parseInt(dislikeCountEl.textContent, 10);

    const apply = (userReaction, likes, dislikes) => {
      likeBtn.classList.toggle("is-active", userReaction === "like");
      dislikeBtn.classList.toggle("is-active", userReaction === "dislike");
      likeCountEl.textContent = likes;
      dislikeCountEl.textContent = dislikes;
    };

    
    let userReaction = (wasLikeActive && type==="like") || (wasDislikeActive && type==="dislike") ? "" : type;
    if (type === "like") {
      if (wasLikeActive) { likeCount--; }            
      else { likeCount++; if (wasDislikeActive) { dislikeCount--; } } 
    } else {
      if (wasDislikeActive) { dislikeCount--; }
      else { dislikeCount++; if (wasLikeActive) { likeCount--; } }
    }
    apply(userReaction, likeCount, dislikeCount);

    
    try {
      console.log("Sending reaction to server...");
      const res = await apiPost(`/api/comments/${commentId}/react`, { type });
      console.log("Server response:", res);
      if (res && res.success && res.data) {
        apply(res.data.userReaction, res.data.likes, res.data.dislikes);
      }
    } catch (error) {
      console.error("Failed to react to comment:", error.message);
      
      const originalLikes = parseInt(likeCountEl.textContent, 10);
      const originalDislikes = parseInt(dislikeCountEl.textContent, 10);
      const originalReaction = wasLikeActive ? "like" : wasDislikeActive ? "dislike" : "";
      apply(originalReaction, originalLikes, originalDislikes);
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

  section.addEventListener("comments:load-initial", async () => {
    if (state.loading) return;
    if (!list.dataset.loadedOnce) { state.cursor = 0; state.done = false; }
    await fetchBatch(false);
  });

  let composing = false;
  let sending   = false;

  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend",  () => { composing = false; });

  input.addEventListener("keydown", async (e) => {
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
        input.value = "";
        list.innerHTML = "";
        state.cursor = 0;
        state.done = false;
        await fetchBatch(false);
      } else {
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
        list.scrollTop = diff;
      } else {
        list.scrollTop = list.scrollHeight;
      }

      list.dataset.loadedOnce = "1";
    } finally {
      state.loading = false;
    }
  }

  const onLiveComment = (e) => {
    const d = e.detail || {};
    if (!d || d.post_id !== postId) return;

    if (list.querySelector(`.comment-row[data-id="${d.comment_id}"]`)) return;

    const nearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 60;

    const row = document.createElement("div");
    row.className = "comment-row";
    row.dataset.id = d.comment_id;
    row.style.cssText = "display:flex; flex-direction:column; gap:2px; padding:6px 4px; border-bottom:1px solid #222;";
    row.innerHTML = `
      <div style="display:flex; gap:6px; color:#9aa; font-size:12px;">
        <b>@${escapeHTML(d.username || "user")}</b>
        <span>•</span>
        <span>${timeAgo(d.created_at || Date.now())}</span>
      </div>
      <div style="color:#000000; font-size:14px;">${escapeHTML(d.content || "")}</div>
      <div style="display:flex; gap:8px; color:#9aa; font-size:12px;">
        <button class="comment-react-btn comment-like-btn" data-id="${d.comment_id}" data-type="like" style="background:none; border:none; cursor:pointer; color:#9aa; padding:2px 6px; border-radius:4px;">
          👍 <span class="count">0</span>
        </button>
        <button class="comment-react-btn comment-dislike-btn" data-id="${d.comment_id}" data-type="dislike" style="background:none; border:none; cursor:pointer; color:#9aa; padding:2px 6px; border-radius:4px;">
          👎 <span class="count">0</span>
        </button>
      </div>
    `;
    list.appendChild(row);

    if (nearBottom) list.scrollTop = list.scrollHeight;
    list.dataset.loadedOnce = "1";
  };

  const onLiveReaction = (e) => {
    const d = e.detail || {};
    if (!d || !d.comment_id) return;

    const row = list.querySelector(`.comment-row[data-id="${d.comment_id}"]`);
    if (!row) return;

    const likeBtn = row.querySelector(".comment-like-btn");
    const dislikeBtn = row.querySelector(".comment-dislike-btn");
    const likeCountEl = likeBtn.querySelector(".count");
    const dislikeCountEl = dislikeBtn.querySelector(".count");

    likeCountEl.textContent = d.likes || 0;
    dislikeCountEl.textContent = d.dislikes || 0;
  };

  window.addEventListener("ws:comment.created", onLiveComment);
  window.addEventListener("ws:comment.reaction", onLiveReaction);
}

function prependComments(container, comments) {
  const frag = document.createDocumentFragment();
  comments.forEach(c => {
    const row = document.createElement("div");
    row.className = "comment-row";
    row.dataset.id = c.comment_id; 
    row.style.cssText = "display:flex; flex-direction:column; gap:2px; padding:6px 4px; border-bottom:1px solid #222;";
    
    
    const liked = c.my_reaction === "like";
    const disliked = c.my_reaction === "dislike";
    
    row.innerHTML = `
      <div style="display:flex; gap:6px; color:#9aa; font-size:12px;">
        <b>@${escapeHTML(c.username)}</b>
        <span>•</span>
        <span>${timeAgo(c.created_at || c.createdAt)}</span>
      </div>
      <div style="color:#000000; font-size:14px;">${escapeHTML(c.content)}</div>
      <div style="display:flex; gap:8px; color:#9aa; font-size:12px;">
        <button class="comment-react-btn comment-like-btn ${liked ? 'is-active' : ''}" 
                data-id="${c.comment_id}" data-type="like" 
                style="background:none; border:none; cursor:pointer; color:${liked ? '#4f46e5' : '#9aa'}; padding:2px 6px; border-radius:4px;">
          👍 <span class="count">${c.likes}</span>
        </button>
        <button class="comment-react-btn comment-dislike-btn ${disliked ? 'is-active' : ''}" 
                data-id="${c.comment_id}" data-type="dislike" 
                style="background:none; border:none; cursor:pointer; color:${disliked ? '#4f46e5' : '#9aa'}; padding:2px 6px; border-radius:4px;">
          👎 <span class="count">${c.dislikes}</span>
        </button>
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
