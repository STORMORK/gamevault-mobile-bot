const { Telegraf } = require('telegraf');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

const PUBLIC_CHANNEL = '@gamevaultmobile';
const ADMIN_ID = 1047945172;

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// Получение игры из Supabase
async function getGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error) {
    console.error('Supabase getGame error:', error);
    return null;
  }

  return data;
}

// Пользователи, которые уже прошли проверку подписки
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

  if (gameId) {
    const game = await getGame(gameId);

    if (!game) {
      return ctx.reply('❌ Игра не найдена.');
    }

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
          [
            {
              text: '🎮 Получить тестовую игру',
              callback_data: 'get_game'
            }
          ]
        ]
      }
    }
  );
});

// ========================
// ПОЛУЧИТЬ ИГРУ
// ========================

bot.action('get_game', async (ctx) => {
  await ctx.answerCbQuery();

  const gameId = 'game_001';
  const game = await getGame(gameId);

  if (!game) {
    return ctx.reply('❌ Игра не найдена.');
  }

  if (verifiedUsers.has(ctx.from.id)) {
    return sendGame(ctx, game);
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
  const game = await getGame(gameId);

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

  await ctx.telegram.sendDocument(ctx.chat.id, game.file_id);
}

// ========================
// СОЗДАНИЕ ПОСТА В КАНАЛЕ
// ========================

bot.command('post', async (ctx) => {
  const gameId = 'game_001';
  const game = await getGame(gameId);

  if (!game) {
    return ctx.reply('❌ Игра не найдена.');
  }

  try {
    await ctx.telegram.sendMessage(
      PUBLIC_CHANNEL,
      `🎮 ${game.name}\n\n` +
        'Новая игра в GameVault-Mobile.\n\n' +
        'Нажми кнопку ниже, чтобы получить игру.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎮 Скачать игру',
                url: `https://t.me/GameVaultMobileBot?start=${gameId}`
              }
            ]
          ]
        }
      }
    );

    await ctx.reply('✅ Пост опубликован в канале.');
  } catch (error) {
    console.error(error);

    await ctx.reply(
      '❌ Не удалось опубликовать пост.\n\n' +
        'Проверь права бота в канале.'
    );
  }
});

// ========================
// FILE ID
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
bot.command('addgame', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('⛔ У тебя нет доступа к этой команде.');
  }

  ctx.reply(
    '🎮 Добавление игры\n\n' +
    'Введи название игры:'
  );
});

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
const addGameSessions = new Map();

bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const session = addGameSessions.get(ctx.from.id);

  if (!session) return;

  if (session.step === 'name') {
    session.name = ctx.message.text;
    session.step = 'description';

    return ctx.reply(
      '📝 Теперь введи описание игры:'
    );
  }
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));