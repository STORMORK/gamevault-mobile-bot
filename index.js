const { Telegraf } = require('telegraf');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

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

bot.start((ctx) => {
  ctx.reply(
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

bot.action('get_game', async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
    '📢 Чтобы получить игру, сначала подпишись на наш Telegram-канал.\n\n' +
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
              callback_data: 'check_subscription'
            }
          ]
        ]
      }
    }
  );
});

bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const member = await ctx.telegram.getChatMember(
      '@gamevaultmobile',
      ctx.from.id
    );

    const subscribed = ['creator', 'administrator', 'member'].includes(
      member.status
    );

    if (subscribed) {
      await ctx.reply(
        '✅ Подписка подтверждена!\n\n' +
        '🎮 Тестовая игра будет доступна здесь.'
      );
    } else {
      await ctx.reply(
        '❌ Ты ещё не подписан на канал.\n\n' +
        'Подпишись и нажми «Проверить подписку» ещё раз.'
      );
    }
  } catch (error) {
    console.error(error);

    await ctx.reply(
      '⚠️ Не удалось проверить подписку. Попробуй ещё раз через несколько секунд.'
    );
  }
});

bot.command('games', (ctx) => {
  ctx.reply('🎮 Пока здесь готовится каталог GameVault-Mobile.');
});

bot.command('new', (ctx) => {
  ctx.reply('🔥 Новинки скоро появятся здесь.');
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

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
