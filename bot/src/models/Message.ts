import { pgPool } from '../config/database';

// Интерфейс для данных сообщения из БД
export interface MessageData {
  id: number;
  user_id: number;
  telegram_message_id: number;
  chat_id: number;
  text: string;
  created_at: Date;
}

// Интерфейс для создания нового сообщения
export interface CreateMessageData {
  user_id: number;
  telegram_message_id: number;
  chat_id: number;
  text: string;
}

/**
 * Модель Message - работа с таблицей messages
 * Инкапсулирует все SQL-запросы для работы с сообщениями
 */
export class Message {
  /**
   * Создать новое сообщение
   * Используем ON CONFLICT для избежания дубликатов (если сообщение уже есть - игнорируем)
   */
  static async create(data: CreateMessageData): Promise<MessageData | null> {
    const query = `
      INSERT INTO messages (user_id, telegram_message_id, chat_id, text)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_message_id, chat_id) DO NOTHING
      RETURNING *
    `;
    const result = await pgPool.query<MessageData>(query, [
      data.user_id,
      data.telegram_message_id,
      data.chat_id,
      data.text,
    ]);
    // Если сообщение уже существует (ON CONFLICT), result.rows будет пустым
    return result.rows[0] || null;
  }

  /**
   * Получить сообщения пользователя с фильтром по дате
   */
  static async findByUserId(
    userId: number,
    options?: {
      chatId?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<MessageData[]> {
    let query = 'SELECT * FROM messages WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    // Фильтр по chat_id (если указан)
    if (options?.chatId !== undefined) {
      query += ` AND chat_id = $${paramIndex}`;
      params.push(options.chatId);
      paramIndex++;
    }

    // Добавляем фильтр по дате начала (если указан)
    if (options?.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    // Добавляем фильтр по дате конца (если указан)
    if (options?.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    // Сортируем по дате создания (новые сначала)
    query += ' ORDER BY created_at DESC';

    // Ограничиваем количество результатов (если указано)
    if (options?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(options.limit);
    }

    const result = await pgPool.query<MessageData>(query, params);
    return result.rows;
  }

  /**
   * Получить количество сообщений пользователя
   */
  static async countByUserId(
    userId: number,
    options?: {
      chatId?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM messages WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    // Фильтр по chat_id (если указан)
    if (options?.chatId !== undefined) {
      query += ` AND chat_id = $${paramIndex}`;
      params.push(options.chatId);
      paramIndex++;
    }

    if (options?.startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(options.startDate);
      paramIndex++;
    }

    if (options?.endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(options.endDate);
      paramIndex++;
    }

    const result = await pgPool.query<{ count: string }>(query, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Получить топ пользователей по количеству сообщений
   */
  static async getTopUsersByMessageCount(
    limit: number = 10,
    options?: {
      chatId?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<Array<{ user_id: number; count: number; username: string | null; first_name: string | null }>> {
    let query = `
      SELECT 
        m.user_id,
        COUNT(*) as count,
        u.username,
        u.first_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
    `;
    const params: any[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    // Фильтр по chat_id (обязательный)
    if (options?.chatId !== undefined) {
      conditions.push(`m.chat_id = $${paramIndex}`);
      params.push(options.chatId);
      paramIndex++;
    }

    // Добавляем фильтр по дате (если указан)
    if (options?.startDate) {
      conditions.push(`m.created_at >= $${paramIndex}`);
      params.push(options.startDate);
      paramIndex++;
    }
    if (options?.endDate) {
      conditions.push(`m.created_at <= $${paramIndex}`);
      params.push(options.endDate);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      GROUP BY m.user_id, u.username, u.first_name
      ORDER BY count DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await pgPool.query(query, params);
    return result.rows.map((row) => ({
      user_id: row.user_id,
      count: parseInt(row.count, 10),
      username: row.username,
      first_name: row.first_name,
    }));
  }

  /**
   * Получить общую статистику по сообщениям
   */
  static async getStats(options?: {
    chatId?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ totalMessages: number; totalUsers: number }> {
    let query = `
      SELECT 
        COUNT(DISTINCT m.id) as total_messages,
        COUNT(DISTINCT m.user_id) as total_users
      FROM messages m
    `;
    const params: any[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    // Фильтр по chat_id (обязательный)
    if (options?.chatId !== undefined) {
      conditions.push(`m.chat_id = $${paramIndex}`);
      params.push(options.chatId);
      paramIndex++;
    }

    if (options?.startDate) {
      conditions.push(`m.created_at >= $${paramIndex}`);
      params.push(options.startDate);
      paramIndex++;
    }
    if (options?.endDate) {
      conditions.push(`m.created_at <= $${paramIndex}`);
      params.push(options.endDate);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const result = await pgPool.query<{ total_messages: string; total_users: string }>(query, params);
    return {
      totalMessages: parseInt(result.rows[0].total_messages, 10),
      totalUsers: parseInt(result.rows[0].total_users, 10),
    };
  }
}
