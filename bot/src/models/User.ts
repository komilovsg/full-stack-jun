import { pgPool } from '../config/database';

// Интерфейс для данных пользователя из БД
export interface UserData {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: Date;
  updated_at: Date;
}

// Интерфейс для создания нового пользователя
export interface CreateUserData {
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/**
 * Модель User - работа с таблицей users
 * Инкапсулирует все SQL-запросы для работы с пользователями
 */
export class User {
  /**
   * Найти или создать пользователя
   * Если пользователь с таким telegram_id уже существует - обновляем его данные
   * Если нет - создаем нового
   */
  static async findOrCreate(data: CreateUserData): Promise<UserData> {
    // Сначала пытаемся найти пользователя по telegram_id
    const findQuery = 'SELECT * FROM users WHERE telegram_id = $1';
    const findResult = await pgPool.query<UserData>(findQuery, [data.telegram_id]);

    if (findResult.rows.length > 0) {
      // Пользователь найден - обновляем его данные (username может измениться)
      const updateQuery = `
        UPDATE users 
        SET username = $1, first_name = $2, last_name = $3, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = $4
        RETURNING *
      `;
      const updateResult = await pgPool.query<UserData>(updateQuery, [
        data.username || null,
        data.first_name || null,
        data.last_name || null,
        data.telegram_id,
      ]);
      return updateResult.rows[0];
    }

    // Пользователь не найден - создаем нового
    const insertQuery = `
      INSERT INTO users (telegram_id, username, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const insertResult = await pgPool.query<UserData>(insertQuery, [
      data.telegram_id,
      data.username || null,
      data.first_name || null,
      data.last_name || null,
    ]);
    return insertResult.rows[0];
  }

  /**
   * Найти пользователя по telegram_id
   */
  static async findByTelegramId(telegramId: number): Promise<UserData | null> {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await pgPool.query<UserData>(query, [telegramId]);
    return result.rows[0] || null;
  }

  /**
   * Найти пользователя по username (без @)
   */
  static async findByUsername(username: string): Promise<UserData | null> {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await pgPool.query<UserData>(query, [username]);
    return result.rows[0] || null;
  }

  /**
   * Получить всех пользователей
   */
  static async findAll(): Promise<UserData[]> {
    const query = 'SELECT * FROM users ORDER BY created_at DESC';
    const result = await pgPool.query<UserData>(query);
    return result.rows;
  }
}
