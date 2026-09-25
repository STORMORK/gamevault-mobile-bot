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

const PORT = process.env.PORT || 3000;
const WEBHOOK_PATH = '/telegram-webhook';

const WEBHOOK_URL =
  process.env.WEBHOOK_URL ||
  process.env.RENDER_EXTERNAL_URL;

const WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET;

if (!WEBHOOK_URL) {
  throw new Error(
    'WEBHOOK_URL or RENDER_EXTERNAL_URL is required.'
  );
}

if (!WEBHOOK_SECRET) {
  throw new Error(
    'TELEGRAM_WEBHOOK_SECRET is required.'
  );
}

// ========================================
// EXPRESS
// ========================================

app.use(express.json());

// ========================================
// WEBHOOK
// ========================================

app.post(
  WEBHOOK_PATH,
  async (req, res) => {
    const receivedSecret =
      req.headers[
        'x-telegram-bot-api-secret-token'
      ];

    if (receivedSecret !== WEBHOOK_SECRET) {
      console.warn(
        'Blocked unauthorized webhook request.'
      );

      return res.sendStatus(403);
    }

    console.log(
      'Telegram webhook request received.'
    );

    console.log(
      'Telegram update:',
      JSON.stringify(req.body)
    );

    try {
      await bot.handleUpdate(req.body);

      console.log(
        'Telegram update processed successfully.'
      );

      return res.sendStatus(200);
    } catch (error) {
      console.error(
        'Telegram update processing error:',
        error
      );

      return res.sendStatus(500);
    }
  }
);

// ========================================
// HEALTH
// ========================================

app.get('/', (req, res) => {
  res.send(
    'GameVault-Mobile bot is running!'
  );
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    bot: 'GameVault-Mobile'
  });
});

// ========================================
// ADMIN
// ========================================

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

// ========================================
// VERIFIED USERS
// ========================================

const verifiedUsers = new Set();

// ========================================
// ADD GAME SESSIONS
// ========================================

const addGameSessions = new Map();

// ========================================
// GET GAME
// ========================================

async function getGame(gameId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (error) {
    console.error(
      'Supabase getGame error:',
      error.message
    );

    return null;
  }

  return data;
}

// ========================================
// NEXT GAME ID
// ========================================

async function getNextGameId() {
  const { data, error } = await supabase
    .from('games')
    .select('id');

  if (error) {
    console.error(
      'Supabase ID error:',
      error.message
    );

    return null;
  }

  let maxNumber = 0;

  for (const game of data || []) {
    const match = String(game.id).match(
      /^game_(\d+)$/
    );

    if (match) {
      const number = Number(match[1]);

      if (number > maxNumber) {
        maxNumber = number;
      }
    }
  }

  return `game_${String(maxNumber + 1).padStart(3, '0')}`;
}

// ========================================
// SEND GAME
// ========================================

async function sendGame(ctx, game) {
  if (!game) {
    return ctx.reply(
      '❌ Игра не найдена.'
    );
  }

  if (!game.file_id) {
    return ctx.reply(
      '⚠️ Файл игры пока не загружен.'
    );
  }

  try {
    await ctx.reply(
      `🎮 ${game.name || 'Игра'}\n\n` +
      `${game.description || ''}\n\n` +
      '📦 Файл игры отправляю...'
    );

    await ctx.telegram.sendDocument(
      ctx.from.id,
      game.file_id,
      {
        caption:
          `🎮 ${game.name || 'Игра'}\n\n` +
          'Спасибо, что пользуешься GameVault-Mobile!'
      }
    );
  } catch (error) {
    console.error(
      'sendGame error:',
      error
    );

    await ctx.reply(
      '❌ Не удалось отправить файл игры.'
    );
  }
}

// ========================================
// SUBSCRIPTION
// ========================================

async function showSubscription(
  ctx,
  gameId
) {
  await ctx.reply(
    '📢 Чтобы скачать игру, сначала подпишись на наш Telegram-канал.\n\n' +
    'После подписки нажми «Проверить подписку».',
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📢 Подписаться',
              url:
                'https://t.me/gamevaultmobile'
            }
          ],
          [
            {
              text:
                '✅ Проверить подписку',
              callback_data:
                `check:${gameId}`
            }
          ]
        ]
      }
    }
  );
}

// ========================================
// START
// ========================================

bot.start(async (ctx) => {
  console.log(
    'START HANDLER:',
    ctx.from?.id,
    ctx.from?.username || ''
  );

  const gameId =
    ctx.startPayload;

  if (gameId) {
    const game =
      await getGame(gameId);

    if (!game) {
      return ctx.reply(
        '❌ Игра не найдена.'
      );
    }

    if (
      verifiedUsers.has(
        ctx.from.id
      )
    ) {
      return sendGame(
        ctx,
        game
      );
    }

    return showSubscription(
      ctx,
      gameId
    );
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
              text:
                '🎮 Получить тестовую игру',
              callback_data:
                'get_game'
            }
          ]
        ]
      }
    }
  );

  console.log(
    'START RESPONSE SENT.'
  );
});

// ========================================
// TEST GAME BUTTON
// ========================================

bot.action(
  'get_game',
  async (ctx) => {
    await ctx.answerCbQuery();

    const gameId =
      'game_001';

    const game =
      await getGame(gameId);

    if (!game) {
      return ctx.reply(
        '❌ Тестовая игра не найдена.'
      );
    }

    if (
      verifiedUsers.has(
        ctx.from.id
      )
    ) {
      return sendGame(
        ctx,
        game
      );
    }

    return showSubscription(
      ctx,
      gameId
    );
  }
);

// ========================================
// CHECK SUBSCRIPTION
// ========================================

bot.action(
  /^check:(.+)$/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const gameId =
      ctx.match[1];

    const game =
      await getGame(gameId);

    if (!game) {
      return ctx.reply(
        '❌ Игра не найдена.'
      );
    }

    try {
      const member =
        await ctx.telegram.getChatMember(
          PUBLIC_CHANNEL,
          ctx.from.id
        );

      const subscribed = [
        'creator',
        'administrator',
        'member'
      ].includes(
        member.status
      );

      if (!subscribed) {
        return ctx.reply(
          '❌ Ты ещё не подписан на канал.\n\n' +
          'Подпишись и нажми «Проверить подписку».'
        );
      }

      verifiedUsers.add(
        ctx.from.id
      );

      await ctx.reply(
        '✅ Подписка подтверждена!'
      );

      await sendGame(
        ctx,
        game
      );
    } catch (error) {
      console.error(
        'Subscription check error:',
        error
      );

      await ctx.reply(
        '⚠️ Не удалось проверить подписку.\n\n' +
        'Попробуй ещё раз через несколько секунд.'
      );
    }
  }
);

// ========================================
// ADMIN HEALTH
// ========================================

bot.command(
  'health',
  async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply(
        '❌ Доступ запрещён.'
      );
    }

    await ctx.reply(
      '✅ Бот работает.\n' +
      `👤 ID: ${ctx.from.id}`
    );
  }
);

// ========================================
// GAMES
// ========================================

bot.command(
  'games',
  async (ctx) => {
    try {
      const {
        data,
        error
      } = await supabase
        .from('games')
        .select(
          'id,name,category,created_at'
        )
        .order(
          'created_at',
          {
            ascending: false
          }
        );

      if (error) {
        console.error(
          'Games list error:',
          error
        );

        return ctx.reply(
          '❌ Ошибка получения списка игр.'
        );
      }

      if (
        !data ||
        data.length === 0
      ) {
        return ctx.reply(
          '🎮 Игр пока нет.'
        );
      }

      const text =
        '🎮 Игры GameVault-Mobile:\n\n' +
        data
          .map(
            (game) =>
              `• ${game.name || 'Без названия'}\n` +
              `  ID: ${game.id}\n` +
              `  Категория: ${game.category || '—'}`
          )
          .join('\n\n');

      await ctx.reply(text);
    } catch (error) {
      console.error(
        'Games command error:',
        error
      );

      await ctx.reply(
        '❌ Ошибка.'
      );
    }
  }
);

// ========================================
// GLOBAL ERROR HANDLER
// ========================================

bot.catch(
  (error, ctx) => {
    console.error(
      'TELEGRAF ERROR:',
      error
    );

    console.error(
      'UPDATE:',
      JSON.stringify(
        ctx?.update
      )
    );
  }
);

// ========================================
// START SERVER
// ========================================

app.listen(
  PORT,
  async () => {
    console.log(
      `Server running on port ${PORT}`
    );

    const webhookUrl =
      `${WEBHOOK_URL}${WEBHOOK_PATH}`;

    try {
      await bot.telegram.setWebhook(
        webhookUrl,
        {
          secret_token:
            WEBHOOK_SECRET
        }
      );

      console.log(
        `Telegram webhook set: ${webhookUrl}`
      );

      console.log(
        'Telegram webhook secret protection: ENABLED'
      );
    } catch (error) {
      console.error(
        'Failed to set Telegram webhook:',
        error
      );
    }
  }
);