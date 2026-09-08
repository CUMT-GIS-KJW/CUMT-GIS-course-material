const state = {
  mode: 'login',
  user: null,
  messages: [],
  filter: 'all',
  keyword: ''
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dom = {
  loginTab: $('#loginTab'),
  registerTab: $('#registerTab'),
  authPanel: $('#authPanel'),
  accountPanel: $('#accountPanel'),
  authForm: $('#authForm'),
  authSubmit: $('#authSubmit'),
  authNotice: $('#authNotice'),
  currentUser: $('#currentUser'),
  logoutBtn: $('#logoutBtn'),
  refreshBtn: $('#refreshBtn'),
  dbStatus: $('#dbStatus'),
  dbStatusText: $('#dbStatusText'),
  statUsers: $('#statUsers'),
  statMessages: $('#statMessages'),
  statReplies: $('#statReplies'),
  boardSummary: $('#boardSummary'),
  messageForm: $('#messageForm'),
  messageContent: $('#messageContent'),
  messageCounter: $('#messageCounter'),
  searchInput: $('#searchInput'),
  messageList: $('#messageList'),
  toast: $('#toast')
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || '请求失败');
  }

  return data;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function showToast(message, type = 'success') {
  dom.toast.textContent = message;
  dom.toast.className = `toast ${type}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => dom.toast.classList.add('hidden'), 2400);
}

function setMode(mode) {
  state.mode = mode;
  dom.loginTab.classList.toggle('active', mode === 'login');
  dom.registerTab.classList.toggle('active', mode === 'register');
  dom.authSubmit.textContent = mode === 'login' ? '登录' : '注册';
  dom.authNotice.textContent = '';
}

function updateCounter() {
  dom.messageCounter.textContent = `${dom.messageContent.value.length} / 500`;
}

function renderUser() {
  const signedIn = Boolean(state.user);
  dom.authPanel.classList.toggle('hidden', signedIn);
  dom.accountPanel.classList.toggle('hidden', !signedIn);
  dom.messageForm.classList.toggle('hidden', !signedIn);
  dom.currentUser.textContent = signedIn ? state.user.username : '-';

  $$('[data-filter="mine"]').forEach((button) => {
    button.disabled = !signedIn;
  });

  if (!signedIn && state.filter === 'mine') {
    state.filter = 'all';
    renderFilterButtons();
  }
}

function renderHealth(data) {
  dom.dbStatus.classList.remove('offline');
  dom.dbStatus.classList.add('online');
  dom.dbStatusText.textContent = '数据库连接正常';
  dom.statUsers.textContent = data.stats.users;
  dom.statMessages.textContent = data.stats.messages;
  dom.statReplies.textContent = data.stats.comments ?? data.stats.replies ?? 0;
}

function renderHealthError(message) {
  dom.dbStatus.classList.remove('online');
  dom.dbStatus.classList.add('offline');
  dom.dbStatusText.textContent = message || '数据库连接失败';
}

function renderFilterButtons() {
  $$('[data-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  });
}

function itemMatchesKeyword(item) {
  if (!state.keyword) {
    return true;
  }

  const keyword = state.keyword.toLowerCase();
  return item.content.toLowerCase().includes(keyword) || item.username.toLowerCase().includes(keyword);
}

function getVisibleMessages() {
  return state.messages
    .map((message) => {
      const rootMatches = itemMatchesKeyword(message);
      const matchedReplies = message.replies.filter(itemMatchesKeyword);

      if (state.keyword && !rootMatches && !matchedReplies.length) {
        return null;
      }

      let replies = rootMatches ? message.replies : matchedReplies;

      if (state.filter === 'mine') {
        if (!state.user) {
          return null;
        }

        const ownRoot = message.userId === state.user.id;
        const ownReplies = replies.filter((reply) => reply.userId === state.user.id);

        if (!ownRoot && !ownReplies.length) {
          return null;
        }

        replies = ownRoot ? replies : ownReplies;
      }

      return { ...message, replies };
    })
    .filter(Boolean);
}

function renderMessages() {
  const messages = getVisibleMessages();
  dom.boardSummary.textContent = `共 ${state.messages.length} 条留言`;

  if (!messages.length) {
    const text = state.keyword || state.filter === 'mine'
      ? '没有找到符合条件的留言。'
      : '暂无留言，登录后发布第一条吧。';
    dom.messageList.innerHTML = `<div class="empty">${text}</div>`;
    return;
  }

  dom.messageList.innerHTML = messages.map(renderMessage).join('');
  bindMessageEvents();
}

function renderMessage(message) {
  const canDelete = state.user && state.user.id === message.userId;
  const replyText = message.replies.length ? `${message.replies.length} 条评论` : '暂无评论';

  return `
    <article class="message-card">
      <div class="message-meta">
        <div>
          <span class="author">${escapeHtml(message.username)}</span>
          <time>${formatDate(message.createdAt)}</time>
        </div>
        <span class="reply-count">${replyText}</span>
      </div>
      <p class="message-content">${escapeHtml(message.content)}</p>
      <div class="message-actions">
        ${state.user ? `<button class="ghost-btn small" type="button" data-reply="${message.id}">评论</button>` : ''}
        ${canDelete ? `<button class="danger-btn small" type="button" data-delete="${message.id}">删除</button>` : ''}
      </div>
      <form class="reply-form hidden" data-reply-form="${message.id}">
        <textarea maxlength="500" rows="2" placeholder="在这条留言下写评论..." required></textarea>
        <div class="form-footer">
          <span>最多 500 字</span>
          <button class="primary-btn compact" type="submit">提交评论</button>
        </div>
      </form>
      <div class="reply-list">
        ${message.replies.map(renderReply).join('')}
      </div>
    </article>
  `;
}

function renderReply(reply) {
  const canDelete = state.user && state.user.id === reply.userId;

  return `
    <div class="reply-item">
      <div class="reply-meta">
        <div>
          <span class="author">${escapeHtml(reply.username)}</span>
          <time>${formatDate(reply.createdAt)}</time>
        </div>
        ${canDelete ? `<button class="danger-btn small" type="button" data-delete="${reply.id}">删除</button>` : ''}
      </div>
      <p class="reply-content">${escapeHtml(reply.content)}</p>
    </div>
  `;
}

function bindMessageEvents() {
  $$('[data-reply]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = $(`[data-reply-form="${button.dataset.reply}"]`);
      form.classList.toggle('hidden');
      form.querySelector('textarea').focus();
    });
  });

  $$('[data-reply-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const textarea = form.querySelector('textarea');

      try {
        await request(`/api/messages/${form.dataset.replyForm}/comments`, {
          method: 'POST',
          body: JSON.stringify({ content: textarea.value })
        });
        textarea.value = '';
        showToast('评论成功');
        await refreshData();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });

  $$('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('确定删除这条内容吗？')) {
        return;
      }

      try {
        await request(`/api/messages/${button.dataset.delete}`, { method: 'DELETE' });
        showToast('删除成功');
        await refreshData();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });
}

async function loadHealth() {
  try {
    renderHealth(await request('/api/health'));
  } catch (error) {
    renderHealthError(error.message);
  }
}

async function loadSession() {
  const data = await request('/api/session');
  state.user = data.user;
  renderUser();
}

async function loadMessages() {
  const data = await request('/api/messages');
  state.messages = data.messages;
  renderMessages();
}

async function refreshData() {
  await Promise.all([loadHealth(), loadMessages()]);
}

async function logout() {
  try {
    await request('/api/logout', { method: 'POST' });
    state.user = null;
    renderUser();
    renderMessages();
    showToast('已退出登录');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

dom.loginTab.addEventListener('click', () => setMode('login'));
dom.registerTab.addEventListener('click', () => setMode('register'));
dom.logoutBtn.addEventListener('click', logout);
dom.refreshBtn.addEventListener('click', refreshData);
dom.messageContent.addEventListener('input', updateCounter);

$$('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    renderFilterButtons();
    renderMessages();
  });
});

dom.searchInput.addEventListener('input', () => {
  state.keyword = dom.searchInput.value.trim();
  renderMessages();
});

dom.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  dom.authNotice.textContent = '';

  const formData = new FormData(dom.authForm);
  const payload = {
    username: formData.get('username'),
    password: formData.get('password')
  };

  try {
    const data = await request(`/api/${state.mode}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    state.user = data.user;
    dom.authForm.reset();
    renderUser();
    showToast(state.mode === 'login' ? '登录成功' : '注册成功');
    await refreshData();
  } catch (error) {
    dom.authNotice.textContent = error.message;
  }
});

dom.messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await request('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ content: dom.messageContent.value })
    });
    dom.messageContent.value = '';
    updateCounter();
    showToast('留言发布成功');
    await refreshData();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

async function init() {
  setMode('login');
  updateCounter();
  renderFilterButtons();
  await loadHealth();
  await loadSession();
  await loadMessages();
}

init().catch((error) => {
  renderHealthError(error.message);
  dom.messageList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
});
