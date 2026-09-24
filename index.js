const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const PUBLIC_CHANNEL = '@gamevaultmobile';

// Каталог игр
const games = {
  game_001: {
    name: 'Тестовая игра',
    file_id: 'BQACAgIAAxkBAAMNarVXP1yAo87vbQOlCsCGF0BJ0OYAAlusAALufKhJppMrCQABiMpLPQQ'
  }
};

// Пока храним прошедших проверку в памяти
const verifiedUsers = new Set();

app.get('/', (req, res) => {
  res.send('GameVault-Mobile bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// ========================
// START
// ========================

bot.start(async (ctx) => {
  const gameId = ctx.startPayload;

  // Пользователь пришёл по кнопке конкретной игры
  if (gameId && games[gameId]) {
    const game = games[gameId];

    if (verifiedUsers.has(ctx.from.id)) {
      return sendGame(ctx, game);
    }

    return showSubscription(ctx, gameId);
  }

  await ctx.reply(
    '🎮 Добро пожаловать в GameVault-Mobile!\n\n' +
    'Твоё хранилище мобильных игр.\n\n' +
    'Игры из наших подборок можно получить через кнопки в канале.',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Получить тестовую игру', callback_data: 'get_game' }]
        ]
      }
    }
  );
});

// ========================
// ТЕСТОВАЯ КНОПКА
// ========================

bot.action('get_game', async (ctx) => {
  await ctx.answerCbQuery();

  const gameId = 'game_001';

  if (verifiedUsers.has(ctx.from.id)) {
    return sendGame(ctx, games[gameId]);
  }

  return showSubscription(ctx, gameId);
});

// ========================
// ПРОВЕРКА ПОДПИСКИ
// ========================

async function showSubscription(ctx, gameId) {
  await ctx.reply(
    '📢 Чтобы скачать игру, сначала подпишись на наш Telegram-канал.\n\n' +
    'После подписки нажми «Проверить подписку».',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📢 Подписаться',
              url: 'https://t.me/gamevaultmobile'
            }
          ],
          [
            {
              text: '✅ Проверить подписку',
              callback_data: `check:${gameId}`
            }
          ]
        ]
      }
    }
  );
}

bot.action(/^check:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const gameId = ctx.match[1];
  const game = games[gameId];

  if (!game) {
    return ctx.reply('❌ Игра не найдена.');
  }

  try {
    const member = await ctx.telegram.getChatMember(
      PUBLIC_CHANNEL,
      ctx.from.id
    );

    const subscribed = [
      'creator',
      'administrator',
      'member'
    ].includes(member.status);

    if (!subscribed) {
      return ctx.reply(
        '❌ Ты ещё не подписан на канал.\n\n' +
        'Подпишись и нажми «Проверить подписку».'
      );
    }

    verifiedUsers.add(ctx.from.id);

    await ctx.reply('✅ Подписка подтверждена!');

    await sendGame(ctx, game);

  } catch (error) {
    console.error(error);

    await ctx.reply(
      '⚠️ Не удалось проверить подписку.\n\n' +
      'Попробуй ещё раз через несколько секунд.'
    );
  }
});

// ========================
// ОТПРАВКА ИГРЫ
// ========================

async function sendGame(ctx, game) {
  await ctx.reply(
    `🎮 ${game.name}\n\n` +
    'Вот твоя игра 👇'
  );

  await ctx.telegram.sendDocument(
    ctx.chat.id,
    game.file_id
  );
}

// ========================
// ПОЛУЧЕНИЕ FILE_ID
// ========================

bot.command('fileid', async (ctx) => {
  await ctx.reply(
    '📦 Отправь APK следующим сообщением как документ.'
  );
});

bot.on('document', async (ctx) => {
  const document = ctx.message.document;

  await ctx.reply(
    '📦 FILE_ID:\n\n' +
    document.file_id
  );
});

// ========================
// КОМАНДЫ
// ========================

bot.command('games', (ctx) => {
  ctx.reply(
    '🎮 Каталог GameVault-Mobile пока готовится.'
  );
});

bot.command('new', (ctx) => {
  ctx.reply(
    '🔥 Новинки скоро появятся здесь.'
  );
});

bot.help((ctx) => {
  ctx.reply(
    '🎮 GameVault-Mobile\n\n' +
    '/start — запустить бота\n' +
    '/games — игры\n' +
    '/new — новинки\n' +
    '/help — помощь'
  );
});

// ========================
// ЗАПУСК
// ========================

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));