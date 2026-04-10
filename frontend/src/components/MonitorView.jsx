'use client';

export default function MonitorView({ hidden, grafanaUrl, onOpenConfig }) {
  return (
    <section className={`monitor-container${hidden ? ' hidden' : ''}`}>
      <div className="grafana-header">
        <div className="grafana-header-left">
          <span className="grafana-label">◈ Dashboard</span>
          <span className="grafana-url-display">
            {grafanaUrl || 'Nenhuma URL configurada'}
          </span>
        </div>
        <button className="btn-config-grafana" onClick={onOpenConfig}>
          Configurar URL
        </button>
      </div>

      <div className="grafana-wrapper">
        {grafanaUrl ? (
          <iframe
            className="grafana-iframe"
            src={grafanaUrl}
            frameBorder="0"
            allowFullScreen
            title="Dashboard Grafana"
          />
        ) : (
          <div className="grafana-placeholder">
            <div className="placeholder-emblem">◈</div>
            <h3 className="placeholder-title">Nenhum dashboard conectado</h3>
            <p className="placeholder-text">
              Conecte seu painel Grafana para visualizar<br />
              dados climáticos em tempo real.
            </p>
            <button className="btn-primary" onClick={onOpenConfig}>
              Configurar Grafana
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
