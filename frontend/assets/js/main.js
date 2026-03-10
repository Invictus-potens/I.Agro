// ============================================
// CONFIGURAÇÃO
// ============================================
const DEFAULT_API_URL = window.location.origin;

let API_BASE_URL = DEFAULT_API_URL;
let grafanaUrl = localStorage.getItem('agroGrafanaUrl') || '';

function normalizeApiUrl(url) {
    const rawValue = (url || '').trim();
    if (!rawValue) return DEFAULT_API_URL;

    let normalized = rawValue.replace(/\/+$/, '');

    // Browsers block HTTPS pages from calling HTTP APIs (mixed content).
    if (window.location.protocol === 'https:' && normalized.startsWith('http://')) {
        normalized = normalized.replace(/^http:\/\//, 'https://');
    }

    return normalized;
}

// ============================================
// ESTADO DA APLICAÇÃO
// ============================================
let currentChatId = null;
let currentMessages = [];
let activeTab = 'chat'; // 'chat' | 'monitor'

// ============================================
// ELEMENTOS DO DOM
// ============================================
const appContainer    = document.getElementById('appContainer');
const sidebar         = document.getElementById('sidebar');
const chatView        = document.getElementById('chatView');
const monitorView     = document.getElementById('monitorView');
const chatMessages    = document.getElementById('chatMessages');
const chatWelcome     = document.getElementById('chatWelcome');
const userInput       = document.getElementById('userInput');
const sendBtn         = document.getElementById('sendBtn');
const newChatBtn      = document.getElementById('newChatBtn');
const historyList     = document.getElementById('historyList');
const chatTitle       = document.getElementById('chatTitle');

const tabChat         = document.getElementById('tabChat');
const tabMonitor      = document.getElementById('tabMonitor');
const configBtn       = document.getElementById('configBtn');

const grafanaFrame         = document.getElementById('grafanaFrame');
const grafanaPlaceholder   = document.getElementById('grafanaPlaceholder');
const grafanaUrlDisplay    = document.getElementById('grafanaUrlDisplay');
const configGrafanaBtn     = document.getElementById('configGrafanaBtn');
const openConfigFromPlaceholder = document.getElementById('openConfigFromPlaceholder');

const configModal     = document.getElementById('configModal');
const grafanaUrlInput = document.getElementById('grafanaUrlInput');
const apiUrlInput     = document.getElementById('apiUrlInput');
const closeModal      = document.getElementById('closeModal');
const cancelConfig    = document.getElementById('cancelConfig');
const saveConfig      = document.getElementById('saveConfig');

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApiUrl();
    loadGrafanaUrl();
    setupEventListeners();
    createNewChat();
    loadChatHistory();
});

async function initializeApiUrl() {
    const savedApiUrl = localStorage.getItem('agroApiUrl');
    if (savedApiUrl) {
        API_BASE_URL = normalizeApiUrl(savedApiUrl);
        return;
    }

    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Config indisponível');
        const config = await response.json();
        API_BASE_URL = normalizeApiUrl(config.apiBaseUrl || DEFAULT_API_URL);
    } catch {
        API_BASE_URL = DEFAULT_API_URL;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Chat
    sendBtn.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    newChatBtn.addEventListener('click', createNewChat);

    // Tabs
    tabChat.addEventListener('click', () => switchTab('chat'));
    tabMonitor.addEventListener('click', () => switchTab('monitor'));

    // Config modal
    configBtn.addEventListener('click', openConfigModal);
    configGrafanaBtn.addEventListener('click', openConfigModal);
    openConfigFromPlaceholder.addEventListener('click', openConfigModal);
    closeModal.addEventListener('click', closeConfigModal);
    cancelConfig.addEventListener('click', closeConfigModal);
    saveConfig.addEventListener('click', handleSaveConfig);

    // Fechar modal ao clicar fora
    configModal.addEventListener('click', (e) => {
        if (e.target === configModal) closeConfigModal();
    });
}

// ============================================
// TROCA DE ABAS
// ============================================
function switchTab(tab) {
    activeTab = tab;

    if (tab === 'chat') {
        tabChat.classList.add('active');
        tabMonitor.classList.remove('active');

        chatView.classList.remove('hidden');
        monitorView.classList.add('hidden');
        sidebar.classList.remove('hidden');
        appContainer.classList.remove('monitor-mode');

        chatTitle.textContent = currentMessages.length
            ? chatTitle.textContent
            : 'Novo Planejamento';
    } else {
        tabMonitor.classList.add('active');
        tabChat.classList.remove('active');

        monitorView.classList.remove('hidden');
        chatView.classList.add('hidden');
        sidebar.classList.add('hidden');
        appContainer.classList.add('monitor-mode');
    }
}

// ============================================
// GRAFANA
// ============================================
function loadGrafanaUrl() {
    if (grafanaUrl) {
        grafanaUrlDisplay.textContent = grafanaUrl;
        grafanaFrame.src = grafanaUrl;
        grafanaFrame.classList.remove('hidden');
        grafanaPlaceholder.classList.add('hidden');
    } else {
        grafanaUrlDisplay.textContent = 'Nenhuma URL configurada';
        grafanaFrame.classList.add('hidden');
        grafanaPlaceholder.classList.remove('hidden');
    }
}

// ============================================
// MODAL DE CONFIGURAÇÃO
// ============================================
function openConfigModal() {
    grafanaUrlInput.value = grafanaUrl;
    apiUrlInput.value = API_BASE_URL;
    configModal.classList.remove('hidden');
    grafanaUrlInput.focus();
}

function closeConfigModal() {
    configModal.classList.add('hidden');
}

function handleSaveConfig() {
    const newGrafanaUrl = grafanaUrlInput.value.trim();
    const newApiUrl = normalizeApiUrl(apiUrlInput.value.trim() || DEFAULT_API_URL);

    grafanaUrl = newGrafanaUrl;
    API_BASE_URL = newApiUrl;

    localStorage.setItem('agroGrafanaUrl', grafanaUrl);
    localStorage.setItem('agroApiUrl', API_BASE_URL);

    loadGrafanaUrl();
    closeConfigModal();
}

// ============================================
// GERENCIAMENTO DE CHAT
// ============================================
// ============================================
// WELCOME STATE
// ============================================
function showWelcome() {
    chatWelcome?.classList.remove('hidden');
}

function hideWelcome() {
    chatWelcome?.classList.add('hidden');
}

// Chip de sugestão — acessível via onclick no HTML
window.useSuggestion = function(text) {
    userInput.value = text;
    userInput.focus();
    handleSendMessage();
};

// ============================================
// GERENCIAMENTO DE CHAT
// ============================================
function createNewChat() {
    currentChatId = null;
    currentMessages = [];
    chatMessages.innerHTML = '';
    chatTitle.textContent = 'Novo Planejamento';
    userInput.value = '';
    showWelcome();
    userInput.focus();
}

async function loadChat(chatId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chats/${chatId}`);
        if (!response.ok) throw new Error('Chat não encontrado');

        const chatData = await response.json();
        currentChatId = chatData.id || chatData.chatId;
        currentMessages = (chatData.messages || []).map(m => ({
            sender: m.role === 'assistant' ? 'ai' : m.role,
            content: m.content,
            timestamp: m.created_at
        }));
        chatTitle.textContent = chatData.title || 'Planejamento';

        chatMessages.innerHTML = '';
        if (currentMessages.length > 0) {
            hideWelcome();
            currentMessages.forEach(msg => renderMessage(msg));
            scrollToBottom();
        } else {
            showWelcome();
        }
        loadChatHistory();
    } catch (error) {
        console.error('Erro ao carregar chat:', error);
    }
}

async function saveChatTitle(chatId, title) {
    if (!chatId || String(chatId).startsWith('local_')) return;
    try {
        await fetch(`${API_BASE_URL}/api/chats/${chatId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
    } catch {
        // silently ignore title save errors
    }
}

// ============================================
// ENVIO DE MENSAGENS
// ============================================
async function handleSendMessage() {
    const messageText = userInput.value.trim();
    if (!messageText) return;

    // Cria o chat no banco apenas na primeira mensagem
    if (!currentChatId) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Novo Planejamento', createdAt: new Date().toISOString() })
            });
            if (res.ok) {
                const data = await res.json();
                currentChatId = data.chatId || data.id;
                loadChatHistory();
            } else {
                currentChatId = `local_${Date.now()}`;
            }
        } catch {
            currentChatId = `local_${Date.now()}`;
        }
    }

    addMessageToUI('user', messageText);
    userInput.value = '';
    userInput.focus();

    // Atualiza título na primeira mensagem
    if (currentMessages.length === 1) {
        const newTitle = messageText.length > 40
            ? messageText.substring(0, 40) + '...'
            : messageText;
        chatTitle.textContent = newTitle;
        saveChatTitle(currentChatId, newTitle);
    }

    showTypingIndicator();

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: messageText,
                chatId: currentChatId,
                history: currentMessages.slice(-10)
            })
        });

        hideTypingIndicator();

        if (response.ok) {
            const data = await response.json();
            const aiResponse = data.reply || data.message || 'Resposta não disponível.';
            addMessageToUI('ai', aiResponse);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        hideTypingIndicator();
        console.error('Erro ao enviar mensagem:', error);
        addMessageToUI('ai', 'Não foi possível conectar ao servidor. Verifique se o backend está rodando e a URL está correta nas configurações (⚙).');
    }
}

// ============================================
// INTERFACE DO CHAT
// ============================================
function addMessageToUI(sender, content) {
    hideWelcome();
    const message = { sender, content, timestamp: new Date() };
    currentMessages.push(message);
    renderMessage(message);
    scrollToBottom();
}

function renderMessages(messages) {
    chatMessages.innerHTML = '';
    messages.forEach(msg => renderMessage(msg));
    scrollToBottom();
}

function renderMessage(message) {
    const messageRow = document.createElement('div');
    messageRow.className = `message-row ${message.sender}`;

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const avatar = document.createElement('div');
    avatar.className = `avatar ${message.sender === 'user' ? 'user-av' : 'ai-av'}`;

    if (message.sender === 'user') {
        avatar.textContent = 'A';
    } else {
        const avatarAi = document.createElement('div');
        avatarAi.className = 'avatar-ai';
        const img = document.createElement('img');
        img.src = 'assets/img/avatar_ai.png';
        img.alt = 'I.Agro';
        avatarAi.appendChild(img);
        avatar.appendChild(avatarAi);
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'text';

    const paragraphs = message.content.split('\n');
    paragraphs.forEach(para => {
        if (para.trim()) {
            const p = document.createElement('p');
            p.textContent = para.trim();
            textDiv.appendChild(p);
        }
    });

    messageContent.appendChild(avatar);
    messageContent.appendChild(textDiv);
    messageRow.appendChild(messageContent);
    chatMessages.appendChild(messageRow);
}

function showTypingIndicator() {
    const typingRow = document.createElement('div');
    typingRow.className = 'message-row ai';
    typingRow.id = 'typing-indicator';

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    const avatar = document.createElement('div');
    avatar.className = 'avatar ai-av';
    const avatarAi = document.createElement('div');
    avatarAi.className = 'avatar-ai';
    const img = document.createElement('img');
    img.src = 'assets/img/avatar_ai.png';
    avatarAi.appendChild(img);
    avatar.appendChild(avatarAi);

    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.innerHTML = '<p>I.Agro está digitando<span class="typing-dots">...</span></p>';

    messageContent.appendChild(avatar);
    messageContent.appendChild(textDiv);
    typingRow.appendChild(messageContent);
    chatMessages.appendChild(typingRow);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ============================================
// HISTÓRICO DE CONVERSAS
// ============================================
async function loadChatHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chats`);
        if (response.ok) {
            const chats = await response.json();
            renderChatHistory(chats);
        } else {
            throw new Error('Erro ao carregar histórico');
        }
    } catch {
        loadChatHistoryFromLocal();
    }
}

function loadChatHistoryFromLocal() {
    const localChats = JSON.parse(localStorage.getItem('agroChats') || '{}');
    const chats = Object.values(localChats).sort((a, b) =>
        new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt)
    );
    renderChatHistory(chats);
}

function renderChatHistory(chats) {
    if (!chats || chats.length === 0) {
        historyList.innerHTML = '<p style="padding:20px;text-align:center;color:var(--text-secondary);font-size:0.85rem;">Nenhuma conversa ainda</p>';
        return;
    }

    const grouped = groupChatsByDate(chats);
    historyList.innerHTML = '';

    Object.keys(grouped).forEach(dateLabel => {
        const label = document.createElement('p');
        label.className = 'history-label';
        label.textContent = dateLabel;
        historyList.appendChild(label);

        grouped[dateLabel].forEach(chat => {
            historyList.appendChild(createHistoryItem(chat));
        });
    });
}

function groupChatsByDate(chats) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const grouped = {};

    chats.forEach(chat => {
        const chatDate = new Date(chat.createdAt || chat.updatedAt || Date.now());
        chatDate.setHours(0, 0, 0, 0);

        let label;
        if (chatDate.getTime() === today.getTime()) {
            label = 'Hoje';
        } else if (chatDate.getTime() === yesterday.getTime()) {
            label = 'Ontem';
        } else {
            label = chatDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
        }

        if (!grouped[label]) grouped[label] = [];
        grouped[label].push(chat);
    });

    return grouped;
}

function createHistoryItem(chat) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.chatId = chat.id || chat.chatId;

    const title = chat.title ||
        (chat.messages && chat.messages.length > 0
            ? chat.messages[0].content.substring(0, 35) + '...'
            : 'Sem título');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-item-title';
    titleSpan.textContent = title;
    titleSpan.title = title;
    item.appendChild(titleSpan);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-item-delete';
    deleteBtn.title = 'Apagar conversa';
    deleteBtn.innerHTML = '&#x2715;';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id || chat.chatId);
    });
    item.appendChild(deleteBtn);

    if ((chat.id || chat.chatId) === currentChatId) {
        item.classList.add('active');
    }

    item.addEventListener('click', () => loadChat(chat.id || chat.chatId));
    return item;
}

async function deleteChat(chatId) {
    if (!chatId || String(chatId).startsWith('local_')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/chats/${chatId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        if (chatId === currentChatId) {
            createNewChat();
        } else {
            loadChatHistory();
        }
    } catch {
        console.error('Erro ao apagar conversa');
    }
}
