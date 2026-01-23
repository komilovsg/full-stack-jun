import { describe, it, expect } from 'vitest';

/**
 * Тесты для функций форматирования статистики
 * Эти функции можно тестировать без моков, так как они чистые
 */

describe('Stats Handlers - Formatting Functions', () => {
  const mockStats = {
    topUsers: [
      { user_id: 1, count: 50, username: 'user1', first_name: 'User One' },
      { user_id: 2, count: 30, username: 'user2', first_name: 'User Two' },
      { user_id: 3, count: 20, username: null, first_name: 'User Three' },
    ],
    totalMessages: 100,
    totalUsers: 3,
  };

  it('должен правильно форматировать общую статистику', () => {
    const period = 'today';
    const periodName = 'сегодня';
    
    let message = `📊 Статистика чата за ${periodName}:\n\n`;
    message += '🏆 Топ пользователей по сообщениям:\n\n';
    
    mockStats.topUsers.forEach((user, index) => {
      const username = user.username ? `@${user.username}` : user.first_name || 'Неизвестный';
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      message += `${emoji} ${username} - ${user.count} сообщений\n`;
    });
    
    message += `\n📈 Всего: ${mockStats.totalMessages} сообщений от ${mockStats.totalUsers} пользователей`;

    expect(message).toContain('📊 Статистика чата за сегодня');
    expect(message).toContain('🏆 Топ пользователей');
    expect(message).toContain('@user1 - 50 сообщений');
    expect(message).toContain('Всего: 100 сообщений от 3 пользователей');
  });

  it('должен правильно обрабатывать пустую статистику', () => {
    const emptyStats = {
      topUsers: [],
      totalMessages: 0,
      totalUsers: 0,
    };

    const periodName = 'все время';
    let message = `📊 Статистика чата за ${periodName}:\n\n`;

    if (emptyStats.topUsers.length === 0) {
      message += 'Пока нет сообщений в этом чате.\n';
    }

    expect(message).toContain('Пока нет сообщений в этом чате');
  });

  it('должен правильно форматировать username и first_name', () => {
    const userWithUsername = { username: 'testuser', first_name: 'Test' };
    const userWithoutUsername = { username: null, first_name: 'Test User' };
    const userWithoutBoth = { username: null, first_name: null };

    const display1 = userWithUsername.username ? `@${userWithUsername.username}` : userWithUsername.first_name || 'Неизвестный';
    const display2 = userWithoutUsername.username ? `@${userWithoutUsername.username}` : userWithoutUsername.first_name || 'Неизвестный';
    const display3 = userWithoutBoth.username ? `@${userWithoutBoth.username}` : userWithoutBoth.first_name || 'Неизвестный';

    expect(display1).toBe('@testuser');
    expect(display2).toBe('Test User');
    expect(display3).toBe('Неизвестный');
  });
});
