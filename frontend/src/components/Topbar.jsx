'use client';

export default function Topbar({ chatTitle, activeTab, onSwitchTab, onOpenConfig, onLogout }) {
  const username = typeof window !== 'undefined' ? localStorage.getItem('agroUsername') : null;

  return (
    <div className="topbar">
      <h1 className="topic-tittle">{chatTitle}</h1>

      <nav className="tab-nav">
        <button
          className={`tab-btn${activeTab === 'chat' ? ' active' : ''}`}
          onClick={() => onSwitchTab('chat')}
        >
          ◉ Chat IA
        </button>
        <button
          className={`tab-btn${activeTab === 'monitor' ? ' active' : ''}`}
          onClick={() => onSwitchTab('monitor')}
        >
          ◈ Monitoramento
        </button>
      </nav>

      <div className="topbar-actions">
        {username && <span className="topbar-user">{username}</span>}
        <button className="config-btn" title="Configurações" onClick={onOpenConfig}>⚙</button>
        {onLogout && (
          <button className="config-btn" title="Sair" onClick={onLogout}>⏻</button>
        )}
      </div>
    </div>
  );
}
