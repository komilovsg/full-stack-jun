# Используем официальный Node.js образ (alpine - легковесная версия)
FROM node:20-alpine

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
# Это делается отдельно для кэширования слоев Docker
COPY package*.json ./

# Устанавливаем зависимости (включая dev для сборки TypeScript)
RUN npm install

# Копируем весь исходный код
COPY . .

# Компилируем TypeScript в JavaScript
RUN npm run build

# Удаляем dev-зависимости после сборки (оптимизация размера)
RUN npm prune --production

# Запускаем приложение
CMD ["node", "dist/index.js"]
