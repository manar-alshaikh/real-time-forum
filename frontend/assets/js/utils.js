export const $  = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export async function apiGet(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  if (!res.ok) return null;
  return res.json();
}

export async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function throttle(fn, wait=200) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn(...args);
    }
  };
}

export function debounce(fn, delay=250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

export function timeAgo(ts) {
  const d = new Date(ts);
  const s = Math.floor((Date.now() - d.getTime())/1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s/60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h/24);
  return `${days}d ago`;
}

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

export function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
  
  socket = new WebSocket(wsUrl);

  socket.addEventListener('open', (event) => {
    console.log('WebSocket connected successfully');
    reconnectAttempts = 0; 
    
    
    document.dispatchEvent(new CustomEvent('websocketReady'));
  });

  socket.addEventListener('message', (event) => {
    console.log('WebSocket message received:', event.data);
  });

  socket.addEventListener('close', (event) => {
    console.log('WebSocket disconnected:', event.code, event.reason);
    
    
    if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(1000 * reconnectAttempts, 10000); 
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts})`);
      
      setTimeout(() => {
        connectWebSocket();
      }, delay);
    }
  });

  socket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

export function reconnectWebSocket() {
  console.log('Forcing WebSocket reconnection for user change...');
  reconnectAttempts = 0;
  connectWebSocket();
}

export function emit(type, data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, data }));
  } else {
    console.warn('WebSocket not connected, cannot emit message');
  }
}


document.addEventListener('userLoggedIn', () => {
  console.log('User logged in, reconnecting WebSocket...');
  setTimeout(() => {
    reconnectWebSocket();
  }, 500);
});

document.addEventListener('userLoggedOut', () => {
  console.log('User logged out, WebSocket will be reconnected on next login');
});


connectWebSocket();
