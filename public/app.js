const API_URL = "http://localhost:3000/api/completion";

const chatMessages = document.getElementById("chatMessages");
const welcomeMessage = document.getElementById("welcomeMessage");
const promptInput = document.getElementById("promptInput");
const fileInput = document.getElementById("fileInput");
const attachButton = document.getElementById("attachButton");
const clearFileButton = document.getElementById("clearFileButton");
const sendButton = document.getElementById("sendButton");
const newChatButton = document.getElementById("newChatButton");
const fileStatus = document.getElementById("fileStatus");
const fileName = document.getElementById("fileName");

let previousResponseId = null;
let selectedFile = null;
let isSending = false;

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFileSelection);
clearFileButton.addEventListener("click", clearSelectedFile);
sendButton.addEventListener("click", sendMessage);
newChatButton.addEventListener("click", startNewChat);

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});

function handleFileSelection() {
  selectedFile = fileInput.files[0] ?? null;
  updateFileStatus();
}

function clearSelectedFile() {
  selectedFile = null;
  fileInput.value = "";
  updateFileStatus();
}

function updateFileStatus() {
  const hasFile = Boolean(selectedFile);
  fileStatus.hidden = !hasFile;
  fileName.textContent = hasFile ? selectedFile.name : "";
  clearFileButton.disabled = !hasFile;
}

async function sendMessage() {
  const prompt = promptInput.value.trim();
  if (!prompt || isSending) return;

  const fileForThisRequest = selectedFile;
  removeWelcomeMessage();
  addMessage("user", prompt, fileForThisRequest?.name);
  promptInput.value = "";
  clearSelectedFile();

  const formData = new FormData();
  formData.append("prompt", prompt);
  if (fileForThisRequest) formData.append("file", fileForThisRequest);
  if (previousResponseId) {
    formData.append("previous_response_id", previousResponseId);
  }

  setSendingState(true);
  const loadingMessage = addLoadingMessage();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
      // Content-Type は指定しません。ブラウザーが boundary を含む
      // multipart/form-data ヘッダーを自動的に設定します。
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`API から JSON ではない応答が返されました（HTTP ${response.status}）。`);
    }

    if (!response.ok) {
      const apiMessage = data?.error?.message || data?.message;
      throw new Error(apiMessage || `API リクエストに失敗しました（HTTP ${response.status}）。`);
    }

    if (!data.id || typeof data.output_text !== "string") {
      throw new Error("API 応答に id または output_text がありません。");
    }

    previousResponseId = data.id;
    loadingMessage.remove();
    addMessage("assistant", data.output_text);
  } catch (error) {
    loadingMessage.remove();
    addMessage("error", error instanceof Error ? error.message : "不明なエラーが発生しました。");
  } finally {
    setSendingState(false);
    promptInput.focus();
  }
}

function startNewChat() {
  previousResponseId = null;
  clearSelectedFile();
  promptInput.value = "";
  chatMessages.replaceChildren(welcomeMessage);
  welcomeMessage.hidden = false;
  promptInput.focus();
}

function removeWelcomeMessage() {
  if (welcomeMessage.isConnected) welcomeMessage.remove();
}

function addMessage(role, text, attachedFileName = null) {
  const row = document.createElement("article");
  row.className = `message-row ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = role === "user" ? "あなた" : role === "assistant" ? "AI" : "エラー";

  const body = document.createElement("p");
  body.textContent = text;

  bubble.append(label, body);

  if (attachedFileName) {
    const attachment = document.createElement("div");
    attachment.className = "message-attachment";
    attachment.textContent = `📎 ${attachedFileName}`;
    bubble.append(attachment);
  }

  row.append(bubble);
  chatMessages.append(row);
  scrollToBottom();
  return row;
}

function addLoadingMessage() {
  const row = document.createElement("article");
  row.className = "message-row assistant";
  row.setAttribute("aria-label", "AI が応答を生成中");
  row.innerHTML = `
    <div class="message-bubble loading-bubble">
      <div class="message-label">AI</div>
      <div class="typing-indicator" aria-hidden="true"><span></span><span></span><span></span></div>
    </div>`;
  chatMessages.append(row);
  scrollToBottom();
  return row;
}

function setSendingState(sending) {
  isSending = sending;
  sendButton.disabled = sending;
  sendButton.textContent = sending ? "送信中..." : "送信";
}

function scrollToBottom() {
  chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
}
