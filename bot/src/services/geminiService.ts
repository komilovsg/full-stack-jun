import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { Message } from '../models/Message';
import { User } from '../models/User';

// Интерфейс для результата анализа
export interface UserAnalysis {
  style: string; // Стиль общения
  topics: string; // Основные темы
  averageLength: string; // Средняя длина сообщений
  activity: string; // Активность по времени суток
  tone: string; // Тональность
  features: string; // Особенности
  messageCount: number; // Количество проанализированных сообщений
  period: string; // Период анализа
}

/**
 * Сервис для работы с Gemini API
 */
export class GeminiService {
  private static genAI: GoogleGenerativeAI | null = null;
  private static model: any = null;

  /**
   * Проверка доступности API
   */
  static isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  /**
   * Создать модель с настройками безопасности
   */
  private static createModel(modelName: string) {
    if (!this.genAI) {
      throw new Error('GoogleGenerativeAI не инициализирован');
    }

    // Safety Settings для избежания блокировок при анализе сообщений из групп
    // BLOCK_ONLY_HIGH - блокирует только высокий уровень опасности
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ];

    return this.genAI.getGenerativeModel({
      model: modelName,
      safetySettings,
    });
  }

  /**
   * Инициализация Gemini API
   */
  static initialize() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY не установлен в переменных окружения');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    
    // Используем актуальные модели для бесплатного тарифа (январь 2026)
    // Приоритет: gemini-3-flash-preview > gemini-2.5-flash > gemini-2.5-pro
    const models = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'];
    
    for (const modelName of models) {
      try {
        this.model = this.createModel(modelName);
        console.log(`✅ Gemini API инициализирован (модель: ${modelName})`);
        return;
      } catch (error) {
        console.log(`⚠️ Модель ${modelName} недоступна, пробую следующую...`);
      }
    }
    
    // Fallback на старые модели, если новые не работают
    try {
      this.model = this.createModel('gemini-1.5-flash');
      console.log('✅ Gemini API инициализирован (модель: gemini-1.5-flash)');
    } catch (error) {
      this.model = this.createModel('gemini-pro');
      console.log('✅ Gemini API инициализирован (модель: gemini-pro)');
    }
  }

  /**
   * Retry с экспоненциальной задержкой для обработки Rate Limiting
   */
  private static async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Если это не Rate Limit ошибка, не повторяем
        if (error.status !== 429 && !error.message?.includes('429')) {
          throw error;
        }
        
        // Вычисляем задержку: экспоненциальная с jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`⚠️ Rate Limit достигнут. Повтор через ${Math.round(delay)}ms (попытка ${attempt + 1}/${maxRetries})...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Неизвестная ошибка при повторных попытках');
  }

  /**
   * Получить последние сообщения пользователя
   */
  private static async getUserMessages(telegramUserId: number, limit: number = 100): Promise<string[]> {
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
    
    // Если текст слишком длинный, берем только последние сообщения
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
   * Анализировать пользователя с помощью Gemini API
   */
  static async analyzeUser(
    telegramUserId: number,
    options?: { limit?: number }
  ): Promise<UserAnalysis | null> {
    try {
      if (!this.model) {
        this.initialize();
      }

      // Получаем пользователя
      const user = await User.findByTelegramId(telegramUserId);
      if (!user) {
        return null;
      }

      // Получаем последние сообщения (ограничиваем до 30 для более стабильной работы бесплатного API)
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

      // Отправляем запрос в Gemini
      console.log(`🤖 Отправляю запрос в Gemini API для анализа пользователя ${telegramUserId} (${messages.length} сообщений)`);
      
      // Если модель не инициализирована, инициализируем её
      if (!this.model) {
        this.initialize();
      }
      
      let result;
      let response;
      let analysisText;
      
      try {
        // Используем retry с экспоненциальной задержкой для обработки Rate Limiting
        const generateContent = async () => {
          result = await this.model.generateContent(prompt);
          response = await result.response;
          return response.text();
        };
        
        analysisText = await this.retryWithBackoff(generateContent, 3, 2000);
      } catch (error: any) {
        // Детальное логирование ошибки
        console.error('❌ Детали ошибки Gemini API:');
        console.error('  - Сообщение:', error.message);
        console.error('  - Статус:', error.status);
        console.error('  - Статус текст:', error.statusText);
        console.error('  - Детали ошибки:', error.errorDetails);
        
        // Обработка разных типов ошибок
        if (error.status === 429) {
          console.error('⚠️ Превышен лимит запросов (Rate Limit) после всех попыток.');
          throw new Error('Превышен лимит запросов к API. Подождите минуту и попробуйте снова.');
        }
        
        if (error.status === 400) {
          console.error('⚠️ Неверный запрос. Возможно, слишком много данных.');
          throw new Error('Запрос слишком большой. Попробуйте проанализировать пользователя с меньшим количеством сообщений.');
        }
        
        if (error.status === 403) {
          console.error('⚠️ Доступ запрещен. Проверьте API ключ.');
          throw new Error('Проблема с доступом к API. Проверьте API ключ.');
        }
        
        // Если текущая модель не работает (404), пробуем другие модели
        if (error.message && (error.message.includes('404') || error.status === 404)) {
          // Пробуем модели в порядке приоритета для бесплатного API
          const fallbackModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
          
          for (const modelName of fallbackModels) {
            try {
              console.log(`⚠️ Пробую модель: ${modelName}...`);
              this.model = this.createModel(modelName);
              
              // Пробуем с retry
              const generateContent = async () => {
                result = await this.model.generateContent(prompt);
                response = await result.response;
                return response.text();
              };
              
              analysisText = await this.retryWithBackoff(generateContent, 2, 1000);
              console.log(`✅ Модель ${modelName} работает!`);
              break;
            } catch (fallbackError: any) {
              console.error(`❌ Модель ${modelName} не работает:`);
              console.error('  - Статус:', fallbackError.status);
              console.error('  - Сообщение:', fallbackError.message);
              if (modelName === fallbackModels[fallbackModels.length - 1]) {
                // Последняя модель не сработала
                throw new Error(`Все модели Gemini недоступны. Последняя ошибка: ${fallbackError.message}`);
              }
            }
          }
        } else {
          throw error;
        }
      }

      // Парсим результат (простой парсинг по строкам)
      const analysis = this.parseAnalysisResponse(analysisText, messages.length, averageLength);

      return analysis;
    } catch (error) {
      console.error('❌ Ошибка при анализе пользователя через Gemini:', error);
      throw error;
    }
  }

  /**
   * Парсинг ответа от Gemini
   */
  private static parseAnalysisResponse(
    responseText: string,
    messageCount: number,
    averageLength: number
  ): UserAnalysis {
    // Простой парсинг по ключевым словам
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
