import { Context } from 'telegraf';
import { GeminiService } from '../services/geminiService';
import { DeepSeekService } from '../services/deepseekService';
import { QwenService } from '../services/qwenService';
import { User } from '../models/User';

/**
 * Форматирование результата анализа для вывода
 */
function formatAnalysisResult(analysis: Awaited<ReturnType<typeof GeminiService.analyzeUser>>, username: string | null, firstName: string | null): string {
  if (!analysis) {
    return '❌ Пользователь не найден в базе данных.';
  }

  const displayName = username ? `@${username}` : firstName || 'Неизвестный';

  let message = `🔍 Анализ пользователя ${displayName}\n\n`;
  message += `📝 Стиль: ${analysis.style}\n`;
  message += `💬 Темы: ${analysis.topics}\n`;
  message += `📏 Средняя длина сообщений: ${analysis.averageLength}\n`;
  message += `⏰ Активность: ${analysis.activity}\n`;
  message += `😊 Тональность: ${analysis.tone}\n`;
  message += `✨ Особенности: ${analysis.features}\n\n`;
  message += `📊 На основе ${analysis.messageCount} сообщений за ${analysis.period}.`;

  return message;
}

/**
 * Обработчик команды /analyze
 * Использование: /analyze @username или /analyze (reply на сообщение)
 */
export async function handleAnalyzeCommand(ctx: Context) {
  try {
    console.log(`🔍 Команда /analyze получена от пользователя ${ctx.from?.id} в чате ${ctx.chat?.id}`);

    if (!ctx.message || !('text' in ctx.message)) {
      await ctx.reply('❌ Команда должна быть текстовой.');
      return;
    }

    let targetUserId: number | undefined;

    // Проверяем, есть ли reply на сообщение
    const message = ctx.message;
    if ('reply_to_message' in message && message.reply_to_message && 'from' in message.reply_to_message && message.reply_to_message.from) {
      targetUserId = message.reply_to_message.from.id;
      console.log(`📎 Анализ по reply на сообщение от пользователя ${targetUserId}`);
    } else {
      // Пытаемся извлечь username из команды
      const text = message.text;
      const match = text.match(/@(\w+)/);
      
      if (match) {
        const username = match[1];
        console.log(`🔍 Поиск пользователя по username: @${username}`);
        
        const user = await User.findByUsername(username);
        if (user) {
          targetUserId = user.telegram_id;
        } else {
          await ctx.reply(`❌ Пользователь @${username} не найден в базе данных.`);
          return;
        }
      } else {
        // Если username не указан и нет reply - используем отправителя команды
        targetUserId = ctx.from?.id;
        console.log(`👤 Анализ отправителя команды: ${targetUserId}`);
      }
    }

    if (!targetUserId) {
      await ctx.reply(
        '❌ Не удалось определить пользователя для анализа.\n\n' +
        'Использование:\n' +
        '• /analyze @username - анализ по username\n' +
        '• /analyze (reply на сообщение) - анализ пользователя из сообщения\n' +
        '• /analyze - анализ вашего профиля'
      );
      return;
    }

    // Отправляем сообщение о начале анализа
    const processingMessage = await ctx.reply('⏳ Анализирую пользователя... Это может занять несколько секунд.');

    try {
      // Получаем информацию о пользователе
      const user = await User.findByTelegramId(targetUserId);
      if (!user) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMessage.message_id,
          undefined,
          '❌ Пользователь не найден в базе данных.'
        );
        return;
      }

      // Выполняем анализ (ограничиваем до 30 сообщений для более стабильной работы бесплатного API)
      // Порядок приоритета: DeepSeek → Qwen → Gemini
      let analysis = null;
      let usedService = '';

      type Provider = 'DeepSeek' | 'Qwen' | 'Gemini';
      const providers: Provider[] = ['DeepSeek', 'Qwen', 'Gemini'];
      let lastError: Error | null = null;
      let deepseekInsufficient = false;

      for (const provider of providers) {
        try {
          if (provider === 'DeepSeek') {
            const isAvailable = DeepSeekService.isAvailable();
            console.log(`🔍 DeepSeek доступен: ${isAvailable}`);
            if (!isAvailable) {
              console.log('⏭️ Пропускаю DeepSeek (недоступен)');
              continue;
            }
            console.log('🔄 Пробую DeepSeek API...');
            analysis = await DeepSeekService.analyzeUser(targetUserId, { limit: 30 });
            usedService = 'DeepSeek';
            console.log('✅ DeepSeek API успешно выполнил анализ');
            break;
          }

          if (provider === 'Qwen') {
            const isAvailable = QwenService.isAvailable();
            console.log(`🔍 Qwen доступен: ${isAvailable}`);
            console.log(`🔍 DASHSCOPE_API_KEY установлен: ${!!process.env.DASHSCOPE_API_KEY}`);
            if (!isAvailable) {
              console.log('⏭️ Пропускаю Qwen (недоступен - DASHSCOPE_API_KEY не установлен)');
              continue;
            }
            console.log('🔄 Пробую Qwen API...');
            analysis = await QwenService.analyzeUser(targetUserId, { limit: 30 });
            usedService = 'Qwen';
            console.log('✅ Qwen API успешно выполнил анализ');
            break;
          }

          if (provider === 'Gemini') {
            const isAvailable = GeminiService.isAvailable();
            console.log(`🔍 Gemini доступен: ${isAvailable}`);
            if (!isAvailable) {
              console.log('⏭️ Пропускаю Gemini (недоступен)');
              continue;
            }
            console.log('🔄 Пробую Gemini API...');
            analysis = await GeminiService.analyzeUser(targetUserId, { limit: 30 });
            usedService = 'Gemini';
            console.log('✅ Gemini API успешно выполнил анализ');
            break;
          }
        } catch (err: any) {
          const error = err instanceof Error ? err : new Error(String(err));
          lastError = error;
          console.error(`❌ ${provider} API не сработал:`, error.message);
          if (provider === 'DeepSeek' && error.message.includes('INSUFFICIENT_BALANCE')) {
            deepseekInsufficient = true;
          }
        }
      }

      if (!analysis) {
        if (deepseekInsufficient && !QwenService.isAvailable() && !GeminiService.isAvailable()) {
          throw new Error(
            'DeepSeek API: недостаточно средств на счету. Альтернативные API (Qwen / Gemini) недоступны.',
          );
        }
        if (lastError) {
          throw lastError;
        }
        throw new Error(
          'Ни один LLM‑провайдер не смог выполнить анализ. Проверьте настройки ключей API.',
        );
      }

      if (!analysis) {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          processingMessage.message_id,
          undefined,
          '❌ Не удалось выполнить анализ пользователя. Проверьте настройки API.'
        );
        return;
      }

      console.log(`✅ Анализ выполнен через ${usedService} API`);

      // Форматируем и отправляем результат
      const resultText = formatAnalysisResult(analysis, user.username, user.first_name);
      const finalText = `${resultText}\n\n🤖 Анализ выполнен через ${usedService} API`;
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMessage.message_id,
        undefined,
        finalText
      );
    } catch (error: any) {
      console.error('❌ Ошибка при анализе пользователя:', error);
      console.error('  - Тип ошибки:', error.constructor.name);
      console.error('  - Сообщение:', error.message);
      console.error('  - Stack:', error.stack);
      
      let errorMessage = '❌ Произошла ошибка при анализе пользователя.';
      
      // Более информативные сообщения об ошибках
      if (error.message && error.message.includes('лимит')) {
        errorMessage = '⚠️ Превышен лимит запросов к API. Подождите минуту и попробуйте снова.';
      } else if (error.message && error.message.includes('слишком большой')) {
        errorMessage = '⚠️ Слишком много данных для анализа. Попробуйте пользователя с меньшим количеством сообщений.';
      } else if (error.message && error.message.includes('API ключ')) {
        errorMessage = '⚠️ Проблема с доступом к API. Проверьте настройки.';
      }
      
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        processingMessage.message_id,
        undefined,
        errorMessage
      );
    }
  } catch (error) {
    console.error('❌ Ошибка в handleAnalyzeCommand:', error);
    if (ctx.reply) {
      await ctx.reply('Произошла ошибка при обработке команды.');
    }
  }
}
