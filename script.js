import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

/* ---------------------------
   FIREBASE CONFIG
--------------------------- */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "french-lesson-117de.firebaseapp.com",
  projectId: "french-lesson-117de",
  storageBucket: "french-lesson-117de.firebasestorage.app",
  messagingSenderId: "1005222773906",
  appId: "1:1005222773906:web:9223baf83ec9cf9de3d24b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------------------------
   APP SETTINGS
--------------------------- */
const ROOM_ID = "main-lounge";
const ONLINE_WINDOW_MS = 90 * 1000;
const HEARTBEAT_MS = 25000;

const startScreen = document.getElementById("startScreen");
const chatApp = document.getElementById("chatApp");
const startForm = document.getElementById("startForm");
const usernameInput = document.getElementById("usernameInput");
const sidebarUsername = document.getElementById("sidebarUsername");

const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const messages = document.getElementById("messages");
const emptyState = document.getElementById("emptyState");

const emojiToggle = document.getElementById("emojiToggle");
const emojiPanel = document.getElementById("emojiPanel");
const emojiItems = document.querySelectorAll(".emoji-item");

const membersBtn = document.getElementById("membersBtn");
const membersPanel = document.getElementById("membersPanel");
const closeMembers = document.getElementById("closeMembers");
const membersList = document.getElementById("membersList");
const membersCount = document.getElementById("membersCount");

let currentUsername = "";
let sessionId = localStorage.getItem("novaroom_session_id");
let heartbeatInterval = null;
let unsubscribeMessages = null;
let unsubscribeMembers = null;

if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("novaroom_session_id", sessionId);
}

/* ---------------------------
   HELPERS
--------------------------- */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

function normalizeUsername(name) {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function formatTimeFromDate(date) {
  if (!(date instanceof Date)) return "Now";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showEmptyState(show) {
  emptyState.style.display = show ? "block" : "none";
}

function openEmojiPanel() {
  emojiPanel.classList.add("show");
  emojiToggle.classList.add("active");
  emojiToggle.setAttribute("aria-expanded", "true");
}

function closeEmojiPanel() {
  emojiPanel.classList.remove("show");
  emojiToggle.classList.remove("active");
  emojiToggle.setAttribute("aria-expanded", "false");
}

function openMembersPanel() {
  membersPanel.classList.add("show");
}

function closeMembersPanel() {
  membersPanel.classList.remove("show");
}

function spawnFloatingEmoji(emoji, sourceElement) {
  const rect = sourceElement.getBoundingClientRect();
  const floating = document.createElement("div");

  floating.className = "floating-emoji";
  floating.textContent = emoji;
  floating.style.left = `${rect.left + rect.width / 2}px`;
  floating.style.top = `${rect.top + window.scrollY}px`;

  document.body.appendChild(floating);

  setTimeout(() => {
    floating.remove();
  }, 1000);
}

/* ---------------------------
   FIRESTORE PATHS
--------------------------- */
function roomDocRef() {
  return doc(db, "rooms", ROOM_ID);
}

function messagesCollectionRef() {
  return collection(db, "rooms", ROOM_ID, "messages");
}

function roomUserDocRef() {
  return doc(db, "rooms", ROOM_ID, "roomUsers", sessionId);
}

/* ---------------------------
   PRESENCE
--------------------------- */
async function upsertPresence() {
  if (!currentUsername) return;

  await setDoc(
    roomUserDocRef(),
    {
      username: currentUsername,
      sessionId,
      roomId: ROOM_ID,
      lastSeen: serverTimestamp()
    },
    { merge: true }
  );
}

function startHeartbeat() {
  stopHeartbeat();
  upsertPresence();

  heartbeatInterval = setInterval(() => {
    upsertPresence().catch(console.error);
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/* ---------------------------
   RENDER MESSAGES
--------------------------- */
function renderMessages(docs) {
  messages.innerHTML = "";

  if (!docs.length) {
    messages.appendChild(emptyState);
    showEmptyState(true);
    return;
  }

  showEmptyState(false);

  docs.forEach((messageDoc) => {
    const data = messageDoc.data();

    const username = data.username || "Guest";
    const text = data.text || "";
    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const firstLetter = username.charAt(0).toUpperCase();

    const row = document.createElement("div");
    row.className = "message-row";

    row.innerHTML = `
      <div class="avatar">${escapeHtml(firstLetter)}</div>
      <div class="message-content">
        <div class="message-meta">${escapeHtml(username)} <span>${formatTimeFromDate(ts)}</span></div>
        <div class="message-bubble">${escapeHtml(text)}</div>
      </div>
    `;

    messages.appendChild(row);
  });

  messages.scrollTop = messages.scrollHeight;
}

/* ---------------------------
   RENDER MEMBERS
--------------------------- */
function renderMembers(docs) {
  const now = Date.now();

  const onlineUsers = docs
    .map((memberDoc) => memberDoc.data())
    .filter((member) => {
      const lastSeen = member.lastSeen?.toDate ? member.lastSeen.toDate().getTime() : 0;
      return now - lastSeen < ONLINE_WINDOW_MS;
    })
    .sort((a, b) => {
      const aTime = a.lastSeen?.toDate ? a.lastSeen.toDate().getTime() : 0;
      const bTime = b.lastSeen?.toDate ? b.lastSeen.toDate().getTime() : 0;
      return bTime - aTime;
    });

  membersList.innerHTML = "";
  membersCount.textContent = onlineUsers.length;

  onlineUsers.forEach((member) => {
    const name = member.username || "Guest";
    const firstLetter = name.charAt(0).toUpperCase();

    const item = document.createElement("div");
    item.className = "member-item";

    item.innerHTML = `
      <div class="member-left">
        <div class="member-avatar">${escapeHtml(firstLetter)}</div>
        <div class="member-name">${escapeHtml(name)}</div>
      </div>
      <div class="member-badge">Online</div>
    `;

    membersList.appendChild(item);
  });
}

/* ---------------------------
   FIRESTORE LISTENERS
--------------------------- */
function listenToMessages() {
  if (unsubscribeMessages) unsubscribeMessages();

  const q = query(messagesCollectionRef(), orderBy("createdAt", "asc"), limit(200));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    renderMessages(snapshot.docs);
  });
}

function listenToMembers() {
  if (unsubscribeMembers) unsubscribeMembers();

  const q = query(
    collection(db, "rooms", ROOM_ID, "roomUsers"),
    orderBy("lastSeen", "desc"),
    limit(300)
  );

  unsubscribeMembers = onSnapshot(q, (snapshot) => {
    renderMembers(snapshot.docs);
  });
}

/* ---------------------------
   SEND MESSAGE
--------------------------- */
async function sendMessage(text) {
  const cleanText = text.trim();
  if (!cleanText || !currentUsername) return;

  await addDoc(messagesCollectionRef(), {
    username: currentUsername,
    text: cleanText,
    roomId: ROOM_ID,
    sessionId,
    createdAt: serverTimestamp()
  });

  await upsertPresence();
}

/* ---------------------------
   START CHAT
--------------------------- */
function enterChat(username) {
  currentUsername = username;
  sidebarUsername.textContent = currentUsername;
  localStorage.setItem("novaroom_username", currentUsername);

  startScreen.classList.add("hidden");
  chatApp.classList.remove("hidden");

  listenToMessages();
  listenToMembers();
  startHeartbeat();

  messageInput.focus();
}

/* ---------------------------
   EVENTS
--------------------------- */
startForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const enteredName = normalizeUsername(usernameInput.value);
  if (!enteredName) {
    usernameInput.focus();
    return;
  }

  try {
    await setDoc(
      roomUserDocRef(),
      {
        username: enteredName,
        sessionId,
        roomId: ROOM_ID,
        joinedAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      },
      { merge: true }
    );

    enterChat(enteredName);
  } catch (error) {
    console.error(error);
    alert("Could not enter the chat. Check your Firebase config and Firestore rules.");
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text) return;

  try {
    await sendMessage(text);
    messageInput.value = "";
    closeEmojiPanel();
    messageInput.focus();
  } catch (error) {
    console.error(error);
    alert("Could not send message. Check your Firestore rules.");
  }
});

emojiToggle.addEventListener("click", () => {
  const isOpen = emojiPanel.classList.contains("show");
  if (isOpen) closeEmojiPanel();
  else openEmojiPanel();
});

emojiItems.forEach((item) => {
  item.addEventListener("click", () => {
    const emoji = item.textContent;
    messageInput.value += emoji;
    messageInput.focus();
    spawnFloatingEmoji(emoji, item);
  });
});

membersBtn.addEventListener("click", () => {
  membersPanel.classList.toggle("show");
});

closeMembers.addEventListener("click", () => {
  closeMembersPanel();
});

document.addEventListener("click", (event) => {
  const clickedInsidePanel = emojiPanel.contains(event.target);
  const clickedToggle = emojiToggle.contains(event.target);

  if (!clickedInsidePanel && !clickedToggle) {
    closeEmojiPanel();
  }

  const clickedMembersButton = membersBtn.contains(event.target);
  const clickedMembersPanel = membersPanel.contains(event.target);

  if (!clickedMembersButton && !clickedMembersPanel) {
    closeMembersPanel();
  }
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeEmojiPanel();
  }
});

window.addEventListener("beforeunload", () => {
  stopHeartbeat();
});

/* ---------------------------
   RESTORE LAST USERNAME
--------------------------- */
const savedUsername = localStorage.getItem("novaroom_username");
if (savedUsername) {
  usernameInput.value = savedUsername;
}
