import { Context } from 'telegraf';
import { DigestService } from '../services/digestService';

export async function handleDigestCommand(ctx: Context) {
  try {
    if (!ctx.chat || (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup')) {
      await ctx.reply('❌ Дайджест доступен только в групповых чатах.');
      return;
    }

    const chatId = ctx.chat.id;
    const from = ctx.from;

    console.log(
      `🧾 Команда /digest получена от пользователя ${from?.id} в чате ${chatId} (тип: ${ctx.chat.type})`,
    );

    const message = await ctx.reply(
      '⏳ Собираю сообщения за сегодня и готовлю дайджест… Это может занять до 10–15 секунд.',
    );

    try {
      const digest = await DigestService.generateDigest({ chatId, period: 'today' });

      if (!digest) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          message.message_id,
          undefined,
          '📭 За сегодня пока нет сообщений для дайджеста.',
        );
        return;
      }

      const text =
        `🧾 Дайджест чата за сегодня\n\n` +
        `📝 *Краткий пересказ*\n${digest.summary}\n\n` +
        `✅ *Action items*\n` +
        (digest.actionItems.length
          ? digest.actionItems.map((item) => `• ${item}`).join('\n')
          : '• Нет явных задач.') +
        `\n\n` +
        `🔍 *Контекст*\n` +
        `• Темы: ${digest.topics}\n` +
        `• Тон: ${digest.tone}`;

      await ctx.telegram.editMessageText(ctx.chat.id, message.message_id, undefined, text, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('❌ Ошибка при формировании дайджеста:', error);
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        message.message_id,
        undefined,
        '❌ Не удалось сформировать дайджест. Попробуйте позже.',
      );
    }
  } catch (error) {
    console.error('❌ Ошибка в handleDigestCommand:', error);
    if (ctx.reply) {
      await ctx.reply('Произошла ошибка при формировании дайджеста.');
    }
  }
}

