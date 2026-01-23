import { NextResponse } from 'next/server';
import { Pool } from 'pg';

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'telegram_bot',
  max: 20,
  connectionTimeoutMillis: 5000,
});

interface TopUserRow {
  username: string | null;
  first_name: string | null;
  message_count: string;
}

const recentAnalyses: { username: string; analyzedAt: string }[] = [];

export async function GET() {
  try {
    const statsQuery = `
      SELECT 
        COUNT(DISTINCT m.id) as total_messages,
        COUNT(DISTINCT m.user_id) as total_users
      FROM messages m
    `;
    const statsResult = await pgPool.query<{ total_messages: string; total_users: string }>(
      statsQuery,
    );

    const topUsersQuery = `
      SELECT 
        u.username,
        u.first_name,
        COUNT(m.id) as message_count
      FROM messages m
      JOIN users u ON m.user_id = u.id
      GROUP BY u.username, u.first_name
      ORDER BY message_count DESC
      LIMIT 8
    `;
    const topUsersResult = await pgPool.query<TopUserRow>(topUsersQuery);

    // Получаем данные для таблицы всех пользователей
    const allUsersQuery = `
      SELECT 
        u.id,
        u.telegram_id,
        u.username,
        u.first_name,
        u.last_name,
        COUNT(m.id) as message_count,
        MIN(m.created_at) as first_message,
        MAX(m.created_at) as last_message
      FROM users u
      LEFT JOIN messages m ON u.id = m.user_id
      GROUP BY u.id, u.telegram_id, u.username, u.first_name, u.last_name
      ORDER BY message_count DESC
    `;
    const allUsersResult = await pgPool.query<{
      id: number;
      telegram_id: number;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      message_count: string;
      first_message: Date | null;
      last_message: Date | null;
    }>(allUsersQuery);

    // Получаем данные для графика (сообщения по дням за последние 30 дней)
    const messagesByDayQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as message_count
      FROM messages
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    const messagesByDayResult = await pgPool.query<{
      date: Date;
      message_count: string;
    }>(messagesByDayQuery);

    const totalMessages = parseInt(statsResult.rows[0]?.total_messages || '0', 10);
    const totalUsers = parseInt(statsResult.rows[0]?.total_users || '0', 10);

    const topUsers = topUsersResult.rows.map((row) => ({
      username: row.username,
      first_name: row.first_name,
      messageCount: parseInt(row.message_count, 10),
    }));

    const allUsers = allUsersResult.rows.map((row) => ({
      id: row.id,
      telegramId: row.telegram_id,
      username: row.username,
      firstName: row.first_name,
      lastName: row.last_name,
      messageCount: parseInt(row.message_count, 10),
      firstMessage: row.first_message ? new Date(row.first_message).toISOString() : null,
      lastMessage: row.last_message ? new Date(row.last_message).toISOString() : null,
    }));

    const messagesByDay = messagesByDayResult.rows.map((row) => ({
      date: new Date(row.date).toISOString().split('T')[0],
      count: parseInt(row.message_count, 10),
    }));

    return NextResponse.json({
      totalMessages,
      totalUsers,
      topUsers,
      allUsers,
      messagesByDay,
      recentAnalyses,
    });
  } catch (error: any) {
    console.error('Ошибка при получении overview:', error);
    const errorMessage =
      error?.message?.includes('password authentication')
        ? 'Ошибка подключения к БД: проверьте POSTGRES_PASSWORD в .env'
        : error?.message?.includes('ENOTFOUND')
        ? 'БД недоступна: убедитесь, что PostgreSQL запущен'
        : 'Не удалось получить статистику';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

