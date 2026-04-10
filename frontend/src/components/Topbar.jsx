'use client';

export default function Topbar({ chatTitle, activeTab, onSwitchTab, onOpenConfig }) {
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

      <button className="config-btn" title="Configurações" onClick={onOpenConfig}>⚙</button>
    </div>
  );
}
