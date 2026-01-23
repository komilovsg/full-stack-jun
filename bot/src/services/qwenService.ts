import OpenAI from 'openai';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { UserAnalysis } from './geminiService';

/**
 * Сервис для работы с Qwen (Alibaba Model Studio, OpenAI‑совместимый API)
 */
export class QwenService {
  private static client: OpenAI | null = null;

  /**
   * Проверка доступности API
   */
  static isAvailable(): boolean {
    return !!process.env.DASHSCOPE_API_KEY;
  }

  /**
   * Ленивая инициализация клиента
   */
  private static getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        throw new Error('DASHSCOPE_API_KEY не установлен в переменных окружения');
      }

      const baseURL =
        process.env.DASHSCOPE_BASE_URL ||
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

      this.client = new OpenAI({
        apiKey,
        baseURL,
      });
    }

    return this.client;
  }

  /**
   * Получить последние сообщения пользователя
   */
  private static async getUserMessages(
    telegramUserId: number,
    limit: number = 30,
  ): Promise<string[]> {
    const user = await User.findByTelegramId(telegramUserId);
    if (!user) {
      return [];
    }

    const messages = await Message.findByUserId(user.id, { limit });
    return messages.map((msg) => msg.text);
  }

  /**
   * Создать промпт для анализа пользователя (по той же схеме, что Gemini/DeepSeek)
   */
  private static createAnalysisPrompt(
    messages: string[],
    username: string | null,
    firstName: string | null,
  ): string {
    const displayName = username ? `@${username}` : firstName || 'Пользователь';
    const maxLength = 6000;
    let messagesText = messages.join('\n');

    if (messagesText.length > maxLength) {
      const truncated = messages.slice(-Math.floor(messages.length * 0.6));
      messagesText = truncated.join('\n');
      console.log(`⚠️ [Qwen] Текст обрезан до ${messagesText.length} символов`);
    }

    return `Проанализируй стиль общения ${displayName} по сообщениям:

${messagesText}

Формат ответа (только текст, без markdown):
Стиль: [формальный/неформальный, дружелюбный/строгий]
Темы: [основные темы через запятую]
Активность: [время суток активности, если видно]
Тональность: [позитивная/нейтральная/негативная]
Особенности: [частые слова, эмодзи, выражения]

Кратко и конкретно.`;
  }

  /**
   * Анализировать пользователя с помощью Qwen API
   */
  static async analyzeUser(
    telegramUserId: number,
    options?: { limit?: number },
  ): Promise<UserAnalysis | null> {
    try {
      if (!this.isAvailable()) {
        throw new Error('DASHSCOPE_API_KEY не установлен, Qwen недоступен');
      }

      const client = this.getClient();

      const user = await User.findByTelegramId(telegramUserId);
      if (!user) {
        return null;
      }

      const limit = Math.min(options?.limit || 30, 30);
      const messages = await this.getUserMessages(telegramUserId, limit);

      if (messages.length === 0) {
        return {
          style: 'Недостаточно данных',
          topics: 'Нет сообщений для анализа',
          averageLength: '0',
          activity: 'Недостаточно данных',
          tone: 'Недостаточно данных',
          features: 'Нет данных',
          messageCount: 0,
          period: 'все время',
        };
      }

      const totalLength = messages.reduce((sum, msg) => sum + msg.length, 0);
      const averageLength = Math.round(totalLength / messages.length);

      const prompt = this.createAnalysisPrompt(
        messages,
        user.username,
        user.first_name,
      );
      const model = process.env.DASHSCOPE_MODEL || 'qwen-plus';

      console.log(
        `🤖 Отправляю запрос в Qwen API (модель: ${model}) для пользователя ${telegramUserId} (${messages.length} сообщений)`,
      );

      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that analyzes Telegram chat messages and responds in Russian.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const choice = completion.choices?.[0];
      if (!choice || !choice.message) {
        throw new Error('Пустой ответ от Qwen API');
      }

      const content = choice.message.content as unknown;
      let analysisText = '';

      if (typeof content === 'string') {
        analysisText = content;
      } else if (Array.isArray(content)) {
        analysisText = content
          .map((part: any) =>
            typeof part === 'string' ? part : part?.text ?? '',
          )
          .join('');
      } else {
        analysisText = JSON.stringify(content);
      }

      if (!analysisText) {
        throw new Error('Пустой текст ответа от Qwen API');
      }

      const lines = analysisText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line);

      let style = 'Не указан';
      let topics = 'Не указаны';
      let activity = 'Не указана';
      let tone = 'Не указана';
      let features = 'Не указаны';

      for (const line of lines) {
        if (line.toLowerCase().startsWith('стиль:')) {
          style = line.replace(/^стиль:\s*/i, '').trim();
        } else if (line.toLowerCase().startsWith('темы:')) {
          topics = line.replace(/^темы:\s*/i, '').trim();
        } else if (line.toLowerCase().startsWith('активность:')) {
          activity = line.replace(/^активность:\s*/i, '').trim();
        } else if (line.toLowerCase().startsWith('тональность:')) {
          tone = line.replace(/^тональность:\s*/i, '').trim();
        } else if (line.toLowerCase().startsWith('особенности:')) {
          features = line.replace(/^особенности:\s*/i, '').trim();
        }
      }

      const analysis: UserAnalysis = {
        style,
        topics,
        averageLength: `${averageLength} символов`,
        activity,
        tone,
        features,
        messageCount: messages.length,
        period: 'все время',
      };

      return analysis;
    } catch (error) {
      console.error('❌ Ошибка при анализе пользователя через Qwen:', error);
      throw error;
    }
  }
}

