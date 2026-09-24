const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const PUBLIC_CHANNEL = '@gamevaultmobile';
const STORAGE_CHANNEL = '@GameVaultStorage';

// Здесь позже будем добавлять игры.
// file_id получаем командой /fileid.
const games = {
  game_001: {
    name: 'Тестовая игра',
    file_id: null
  }
};

// Храним пользователей, которые уже прошли проверку
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

// =========================
// START
// =========================

bot.start(async (ctx) => {
  const payload = ctx.startPayload;

  // Если пользователь пришёл по кнопке конкретной игры
  if (payload && games[payload]) {
    const game = games[payload];

    if (verifiedUsers.has(ctx.from.id)) {
      return sendGame(ctx, game);
    }

    return showSubscriptionCheck(ctx, payload);
  }

  await ctx.reply(
    '🎮 Добро пожаловать в GameVault-Mobile!\n\n' +
    'Твоё хранилище мобильных игр.\n\n' +
    'Нажми кнопку ниже, чтобы получить игру.',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Получить игру', callback_data: 'get_game' }]
        ]
      }
    }
  );
});

// =========================
// ПОЛУЧИТЬ ИГРУ
// =========================

bot.action('get_game', async (ctx) => {
  await ctx.answerCbQuery();

  await showSubscriptionCheck(ctx, 'game_001');
});

// =========================
// ПРОВЕРКА ПОДПИСКИ
// =========================

async function showSubscriptionCheck(ctx, gameId) {
  await ctx.reply(
    '📢 Чтобы скачать игру, подпишись на наш Telegram-канал.\n\n' +
    'После подписки нажми «Проверить подписку».',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📢 Подписаться',
              url: `https://t.me/${PUBLIC_CHANNEL.replace('@', '')}`
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
        'Подпишись и нажми «Проверить подписку» ещё раз.'
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

// =========================
// ОТПРАВКА ИГРЫ
// =========================

async function sendGame(ctx, game) {
  if (!game.file_id) {
    return ctx.reply(
      '⚠️ Эта игра ещё не подключена к каталогу.\n\n' +
      'Мы скоро добавим APK.'
    );
  }

  await ctx.reply(
    `🎮 ${game.name}\n\n` +
    'Вот твоя игра 👇'
  );

  await ctx.telegram.sendDocument(
    ctx.chat.id,
    game.file_id
  );
}

// =========================
// ПОЛУЧЕНИЕ FILE_ID
// =========================

// Эта команда нужна нам только для настройки игр.
bot.command('fileid', async (ctx) => {
  await ctx.reply(
    '📦 Отправь мне APK-файл следующим сообщением как документ.\n\n' +
    'Я покажу его file_id.'
  );
});

// Получаем APK, отправленный боту
bot.on('document', async (ctx) => {
  const document = ctx.message.document;

  await ctx.reply(
    '📦 FILE_ID:\n\n' +
    document.file_id +
    '\n\n' +
    'Сохрани этот ID — он понадобится для подключения игры.'
  );
});

// =========================
// КОМАНДЫ
// =========================

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

// =========================
// ЗАПУСК
// =========================

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));