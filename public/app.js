
//const API_URL = "https://openai-file.xx14ssrk7ur.jp-tok.codeengine.appdomain.cloud/api/completion";
const API_URL = "/api/completion";

const elements = {
  form: document.querySelector("#chatForm"), input: document.querySelector("#messageInput"),
  history: document.querySelector("#chatHistory"), fileInput: document.querySelector("#fileInput"),
  filePreview: document.querySelector("#attachmentPreview"), fileName: document.querySelector("#fileName"),
  fileSize: document.querySelector("#fileSize"), removeFile: document.querySelector("#removeFileButton"),
  clear: document.querySelector("#clearButton"), newChat: document.querySelector("#newChatButton"),
  overlay: document.querySelector("#loadingOverlay"), send: document.querySelector("#sendButton")
};

let previousResponseId = null;
let pendingFile = null;
let busy = false;

const formatBytes = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(1)} MB`;

function setBusy(value) {
  busy = value;
  elements.overlay.hidden = !value;
  elements.send.disabled = value;
  elements.input.disabled = value;
  elements.fileInput.disabled = value;
  elements.newChat.disabled = value;
}
function resetFile() {
  pendingFile = null; elements.fileInput.value = ""; elements.filePreview.hidden = true;
}
function clearComposer() { elements.input.value = ""; resetFile(); elements.input.focus(); }
function startNewChat() {
  previousResponseId = null; clearComposer();
  elements.history.innerHTML = `<section class="welcome-card" id="welcomeCard"><div class="welcome-icon">💬</div><h2>新しいチャットを開始しました</h2><p>メッセージを入力してください。</p></section>`;
}
function addMessage(role, text, fileLabel = "", isError = false) {
  document.querySelector("#welcomeCard")?.remove();
  const row = document.createElement("article");
  row.className = `message ${role}${isError ? " error" : ""}`;
  const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = role === "user" ? "☺" : "✦";
  const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = text;
  if (fileLabel) { const f = document.createElement("span"); f.className = "message-file"; f.textContent = `📎 ${fileLabel}`; bubble.appendChild(f); }
  row.append(avatar, bubble); elements.history.appendChild(row); elements.history.scrollTop = elements.history.scrollHeight;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。")); reader.readAsDataURL(file); });
}
function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  const parts = [];
  for (const item of data?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
      if (content?.type === "refusal" && typeof content.refusal === "string") parts.push(content.refusal);
    }
  }
  return parts.join("\n").trim();
}
function makePayload(text, fileData) {
  const content = [];
  if (fileData) content.push({ type: "input_file", filename: pendingFile.name, file_data: fileData });
  content.push({ type: "input_text", text });
  const payload = { input: [{ role: "user", content }] };
  if (previousResponseId) payload.previous_response_id = previousResponseId;
  return payload;
}

async function submitMessage(event) {
  event.preventDefault(); if (busy) return;
  const text = elements.input.value.trim();
  if (!text) { elements.input.focus(); return; }
  const selectedFile = pendingFile;
  addMessage("user", text, selectedFile?.name || "");
  clearComposer(); setBusy(true);
  try {
    const fileData = selectedFile ? await fileToDataUrl(selectedFile) : null;
    if (selectedFile) pendingFile = selectedFile;
    const response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(makePayload(text, fileData)) });
    const raw = await response.text();
    let data; try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`JSONではない応答が返されました（HTTP ${response.status}）。`); }
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `APIエラー（HTTP ${response.status}）`);
    const answer = extractResponseText(data);
    if (!answer) throw new Error("応答データから返答テキストを取得できませんでした。");
    if (typeof data.id === "string" && data.id) previousResponseId = data.id;
    addMessage("assistant", answer);
  } catch (error) {
    addMessage("assistant", `エラー: ${error.message}`, "", true);
  } finally { pendingFile = null; setBusy(false); elements.input.focus(); }
}

elements.form.addEventListener("submit", submitMessage);
elements.input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); elements.form.requestSubmit(); } });
elements.fileInput.addEventListener("change", () => { pendingFile = elements.fileInput.files[0] || null; if (!pendingFile) return resetFile(); elements.fileName.textContent = pendingFile.name; elements.fileSize.textContent = formatBytes(pendingFile.size); elements.filePreview.hidden = false; });
elements.removeFile.addEventListener("click", resetFile);
elements.clear.addEventListener("click", clearComposer);
elements.newChat.addEventListener("click", startNewChat);
