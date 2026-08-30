const state = {
  sessionId: localStorage.getItem("sk_session") || "",
  accessCode: localStorage.getItem("sk_code") || "",
  pair: null,
};

const loginPanel = document.querySelector("#login-panel");
const workspace = document.querySelector("#workspace");
const loginForm = document.querySelector("#login-form");
const activityForm = document.querySelector("#activity-form");
const chatForm = document.querySelector("#chat-form");
const refreshButton = document.querySelector("#refresh-button");
const conflictResult = document.querySelector("#conflict-result");
const summaryGrid = document.querySelector("#summary-grid");
const chatLog = document.querySelector("#chat-log");
const connectionStatus = document.querySelector("#connection-status");
const pairLabel = document.querySelector("#pair-label");

loginForm.sessionId.value = state.sessionId;
loginForm.accessCode.value = state.accessCode;

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function pairName(pair) {
  return pair === "hj" ? "Hesam & Jana" : "Christian & Meike";
}

function showWorkspace() {
  loginPanel.classList.add("hidden");
  workspace.classList.remove("hidden");
  connectionStatus.textContent = pairName(state.pair);
  pairLabel.textContent = `Private to ${pairName(state.pair)}`;
}

function renderStatus(data) {
  state.pair = data.pair;
  showWorkspace();

  conflictResult.className = `result ${data.conflict.level}`;
  conflictResult.textContent = data.conflict.publicMessage;

  const cards = [data.own, data.other]
    .map((item) => {
      if (!item.submitted) {
        return `<div class="summary-card"><strong>${pairName(item.pair)}</strong><span>No activity submitted.</span></div>`;
      }
      return `
        <div class="summary-card">
          <strong>${item.pair === data.pair ? "Your metadata" : "Other couple metadata"}</strong>
          <span>${item.city} · ${item.date} · ${item.timeWindow}</span>
          <span>${item.category} · ${item.indoorOutdoor} · ${item.foodInvolved} · ${item.intensity}</span>
        </div>
      `;
    })
    .join("");
  summaryGrid.innerHTML = cards;
}

async function refresh() {
  const data = await api("/api/status", {
    sessionId: state.sessionId,
    accessCode: state.accessCode,
  });
  renderStatus(data);
}

function addMessage(role, content) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = content;
  chatLog.append(node);
  chatLog.scrollTop = chatLog.scrollHeight;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  state.sessionId = String(form.get("sessionId") || "").trim();
  state.accessCode = String(form.get("accessCode") || "").trim();
  localStorage.setItem("sk_session", state.sessionId);
  localStorage.setItem("sk_code", state.accessCode);

  try {
    await refresh();
  } catch (error) {
    connectionStatus.textContent = "Locked";
    alert(error instanceof Error ? error.message : "Could not unlock.");
  }
});

activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(activityForm);
  const activity = Object.fromEntries(form.entries());

  try {
    const data = await api("/api/activity", {
      sessionId: state.sessionId,
      accessCode: state.accessCode,
      activity,
    });
    conflictResult.className = `result ${data.conflict.level}`;
    conflictResult.textContent = data.conflict.publicMessage;
    await refresh();
  } catch (error) {
    alert(error instanceof Error ? error.message : "Could not save activity.");
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(chatForm);
  const message = String(form.get("message") || "").trim();
  if (!message) return;

  addMessage("user", message);
  chatForm.reset();

  try {
    const data = await api("/api/chat", {
      sessionId: state.sessionId,
      accessCode: state.accessCode,
      message,
    });
    addMessage("assistant", data.reply);
  } catch (error) {
    addMessage("assistant", error instanceof Error ? error.message : "Could not send message.");
  }
});

refreshButton.addEventListener("click", () => {
  refresh().catch((error) => alert(error instanceof Error ? error.message : "Could not refresh."));
});

if (state.accessCode) {
  refresh().catch(() => {
    connectionStatus.textContent = "Locked";
  });
}
