import dotenv from 'dotenv';
import path from 'path';
// Загружаем .env из корня проекта (если бот запущен из папки bot/)
const rootEnv = path.resolve(process.cwd(), '../.env');
dotenv.config({ path: rootEnv });
dotenv.config(); // затем из текущей папки (bot/.env)
import { Telegraf, Context } from 'telegraf';
import { connectRedis, testPostgresConnection } from './config/database';
import { User } from './models/User';
import { Message } from './models/Message';
import {
  handleStatsCommand,
  handleGeneralStats,
  handleUserStats,
  handlePeriodSelection,
  handleUserPeriodSelection,
  handleBackToMenu,
} from './handlers/statsHandlers';
import { handleAnalyzeCommand } from './handlers/analyzeHandlers';
import { handleDigestCommand } from './handlers/digestHandlers';
import { GeminiService } from './services/geminiService';

// Проверяем наличие обязательных переменных окружения
if (!process.env.BOT_TOKEN) {
  console.error('Ошибка: BOT_TOKEN не установлен в переменных окружения');
  process.exit(1);
}

// Создаем экземпляр бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Простая команда для проверки работы бота
bot.command('start', (ctx) => {
  console.log(`✅ Команда /start получена от пользователя ${ctx.from?.id} в чате ${ctx.chat?.id} (тип: ${ctx.chat?.type})`);
  ctx.reply('Бот запущен и готов к работе! Используйте /stats для статистики.');
});

// Команда /stats - статистика чата
bot.command('stats', handleStatsCommand);

// Команда /analyze - анализ пользователя
bot.command('analyze', handleAnalyzeCommand);

// Команда /digest - дневной дайджест чата
bot.command('digest', handleDigestCommand);

// Обработчики inline-кнопок для статистики
bot.action(/^stats:general:(-?\d+)$/, async (ctx) => {
  const chatId = parseInt(ctx.match[1]);
  await handleGeneralStats(ctx, chatId);
});

bot.action(/^stats:user:(-?\d+)$/, async (ctx) => {
  const chatId = parseInt(ctx.match[1]);
  await handleUserStats(ctx, chatId);
});

bot.action(/^stats:period:(-?\d+):(\w+)$/, async (ctx) => {
  const chatId = parseInt(ctx.match[1]);
  const period = ctx.match[2];
  await handlePeriodSelection(ctx, chatId, period);
});

bot.action(/^stats:menu:(-?\d+)$/, async (ctx) => {
  const chatId = parseInt(ctx.match[1]);
  await handleBackToMenu(ctx, chatId);
});

// Обработчик текстовых сообщений
// Сохраняет сообщения и пользователей в БД
bot.on('text', async (ctx: Context) => {
  try {
    const message = ctx.message;
    
    // Пропускаем команды - они обрабатываются отдельными обработчиками
    if (message && 'text' in message && message.text.startsWith('/')) {
      return;
    }
    
    console.log(`📨 Получено текстовое сообщение. Chat type: ${ctx.chat?.type}, Chat ID: ${ctx.chat?.id}`);
    
    // Проверяем, что сообщение из группового чата (не личное сообщение)
    // В групповых чатах chat.type будет 'group' или 'supergroup'
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      // Проверяем, что сообщение существует и это текстовое сообщение
      if (message && 'text' in message && ctx.from) {
        // Находим или создаем пользователя
        const user = await User.findOrCreate({
          telegram_id: ctx.from.id,
          username: ctx.from.username || null,
          first_name: ctx.from.first_name || null,
          last_name: ctx.from.last_name || null,
        });

        // Сохраняем сообщение в БД
        await Message.create({
          user_id: user.id,
          telegram_message_id: message.message_id,
          chat_id: ctx.chat.id,
          text: message.text,
        });

        // Логируем для отладки (можно убрать в продакшене)
        console.log(`💬 Сообщение сохранено: от @${ctx.from.username || ctx.from.first_name} в чате ${ctx.chat.id}`);
      } else {
        console.log(`⚠️ Сообщение не подходит для сохранения. Message: ${message ? 'exists' : 'null'}, From: ${ctx.from ? 'exists' : 'null'}`);
      }
    } else {
      console.log(`⚠️ Сообщение не из группового чата. Chat type: ${ctx.chat?.type}`);
    }
  } catch (error) {
    console.error('❌ Ошибка при сохранении сообщения:', error);
    // Не отправляем ошибку пользователю, чтобы не спамить
  }
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error('Ошибка в боте:', err);
  if (ctx && ctx.reply) {
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  }
});

// Функция инициализации (подключение к БД и API)
async function initialize() {
  try {
    // Подключаемся к PostgreSQL
    await testPostgresConnection();
    
    // Подключаемся к Redis
    await connectRedis();
    
    // Инициализируем Gemini API
    GeminiService.initialize();
    
    console.log('✅ Все подключения установлены');
  } catch (error) {
    console.error('❌ Ошибка при инициализации:', error);
    // В продакшене можно добавить retry логику
    throw error;
  }
}

// Запуск бота
async function startBot() {
  try {
    // Сначала инициализируем подключения к БД
    await initialize();
    
    // Затем запускаем бота
    console.log('🚀 Запуск бота...');
    console.log('🔑 BOT_TOKEN установлен:', process.env.BOT_TOKEN ? 'Да' : 'Нет');
    
    // Запускаем бота
    console.log('⏳ Вызываю bot.launch()...');
    await bot.launch();
    console.log('🤖 Бот успешно запущен и готов к работе!');
  } catch (error) {
    console.error('❌ Ошибка при запуске бота:', error);
    if (error instanceof Error) {
      console.error('❌ Детали ошибки:', error.message);
      console.error('❌ Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Запускаем бота
startBot();

// Graceful shutdown (корректное завершение работы)
async function shutdown() {
  console.log('🛑 Остановка бота...');
  await bot.stop();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
