import { Message } from '../models/Message';
import { User } from '../models/User';
import { UserAnalysis } from './geminiService';

/**
 * Сервис для работы с DeepSeek API
 */
export class DeepSeekService {
  private static readonly API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';
  private static readonly API_KEY = process.env.DEEPSEEK_API_KEY;

  /**
   * Проверка доступности API
   */
  static isAvailable(): boolean {
    return !!this.API_KEY;
  }

  /**
   * Получить последние сообщения пользователя
   */
  private static async getUserMessages(telegramUserId: number, limit: number = 50): Promise<string[]> {
    const user = await User.findByTelegramId(telegramUserId);
    if (!user) {
      return [];
    }

    const messages = await Message.findByUserId(user.id, { limit });
    return messages.map((msg) => msg.text);
  }

  /**
   * Создать промпт для анализа пользователя (оптимизированная версия)
   */
  private static createAnalysisPrompt(messages: string[], username: string | null, firstName: string | null): string {
    const displayName = username ? `@${username}` : firstName || 'Пользователь';
    // Ограничиваем длину сообщений для API (6000 символов для более стабильной работы)
    const maxLength = 6000;
    let messagesText = messages.join('\n');
    
    if (messagesText.length > maxLength) {
      const truncated = messages.slice(-Math.floor(messages.length * 0.6)); // Берем последние 60%
      messagesText = truncated.join('\n');
      console.log(`⚠️ Текст обрезан до ${messagesText.length} символов (было ${messages.join('\n').length})`);
    }

    // Оптимизированный промпт - короче, но сохраняет суть
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
   * Анализировать пользователя с помощью DeepSeek API
   */
  static async analyzeUser(
    telegramUserId: number,
    options?: { limit?: number }
  ): Promise<UserAnalysis | null> {
    try {
      if (!this.API_KEY) {
        throw new Error('DEEPSEEK_API_KEY не установлен');
      }

      // Получаем пользователя
      const user = await User.findByTelegramId(telegramUserId);
      if (!user) {
        return null;
      }

      // Получаем последние сообщения (ограничиваем до 30 для более стабильной работы)
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

      // Вычисляем среднюю длину сообщений
      const totalLength = messages.reduce((sum, msg) => sum + msg.length, 0);
      const averageLength = Math.round(totalLength / messages.length);

      // Создаем промпт
      const prompt = this.createAnalysisPrompt(messages, user.username, user.first_name);

      // Отправляем запрос в DeepSeek API
      console.log(`🤖 Отправляю запрос в DeepSeek API для анализа пользователя ${telegramUserId} (${messages.length} сообщений)`);

      const response = await fetch(`${this.API_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ DeepSeek API ошибка: ${response.status} ${response.statusText}`);
        console.error(`   Детали: ${errorText}`);
        
        // Специальная обработка для разных статусов
        if (response.status === 402) {
          throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE'); // Специальный код для недостатка средств
        }
        
        throw new Error(`DeepSeek API ошибка: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };
      const analysisText = data.choices?.[0]?.message?.content || '';

      if (!analysisText) {
        throw new Error('Пустой ответ от DeepSeek API');
      }

      // Парсим результат
      const analysis = this.parseAnalysisResponse(analysisText, messages.length, averageLength);

      return analysis;
    } catch (error) {
      console.error('❌ Ошибка при анализе пользователя через DeepSeek:', error);
      if (error instanceof Error) {
        console.error('   Сообщение:', error.message);
      }
      throw error;
    }
  }

  /**
   * Парсинг ответа от DeepSeek
   */
  private static parseAnalysisResponse(
    responseText: string,
    messageCount: number,
    averageLength: number
  ): UserAnalysis {
    const lines = responseText.split('\n').map((line) => line.trim()).filter((line) => line);

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

    return {
      style,
      topics,
      averageLength: `${averageLength} символов`,
      activity,
      tone,
      features,
      messageCount,
      period: 'все время',
    };
  }
}
