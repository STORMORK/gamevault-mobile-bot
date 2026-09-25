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

// ========================
// WEBHOOK
// ========================

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = '/telegram-webhook';

const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  process.env.RENDER_EXTERNAL_URL;

const WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET;

if (!WEBHOOK_URL) {
  throw new Error(
    'WEBHOOK_URL or RENDER_EXTERNAL_URL is required for webhook mode.'
  );
}

if (!WEBHOOK_SECRET) {
  throw new Error(
    'TELEGRAM_WEBHOOK_SECRET is required for webhook security.'
  );
}

// ========================
// WEBHOOK SECURITY
// ========================

app.use((req, res, next) => {
  if (req.path !== WEBHOOK_PATH) {
    return next();
  }

  const receivedSecret =
    req.headers['x-telegram-bot-api-secret-token'];

  if (receivedSecret !== WEBHOOK_SECRET) {
    console.warn(
      'Blocked unauthorized webhook request.'
    );

    return res.sendStatus(403);
  }

  next();
});

// ========================
// TELEGRAM WEBHOOK
// ========================

app.use(
  bot.webhookCallback(WEBHOOK_PATH)
);

// ========================
// ADMIN
// ========================

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// ========================
// СЕССИИ ДОБАВЛЕНИЯ ИГР
// ========================

const addGameSessions = new Map();

// ========================
// ПОЛУЧЕНИЕ ИГРЫ
// ========================

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

// ========================
// СОЗДАНИЕ ID НОВОЙ ИГРЫ
// ========================

async function getNextGameId() {
  const { data, error } = await supabase
    .from('games')
    .select('id');

  if (error) {
    console.error('Supabase ID error:', error);
    return null;
  }

  let maxNumber = 0;

  for (const game of data || []) {
    const match = String(game.id).match(/^game_(\d+)$/);

    if (match) {
      const number = Number(match[1]);

      if (number > maxNumber) {
        maxNumber = number;
      }
    }
  }

  return `game_${String(maxNumber + 1).padStart(3, '0')}`;
}

// ========================
// ПРОВЕРЕННЫЕ ПОЛЬЗОВАТЕЛИ
// ========================

const verifiedUsers = new Set();

// ========================
// EXPRESS
// ========================

app.get('/', (req, res) => {
  res.send('GameVault-Mobile bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
       