import { clearGameState } from "./state.js";
import { sendAnalyticsTrigger } from "./analytics.js";

export class ChatRenderer {
  constructor(elements) {
    this.chatLog = elements.chatLog;
    this.messageList = elements.messageList;
    this.typingIndicator = elements.typingIndicator;
    this.newMessageButton = elements.newMessageButton;
    this.messageInput = elements.messageInput;
    this.sendButton = elements.sendButton;
    this.statusText = elements.statusText;
    this.chatHeader = elements.chatHeader || document.querySelector(".chat-header");
    this.profileName = elements.profileName || document.querySelector(".profile-name");
    this.imageModal = null;
    this.pdfModal = null;
    this.privacyModal = null;

    this.newMessageButton.addEventListener("click", () => {
      this.scrollToBottom();
      this.hideNewMessageNotice();
    });

    this.chatLog.addEventListener("scroll", () => {
      if (this.isNearBottom()) this.hideNewMessageNotice();
    });

    this.bindPrivacyModalButton();
  }

  renderHistory(history) {
    this.messageList.innerHTML = "";
    history.forEach((message) => this.appendMessage(message));
    this.scrollToBottom();
  }

  appendMessage(message) {
    if (message.setHeaderNameOnMessage) {
      this.setHeaderName(message.setHeaderNameOnMessage);
    }

    const shouldScroll = this.isNearBottom();
    const row = document.createElement("div");
    row.className = `message-row ${this.getMessageClass(message.sender)}`;
    if (message.badMessage) {
      row.classList.add("bad-message-row");
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.sender === "system" && message.systemStyle === "ending") {
      bubble.classList.add("ending-system-message");
    }
    if (message.badMessage) {
      bubble.classList.add("bad-message");
    }
    this.appendMessageContent(bubble, message);

    if (message.badMessage) {
      row.appendChild(bubble);
    } else if (message.sender === "user") {
      const meta = this.createOutgoingMeta(message.time);
      row.append(meta, bubble);
    } else {
      const time = this.createMessageTime(message.time);
      row.append(bubble, time);
    }

    this.messageList.appendChild(row);
    this.afterNewContent(shouldScroll);
  }

  appendMessageContent(bubble, message) {
    if (message.type === "image") {
      bubble.classList.add("image-bubble");
      const button = document.createElement("button");
      button.className = "chat-image-button";
      button.type = "button";

      const image = document.createElement("img");
      image.className = "chat-image";
      image.src = message.src;
      image.alt = message.alt || "送信された画像";
      image.loading = "lazy";

      button.appendChild(image);
      button.addEventListener("click", () => this.openImageModal(message.src, image.alt));
      bubble.appendChild(button);
      return;
    }

    if (message.type === "pdf") {
      bubble.classList.add("pdf-bubble");
      const button = document.createElement("button");
      button.className = "pdf-card";
      button.type = "button";

      const icon = document.createElement("span");
      icon.className = "pdf-card__icon";
      icon.textContent = "PDF";

      const name = document.createElement("span");
      name.className = "pdf-card__name";
      name.textContent = message.fileName || "PDFファイル";

      button.append(icon, name);
      button.addEventListener("click", () => this.openPdfModal(message.src, message.fileName));
      bubble.appendChild(button);
      return;
    }

    if (message.type === "restartButton") {
      const button = document.createElement("button");
      button.className = "restart-button";
      button.type = "button";
      button.textContent = message.text || "最初から開始";
      button.addEventListener("click", () => {
        if (message.clickTriggerId) {
          sendAnalyticsTrigger(message.clickTriggerId);
        }
        clearGameState();
        window.location.reload();
      });
      bubble.appendChild(button);
      return;
    }

    this.appendTextWithLinks(bubble, message.text || "");
  }

  appendTextWithLinks(container, text) {
    const urlPattern = /https?:\/\/[^\s]+/g;
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
      const url = match[0];
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      if (this.isSafeUrl(url)) {
        const link = document.createElement("a");
        link.href = url;
        link.textContent = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        container.appendChild(link);
      } else {
        container.appendChild(document.createTextNode(url));
      }

      lastIndex = match.index + url.length;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  isSafeUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  openImageModal(src, alt) {
    this.closeImageModal();
    this.closePdfModal();

    const modal = document.createElement("div");
    modal.className = "image-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const closeButton = document.createElement("button");
    closeButton.className = "image-modal__close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "画像を閉じる");
    closeButton.textContent = "×";

    const image = document.createElement("img");
    image.className = "image-modal__image";
    image.src = src;
    image.alt = alt || "拡大画像";

    modal.append(closeButton, image);
    document.body.appendChild(modal);

    const onKeyDown = (event) => {
      if (event.key === "Escape") this.closeImageModal();
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal) this.closeImageModal();
    });
    closeButton.addEventListener("click", () => this.closeImageModal());
    document.addEventListener("keydown", onKeyDown);

    this.imageModal = { element: modal, onKeyDown };
  }

  closeImageModal() {
    if (!this.imageModal) return;
    document.removeEventListener("keydown", this.imageModal.onKeyDown);
    this.imageModal.element.remove();
    this.imageModal = null;
  }

  openPdfModal(src, fileName) {
    if (!src) return;
    if (typeof HTMLIFrameElement !== "function") {
      window.open(src, "_blank", "noopener");
      return;
    }

    this.closeImageModal();
    this.closePdfModal();

    const modal = document.createElement("div");
    modal.className = "pdf-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");

    const panel = document.createElement("div");
    panel.className = "pdf-modal__panel";

    const header = document.createElement("div");
    header.className = "pdf-modal__header";

    const title = document.createElement("div");
    title.className = "pdf-modal__title";
    title.textContent = fileName || "PDFファイル";

    const closeButton = document.createElement("button");
    closeButton.className = "pdf-modal__close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "PDFを閉じる");
    closeButton.textContent = "×";

    const frame = document.createElement("iframe");
    frame.className = "pdf-modal__frame";
    frame.src = src;
    frame.title = fileName || "PDFプレビュー";

    const actions = document.createElement("div");
    actions.className = "pdf-modal__actions";

    const openLink = document.createElement("a");
    openLink.href = src;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "新規タブで開く";

    const downloadLink = document.createElement("a");
    downloadLink.href = src;
    downloadLink.download = fileName || "";
    downloadLink.textContent = "ダウンロード";

    actions.append(openLink, downloadLink);
    header.append(title, closeButton);
    panel.append(header, frame, actions);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    const onKeyDown = (event) => {
      if (event.key === "Escape") this.closePdfModal();
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal) this.closePdfModal();
    });
    closeButton.addEventListener("click", () => this.closePdfModal());
    document.addEventListener("keydown", onKeyDown);

    this.pdfModal = { element: modal, onKeyDown };
  }

  closePdfModal() {
    if (!this.pdfModal) return;
    document.removeEventListener("keydown", this.pdfModal.onKeyDown);
    this.pdfModal.element.remove();
    this.pdfModal = null;
  }

  bindPrivacyModalButton() {
    const button = document.querySelector(".privacy-cookie-button");
    if (!button) return;

    button.addEventListener("click", () => {
      this.openPrivacyModal();
    });
  }

  openPrivacyModal() {
    this.closePrivacyModal();
    this.closeImageModal();
    this.closePdfModal();

    const modal = document.createElement("div");
    modal.className = "privacy-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "privacy-modal-title");

    const panel = document.createElement("div");
    panel.className = "privacy-modal__panel";

    const closeButton = document.createElement("button");
    closeButton.className = "privacy-modal__close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "プライバシーポリシーを閉じる");
    closeButton.textContent = "×";

    const title = document.createElement("h2");
    title.id = "privacy-modal-title";
    title.className = "privacy-modal__title";
    title.textContent = "プライバシーポリシー";

    const body = document.createElement("div");
    body.className = "privacy-modal__body";

    const createPrivacyLink = (text, href) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = text;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    };

    const paragraph1 = document.createElement("p");
    paragraph1.textContent =
      "当サイトでは、Googleによるアクセス解析ツール「Googleアナリティクス」を使用しています。このGoogleアナリティクスはデータの収集のためにCookieを使用しています。このデータは匿名で収集されており、個人を特定するものではありません。";

    const paragraph2 = document.createElement("p");
    paragraph2.append(
      "この機能はCookieを無効にすることで収集を拒否することが出来ますので、お使いのブラウザの設定をご確認ください。この規約に関しての詳細は",
      createPrivacyLink(
        "Googleアナリティクスサービス利用規約",
        "https://marketingplatform.google.com/about/analytics/terms/jp/"
      ),
      "のページや",
      createPrivacyLink(
        "Googleポリシーと規約ページ",
        "https://policies.google.com/technologies/ads?hl=ja"
      ),
      "をご覧ください。"
    );

    body.append(paragraph1, paragraph2);

    panel.append(closeButton, title, body);
    modal.appendChild(panel);
    document.body.appendChild(modal);

    const onKeyDown = (event) => {
      if (event.key === "Escape") this.closePrivacyModal();
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal) this.closePrivacyModal();
    });
    closeButton.addEventListener("click", () => this.closePrivacyModal());
    document.addEventListener("keydown", onKeyDown);

    this.privacyModal = { element: modal, onKeyDown };
  }

  closePrivacyModal() {
    if (!this.privacyModal) return;
    document.removeEventListener("keydown", this.privacyModal.onKeyDown);
    this.privacyModal.element.remove();
    this.privacyModal = null;
  }

  showCorruptionOverlay() {
    document.querySelectorAll(".corruption-overlay").forEach((element) => element.remove());

    const text = "縺ゅ≠縺ゅ＞縺｢  ≠縺ｵ縺√ 縺√ｒ  ↓縺奇ｽゅ  悶⊂縺ｼ繝ｴ縺ｶ縺医♀縺";
    const overlay = document.createElement("div");
    overlay.className = "corruption-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const timerIds = [];

    const fragments = [
      ["corruption-text corruption-text--large", "4%", "7%", 180],
      ["corruption-text corruption-text--small", "45%", "13%", 42],
      ["corruption-text corruption-text--vertical", "8%", "28%", 35],
      ["corruption-text corruption-text--large", "24%", "45%", 26],
      ["corruption-text corruption-text--small", "58%", "55%", 10],
      ["corruption-text corruption-text--vertical", "76%", "18%", 160],
      ["corruption-text corruption-text--large", "-6%", "76%", 14],
      ["corruption-text corruption-text--small", "36%", "86%", 153],
      ["corruption-text corruption-text--vertical", "88%", "52%", 90]
    ];

    fragments.forEach(([className, left, top, intervalMs], index) => {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = "";
      span.style.left = left;
      span.style.top = top;
      span.style.animationDelay = `${index * 70}ms`;
      overlay.appendChild(span);
      timerIds.push(this.typeCorruptionText(span, text, intervalMs));
    });

    document.body.appendChild(overlay);
    window.setTimeout(() => {
      timerIds.forEach((timerId) => window.clearInterval(timerId));
      overlay.remove();
    }, 6200);
  }

  typeCorruptionText(element, text, intervalMs) {
    let index = 0;

    const timerId = window.setInterval(() => {
      index += 1;
      element.textContent = text.slice(0, index);

      if (index >= text.length) {
        window.clearInterval(timerId);
      }
    }, intervalMs);

    return timerId;
  }

  showTyping() {
    const shouldScroll = this.isNearBottom();
    this.typingIndicator.hidden = false;
    this.afterNewContent(shouldScroll);
  }

  hideTyping() {
    this.typingIndicator.hidden = true;
  }

  setInputLocked(isLocked) {
    this.messageInput.disabled = isLocked;
    this.sendButton.disabled = isLocked;
  }

  setBadEndStatus(isBadEnd) {
    this.statusText.textContent = isBadEnd ? "オフライン" : "オンライン";
    this.statusText.classList.toggle("offline", isBadEnd);
    this.statusText.classList.toggle("online", !isBadEnd);
    this.chatHeader?.classList.toggle("bad-end", isBadEnd);
  }

  setHeaderName(name) {
    if (!this.profileName || !name) return;
    this.profileName.textContent = name;
  }

  scrollToBottom() {
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  isNearBottom() {
    const threshold = 48;
    return this.chatLog.scrollHeight - this.chatLog.scrollTop - this.chatLog.clientHeight <= threshold;
  }

  hideNewMessageNotice() {
    this.newMessageButton.hidden = true;
  }

  showNewMessageNotice() {
    this.newMessageButton.hidden = false;
  }

  afterNewContent(shouldScroll) {
    requestAnimationFrame(() => {
      if (shouldScroll) {
        this.scrollToBottom();
      } else {
        this.showNewMessageNotice();
      }
    });
  }

  getMessageClass(sender) {
    if (sender === "user") return "outgoing";
    if (sender === "system") return "system";
    return "incoming";
  }

  formatTime(value) {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  createMessageTime(value) {
    const time = document.createElement("time");
    time.className = "message-time";
    time.dateTime = value || new Date().toISOString();
    time.textContent = this.formatTime(value);
    return time;
  }

  createOutgoingMeta(value) {
    const meta = document.createElement("div");
    meta.className = "message-meta message-meta--outgoing";

    const read = document.createElement("span");
    read.className = "message-read-receipt";
    read.textContent = "既読";

    const time = this.createMessageTime(value);
    meta.append(read, time);
    return meta;
  }
}
