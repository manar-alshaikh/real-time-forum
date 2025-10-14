import { $, escapeHTML } from "./utils.js";


let currentProfile = null;
let isInitialized = false;

document.addEventListener("DOMContentLoaded", () => {
  const slot = $("#userProfile");
  if (!slot) return;

  renderSkeleton(slot);
  waitForLoginThenLoad(slot);
  setupUserChangeHandlers();
});

function setupUserChangeHandlers() {
  
  document.addEventListener('userLoggedIn', () => {
    console.log('Profile: User logged in, loading profile...');
    const slot = $("#userProfile");
    if (slot) {
      renderSkeleton(slot);
      waitForLoginThenLoad(slot);
    }
  });

  document.addEventListener('userLoggedOut', () => {
    console.log('Profile: User logged out, clearing profile...');
    currentProfile = null;
    isInitialized = false;
    
    const slot = $("#userProfile");
    if (slot) {
      renderLoggedOutState(slot);
    }
  });

  
  document.addEventListener('contactsManagerReady', () => {
    console.log('Profile: Contacts manager ready, profile might need refresh');
    const slot = $("#userProfile");
    if (slot && !currentProfile) {
      renderSkeleton(slot);
      waitForLoginThenLoad(slot);
    }
  });
}

function renderLoggedOutState(slot) {
  slot.innerHTML = `
    <div class="profile-card">
      <div class="avatar">
        <div class="avatar-fallback">👤</div>
      </div>
      <div class="profile-info">
        <div class="profile-name">Not Logged In</div>
        <div class="profile-details">Please sign in to view profile</div>
      </div>
    </div>
  `;
}

function waitForLoginThenLoad(slot) {
  let loaded = false;
  let retryCount = 0;
  const maxRetries = 5;

  const tryLoad = async () => {
    if (loaded) return;
    
    
    if (!document.body.classList.contains("logged-in")) {
      console.log('Profile: User not logged in, waiting...');
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryLoad, 500);
      }
      return;
    }

    const ok = await loadProfile(slot);
    if (ok) {
      loaded = true;
      isInitialized = true;
    } else if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(tryLoad, 500);
    }
  };

  
  if (document.body.classList.contains("logged-in")) {
    tryLoad();
    return;
  }

  
  const obs = new MutationObserver(() => {
    if (document.body.classList.contains("logged-in")) {
      obs.disconnect();
      tryLoad();
    }
  });
  obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  
  setTimeout(tryLoad, 1000);
}

async function loadProfile(slot) {
  try {
    console.log('Profile: Loading profile data...');
    const resp = await fetch("/api/profile", {
      method: "GET",
      credentials: "include", 
      cache: "no-store",
    });
    
    if (!resp.ok) {
      console.error('Profile: API response not OK', resp.status);
      return false;
    } 

    const res = await resp.json();
    console.log('Profile: API response:', res);
    
    if (!res || !res.success || !res.data) {
      console.error('Profile: Invalid response data');
      return false;
    }

    const p = normalizeProfile(res.data);
    currentProfile = p;
    renderProfile(slot, p);
    
    console.log('Profile: Successfully loaded for user:', p.username);
    return true;
  } catch (error) {
    console.error('Profile: Failed to load profile:', error);
    return false;
  }
}

function normalizeProfile(raw) {
  const username = (raw.username ?? raw.userName ?? "").toString();
  const age =
    typeof raw.age === "number"
      ? raw.age
      : isFinite(parseInt(raw.age, 10))
      ? parseInt(raw.age, 10)
      : null;
  const gender = (raw.gender ?? raw.sex ?? "").toString();
  const description = (raw.description ?? raw.bio ?? "").toString();
  const profile_picture = (
    raw.profile_picture ??
    raw.avatar_url ??
    raw.avatarURL ??
    raw.avatar ??
    ""
  ).toString();

  return { username, age, gender, description, profile_picture };
}

function renderSkeleton(slot) {
  slot.innerHTML = `
    <div class="profile-card">
      <div class="avatar">
        <div class="avatar-fallback skeleton">•</div>
      </div>
      <div class="profile-info">
        <div class="profile-name skeleton">Loading...</div>
        <div class="profile-details skeleton">Fetching profile...</div>
      </div>
    </div>
  `;
}

function renderProfile(slot, profile) {
  const initials = profile.username ? profile.username.charAt(0).toUpperCase() : "?";
  const hasPic = profile.profile_picture && profile.profile_picture.trim() !== "";

  const avatarHTML = hasPic
    ? `
      <img src="${escapeHTML(profile.profile_picture)}"
           alt="${escapeHTML(profile.username)}'s profile picture"
           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="avatar-fallback" style="display:none">${escapeHTML(initials)}</div>
    `
    : `<div class="avatar-fallback">${escapeHTML(initials)}</div>`;

  slot.innerHTML = `
    <div class="profile-card">
      <div class="avatar">${avatarHTML}</div>
      <div class="profile-info">
        <div class="profile-name">@${escapeHTML(profile.username)}</div>
        <div class="profile-details">
          ${profile.gender ? `<span class="detail-pill">${escapeHTML(profile.gender)}</span>` : ""}
          ${profile.age ? `<span class="detail-pill">${profile.age} years</span>` : ""}
        </div>
        <div class="profile-description">
          ${profile.description ? escapeHTML(profile.description) : "No description yet."}
        </div>
      </div>
    </div>
  `;
}


(function () {
  if (document.getElementById("profile-styles")) return;

  const styles = `
    #userProfile {
      height: 100%;
      width: 100%;
      display: flex;
    }

    .profile-card {
      position: relative;
      height: 100%;
      width: 70%;
      flex: 1;
      background: #111317;
      color: #e6ebf3;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 15px;
    }

    .avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      overflow: hidden;
      background: #0f1420;
      border: 1px solid #22324e;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      font-size: 40px;
      font-weight: bold;
    }

    .profile-info {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 300px;
    }

    .profile-name {
      font-size: 18px;
      font-weight: bold;
      color: white;
    }

    .profile-details {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .detail-pill {
      background: #0e1420;
      border: 1px solid #22324e;
      color: #cbd5e1;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
    }

    .profile-description {
      color: #d7ddea;
      font-size: 14px;
      line-height: 1.4;
    }

    
    .skeleton {
      background: linear-gradient(90deg, #1a1f2e 25%, #22324e 50%, #1a1f2e 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 4px;
      color: transparent !important;
    }

    .skeleton::before {
      content: "\\00a0"; 
    }

    @keyframes loading {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }
  `;

  const styleEl = document.createElement("style");
  styleEl.id = "profile-styles";
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
})();


export { currentProfile, isInitialized };
