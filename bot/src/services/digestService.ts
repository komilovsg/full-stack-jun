import { Message } from '../models/Message';
import { GeminiService } from './geminiService';
import { QwenService } from './qwenService';
import { DeepSeekService } from './deepseekService';

export interface ChatDigestOptions {
  chatId: number;
  period?: 'today' | 'yesterday';
  maxMessages?: number;
}

export interface ChatDigestResult {
  summary: string;
  actionItems: string[];
  topics: string;
  tone: string;
}

export class DigestService {
  /**
   * Получить временной диапазон для периода
   */
  private static getDateRange(period: 'today' | 'yesterday'): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    if (period === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: start, endDate: end };
    }

    // today
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { startDate: start, endDate: now };
  }

  /**
   * Собрать сообщения из чата за период
   */
  private static async getChatMessages({
    chatId,
    period = 'today',
    maxMessages = 200,
  }: ChatDigestOptions): Promise<string[]> {
    const { startDate, endDate } = this.getDateRange(period);

    // Берём сообщения всех пользователей по chatId и диапазону дат
    const queryMessages = `
      SELECT text
      FROM messages
      WHERE chat_id = $1
        AND created_at >= $2
        AND created_at <= $3
      ORDER BY created_at ASC
      LIMIT $4
    `;

    // Небольшой хак: используем pgPool через статический метод getStats,
    // чтобы не дублировать подключение — но проще всего сделать прямой запрос здесь.
    // Однако у нас нет прямого экспорта pgPool здесь, поэтому опираемся на Message.getStats как на шаблон.
    const { pgPool } = await import('../config/database');

    const res = await pgPool.query<{ text: string }>(queryMessages, [
      chatId,
      startDate,
      endDate,
      maxMessages,
    ]);

    return res.rows.map((row) => row.text);
  }

  /**
   * Сформировать промпт для дайджеста
   */
  private static createDigestPrompt(
    messages: string[],
    periodLabel: string,
  ): string {
    const joined = messages.join('\n');
    const maxLength = 8000;
    let text = joined;

    if (text.length > maxLength) {
      // Берём середину + конец, чтобы захватить разные участки обсуждений
      const sliceSize = Math.floor(messages.length * 0.6);
      text = messages.slice(-sliceSize).join('\n');
    }

    return `Ты помощник, который делает дайджест группового чата Telegram.
Ниже — сообщения за период: ${periodLabel}.

Твоя задача:
1) Кратко пересказать, что обсуждали (2–4 предложения).
2) Выделить список action items / задач (по пунктам).
3) Описать основные темы и общее настроение участников.

Формат ответа (строго придерживайся структуры, без markdown, только текст):

Summary:
- [краткий пересказ в 2–4 предложениях]

Action items:
- [задача 1]
- [задача 2]
- [и т.д.; если задач нет, напиши один пункт "Нет явных задач"]

Context:
- Темы: [перечисли основные темы через запятую]
- Тон: [кратко опиши общее настроение: позитивное / нейтральное / напряжённое и т.п.]

Сообщения чата:
${text}`;
  }

  /**
   * Вызвать LLM‑провайдера по приоритету: Qwen → Gemini → DeepSeek (как fallback)
   */
  private static async generateWithLLM(prompt: string): Promise<string> {
    const providers: Array<'Qwen' | 'Gemini' | 'DeepSeek'> = [
      'Qwen',
      'Gemini',
      'DeepSeek',
    ];

    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        if (provider === 'Qwen' && QwenService.isAvailable()) {
          console.log('🧠 Digest: вызываю Qwen API…');
          // Переиспользуем analyzeUser?“ Нет, тут другой промпт → сделаем прямой вызов через QwenService.getClient
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({
            apiKey: process.env.DASHSCOPE_API_KEY,
            baseURL:
              process.env.DASHSCOPE_BASE_URL ||
              'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
          });

          const completion = await client.chat.completions.create({
            model: process.env.DASHSCOPE_MODEL || 'qwen-plus',
            messages: [
              {
                role: 'system',
                content:
                  'Ты помощник, который делает структурированный дайджест группового чата на русском языке.',
              },
              { role: 'user', content: prompt },
            ],
          });

          const content = completion.choices[0]?.message?.content;
          if (!content) throw new Error('Пустой ответ от Qwen');
          return typeof content === 'string' ? content : JSON.stringify(content);
        }

        if (provider === 'Gemini' && GeminiService.isAvailable()) {
          console.log('🧠 Digest: вызываю Gemini API…');
          // Используем существующую инициализацию Gemini
          // но здесь вызываем generateContent напрямую
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const apiKey = process.env.GEMINI_API_KEY!;
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          return response.text();
        }

        if (provider === 'DeepSeek' && DeepSeekService.isAvailable()) {
          console.log('🧠 Digest: вызываю DeepSeek API…');
          // Небольшой direct fetch, как в deepseekService
          const url =
            process.env.DEESEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: [
                {
                  role: 'user',
                  content: prompt,
                },
              ],
            }),
          });
          const data = (await res.json()) as {
            choices?: Array<{
              message?: { content?: string };
            }>;
          };
          const text = data.choices?.[0]?.message?.content || '';
          if (!text) throw new Error('Пустой ответ от DeepSeek');
          return text;
        }
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`❌ Digest: ошибка провайдера ${provider}:`, lastError.message);
      }
    }

    throw lastError || new Error('Все LLM‑провайдеры недоступны для дайджеста');
  }

  /**
   * Сгенерировать дайджест чата
   */
  static async generateDigest(
    options: ChatDigestOptions,
  ): Promise<ChatDigestResult | null> {
    const period = options.period || 'today';
    const periodLabel = period === 'today' ? 'сегодня' : 'вчера';

    const messages = await this.getChatMessages({
      chatId: options.chatId,
      period,
      maxMessages: options.maxMessages ?? 200,
    });

    if (messages.length === 0) {
      return null;
    }

    const prompt = this.createDigestPrompt(messages, periodLabel);
    const raw = await this.generateWithLLM(prompt);

    // Простой парсинг по секциям Summary / Action items / Context
    const summaryMatch = raw.match(/Summary:\s*([\s\S]*?)(?:Action items:|$)/i);
    const actionMatch = raw.match(/Action items:\s*([\s\S]*?)(?:Context:|$)/i);
    const contextMatch = raw.match(/Context:\s*([\s\S]*)$/i);

    const summary = (summaryMatch?.[1] || raw).trim();

    const actionBlock = (actionMatch?.[1] || '').trim();
    const actionItems = actionBlock
      ? actionBlock
          .split('\n')
          .map((line) => line.replace(/^-+\s*/, '').trim())
          .filter(Boolean)
      : ['Нет явных задач.'];

    let topics = 'Не указаны';
    let tone = 'Не указан';

    if (contextMatch?.[1]) {
      const ctx = contextMatch[1];
      const topicsMatch = ctx.match(/Темы:\s*(.*)/i);
      const toneMatch = ctx.match(/Тон:\s*(.*)/i);
      if (topicsMatch?.[1]) topics = topicsMatch[1].trim();
      if (toneMatch?.[1]) tone = toneMatch[1].trim();
    }

    return {
      summary,
      actionItems,
      topics,
      tone,
    };
  }
}

