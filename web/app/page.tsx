'use client';

import { useEffect, useState } from 'react';

interface UserAnalysis {
  style: string;
  topics: string;
  averageLength: string;
  activity: string;
  tone: string;
  features: string;
  messageCount: number;
  period: string;
}

interface TopUser {
  username: string | null;
  first_name: string | null;
  messageCount: number;
}

interface UserTableRow {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  messageCount: number;
  firstMessage: string | null;
  lastMessage: string | null;
}

interface MessagesByDay {
  date: string;
  count: number;
}

interface OverviewData {
  totalMessages: number;
  totalUsers: number;
  topUsers: TopUser[];
  allUsers?: UserTableRow[];
  messagesByDay?: MessagesByDay[];
  recentAnalyses: { username: string; analyzedAt: string }[];
}

export default function Home() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<UserAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<'qwen' | 'gemini' | 'deepseek'>('qwen');

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<{
    a: { username: string; analysis: UserAnalysis } | null;
    b: { username: string; analysis: UserAnalysis } | null;
  }>({ a: null, b: null });

  const [overviewError, setOverviewError] = useState<string | null>(null);

  // API URL - если запущен отдельно на 3001, используем его, иначе относительный путь
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const loadOverview = async () => {
      try {
        const res = await fetch(`${API_URL}/api/overview`);
        const data = await res.json();
        if (!res.ok) {
          setOverviewError(data.error || 'Не удалось загрузить статистику');
          setOverview(null);
          return;
        }
        setOverview(data);
        setOverviewError(null);
      } catch (err) {
        console.error(err);
        setOverviewError('Ошибка подключения к серверу');
        setOverview(null);
      } finally {
        setOverviewLoading(false);
      }
    };

    loadOverview();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Введите username');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), provider }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при анализе пользователя');
      }

      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!compareA.trim() || !compareB.trim()) {
      setCompareError('Укажите два username для сравнения');
      return;
    }

    setCompareLoading(true);
    setCompareError(null);
    setCompareResult({ a: null, b: null });

    try {
      const [resA, resB] = await Promise.all([
        fetch(`${API_URL}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: compareA.trim(), provider }),
        }),
        fetch(`${API_URL}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: compareB.trim(), provider }),
        }),
      ]);

      const dataA = await resA.json();
      const dataB = await resB.json();

      if (!resA.ok) {
        throw new Error(dataA.error || `Ошибка при анализе ${compareA}`);
      }
      if (!resB.ok) {
        throw new Error(dataB.error || `Ошибка при анализе ${compareB}`);
      }

      setCompareResult({
        a: { username: compareA.trim(), analysis: dataA.analysis },
        b: { username: compareB.trim(), analysis: dataB.analysis },
      });
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Произошла ошибка при сравнении');
    } finally {
      setCompareLoading(false);
    }
  };

  return (
    <main className="page-root">
      <div className="page-shell">
        <section className="hero-panel">
          <div className="hero-badge">
            <span className="hero-meta-dot" />
            <span>ARD · Telegram Chat Analytics</span>
          </div>

          <div>
            <h1 className="hero-title">
              Аналитика стиля общения{' '}
              <span className="hero-title-accent">в один клик</span>
            </h1>
            <p className="hero-subtitle">
              Введите username из группового чата — система соберёт сообщения из базы и покажет
              понятный профиль общения: тональность, темы, активность и особенности.
            </p>
          </div>

          <div className="hero-meta">
            <div className="hero-meta-item">
              <span>⚙️</span>
              <span>Данные из PostgreSQL + Redis</span>
            </div>
            <div className="hero-meta-item">
              <span>🤖</span>
              <span>LLM анализ через Qwen / DeepSeek / Gemini</span>
            </div>
            <div className="hero-meta-item">
              <span>📊</span>
              <span>/stats и /analyze в одном веб-интерфейсе</span>
            </div>
          </div>

          <section className="card" aria-label="Статистика чата">
            <div className="card-header">
              <div className="card-title">
                <span className="card-title-main">Статистика чата</span>
                <span className="card-title-sub">
                  Сводка по сохранённым сообщениям от Telegram-бота
                </span>
              </div>
            </div>

            {overviewLoading ? (
              <p className="empty-state">
                <span className="empty-state-emoji">⏳</span>
                Загружаем статистику…
              </p>
            ) : overview ? (
              <>
                <div className="analysis-grid">
                  <div>
                    <p className="analysis-item-label">Сообщения</p>
                    <p className="analysis-item-value">
                      {overview.totalMessages.toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <div>
                    <p className="analysis-item-label">Пользователи</p>
                    <p className="analysis-item-value">
                      {overview.totalUsers.toLocaleString('ru-RU')}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: '1rem' }}>
                  <p className="analysis-item-label">Топ активных пользователей</p>
                  {overview.topUsers.length === 0 ? (
                    <p className="empty-state">
                      <span className="empty-state-emoji">💤</span>
                      Пока нет сообщений в базе.
                    </p>
                  ) : (
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        marginTop: '0.35rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      {overview.topUsers.slice(0, 4).map((user, index) => {
                        const name = user.username
                          ? `@${user.username}`
                          : user.first_name || 'Неизвестный';
                        const emoji =
                          index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                        return (
                          <li
                            key={`${user.username}-${index}`}
                            style={{ display: 'flex', justifyContent: 'space-between' }}
                          >
                            <span>
                              {emoji} {name}
                            </span>
                            <span style={{ color: '#9ca3af' }}>
                              {user.messageCount.toLocaleString('ru-RU')} сообщений
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {overview.recentAnalyses.length > 0 && (
                  <div className="analysis-footer" style={{ marginTop: '1rem' }}>
                    <span>Недавние анализы:</span>
                    <span className="analysis-footer-highlight">
                      {overview.recentAnalyses
                        .map((item) => `@${item.username}`)
                        .slice(0, 3)
                        .join(', ')}
                    </span>
                  </div>
                )}

                {/* График активности по дням */}
                {overview.messagesByDay && overview.messagesByDay.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <p className="analysis-item-label" style={{ marginBottom: '0.75rem' }}>
                      📈 Активность за последние 30 дней
                    </p>
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          gap: '0.25rem',
                          height: '120px',
                          justifyContent: 'space-between',
                        }}
                      >
                        {overview.messagesByDay.map((day, idx) => {
                          const maxCount = Math.max(...overview.messagesByDay!.map((d) => d.count));
                          const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                          return (
                            <div
                              key={day.date}
                              style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <div
                                style={{
                                  width: '100%',
                                  height: `${height}%`,
                                  minHeight: day.count > 0 ? '4px' : '0',
                                  background: 'linear-gradient(180deg, #34d399, #22c55e)',
                                  borderRadius: '2px 2px 0 0',
                                  transition: 'height 0.3s ease',
                                }}
                                title={`${day.date}: ${day.count} сообщений`}
                              />
                              {idx % 5 === 0 && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    color: '#9ca3af',
                                    writingMode: 'vertical-rl',
                                    textOrientation: 'mixed',
                                  }}
                                >
                                  {new Date(day.date).getDate()}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Таблица всех пользователей */}
                {overview.allUsers && overview.allUsers.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <p className="analysis-item-label" style={{ marginBottom: '0.75rem' }}>
                      📊 Все пользователи в базе
                    </p>
                    <div
                      style={{
                        background: 'rgba(15, 23, 42, 0.6)',
                        borderRadius: '0.5rem',
                        padding: '0.75rem',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        overflowX: 'auto',
                      }}
                    >
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '0.85rem',
                        }}
                      >
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
                            <th style={{ textAlign: 'left', padding: '0.5rem', color: '#9ca3af', fontWeight: 600 }}>
                              Пользователь
                            </th>
                            <th style={{ textAlign: 'right', padding: '0.5rem', color: '#9ca3af', fontWeight: 600 }}>
                              Сообщений
                            </th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', color: '#9ca3af', fontWeight: 600 }}>
                              Первое сообщение
                            </th>
                            <th style={{ textAlign: 'left', padding: '0.5rem', color: '#9ca3af', fontWeight: 600 }}>
                              Последнее сообщение
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.allUsers.map((user) => {
                            const displayName = user.username
                              ? `@${user.username}`
                              : user.firstName || `ID: ${user.telegramId}`;
                            return (
                              <tr
                                key={user.id}
                                style={{
                                  borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                                  transition: 'background 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(148, 163, 184, 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                <td style={{ padding: '0.5rem', color: '#e5e7eb' }}>{displayName}</td>
                                <td style={{ textAlign: 'right', padding: '0.5rem', color: '#34d399', fontWeight: 600 }}>
                                  {user.messageCount.toLocaleString('ru-RU')}
                                </td>
                                <td style={{ padding: '0.5rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                                  {user.firstMessage
                                    ? new Date(user.firstMessage).toLocaleDateString('ru-RU', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                      })
                                    : '-'}
                                </td>
                                <td style={{ padding: '0.5rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                                  {user.lastMessage
                                    ? new Date(user.lastMessage).toLocaleDateString('ru-RU', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                      })
                                    : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div>
                <p className="empty-state">
                  <span className="empty-state-emoji">⚠️</span>
                  {overviewError || 'Не удалось загрузить статистику чата.'}
                </p>
                {overviewError?.includes('POSTGRES_PASSWORD') && (
                  <p
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.8rem',
                      color: '#9ca3af',
                      textAlign: 'center',
                    }}
                  >
                    Проверьте переменные окружения в <code style={{ color: '#34d399' }}>.env</code>
                  </p>
                )}
              </div>
            )}
          </section>
        </section>

        <section className="card" aria-label="Анализ и сравнение пользователей">
          <div className="card-header">
            <div className="card-title">
              <span className="card-title-main">Анализ пользователя</span>
              <span className="card-title-sub">
                Использует то же ядро, что и команда /analyze в Telegram-боте
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
              <span className="card-pill">
                LLM · {provider === 'qwen' ? 'Qwen' : provider === 'gemini' ? 'Gemini' : 'DeepSeek'}
              </span>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {[
                  { id: 'qwen', label: 'Qwen' },
                  { id: 'deepseek', label: 'DeepSeek' },
                  { id: 'gemini', label: 'Gemini' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setProvider(opt.id as 'qwen' | 'gemini' | 'deepseek')}
                    style={{
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      border: 'none',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      background:
                        provider === opt.id
                          ? 'linear-gradient(135deg, #34d399, #22c55e)'
                          : 'rgba(148, 163, 184, 0.2)',
                      color: provider === opt.id ? '#020617' : '#e5e7eb',
                      boxShadow: provider === opt.id ? '0 0 0 1px rgba(34,197,94,0.6)' : 'none',
                      transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="form-shell">
            <div className="field-label">
              <span className="field-label-strong">Username</span>
              <span> · пример: @username или только username</span>
            </div>

            <div className="field-row">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username из того же чата, где работает бот"
                disabled={loading}
                className="field-input"
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="primary-button"
              >
                {loading ? 'Анализирую…' : 'Анализировать'}
              </button>
            </div>

            <p className="helper-text">
              Анализ строится по последним{' '}
              <span className="helper-highlight">30 сообщениям</span> пользователя, сохранённым
              ботом в базе данных.
            </p>
          </form>

          {error && <div className="alert">❌ {error}</div>}

          {analysis ? (
            <div
              className="analysis-card"
              style={{
                marginTop: '1rem',
                maxHeight: '400px',
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: '0.5rem',
              }}
            >
              <div className="analysis-header">
                <div>
                  <p className="analysis-title">Профиль общения</p>
                  <p className="card-title-sub">
                    Обновлён на основе последних сообщений пользователя
                  </p>
                </div>
              </div>

              <div className="analysis-grid">
                <div>
                  <p className="analysis-item-label">Стиль</p>
                  <p className="analysis-item-value">{analysis.style}</p>
                </div>
                <div>
                  <p className="analysis-item-label">Темы</p>
                  <p className="analysis-item-value">{analysis.topics}</p>
                </div>
                <div>
                  <p className="analysis-item-label">Средняя длина</p>
                  <p className="analysis-item-value">{analysis.averageLength}</p>
                </div>
                <div>
                  <p className="analysis-item-label">Активность</p>
                  <p className="analysis-item-value">{analysis.activity}</p>
                </div>
                <div>
                  <p className="analysis-item-label">Тональность</p>
                  <p className="analysis-item-value">{analysis.tone}</p>
                </div>
                <div>
                  <p className="analysis-item-label">Особенности</p>
                  <p className="analysis-item-value">{analysis.features}</p>
                </div>
              </div>

              <div className="analysis-footer">
                <span>
                  📊 На основе{' '}
                  <span className="analysis-footer-highlight">
                    {analysis.messageCount} сообщений
                  </span>
                </span>
                <span>Период: {analysis.period}</span>
              </div>
            </div>
          ) : (
            <p className="empty-state">
              <span className="empty-state-emoji">👈</span>
              Введите username и запустите анализ, чтобы увидеть профиль пользователя.
            </p>
          )}

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(148, 163, 184, 0.2)' }}>
            <div className="card-header" style={{ padding: 0, marginBottom: '0.75rem' }}>
              <div className="card-title">
                <span className="card-title-main">Сравнение двух пользователей</span>
                <span className="card-title-sub">
                  Посмотрите, кто пишет больше и кто позитивнее
                </span>
              </div>
            </div>

            <form onSubmit={handleCompare} className="form-shell">
              <div className="field-row">
                <input
                  type="text"
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                  placeholder="@user_1"
                  disabled={compareLoading}
                  className="field-input"
                />
                <input
                  type="text"
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                  placeholder="@user_2"
                  disabled={compareLoading}
                  className="field-input"
                />
              </div>
              <button
                type="submit"
                disabled={compareLoading || !compareA.trim() || !compareB.trim()}
                className="primary-button"
              >
                {compareLoading ? 'Сравниваю…' : 'Сравнить'}
              </button>
            </form>

            {compareError && <div className="alert">❌ {compareError}</div>}

            {compareResult.a && compareResult.b && (
              <div className="analysis-grid" style={{ marginTop: '1rem' }}>
                {[compareResult.a, compareResult.b].map((item, idx) => (
                  <div
                    key={idx}
                    className="analysis-card"
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      paddingRight: '0.5rem',
                    }}
                  >
                    <div className="analysis-header">
                      <p className="analysis-title">
                        {idx === 0 ? 'Пользователь A' : 'Пользователь B'}
                      </p>
                      <span className="analysis-pill">{item.username}</span>
                    </div>
                    <div>
                      <p className="analysis-item-label">Стиль</p>
                      <p className="analysis-item-value">{item.analysis.style}</p>
                    </div>
                    <div>
                      <p className="analysis-item-label">Тональность</p>
                      <p className="analysis-item-value">{item.analysis.tone}</p>
                    </div>
                    <div>
                      <p className="analysis-item-label">Сообщений</p>
                      <p className="analysis-item-value">
                        {item.analysis.messageCount.toLocaleString('ru-RU')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

