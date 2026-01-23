import { Context } from 'telegraf';
import { StatsService } from '../services/statsService';
import { Markup } from 'telegraf';

/**
 * Форматирование общей статистики для вывода
 */
function formatGeneralStats(stats: Awaited<ReturnType<typeof StatsService.getChatStats>>, period: string): string {
  const periodNames: Record<string, string> = {
    all: 'все время',
    today: 'сегодня',
    week: 'за неделю',
    month: 'за месяц',
  };

  const periodName = periodNames[period] || period;

  let message = `📊 Статистика чата за ${periodName}:\n\n`;

  if (stats.topUsers.length === 0) {
    message += 'Пока нет сообщений в этом чате.\n';
    return message;
  }

  message += '🏆 Топ пользователей по сообщениям:\n\n';

  stats.topUsers.forEach((user, index) => {
    const username = user.username ? `@${user.username}` : user.first_name || 'Неизвестный';
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    message += `${emoji} ${username} - ${user.count} сообщений\n`;
  });

  message += `\n📈 Всего: ${stats.totalMessages} сообщений от ${stats.totalUsers} пользователей`;

  return message;
}

/**
 * Форматирование статистики пользователя
 */
function formatUserStats(stats: Awaited<ReturnType<typeof StatsService.getUserStats>>, period: string): string {
  if (!stats) {
    return '❌ Пользователь не найден.';
  }

  const periodNames: Record<string, string> = {
    all: 'все время',
    today: 'сегодня',
    week: 'за неделю',
    month: 'за месяц',
  };

  const periodName = periodNames[period] || period;
  const username = stats.username ? `@${stats.username}` : stats.firstName || 'Неизвестный';

  return `👤 Статистика пользователя ${username} за ${periodName}:\n\n📝 Сообщений: ${stats.messageCount}`;
}

/**
 * Создание inline-кнопок для выбора периода
 */
function createPeriodButtons(chatId: number, currentPeriod?: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 За сегодня', `stats:period:${chatId}:today`),
      Markup.button.callback('📆 За неделю', `stats:period:${chatId}:week`),
    ],
    [
      Markup.button.callback('📊 За месяц', `stats:period:${chatId}:month`),
      Markup.button.callback('🌐 За всё время', `stats:period:${chatId}:all`),
    ],
    [Markup.button.callback('🔙 Назад', `stats:menu:${chatId}`)],
  ]);
}

/**
 * Создание главного меню статистики
 */
function createStatsMenu(chatId: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Общая статистика', `stats:general:${chatId}`)],
    [Markup.button.callback('👤 Статистика пользователя', `stats:user:${chatId}`)],
  ]);
}

/**
 * Обработчик команды /stats
 */
export async function handleStatsCommand(ctx: Context) {
  try {
    console.log(`📊 Команда /stats получена от пользователя ${ctx.from?.id} в чате ${ctx.chat?.id} (тип: ${ctx.chat?.type})`);
    
    if (!ctx.chat) {
      console.error('❌ ctx.chat отсутствует');
      return;
    }

    const chatId = ctx.chat.id;
    const message = `📊 Статистика чата\n\nВыберите опцию:`;

    console.log(`📤 Отправляю меню статистики для чата ${chatId}`);
    await ctx.reply(message, createStatsMenu(chatId));
    console.log(`✅ Меню статистики отправлено`);
  } catch (error) {
    console.error('❌ Ошибка в handleStatsCommand:', error);
    if (error instanceof Error) {
      console.error('❌ Детали ошибки:', error.message);
      console.error('❌ Stack:', error.stack);
    }
    if (ctx.reply) {
      await ctx.reply('Произошла ошибка при получении статистики.');
    }
  }
}

/**
 * Обработчик inline-кнопки "Общая статистика"
 */
export async function handleGeneralStats(ctx: Context, chatId: number, period: string = 'all') {
  try {
    console.log(`📊 Получение общей статистики для чата ${chatId}, период: ${period}`);
    const stats = await StatsService.getChatStats(chatId, period);
    const message = formatGeneralStats(stats, period);

    try {
      await ctx.editMessageText(message, createPeriodButtons(chatId, period));
    } catch (editError: any) {
      // Обработка ошибки "message is not modified"
      if (editError.response?.error_code === 400 && editError.response?.description?.includes('message is not modified')) {
        console.log(`ℹ️ Сообщение не изменено (период: ${period})`);
        return;
      }
      throw editError;
    }
  } catch (error) {
    console.error('Ошибка в handleGeneralStats:', error);
    if (error instanceof Error) {
      console.error('  - Сообщение:', error.message);
      console.error('  - Stack:', error.stack);
    }
    try {
      await ctx.editMessageText('❌ Произошла ошибка при получении статистики. Попробуйте позже.');
    } catch (editError) {
      if (ctx.reply) {
        await ctx.reply('❌ Произошла ошибка при получении статистики. Попробуйте позже.');
      }
    }
  }
}

/**
 * Обработчик inline-кнопки "Статистика пользователя"
 */
export async function handleUserStats(ctx: Context, chatId: number) {
  try {
    // Пока просто просим выбрать период, потом можно добавить выбор пользователя
    await ctx.editMessageText(
      '👤 Статистика пользователя\n\nВыберите период:',
      createPeriodButtons(chatId)
    );
  } catch (error) {
    console.error('Ошибка в handleUserStats:', error);
    await ctx.editMessageText('Произошла ошибка.');
  }
}

/**
 * Обработчик выбора периода для общей статистики
 */
export async function handlePeriodSelection(ctx: Context, chatId: number, period: string) {
  try {
    const stats = await StatsService.getChatStats(chatId, period);
    const message = formatGeneralStats(stats, period);

    try {
      await ctx.editMessageText(message, createPeriodButtons(chatId, period));
    } catch (editError: any) {
      // Обработка ошибки "message is not modified" - это нормально, если пользователь выбрал тот же период
      if (editError.response?.error_code === 400 && editError.response?.description?.includes('message is not modified')) {
        console.log(`ℹ️ Сообщение не изменено (пользователь выбрал тот же период: ${period})`);
        // Можно попробовать отправить новое сообщение или просто игнорировать
        return;
      }
      throw editError;
    }
  } catch (error) {
    console.error('Ошибка в handlePeriodSelection:', error);
    if (error instanceof Error) {
      console.error('  - Сообщение:', error.message);
      console.error('  - Stack:', error.stack);
    }
    try {
      await ctx.editMessageText('❌ Произошла ошибка при получении статистики. Попробуйте позже.');
    } catch (editError) {
      // Если не удалось отредактировать, отправляем новое сообщение
      if (ctx.reply) {
        await ctx.reply('❌ Произошла ошибка при получении статистики. Попробуйте позже.');
      }
    }
  }
}

/**
 * Обработчик выбора периода для статистики пользователя
 */
export async function handleUserPeriodSelection(ctx: Context, chatId: number, period: string, userId?: number) {
  try {
    // Если userId не указан, используем ID отправителя
    const targetUserId = userId || (ctx.from?.id);
    
    if (!targetUserId) {
      await ctx.editMessageText('Не удалось определить пользователя.');
      return;
    }

    const stats = await StatsService.getUserStats(chatId, targetUserId, period);
    
    if (!stats) {
      await ctx.editMessageText('Пользователь не найден в базе данных.');
      return;
    }

    const message = formatUserStats(stats, period);
    await ctx.editMessageText(message, createPeriodButtons(chatId, period));
  } catch (error) {
    console.error('Ошибка в handleUserPeriodSelection:', error);
    await ctx.editMessageText('Произошла ошибка при получении статистики пользователя.');
  }
}

/**
 * Обработчик кнопки "Назад"
 */
export async function handleBackToMenu(ctx: Context, chatId: number) {
  try {
    const message = `📊 Статистика чата\n\nВыберите опцию:`;
    await ctx.editMessageText(message, createStatsMenu(chatId));
  } catch (error) {
    console.error('Ошибка в handleBackToMenu:', error);
  }
}
