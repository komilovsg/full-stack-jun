import { Pool } from 'pg';
import { createClient } from 'redis';

// Конфигурация подключения к PostgreSQL
// Pool - это пул соединений, который позволяет эффективно управлять множественными подключениями к БД
export const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'telegram_bot',
  // Максимальное количество клиентов в пуле
  max: 20,
  // Время ожидания перед таймаутом подключения (в миллисекундах)
  connectionTimeoutMillis: 2000,
});

// Обработка ошибок подключения
pgPool.on('error', (err) => {
  console.error('Неожиданная ошибка PostgreSQL клиента:', err);
});

// Конфигурация подключения к Redis
// Redis используется для кэширования результатов статистики
export const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
});

// Обработка ошибок Redis
redisClient.on('error', (err) => {
  console.error('Ошибка Redis клиента:', err);
});

// Функция для подключения к Redis
export async function connectRedis() {
  try {
    await redisClient.connect();
    console.log('✅ Подключение к Redis установлено');
  } catch (error) {
    console.error('❌ Ошибка подключения к Redis:', error);
    throw error;
  }
}

// Функция для проверки подключения к PostgreSQL
export async function testPostgresConnection() {
  try {
    const result = await pgPool.query('SELECT NOW()');
    console.log('✅ Подключение к PostgreSQL установлено:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Ошибка подключения к PostgreSQL:', error);
    throw error;
  }
}
