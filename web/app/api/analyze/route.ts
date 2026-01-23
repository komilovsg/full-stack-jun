import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Инициализация подключения к БД
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'telegram_bot',
  max: 20,
  connectionTimeoutMillis: 5000,
});

// Интерфейсы
interface UserData {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface MessageData {
  id: number;
  user_id: number;
  telegram_message_id: number;
  chat_id: number;
  text: string;
  created_at: Date;
}

interface UserAnalysis {
  style: string;
  topics: string;
  averageLength: string;
  activity: string;
  tone: string;
  features: string;
  messageCount: number;
  period: string;
}

const recentAnalyses: { username: string; analyzedAt: string }[] = [];

type Provider = 'qwen' | 'gemini' | 'deepseek';

// Вспомогательные функции
async function findUserByUsername(username: string): Promise<UserData | null> {
  const query = 'SELECT * FROM users WHERE username = $1';
  const result = await pgPool.query<UserData>(query, [username]);
  return result.rows[0] || null;
}

async function getUserMessages(userId: number, limit: number = 30): Promise<string[]> {
  const query = `
    SELECT text FROM messages 
    WHERE user_id = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `;
  const result = await pgPool.query<MessageData>(query, [userId, limit]);
  return result.rows.map((msg) => msg.text);
}

function createAnalysisPrompt(messages: string[], username: string | null, firstName: string | null): string {
  const displayName = username ? `@${username}` : firstName || 'Пользователь';
  const maxLength = 6000;
  let messagesText = messages.join('\n');
  
  if (messagesText.length > maxLength) {
    const truncated = messages.slice(-Math.floor(messages.length * 0.6));
    messagesText = truncated.join('\n');
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

function parseAnalysisResponse(
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

async function analyzeUserWithGemini(username: string): Promise<UserAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY не установлен');
  }

  // Находим пользователя
  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }

  // Получаем сообщения
  const limit = 30;
  const messages = await getUserMessages(user.id, limit);

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

  // Вычисляем среднюю длину
  const totalLength = messages.reduce((sum, msg) => sum + msg.length, 0);
  const averageLength = Math.round(totalLength / messages.length);

  // Создаем промпт
  const prompt = createAnalysisPrompt(messages, user.username, user.first_name);

  // Инициализируем Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  ];

  // Пробуем модели в порядке приоритета
  const models = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
  let model = null;
  let analysisText = '';

  for (const modelName of models) {
    try {
      model = genAI.getGenerativeModel({ model: modelName, safetySettings });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      analysisText = response.text();
      break;
    } catch (error: any) {
      if (modelName === models[models.length - 1]) {
        throw error;
      }
      continue;
    }
  }

  // Парсим результат
  const analysis = parseAnalysisResponse(analysisText, messages.length, averageLength);
  return analysis;
}

async function analyzeUserWithQwen(username: string): Promise<UserAnalysis | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseURL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
  const model = process.env.DASHSCOPE_MODEL || 'qwen-plus';

  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY не установлен');
  }

  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }

  const limit = 30;
  const messages = await getUserMessages(user.id, limit);

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
  const prompt = createAnalysisPrompt(messages, user.username, user.first_name);

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Ты помощник, который анализирует сообщения из Telegram-чата и отвечает коротко и структурированно на русском языке.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  const analysisText = Array.isArray(content)
    ? content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('\n')
    : (content as string | null) || '';

  if (!analysisText) {
    throw new Error('Пустой ответ от Qwen');
  }

  const analysis = parseAnalysisResponse(analysisText, messages.length, averageLength);
  return analysis;
}

async function analyzeUserWithDeepseek(username: string): Promise<UserAnalysis | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com';

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY не установлен');
  }

  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }

  const limit = 30;
  const messages = await getUserMessages(user.id, limit);

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
  const prompt = createAnalysisPrompt(messages, user.username, user.first_name);

  const response = await fetch(`${apiUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
    if (response.status === 402) {
      throw new Error('DEEPSEEK_INSUFFICIENT_BALANCE');
    }
    throw new Error(`DeepSeek API ошибка: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
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

  const analysis = parseAnalysisResponse(analysisText, messages.length, averageLength);
  return analysis;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, provider } = body as { username?: string; provider?: Provider };

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username обязателен' },
        { status: 400 }
      );
    }

    // Убираем @ если есть
    const cleanUsername = username.replace('@', '').trim();

    if (!cleanUsername) {
      return NextResponse.json(
        { error: 'Username не может быть пустым' },
        { status: 400 }
      );
    }

    // Сначала проверяем, существует ли пользователь
    const user = await findUserByUsername(cleanUsername);
    if (!user) {
      return NextResponse.json(
        { error: `Пользователь @${cleanUsername} не найден в базе данных` },
        { status: 404 }
      );
    }

    let analysis: UserAnalysis | null = null;
    let lastError: Error | null = null;

    const selected: Provider | 'auto' =
      provider && ['qwen', 'gemini', 'deepseek'].includes(provider)
        ? provider
        : 'auto';

    const order: Provider[] =
      selected === 'auto'
        ? ['deepseek', 'qwen', 'gemini']
        : [selected];

    for (const p of order) {
      if (analysis) break;

      try {
        if (p === 'qwen') {
          analysis = await analyzeUserWithQwen(cleanUsername);
        } else if (p === 'gemini') {
          analysis = await analyzeUserWithGemini(cleanUsername);
        } else if (p === 'deepseek') {
          analysis = await analyzeUserWithDeepseek(cleanUsername);
        }
      } catch (error) {
        console.error(`Ошибка при анализе через ${p}:`, error);
        if (error instanceof Error) {
          lastError = error;
        }
      }
    }

    // Если анализ не удался из-за ошибок API
    if (!analysis) {
      const message = lastError ? lastError.message : 'Не удалось выполнить анализ пользователя';
      return NextResponse.json(
        { error: `Ошибка при анализе: ${message}` },
        { status: 500 }
      );
    }

    // Добавляем в список последних анализов (для веб-дашборда)
    recentAnalyses.unshift({
      username: cleanUsername,
      analyzedAt: new Date().toISOString(),
    });
    if (recentAnalyses.length > 10) {
      recentAnalyses.length = 10;
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Ошибка при анализе пользователя:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return NextResponse.json(
      { error: `Ошибка при анализе: ${message}` },
      { status: 500 }
    );
  }
}
