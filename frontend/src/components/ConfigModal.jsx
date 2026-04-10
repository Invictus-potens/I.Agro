'use client';

import { useState, useEffect } from 'react';

export default function ConfigModal({ isOpen, grafanaUrl, apiBaseUrl, onSave, onClose }) {
  const [grafanaInput, setGrafanaInput] = useState('');
  const [apiInput, setApiInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setGrafanaInput(grafanaUrl || '');
      setApiInput(apiBaseUrl || '');
    }
  }, [isOpen, grafanaUrl, apiBaseUrl]);

  if (!isOpen) return null;

  function handleSave() {
    onSave({ grafanaUrl: grafanaInput.trim(), apiBaseUrl: apiInput.trim() });
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal">
        <div className="modal-header">
          <h2>Configurações</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="config-group">
            <label htmlFor="grafanaUrlInput">URL do Dashboard Grafana</label>
            <input
              id="grafanaUrlInput"
              type="text"
              value={grafanaInput}
              onChange={e => setGrafanaInput(e.target.value)}
              placeholder="http://localhost:8005/d/..."
              className="modal-input"
            />
            <p className="modal-hint">
              Para embutir corretamente, ative <code>allow_embedding = true</code> nas configurações do Grafana.
            </p>
          </div>
          <div className="config-group">
            <label htmlFor="apiUrlInput">URL da API Backend</label>
            <input
              id="apiUrlInput"
              type="text"
              value={apiInput}
              onChange={e => setApiInput(e.target.value)}
              placeholder="http://localhost:8005"
              className="modal-input"
            />
            <p className="modal-hint">Endereço base do servidor backend onde o chat IA está hospedado.</p>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Salvar configurações</button>
        </div>
      </div>
    </div>
  );
}
