# Упрощенная версия для разработки
# В продакшене можно использовать многоэтапную сборку
FROM node:20-alpine

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Запускаем Next.js в продакшн режиме
CMD ["npm", "start"]
