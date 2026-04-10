'use client';

import { useRef, useEffect, useState } from 'react';

function MessageRow({ message }) {
  const paragraphs = message.content.split('\n').filter(p => p.trim());

  return (
    <div className={`message-row ${message.sender}`}>
      <div className="message-content">
        <div className={`avatar ${message.sender === 'user' ? 'user-av' : 'ai-av'}`}>
          {message.sender === 'user' ? (
            'A'
          ) : (
            <div className="avatar-ai">
              <img src="/img/avatar_ai.png" alt="I.Agro" />
            </div>
          )}
        </div>
        <div className="text">
          {paragraphs.map((p, i) => (
            <p key={i}>{p.trim()}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="message-row ai">
      <div className="message-content">
        <div className="avatar ai-av">
          <div className="avatar-ai">
            <img src="/img/avatar_ai.png" alt="I.Agro" />
          </div>
        </div>
        <div className="text">
          <p>I.Agro está digitando<span className="typing-dots">...</span></p>
        </div>
      </div>
    </div>
  );
}

export default function ChatView({
  messages,
  setMessages,
  currentChatId,
  setCurrentChatId,
  currentLocationId,
  apiBaseUrl,
  onHistoryUpdate,
  onTitleUpdate,
}) {
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const showWelcome = messages.length === 0;

  async function handleSend(overrideText) {
    const messageText = (overrideText !== undefined ? overrideText : inputValue).trim();
    if (!messageText) return;

    let chatId = currentChatId;

    if (!chatId) {
      try {
        const res = await fetch(`${apiBaseUrl}/api/chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Novo Planejamento', createdAt: new Date().toISOString() }),
        });
        if (res.ok) {
          const data = await res.json();
          chatId = data.chatId || data.id;
          setCurrentChatId(chatId);
          onHistoryUpdate();
        } else {
          chatId = `local_${Date.now()}`;
          setCurrentChatId(chatId);
        }
      } catch {
        chatId = `local_${Date.now()}`;
        setCurrentChatId(chatId);
      }
    }

    const newMessage = { sender: 'user', content: messageText, timestamp: new Date() };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    if (overrideText === undefined) setInputValue('');

    if (messages.length === 0) {
      const newTitle = messageText.length > 40
        ? messageText.substring(0, 40) + '...'
        : messageText;
      onTitleUpdate(newTitle);
      saveChatTitle(chatId, newTitle);
    }

    setIsTyping(true);

    try {
      const res = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          chatId,
          history: updatedMessages.slice(-10),
          locationId: currentLocationId,
        }),
      });

      setIsTyping(false);

      if (res.ok) {
        const data = await res.json();
        const aiReply = data.reply || data.message || 'Resposta não disponível.';
        setMessages(prev => [...prev, { sender: 'ai', content: aiReply, timestamp: new Date() }]);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          content: 'Não foi possível conectar ao servidor. Verifique se o backend está rodando e a URL está correta nas configurações (⚙).',
          timestamp: new Date(),
        },
      ]);
    }
  }

  async function saveChatTitle(chatId, title) {
    if (!chatId || String(chatId).startsWith('local_')) return;
    try {
      await fetch(`${apiBaseUrl}/api/chats/${chatId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch {
      // ignore
    }
  }

  return (
    <main className="chat-container">
      {showWelcome && (
        <div className="chat-welcome">
          <div className="welcome-content">
            <div className="welcome-emblem">✦</div>
            <h2 className="welcome-title">I.Agro</h2>
            <p className="welcome-sub">
              Companheiro inteligente para sua lavoura.<br />
              Pergunte sobre clima, plantio e colheita.
            </p>
            <div className="welcome-chips">
              <button className="suggestion-chip" onClick={() => handleSend('Qual a previsão do tempo para os próximos 3 dias?')}>
                ☁ Previsão 3 dias
              </button>
              <button className="suggestion-chip" onClick={() => handleSend('Quando devo irrigar minha plantação esta semana?')}>
                💧 Irrigação
              </button>
              <button className="suggestion-chip" onClick={() => handleSend('Há risco de geada ou chuva forte esta semana?')}>
                ⚡ Alertas climáticos
              </button>
              <button className="suggestion-chip" onClick={() => handleSend('Qual o melhor momento para iniciar o plantio?')}>
                🌱 Momento de plantio
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <MessageRow key={i} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <div className="input-container">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Pergunte sobre clima, plantio, colheita..."
          />
          <button type="button" title="Enviar mensagem" onClick={() => handleSend()}>
            <img src="/img/message.png" alt="Enviar" />
          </button>
        </div>
        <p className="disclaimer">I.Agro pode cometer erros. Consulte um agrônomo para decisões críticas.</p>
      </div>
    </main>
  );
}
