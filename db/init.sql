-- Создание таблицы пользователей
-- Храним информацию о пользователях, которые пишут в чате
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL, -- ID пользователя в Telegram
    username VARCHAR(255), -- @username (может быть NULL)
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы сообщений
-- Храним все текстовые сообщения из группового чата
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_message_id BIGINT NOT NULL, -- ID сообщения в Telegram
    chat_id BIGINT NOT NULL, -- ID чата
    text TEXT NOT NULL, -- Текст сообщения
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Уникальность: одно сообщение в одном чате
    UNIQUE(telegram_message_id, chat_id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at в таблице users
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
