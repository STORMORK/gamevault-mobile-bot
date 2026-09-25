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

if (!WEBHOOK_URL) {
  throw new Error(
    'WEBHOOK_URL or RENDER_EXTERNAL_URL is required for webhook mode.'
  );
}

app.use(bot.webhookCallback(WEBHOOK_PATH));

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
// ПУБЛИКАЦИЯ ИГРЫ В КАНАЛЕ
// ========================

async function publishGame(game) {
  const text =
    `🎮 ${game.name}\n\n` +
    `${game.description || 'Новая игра в GameVault-Mobile.'}\n\n` +
    `📂 Категория: ${game.category || 'Другое'}\n\n` +
    'Нажми кнопку ниже, чтобы получить игру.';

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🎮 Скачать игру',
            url: `https://t.me/GameVaultMobileBot?start=${game.id}`
          }
        ]
      ]
    }
  };

  if (game.cover_file_id) {
    await bot.telegram.sendPhoto(
      PUBLIC_CHANNEL,
      game.cover_file_id,
      {
        caption: text,
        ...options
      }
    );
  } else {
    await bot.telegram.sendMessage(
      PUBLIC_CHANNEL,
      text,
      options
    );
  }
}

// ========================
// СОЗДАНИЕ ПОСТА
// ========================

bot.command('post', async (ctx) => {
  const gameId = 'game_001';
  const game = await getGame(gameId);

  if (!game) {
    return ctx.reply('❌ Игра не найдена.');
  }

  try {
    await publishGame(game);

    await ctx.reply(
      '✅ Пост опубликован в канале.'
    );
  } catch (error) {
    console.error(error);

    await ctx.reply(
      '❌ Не удалось опубликовать пост.\n\n' +
        'Проверь права бота в канале.'
    );
  }
});

// ========================
// ДОБАВЛЕНИЕ ИГРЫ
// ========================

bot.command('addgame', async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      '⛔ У тебя нет доступа к этой команде.'
    );
  }

  addGameSessions.set(ctx.from.id, {
    step: 'name'
  });

  await ctx.reply(
    '🎮 Добавление игры\n\n' +
      'Введи название игры:'
  );
});

// ========================
// ТЕКСТ ДОБАВЛЕНИЯ ИГРЫ
// ========================

bot.on('text', async (ctx) => {
  if (!isAdmin(ctx)) return;

  if (ctx.message.text.startsWith('/')) return;

  const session = addGameSessions.get(
    ctx.from.id
  );

  if (!session) return;

  if (session.step === 'name') {
    session.name =
      ctx.message.text.trim();

    session.step = 'description';

    return ctx.reply(
      '📝 Теперь введи описание игры:'
    );
  }

  if (session.step === 'description') {
    session.description =
      ctx.message.text.trim();

    session.step = 'category';

    return ctx.reply(
      '📂 Теперь введи категорию игры:'
    );
  }

  if (session.step === 'category') {
    session.category =
      ctx.message.text.trim();

    session.step = 'cover';

    return ctx.reply(
      '🖼 Теперь отправь обложку игры как фото.'
    );
  }
});

// ========================
// ОБЛОЖКА ИГРЫ
// ========================

bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx)) return;

  const session = addGameSessions.get(
    ctx.from.id
  );

  if (
    !session ||
    session.step !== 'cover'
  ) {
    return;
  }

  const photos = ctx.message.photo;

  const cover =
    photos[photos.length - 1];

  session.cover_file_id =
    cover.file_id;

  session.step = 'file';

  await ctx.reply(
    '✅ Обложка получена!\n\n' +
      '📦 Теперь отправь APK-файл игры как документ.'
  );
});

// ========================
// APK / ДОКУМЕНТ
// ========================

bot.on('document', async (ctx) => {
  const document =
    ctx.message.document;

  if (isAdmin(ctx)) {
    const session =
      addGameSessions.get(ctx.from.id);

    if (
      session &&
      session.step === 'file'
    ) {
      try {
        const gameId =
          await getNextGameId();

        if (!gameId) {
          return ctx.reply(
            '❌ Не удалось создать ID игры.'
          );
        }

        const { error } =
          await supabase
            .from('games')
            .insert({
              id: gameId,
              name: session.name,
              description:
                session.description,
              category:
                session.category,
              cover_file_id:
                session.cover_file_id,
              file_id:
                document.file_id
            });

        if (error) {
          console.error(
            'Supabase insert error:',
            error
          );

          return ctx.reply(
            '❌ Не удалось сохранить игру в Supabase.'
          );
        }

        const game = {
          id: gameId,
          name: session.name,
          description:
            session.description,
          category:
            session.category,
          cover_file_id:
            session.cover_file_id,
          file_id:
            document.file_id
        };

        try {
          await publishGame(game);
        } catch (publishError) {
          console.error(
            'Channel publish error:',
            publishError
          );
        }

        addGameSessions.delete(
          ctx.from.id
        );

        return ctx.reply(
          '✅ Игра успешно добавлена!\n\n' +
            `🎮 ${session.name}\n` +
            `🆔 ${gameId}\n` +
            `📂 ${session.category}\n` +
            '🖼 Обложка сохранена\n\n' +
            'Игра сохранена в каталоге GameVault-Mobile.\n' +
            '📢 Пост автоматически опубликован в канале.'
        );
      } catch (error) {
        console.error(error);

        return ctx.reply(
          '❌ Произошла ошибка при добавлении игры.'
        );
      }
    }
  }

  await ctx.reply(
    '📦 FILE_ID:\n\n' +
      document.file_id
  );
});

// ========================
// FILE ID
// ========================

bot.command('fileid', async (ctx) => {
  await ctx.reply(
    '📦 Отправь APK следующим сообщением как документ.'
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
      '/help — помощь\n' +
      '/addgame — добавить игру'
  );
});

// ========================
// ЗАПУСК WEBHOOK
// ========================

const server = app.listen(
  PORT,
  async () => {
    const webhookUrl =
      `${WEBHOOK_URL}${WEBHOOK_PATH}`;

    try {
      const webhookOptions = {};

      if (
        process.env.TELEGRAM_WEBHOOK_SECRET
      ) {
        webhookOptions.secret_token =
          process.env.TELEGRAM_WEBHOOK_SECRET;
      }

      await bot.telegram.setWebhook(
        webhookUrl,
        webhookOptions
      );

      const webhookInfo =
        await bot.telegram.getWebhookInfo();

      console.log(
        `Server running on port ${PORT}`
      );

      console.log(
        `Telegram webhook set: ${webhookInfo.url}`
      );
    } catch (error) {
      console.error(
        'Telegram webhook setup error:',
        error
      );
    }
  }
);

process.once(
  'SIGINT',
  () => {
    server.close(
      () => bot.stop('SIGINT')
    );
  }
);

process.once(
  'SIGTERM',
  () => {
    server.close(
      () => bot.stop('SIGTERM')
    );
  }
);