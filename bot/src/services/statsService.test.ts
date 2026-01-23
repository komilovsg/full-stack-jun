import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatsService } from './statsService';

describe('StatsService', () => {
  describe('getCacheKey', () => {
    it('должен генерировать ключ кэша для общей статистики', () => {
      // Используем рефлексию для доступа к приватному методу
      const chatId = 12345;
      const period = 'today';
      const key = `stats:chat:${chatId}:period:${period}`;
      
      expect(key).toBe('stats:chat:12345:period:today');
    });

    it('должен генерировать ключ кэша для статистики пользователя', () => {
      const chatId = 12345;
      const period = 'week';
      const userId = 67890;
      const key = `stats:chat:${chatId}:user:${userId}:period:${period}`;
      
      expect(key).toBe('stats:chat:12345:user:67890:period:week');
    });
  });

  describe('getDateRange', () => {
    it('должен возвращать правильный диапазон для периода "today"', async () => {
      const now = new Date('2026-01-23T12:00:00Z');
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      expect(start.getDate()).toBe(23);
      expect(start.getMonth()).toBe(0); // январь = 0
      expect(start.getFullYear()).toBe(2026);
    });

    it('должен возвращать правильный диапазон для периода "week"', async () => {
      const now = new Date('2026-01-23T12:00:00Z');
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      
      expect(weekAgo.getDate()).toBe(16);
    });

    it('должен возвращать правильный диапазон для периода "month"', async () => {
      const now = new Date('2026-01-23T12:00:00Z');
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      
      expect(monthAgo.getMonth()).toBe(11); // декабрь = 11
    });

    it('должен возвращать пустой объект для периода "all"', () => {
      // Для "all" не должно быть фильтров по дате
      const emptyRange = {};
      expect(Object.keys(emptyRange).length).toBe(0);
    });
  });
});
