
import { apiGet, apiPost, $, $$, debounce, throttle, timeAgo } from "./utils.js";

const state = {
  page: 1,
  limit: 10,
  loading: false,
  done: false,
  currentCategory: 0, 
  search: ""
};

document.addEventListener("DOMContentLoaded", () => {
  const root = $("#postsSection");
  if (!root) return;
  bootRealtime(); 
  injectStylesForComposer();
  mountToolbar();
  mountComposer();
  bindAddButton();
  bindInfiniteScroll();
  loadCategoriesIntoFilter().then(() => {
    resetFeed();
  });
});

function bootRealtime() {
  try {
    const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
    const ws = new WebSocket(url);

    ws.addEventListener("message", (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case "post.created":
          
          resetFeed();
          break;

        case "post.reaction":
          applyReactionCountsInline(msg.data);
          break;
          
        case "comment.created":
        window.dispatchEvent(new CustomEvent("ws:comment.created", { detail: msg.data }));
        break;
      }
    });

    ws.addEventListener("close", () => setTimeout(bootRealtime, 1000)); 
  } catch {}
}

function applyReactionCountsInline(d) {
  const id = d?.post_id;
  if (!id) return;
  const likeBtn = document.querySelector(`.post-card .like-btn[data-id="${id}"]`);
  const dislikeBtn = document.querySelector(`.post-card .dislike-btn[data-id="${id}"]`);
  if (!likeBtn || !dislikeBtn) return; 

  const likeCountEl = likeBtn.querySelector(".count");
  const dislikeCountEl = dislikeBtn.querySelector(".count");
  if (typeof d.likes === "number" && likeCountEl) likeCountEl.textContent = d.likes;
  if (typeof d.dislikes === "number" && dislikeCountEl) dislikeCountEl.textContent = d.dislikes;
}

function injectStylesForComposer() {
  const css = `
  .composer-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.45);
    display: none; align-items: center; justify-content: center; z-index: 50;
  }
  .composer {
    width: min(760px, 90vw); background: #111; color: #eee;
    border-radius: 12px; padding: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.5);
  }
  .composer h3 { margin: 0 0 10px; font-size: 18px; }
  .composer .row { display: grid; gap: 10px; }
  .composer input[type="text"] {
    width: 100%; padding: 10px 12px; font-size: 16px; border-radius: 8px; border: 1px solid #333; background:#1a1a1a; color:#eee;
  }
  .composer textarea {
    width: 100%; height: 180px; resize: none; padding: 12px; font-size: 15px;
    border-radius: 10px; border: 1px solid #333; background:#1a1a1a; color:#eee;
  }
  .composer .cats { max-height: 140px; overflow: auto; padding: 8px; border:1px solid #333; border-radius: 8px; background:#0f0f0f; }
  .composer .cats label { display: flex; align-items: center; gap: 8px; padding: 6px 4px; }
  .composer .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .btn { padding: 10px 14px; border-radius: 10px; border: 0; cursor: pointer; }
  .btn-primary { background: #4f46e5; color: #fff; }
  .btn-ghost { background: #222; color:#eee; }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .post-card {
    background:#111; color:#eee; border:1px solid #222; border-radius:12px; padding:12px; margin:10px 0;
  }
  .post-head { display:flex; align-items:center; gap:8px; font-size: 12px; color:#aaa; }
  .post-title { font-weight: 700; font-size: 16px; margin:6px 0; }
  .post-cats { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
  .pill { font-size: 11px; padding:3px 8px; border-radius:999px; background:#1f2937; color:#cbd5e1; border:1px solid #2b3646;}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

function mountToolbar() {
  const postsRoot = $("#postsSection");
  const filterSelect = postsRoot.querySelector(".posts-filter");
  
  filterSelect.addEventListener("change", () => {
    const v = filterSelect.value;
    state.currentCategory = v.startsWith("cat-") ? parseInt(v.slice(4),10) : 0;
    resetFeed();
  });
}

function mountComposer() {
  const backdrop = document.createElement("div");
  backdrop.className = "composer-backdrop";
  backdrop.innerHTML = `
    <div class="composer" role="dialog" aria-modal="true">
      <h3>Create a post</h3>
      <div class="row">
        <input id="cp-title" type="text" placeholder="Title" />
        <textarea id="cp-content" placeholder="Write something meaningful..."></textarea>
        <div class="cats" id="cp-cats"></div>
        <div class="actions">
          <button class="btn btn-ghost" id="cp-cancel">Cancel</button>
          <button class="btn btn-primary" id="cp-publish" disabled>Publish</button>
        </div>
        <div id="cp-error" style="color:#f87171; font-size:12px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const composerEl = backdrop.querySelector(".composer");
  const titleEl    = backdrop.querySelector("#cp-title");
  const bodyEl     = backdrop.querySelector("#cp-content");
  const catsWrap   = backdrop.querySelector("#cp-cats");
  const publishEl  = backdrop.querySelector("#cp-publish");
  const cancelEl   = backdrop.querySelector("#cp-cancel");
  const errorEl    = backdrop.querySelector("#cp-error");

  
  function validateComposer() {
    const title   = (titleEl.value || "").trim();
    const content = (bodyEl.value  || "").trim();

    
    const anyCatChecked = !!catsWrap.querySelector("input[type='checkbox']:checked");

    const ok = title.length >= 3 && content.length >= 5 && anyCatChecked;
    publishEl.disabled = !ok;
  }

  
  
  const triggerValidate = () => validateComposer();

  
  ["input","change","keyup"].forEach(evt => {
    titleEl.addEventListener(evt, triggerValidate);
    bodyEl.addEventListener(evt, triggerValidate);
  });

  
  ["change","input","click","keyup"].forEach(evt => {
    catsWrap.addEventListener(evt, triggerValidate);
  });

  
  new MutationObserver(() => validateComposer())
    .observe(catsWrap, { childList: true, subtree: true });

  
  function openComposer() {
    backdrop.style.display = "flex";
    
    validateComposer();
    titleEl.focus();
  }
  function closeComposer() {
    backdrop.style.display = "none";
    titleEl.value  = "";
    bodyEl.value   = "";
    errorEl.textContent = "";
    
    catsWrap.querySelectorAll("input[type='checkbox']").forEach(cb => cb.checked = false);
    
    publishEl.disabled = true;
  }

  
  cancelEl.addEventListener("click", closeComposer);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeComposer(); });

  
  async function publish() {
    const title   = titleEl.value.trim();
    const content = bodyEl.value.trim();
    const cats    = [...catsWrap.querySelectorAll("input[type='checkbox']:checked")].map(i => parseInt(i.value,10));

    errorEl.textContent = "";
    publishEl.disabled = true; 

    try {
      const res = await apiPost("/api/posts", { title, content, categories: cats });
      if (!res || !res.success) {
        errorEl.textContent = (res && res.message) || "Failed to publish.";
        publishEl.disabled = false;
        return;
      }
      closeComposer();
      
      resetFeed();
    } catch (e) {
      errorEl.textContent = "Network or server error.";
      publishEl.disabled = false;
    }
  }
  publishEl.addEventListener("click", publish);

  
  window.__openComposer = openComposer;
  window.__closeComposer = closeComposer;

  
  
  loadCategoriesForComposer().then(() => validateComposer());
}


function bindAddButton() {
  const addBtn = $(".add-post-btn");
  if (addBtn) addBtn.addEventListener("click", () => window.__openComposer?.());
}

async function loadCategoriesIntoFilter() {
  const postsRoot = $("#postsSection");
  const filterSelect = postsRoot.querySelector(".posts-filter");
  filterSelect.innerHTML = `<option value="all">All Posts</option>`;
  try {
    const res = await apiGet("/api/categories");
    const cats = (res && res.data) || [];
    cats.forEach(c => {
      const opt = document.createElement("option");
      opt.value = `cat-${c.id}`;
      opt.textContent = c.name;
      opt.style.color = "black";
      filterSelect.appendChild(opt);
    });
  } catch (_) {
    
  }
}

async function loadCategoriesForComposer() {
  const wrap = document.querySelector("#cp-cats");
  wrap.textContent = "Loading categories…";
  try {
    const res = await apiGet("/api/categories");
    const cats = (res && res.data) || [];
    if (!cats.length) {
      wrap.textContent = "No categories available.";
      return;
    }
    const frag = document.createDocumentFragment();
    cats.forEach(c => {
      const line = document.createElement("label");
      line.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 4px;";
      line.innerHTML = `<input type="checkbox" value="${c.id}"> <span>${escapeHTML(c.name)}</span>`;
      frag.appendChild(line);
    });
    wrap.innerHTML = "";
    wrap.appendChild(frag);
  } catch {
    wrap.textContent = "Failed to load categories.";
  }
}


function bindInfiniteScroll() {
  const scroller = $(".posts-scroll");
  if (!scroller) return;
  scroller.addEventListener("scroll", throttle(() => {
    if (state.loading || state.done) return;
    const nearBottom = (scroller.scrollTop + scroller.clientHeight) >= (scroller.scrollHeight - 60);
    if (nearBottom) {
      state.page++;
      fetchAndRenderPosts(true);
    }
  }, 200));
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".react-btn");
  if (!btn) return;
  const postId = parseInt(btn.dataset.id, 10);
  const type = btn.dataset.type; 

  const card = btn.closest(".post-card");
  const likeBtn = card.querySelector(".like-btn");
  const dislikeBtn = card.querySelector(".dislike-btn");

  
  const wasLikeActive = likeBtn.classList.contains("is-active");
  const wasDislikeActive = dislikeBtn.classList.contains("is-active");
  const likeCountEl = likeBtn.querySelector(".count");
  const dislikeCountEl = dislikeBtn.querySelector(".count");
  let likeCount = parseInt(likeCountEl.textContent, 10);
  let dislikeCount = parseInt(dislikeCountEl.textContent, 10);

  const apply = (userReaction, likes, dislikes) => {
    likeBtn.classList.toggle("is-active", userReaction === "like");
    dislikeBtn.classList.toggle("is-active", userReaction === "dislike");
    likeBtn.querySelector(".count").textContent = likes;
    dislikeBtn.querySelector(".count").textContent = dislikes;
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
    const res = await apiPost(`/api/posts/${postId}/react`, { type });
    if (res && res.success && res.data) {
      apply(res.data.userReaction, res.data.likes, res.data.dislikes);
    }
  } catch (_) {
    
    
    
  }
});

function resetFeed() {
  state.page = 1;
  state.done = false;
  $(".posts-scroll").innerHTML = "";
  fetchAndRenderPosts(false);
}

async function fetchAndRenderPosts(append) {
  const list = $(".posts-scroll");
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit)
  });
  if (state.currentCategory > 0) params.set("category_id", String(state.currentCategory));
  if (state.search) params.set("search", state.search);

  state.loading = true;
  const marker = document.createElement("div");
  marker.style.cssText = "text-align:center;color:#aaa;padding:8px;";
  marker.textContent = "Loading…";
  if (!append) list.appendChild(marker);

  try {
    const res = await apiGet(`/api/posts?${params.toString()}`);
    const posts = (res && res.data) || [];
    if (!append) list.innerHTML = "";
    if (posts.length === 0) {
      if (!append) list.innerHTML = `<div style="color:#888;padding:12px;">No posts yet.</div>`;
      state.done = true;
      return;
    }
    renderPosts(posts, list);
    if (posts.length < state.limit) state.done = true;
  } catch (e) {
    if (!append) list.innerHTML = `<div style="color:#f87171;padding:12px;">Failed to load posts.</div>`;
  } finally {
    state.loading = false;
  }
}

function renderPosts(posts, container) {
  posts.forEach(p => {
    const card = document.createElement("div");
    const liked = p.my_reaction === "like";
    const disliked = p.my_reaction === "dislike";
    card.className = "post-card";
    card.innerHTML = `
      <div class="post-head">
        <div>@${escapeHTML(p.username)}</div>
        <div>•</div>
        <div>${timeAgo(p.created_at || p.createdAt)}</div>
      </div>
      <div class="post-title">${escapeHTML(p.title)}</div>
      <div class="post-content">${escapeHTML(p.content)}</div>
      <div class="post-cats">
        ${ (p.categories || []).map(c => `<span class="pill">${escapeHTML(c.name)}</span>`).join("") }
      </div>
      <div class="post-buttons" style="margin-top:8px; display:flex; gap:8px;">
    <button class="react-btn like-btn ${liked ? "is-active": ""}" data-id="${p.post_id}" data-type="like">
      👍 <span class="count">${p.likes}</span>
    </button>
    <button class="react-btn dislike-btn ${disliked ? "is-active": ""}" data-id="${p.post_id}" data-type="dislike">
      👎 <span class="count">${p.dislikes}</span>
    </button>
    <button class="comment-toggle-btn" data-id="${p.post_id}">Comment</button>
  </div>
      <div class="comment-section" data-id="${p.post_id}" style="display:none; flex-direction:column; gap:6px; margin-top:8px;">
        <input type="text" placeholder="Write a comment..." style="padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#eee;">
        <div class="comments-list"></div>
      </div>
    `;

    container.appendChild(card);
  });
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
