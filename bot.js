const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;
const config = require('./settings.json');
const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const LOG_FILE_PATH = './bot.log';
const LOG_MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Initialize log file
fs.writeFileSync(LOG_FILE_PATH, '');

// Start the express server
app.get('/', (req, res) => {
  res.send('Bot Is Ready');
});

app.listen(3000, () => {
  console.log('Server started');
});

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    log('[BotLog] Bot joined the server');

    if (config.utils['auto-auth'].enabled) {
      log('[INFO] Started auto-auth module');
      const password = config.utils['auto-auth'].password;
      setTimeout(() => {
        bot.chat(`/register ${password} ${password}`);
        bot.chat(`/login ${password}`);
      }, 500);
      log('[Auth] Authentification commands executed.');
    }

    if (config.utils['chat-messages'].enabled) {
      log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;
        const msg_timer = setInterval(() => {
          bot.chat(`${messages[i]}`);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach((msg) => {
          bot.chat(msg);
        });
      }
    }

    const pos = config.position;

    if (config.position.enabled) {
      log(`[BotLog] Starting moving to target location (${pos.x}, ${pos.y}, ${pos.z})`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', false);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  bot.on('chat', (username, message) => {
    if (config.utils['chat-log']) {
      log(`[ChatLog] <${username}> ${message}`);
    }

    // Command handling
    if (message.startsWith('!help')) {
      bot.chat('Available commands: !help, !status, !restart');
    } else if (message.startsWith('!status')) {
      bot.chat('Bot status: Online');
    } else if (message.startsWith('!restart')) {
      bot.chat('Restarting bot...');
      setTimeout(() => {
        process.exit(1);
      }, 2000);
    }
  });

  bot.on('goal_reached', () => {
    log(`[BotLog] Bot arrived at target location: ${bot.entity.position}`);
  });

  bot.on('death', () => {
    log(`[BotLog] Bot died and respawned at: ${bot.entity.position}`);
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      setTimeout(createBot, config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', (reason) => {
    log(`[BotLog] Bot was kicked from the server. Reason: ${reason}`);
    setTimeout(createBot, 5000); // Attempt to reconnect after 5 seconds
  });

  bot.on('error', (err) => {
    log(`[ERROR] ${err.message}`);
  });
}

// Run the bot initially
createBot();

// Logging function
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');

  // Rotate log file if exceeds max size
  const stats = fs.statSync(LOG_FILE_PATH);
  if (stats.size > LOG_MAX_SIZE) {
    const backupPath = `${LOG_FILE_PATH}.${timestamp.replace(/:/g, '-')}`;
    fs.renameSync(LOG_FILE_PATH, backupPath);
    fs.writeFileSync(LOG_FILE_PATH, '');
  }
}

// Code to keep the bot running 24/7
process.on('uncaughtException', function (err) {
  log('Caught exception: ' + err);
});

process.on('unhandledRejection', (reason, promise) => {
  log('Unhandled Rejection at:' + (reason.stack || reason));
});

// Periodic status monitoring
setInterval(() => {
  log('Bot is running...');
  // Add more monitoring logic here if needed
}, 60000); // Check every minute

// Automatic updates
setInterval(() => {
  log('Checking for updates...');
  exec('git pull', (error, stdout, stderr) => {
    if (error) {
      log(`Update failed: ${error.message}`);
      return;
    }
    if (stderr) {
      log(`Update failed: ${stderr}`);
      return;
    }
    log(`Update successful: ${stdout}`);
    log('Restarting bot...');
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  });
}, 3600000); // Check for updates every hour