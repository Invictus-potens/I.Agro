'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function conditionEmoji(text) {
  if (!text) return '⛅';
  const t = text.toLowerCase();
  if (t.includes('ensol') || t.includes('sunny') || t.includes('clear')) return '☀️';
  if (t.includes('parcial') || t.includes('partly')) return '⛅';
  if (t.includes('nublado') || t.includes('cloud') || t.includes('overcast') || t.includes('coberto')) return '☁️';
  if (t.includes('garoa') || t.includes('drizzle')) return '🌦️';
  if (t.includes('chuva') || t.includes('rain') || t.includes('chuvoso')) return '🌧️';
  if (t.includes('trovoada') || t.includes('thunder') || t.includes('storm')) return '⛈️';
  if (t.includes('neblina') || t.includes('fog') || t.includes('mist')) return '🌫️';
  if (t.includes('neve') || t.includes('snow')) return '❄️';
  return '⛅';
}

function uvInfo(uv) {
  const n = parseFloat(uv) || 0;
  if (n >= 11) return { label: 'Extremo',    color: '#7B2FBE' };
  if (n >= 8)  return { label: 'Muito Alto', color: '#FF3B30' };
  if (n >= 6)  return { label: 'Alto',       color: '#FF9500' };
  if (n >= 3)  return { label: 'Moderado',   color: '#FFCC00' };
  return        { label: 'Baixo',            color: '#34C759' };
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtHour(timeStr) {
  if (!timeStr) return '';
  const seg = timeStr.split(' ');
  const timePart = seg[1] || timeStr.split('T')[1] || '';
  return timePart.substring(0, 5);
}

function aggregateDaily(forecasts) {
  return (forecasts || []).map(day => {
    const hours = day.hours || [];
    const feels = hours.map(h => h.feelslike_c).filter(v => v != null && v !== 0);
    const hum   = hours.map(h => h.humidity).filter(v => v != null);
    return {
      ...day,
      label: fmtDate(day.date),
      feelslike_max: feels.length ? Math.max(...feels) : day.maxtemp_c,
      feelslike_min: feels.length ? Math.min(...feels) : day.mintemp_c,
      humidity_max:  hum.length   ? Math.max(...hum)   : day.avghumidity,
      humidity_min:  hum.length   ? Math.min(...hum)   : day.avghumidity,
    };
  });
}

function aggregateUVHistory(records) {
  const grouped = {};
  (records || []).forEach(r => {
    if (!r.data_hora) return;
    const d = new Date(r.data_hora);
    d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    const uv  = parseFloat(r.uv) || 0;
    if (!grouped[key] || uv > grouped[key].uv) {
      grouped[key] = {
        key,
        time:  d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        uv,
        fill: uv >= 8 ? '#FF3B30' : uv >= 6 ? '#FF9500' : '#34C759',
      };
    }
  });
  return Object.values(grouped)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-24);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid rgba(55,65,81,0.15)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: '0.8rem',
      fontFamily: 'var(--font-mono)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.09)',
    }}>
      <p style={{ marginBottom: 6, color: 'var(--grain-300)', fontWeight: 500 }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, marginBottom: 2 }}>
          {entry.name}: <strong>{typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ─── Current Weather Card ─────────────────────────────────────────────────────

function CurrentWeatherCard({ data, locationName }) {
  if (!data) return (
    <div className="db-panel">
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--grain-400)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>
        Sem dados de clima atual para esta localidade.
      </div>
    </div>
  );

  const uv = uvInfo(data.uv);

  return (
    <div className="db-panel weather-hero">
      <div className="weather-hero-main">
        <div className="weather-hero-left">
          <span className="weather-hero-emoji">{conditionEmoji(data.condition_text)}</span>
          <div>
            <p className="weather-hero-city">{data.cidade || locationName}</p>
            <p className="weather-hero-cond">{data.condition_text}</p>
          </div>
        </div>
        <div className="weather-hero-temp">{parseFloat(data.temp_c).toFixed(1)}°C</div>
      </div>
      <div className="weather-stats">
        <div className="weather-stat">
          <span className="ws-icon">💧</span>
          <span className="ws-value">{data.humidity}%</span>
          <span className="ws-label">Umidade</span>
        </div>
        <div className="weather-stat">
          <span className="ws-icon">💨</span>
          <span className="ws-value">{data.wind_kph} km/h</span>
          <span className="ws-label">Vento</span>
        </div>
        <div className="weather-stat">
          <span className="ws-icon">🌧️</span>
          <span className="ws-value">{data.precip_mm} mm</span>
          <span className="ws-label">Precipitação</span>
        </div>
        <div className="weather-stat">
          <span className="ws-icon">☀️</span>
          <span className="ws-value" style={{ color: uv.color }}>{parseFloat(data.uv).toFixed(1)}</span>
          <span className="ws-label">UV · {uv.label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Forecast Table ───────────────────────────────────────────────────────────

function ForecastTable({ forecasts, selectedDayIndex, onSelectDay }) {
  return (
    <div className="db-panel">
      <div className="db-panel-header">
        <span className="db-panel-title">PREVISÃO SEMANAL</span>
        <span className="db-panel-hint">Clique num dia para o detalhe horário</span>
      </div>
      <div className="forecast-scroll">
        {forecasts.map((day, i) => {
          const uv = uvInfo(day.uv);
          return (
            <div
              key={day.date}
              className={`fdc${selectedDayIndex === i ? ' fdc-active' : ''}`}
              onClick={() => onSelectDay(selectedDayIndex === i ? null : i)}
            >
              <p className="fdc-date">{fmtDate(day.date)}</p>
              <p className="fdc-emoji">{conditionEmoji(day.condition_text)}</p>
              <p className="fdc-cond">{day.condition_text}</p>
              <div className="fdc-temps">
                <span className="fdc-max">{parseFloat(day.maxtemp_c).toFixed(0)}°</span>
                <span style={{ color: 'var(--grain-400)' }}>/</span>
                <span className="fdc-min">{parseFloat(day.mintemp_c).toFixed(0)}°</span>
              </div>
              <p className="fdc-rain">🌧️ {day.daily_chance_of_rain}%</p>
              <p className="fdc-uv" style={{ color: uv.color }}>UV {parseFloat(day.uv).toFixed(1)} · {uv.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Temperature Chart ────────────────────────────────────────────────────────

function TemperatureChart({ data }) {
  return (
    <div className="db-panel" style={{ flex: 2 }}>
      <div className="db-panel-header">
        <span className="db-panel-title">TEMPERATURA (°C)</span>
      </div>
      <div className="db-chart-body">
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.08)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <YAxis unit="°" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={32} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <Line type="monotone" dataKey="maxtemp_c"    name="Alta (°C)"           stroke="#FF6B6B" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="mintemp_c"    name="Baixa (°C)"          stroke="#6B9FFF" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="avgtemp_c"    name="Média (°C)"          stroke="#E5B25D" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="feelslike_max" name="Sensação Alta (°C)"  stroke="#FFB347" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
            <Line type="monotone" dataKey="feelslike_min" name="Sensação Baixa (°C)" stroke="#87CEEB" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Rain Chart ───────────────────────────────────────────────────────────────

function RainChart({ data }) {
  return (
    <div className="db-panel" style={{ flex: 1 }}>
      <div className="db-panel-header">
        <span className="db-panel-title">CHUVA</span>
      </div>
      <div className="db-chart-body">
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.08)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <YAxis yAxisId="pct" unit="%" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={32} domain={[0, 100]} />
            <YAxis yAxisId="mm"  orientation="right" unit="mm" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={32} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <Bar   yAxisId="pct" dataKey="daily_chance_of_rain" name="Chance (%)"   fill="#6a95c4" opacity={0.85} radius={[4,4,0,0]} />
            <Line  yAxisId="mm"  type="monotone" dataKey="totalprecip_mm" name="Precip. (mm)" stroke="#2D4635" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Humidity Chart ───────────────────────────────────────────────────────────

function HumidityChart({ data }) {
  return (
    <div className="db-panel" style={{ flex: 1 }}>
      <div className="db-panel-header">
        <span className="db-panel-title">UMIDADE (%)</span>
      </div>
      <div className="db-chart-body">
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="gradHumMax" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4ECDC4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4ECDC4" stopOpacity={0}   />
              </linearGradient>
              <linearGradient id="gradHumMin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#A8EDEA" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#A8EDEA" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.08)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <YAxis unit="%" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={32} domain={[0, 100]} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <Area type="monotone" dataKey="humidity_max" name="Alta (%)"  stroke="#4ECDC4" fill="url(#gradHumMax)" strokeWidth={2} />
            <Area type="monotone" dataKey="humidity_min" name="Baixa (%)" stroke="#A8EDEA" fill="url(#gradHumMin)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── UV History Chart ─────────────────────────────────────────────────────────

function UVHistoryChart({ data }) {
  const isEmpty = !data || data.length === 0;

  return (
    <div className="db-panel" style={{ flex: 1 }}>
      <div className="db-panel-header">
        <span className="db-panel-title">HISTÓRICO UV (últimas 24h)</span>
      </div>
      {isEmpty ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 210, color: 'var(--grain-400)', fontStyle: 'italic', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
          Sem histórico disponível
        </div>
      ) : (
        <div className="db-chart-body">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.08)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={28} domain={[0, 12]} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={3} stroke="#FFCC00" strokeDasharray="3 3" label={{ value: 'Mod.', fontSize: 8, fill: '#FFCC00', fontFamily: 'var(--font-mono)' }} />
              <ReferenceLine y={6} stroke="#FF9500" strokeDasharray="3 3" label={{ value: 'Alto', fontSize: 8, fill: '#FF9500', fontFamily: 'var(--font-mono)' }} />
              <ReferenceLine y={8} stroke="#FF3B30" strokeDasharray="3 3" label={{ value: 'M.Alto', fontSize: 8, fill: '#FF3B30', fontFamily: 'var(--font-mono)' }} />
              <Bar dataKey="uv" name="Índice UV" radius={[3,3,0,0]}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Hourly Chart ─────────────────────────────────────────────────────────────

function HourlyChart({ hours, date }) {
  if (!hours?.length) return null;

  const data = hours.map(h => ({
    hour:        fmtHour(h.time),
    temp_c:      h.temp_c,
    feelslike_c: h.feelslike_c,
    chance_rain: h.chance_of_rain,
    humidity:    h.humidity,
    precip_mm:   h.precip_mm,
    uv:          h.uv,
    icon:        h.icon_url || null,
  }));

  return (
    <div className="db-panel">
      <div className="db-panel-header">
        <span className="db-panel-title">DETALHE HORÁRIO — {fmtDate(date)}</span>
      </div>
      <div className="db-chart-body">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.08)" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <YAxis yAxisId="temp" unit="°"  tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={32} />
            <YAxis yAxisId="pct"  unit="%" orientation="right" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} width={32} domain={[0, 100]} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} />
            <Bar  yAxisId="pct"  dataKey="chance_rain" name="Chuva (%)"        fill="#6a95c4" opacity={0.75} radius={[3,3,0,0]} />
            <Line yAxisId="temp" type="monotone" dataKey="temp_c"      name="Temp (°C)"     stroke="#FF6B6B" strokeWidth={2} dot={{ r: 2 }} />
            <Line yAxisId="temp" type="monotone" dataKey="feelslike_c" name="Sensação (°C)"  stroke="#FFB347" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            <Line yAxisId="pct"  type="monotone" dataKey="humidity"    name="Umidade (%)"    stroke="#4ECDC4" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Icon strip */}
      {data.some(d => d.icon) && (
        <div className="hourly-icon-strip">
          {data.map((d, i) => (
            <div key={i} className="hourly-icon-cell">
              {d.icon
                ? <img src={d.icon} alt={d.hour} width={32} height={32} />
                : <span style={{ fontSize: '1.3rem' }}>{conditionEmoji('')}</span>
              }
              <span>{d.hour}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MonitorView({ apiBaseUrl, onOpenConfig }) {
  const [locations, setLocations]         = useState([]);
  const [selectedId, setSelectedId]       = useState(null);
  const [locationData, setLocationData]   = useState(null);
  const [uvHistory, setUvHistory]         = useState([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(null);
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    if (!apiBaseUrl) return;
    fetch(`${apiBaseUrl}/locations`)
      .then(r => r.ok ? r.json() : [])
      .then(locs => {
        setLocations(locs);
        if (locs.length > 0) setSelectedId(locs[0].id);
      })
      .catch(() => {});
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!selectedId || !apiBaseUrl) return;
    setLoading(true);
    setSelectedDayIdx(null);

    Promise.all([
      fetch(`${apiBaseUrl}/locations/${selectedId}`).then(r => r.json()),
      fetch(`${apiBaseUrl}/current-weather/history/${selectedId}`)
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ])
      .then(([locData, history]) => {
        setLocationData(locData);
        setUvHistory(aggregateUVHistory(history));
      })
      .catch(() => setLocationData(null))
      .finally(() => setLoading(false));
  }, [selectedId, apiBaseUrl]);

  const dailyData   = locationData?.forecasts ? aggregateDaily(locationData.forecasts) : [];
  const selectedDay = selectedDayIdx != null ? locationData?.forecasts?.[selectedDayIdx] : null;

  return (
    <section className="monitor-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="location-tabs">
          {locations.map(loc => (
            <button
              key={loc.id}
              className={`location-tab${loc.id === selectedId ? ' active' : ''}`}
              onClick={() => setSelectedId(loc.id)}
            >
              {loc.name}
            </button>
          ))}
          {locations.length === 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'rgba(249,250,251,0.45)' }}>
              Nenhuma localidade cadastrada
            </span>
          )}
        </div>
        <button className="config-btn" title="Configurações" onClick={onOpenConfig} style={{ marginLeft: 'auto', flexShrink: 0 }}>⚙</button>
      </div>

      {/* Body */}
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', color: 'var(--grain-400)', fontStyle: 'italic' }}>
          Carregando dados...
        </div>
      )}

      {!loading && !locationData && locations.length > 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', color: 'var(--grain-400)', fontStyle: 'italic' }}>
          Não foi possível carregar os dados.
        </div>
      )}

      {!loading && locationData && (
        <div className="dashboard">
          <CurrentWeatherCard data={locationData.current_weather} locationName={locationData.name} />
          <ForecastTable forecasts={dailyData} selectedDayIndex={selectedDayIdx} onSelectDay={setSelectedDayIdx} />

          <div className="db-row">
            <TemperatureChart data={dailyData} />
            <RainChart data={dailyData} />
          </div>

          <div className="db-row">
            <HumidityChart data={dailyData} />
            <UVHistoryChart data={uvHistory} />
          </div>

          {selectedDay && (
            <HourlyChart hours={selectedDay.hours} date={selectedDay.date} />
          )}
        </div>
      )}

      {!loading && locations.length === 0 && (
        <div className="grafana-placeholder">
          <div className="placeholder-emblem">◈</div>
          <h3 className="placeholder-title">Nenhuma localidade cadastrada</h3>
          <p className="placeholder-text">Cadastre uma localidade para visualizar os dados climáticos em tempo real.</p>
        </div>
      )}
    </section>
  );
}
