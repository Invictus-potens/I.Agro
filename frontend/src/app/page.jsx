'use client';

import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import ChatView from '../components/ChatView';
import MonitorView from '../components/MonitorView';
import ConfigModal from '../components/ConfigModal';

function getDefaultApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8005`;
  }
  return '';
}

function normalizeApiUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return getDefaultApiUrl();

  let normalized = raw.replace(/\/+$/, '');

  if (typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      normalized.startsWith('http://')) {
    normalized = normalized.replace(/^http:\/\//, 'https://');
  }

  return normalized;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('chat');
  const [currentChatId, setCurrentChatId] = useState(null);
  const [currentMessages, setCurrentMessages] = useState([]);
  const [currentLocationId, setCurrentLocationId] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [chatTitle, setChatTitle] = useState('Novo Planejamento');

  useEffect(() => {
    const savedApiUrl = localStorage.getItem('agroApiUrl');
    if (savedApiUrl) {
      setApiBaseUrl(normalizeApiUrl(savedApiUrl));
    } else {
      setApiBaseUrl(getDefaultApiUrl());
    }
  }, []);

  useEffect(() => {
    if (!apiBaseUrl) return;
    loadChatHistory();
    loadDefaultLocation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  async function loadDefaultLocation() {
    try {
      const res = await fetch(`${apiBaseUrl}/locations`);
      if (!res.ok) return;
      const locations = await res.json();
      if (locations && locations.length > 0) {
        setCurrentLocationId(locations[0].id);
      }
    } catch {
      // sem localização disponível
    }
  }

  async function loadChatHistory() {
    try {
      const res = await fetch(`${apiBaseUrl}/api/chats`);
      if (res.ok) {
        const chats = await res.json();
        setChatHistory(chats);
      } else {
        loadChatHistoryFromLocal();
      }
    } catch {
      loadChatHistoryFromLocal();
    }
  }

  function loadChatHistoryFromLocal() {
    const localChats = JSON.parse(localStorage.getItem('agroChats') || '{}');
    const chats = Object.values(localChats).sort(
      (a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt)
    );
    setChatHistory(chats);
  }

  function createNewChat() {
    setCurrentChatId(null);
    setCurrentMessages([]);
    setChatTitle('Novo Planejamento');
  }

  async function loadChat(chatId) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/chats/${chatId}`);
      if (!res.ok) throw new Error('Chat não encontrado');

      const chatData = await res.json();
      setCurrentChatId(chatData.id || chatData.chatId);

      const messages = (chatData.messages || []).map(m => ({
        sender: m.role === 'assistant' ? 'ai' : m.role,
        content: m.content,
        timestamp: m.created_at,
      }));
      setCurrentMessages(messages);
      setChatTitle(chatData.title || 'Planejamento');
      loadChatHistory();
    } catch (err) {
      console.error('Erro ao carregar chat:', err);
    }
  }

  async function deleteChat(chatId) {
    if (!chatId || String(chatId).startsWith('local_')) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/chats/${chatId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      if (chatId === currentChatId) {
        createNewChat();
      }
      loadChatHistory();
    } catch {
      console.error('Erro ao apagar conversa');
    }
  }

  function handleSaveConfig({ apiBaseUrl: newApi }) {
    const normalizedApi = normalizeApiUrl(newApi || getDefaultApiUrl());
    setApiBaseUrl(normalizedApi);
    localStorage.setItem('agroApiUrl', normalizedApi);
    setConfigModalOpen(false);
  }

  return (
    <>
      <div className={`app-container${activeTab === 'monitor' ? ' monitor-mode' : ''}`}>
        <Topbar
          chatTitle={chatTitle}
          activeTab={activeTab}
          onSwitchTab={setActiveTab}
          onOpenConfig={() => setConfigModalOpen(true)}
        />
        {activeTab === 'chat' && (
          <Sidebar
            chatHistory={chatHistory}
            currentChatId={currentChatId}
            onNewChat={createNewChat}
            onLoadChat={loadChat}
            onDeleteChat={deleteChat}
          />
        )}
        {activeTab === 'chat' ? (
          <ChatView
            messages={currentMessages}
            setMessages={setCurrentMessages}
            currentChatId={currentChatId}
            setCurrentChatId={setCurrentChatId}
            currentLocationId={currentLocationId}
            apiBaseUrl={apiBaseUrl}
            onHistoryUpdate={loadChatHistory}
            onTitleUpdate={setChatTitle}
          />
        ) : (
          <MonitorView
            apiBaseUrl={apiBaseUrl}
            onOpenConfig={() => setConfigModalOpen(true)}
          />
        )}
      </div>

      <ConfigModal
        isOpen={configModalOpen}
        apiBaseUrl={apiBaseUrl}
        onSave={handleSaveConfig}
        onClose={() => setConfigModalOpen(false)}
      />
    </>
  );
}
