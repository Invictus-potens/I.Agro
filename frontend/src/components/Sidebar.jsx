'use client';

function groupChatsByDate(chats) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const grouped = {};

  chats.forEach(chat => {
    const chatDate = new Date(chat.created_at || chat.createdAt || chat.updatedAt || Date.now());
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

export default function Sidebar({
  chatHistory,
  currentChatId,
  onNewChat,
  onLoadChat,
  onDeleteChat,
}) {
  const grouped = chatHistory && chatHistory.length > 0
    ? groupChatsByDate(chatHistory)
    : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">✦</span>
        <span className="brand-name">I.Agro</span>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="new-chat-plus">+</span>
        Novo Planejamento
      </button>

      <div className="history-list">
        {!grouped ? (
          <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Nenhuma conversa ainda
          </p>
        ) : (
          Object.keys(grouped).map(dateLabel => (
            <div key={dateLabel}>
              <p className="history-label">{dateLabel}</p>
              {grouped[dateLabel].map(chat => {
                const chatId = chat.id || chat.chatId;
                const title = chat.title ||
                  (chat.messages && chat.messages.length > 0
                    ? chat.messages[0].content.substring(0, 35) + '...'
                    : 'Sem título');

                return (
                  <div
                    key={chatId}
                    className={`history-item${chatId === currentChatId ? ' active' : ''}`}
                    onClick={() => onLoadChat(chatId)}
                  >
                    <span className="history-item-title" title={title}>{title}</span>
                    <button
                      className="history-item-delete"
                      title="Apagar conversa"
                      onClick={e => { e.stopPropagation(); onDeleteChat(chatId); }}
                    >
                      &#x2715;
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="user-menu">
        <div className="user-avatar">A</div>
        <div className="user-info">
          <span className="user-name">Agricultor</span>
          <span className="user-role">Fazenda</span>
        </div>
      </div>
    </aside>
  );
}
