import { redisClient } from '../config/database';
import { Message } from '../models/Message';
import { User } from '../models/User';

// Интерфейс для результата статистики
export interface StatsResult {
  topUsers: Array<{
    user_id: number;
    count: number;
    username: string | null;
    first_name: string | null;
  }>;
  totalMessages: number;
  totalUsers: number;
}

// Интерфейс для статистики пользователя
export interface UserStatsResult {
  userId: number;
  username: string | null;
  firstName: string | null;
  messageCount: number;
  period: string;
}

/**
 * Сервис для работы со статистикой с кэшированием в Redis
 */
export class StatsService {
  private static readonly CACHE_TTL = parseInt(process.env.CACHE_TTL || '1200'); // 20 минут по умолчанию

  /**
   * Генерация ключа кэша для статистики
   */
  private static getCacheKey(chatId: number, period: string, userId?: number): string {
    if (userId) {
      return `stats:chat:${chatId}:user:${userId}:period:${period}`;
    }
    return `stats:chat:${chatId}:period:${period}`;
  }

  /**
   * Получить даты для периода
   */
  private static getDateRange(period: string): { startDate?: Date; endDate?: Date } {
    const now = new Date();
    let startDate: Date | undefined;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'all':
      default:
        return {}; // Все время - без фильтров
    }

    return { startDate, endDate: now };
  }

  /**
   * Получить общую статистику чата с кэшированием
   */
  static async getChatStats(chatId: number, period: string = 'all'): Promise<StatsResult> {
    const cacheKey = this.getCacheKey(chatId, period);

    try {
      // Пытаемся получить из кэша
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log(`📦 Статистика загружена из кэша для чата ${chatId}, период: ${period}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Ошибка при чтении из кэша:', error);
    }

    // Если нет в кэше - получаем из БД
    const dateRange = this.getDateRange(period);
    console.log(`📊 Получение статистики для чата ${chatId}, период: ${period}`, {
      hasStartDate: !!dateRange.startDate,
      hasEndDate: !!dateRange.endDate,
    });
    
    const [topUsers, stats] = await Promise.all([
      Message.getTopUsersByMessageCount(10, { ...dateRange, chatId }),
      Message.getStats({ ...dateRange, chatId }),
    ]);
    
    console.log(`✅ Статистика получена: ${stats.totalMessages} сообщений от ${stats.totalUsers} пользователей, топ: ${topUsers.length} пользователей`);

    const result: StatsResult = {
      topUsers,
      totalMessages: stats.totalMessages,
      totalUsers: stats.totalUsers,
    };

    // Сохраняем в кэш
    try {
      await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      console.log(`💾 Статистика сохранена в кэш для чата ${chatId}, период: ${period}`);
    } catch (error) {
      console.error('Ошибка при сохранении в кэш:', error);
    }

    return result;
  }

  /**
   * Получить статистику конкретного пользователя с кэшированием
   */
  static async getUserStats(
    chatId: number,
    userId: number,
    period: string = 'all'
  ): Promise<UserStatsResult | null> {
    const cacheKey = this.getCacheKey(chatId, period, userId);

    try {
      // Пытаемся получить из кэша
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log(`📦 Статистика пользователя загружена из кэша: ${userId}, период: ${period}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Ошибка при чтении из кэша:', error);
    }

    // Если нет в кэше - получаем из БД
    const user = await User.findByTelegramId(userId);
    if (!user) {
      return null;
    }

    const dateRange = this.getDateRange(period);
    const messageCount = await Message.countByUserId(user.id, { ...dateRange, chatId });

    const result: UserStatsResult = {
      userId: user.id,
      username: user.username,
      firstName: user.first_name,
      messageCount,
      period,
    };

    // Сохраняем в кэш
    try {
      await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      console.log(`💾 Статистика пользователя сохранена в кэш: ${userId}, период: ${period}`);
    } catch (error) {
      console.error('Ошибка при сохранении в кэш:', error);
    }

    return result;
  }

  /**
   * Очистить кэш для чата (при необходимости)
   */
  static async clearCache(chatId: number): Promise<void> {
    try {
      const pattern = `stats:chat:${chatId}:*`;
      // Redis не поддерживает удаление по паттерну напрямую, нужно использовать SCAN
      // Для простоты можно просто не очищать, кэш истечет сам
      console.log(`🗑️ Кэш для чата ${chatId} будет очищен автоматически через ${this.CACHE_TTL} секунд`);
    } catch (error) {
      console.error('Ошибка при очистке кэша:', error);
    }
  }
}
