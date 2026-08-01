const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outputPath = path.join(__dirname, '..', 'output', 'vocab.json');
const tempOutputPath = path.join(__dirname, '..', 'output', 'vocab.json.tmp');
const historyLogPath = path.join(__dirname, '..', 'logs', 'fetch-vocab.history.log');
const storageStatePath = path.join(__dirname, '..', 'state', 'duocards-session.json');
const debugPath = path.join(__dirname, '..', 'output', 'fetch-vocab-from-scratch.debug.txt');

const FIRST_WAIT_MS = 5000;
const SECOND_WAIT_MS = 3000;
const TAB_COUNT = 5;
const TAB_DELAY_MS = 300;
const AFTER_ENTER_WAIT_MS = 1000;
const SCROLL_PIXELS = 1000;
const SCROLL_DELAY_MS = 250;
const MIN_CARD_COUNT = 20;

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrollToBottom(page) {
  let stableCount = 0;
  let lastPosition = -1;

  while (stableCount < 3) {
    if (page.isClosed()) {
      throw new Error('Browser page was closed during scrolling.');
    }

    const state = await page.evaluate((pixels) => {
      const el = document.querySelector('#content');
      const target = el || document.scrollingElement || document.documentElement;

      const before = target.scrollTop;
      target.scrollBy(0, pixels);

      return {
        before,
        after: target.scrollTop
      };
    }, SCROLL_PIXELS);

    if (state.after === lastPosition || state.after === state.before) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }

    lastPosition = state.after;
    await sleep(SCROLL_DELAY_MS);
  }
}

async function saveDebug(page) {
  const info = await page.evaluate(() => {
    const contentEl = document.querySelector('#content');
    return {
      url: location.href,
      title: document.title,
      content: contentEl ? contentEl.innerText : '',
      body: document.body.innerText || ''
    };
  });

  fs.writeFileSync(
    debugPath,
    [
      '===== URL =====',
      info.url,
      '',
      '===== TITLE =====',
      info.title,
      '',
      '===== CONTENT =====',
      info.content,
      '',
      '===== BODY =====',
      info.body
    ].join('\n'),
    'utf8'
  );
}

function extractCardsFromText(rawText) {
  const lines = String(rawText || '')
    .split('\n')
    .map(normalize)
    .filter(Boolean);

  const startIndex = lines.findIndex((line) => line === 'Search');
  if (startIndex === -1) {
    return [];
  }

  const stopWords = new Set(['LEARNING', 'PRACTICE', 'LIBRARY', 'ACCOUNT']);
  const content = lines.slice(startIndex + 1).filter((line) => !stopWords.has(line));

  const result = [];
  for (let i = 0; i + 2 < content.length; i += 3) {
    result.push({
      word: content[i],
      translation: content[i + 1],
      example: content[i + 2]
    });
  }

  return result.filter((item) => item.word && item.translation);
}

function dedupeCards(cards) {
  const normalizedCards = [];
  const seen = new Set();

  for (const card of cards) {
    const word = normalize(card.word);
    const translation = normalize(card.translation);
    const example = normalize(card.example);

    if (!word || !translation) {
      continue;
    }

    const key = `${word}|||${translation}|||${example}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedCards.push({ word, translation, example });
  }

  return normalizedCards;
}

(async () => {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    page.on('close', () => {
      console.log('Browser page was closed.');
    });

    await page.goto('https://app.duocards.com/', { waitUntil: 'domcontentloaded' });

    console.log('Waiting 5 seconds before refresh...');
    await sleep(FIRST_WAIT_MS);

    if (page.isClosed()) {
      throw new Error('Browser page was closed before refresh.');
    }

    console.log('Reloading page...');
    await page.reload({ waitUntil: 'domcontentloaded' });

    console.log('Waiting 3 seconds after refresh...');
    await sleep(SECOND_WAIT_MS);

    if (page.isClosed()) {
      throw new Error('Browser page was closed before keyboard navigation.');
    }

    for (let i = 0; i < TAB_COUNT; i += 1) {
      await page.keyboard.press('Tab');
      await sleep(TAB_DELAY_MS);
    }

    await page.keyboard.press('Enter');
    console.log('Pressed Tab 5 times and Enter once.');

    await sleep(AFTER_ENTER_WAIT_MS);
    await scrollToBottom(page);

    if (page.isClosed()) {
      throw new Error('Browser page was closed before extraction.');
    }

    const rawText = await page.evaluate(() => {
      const contentEl = document.querySelector('#content');
      return contentEl ? contentEl.innerText : document.body.innerText;
    });

    const normalizedCards = dedupeCards(extractCardsFromText(rawText));
    await saveDebug(page);

    if (normalizedCards.length < MIN_CARD_COUNT) {
      console.log(`Refusing to overwrite vocab.json because only ${normalizedCards.length} cards were detected.`);
      console.log(`Debug saved to ${debugPath}`);
      console.log(normalizedCards.slice(0, 10));
      await browser.close();
      process.exit(1);
    }

    const previousCards = fs.existsSync(outputPath)
      ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
      : [];

    const previousWords = new Set(previousCards.map((item) => item.word));
    const currentWords = new Set(normalizedCards.map((item) => item.word));

    const added = normalizedCards.filter((item) => !previousWords.has(item.word)).length;
    const removed = previousCards.filter((item) => !currentWords.has(item.word)).length;
    const timestamp = new Date().toISOString();

    fs.writeFileSync(tempOutputPath, JSON.stringify(normalizedCards, null, 2), 'utf8');
    fs.renameSync(tempOutputPath, outputPath);

    fs.appendFileSync(
      historyLogPath,
      `${timestamp} | old=${previousCards.length} | new=${normalizedCards.length} | added=${added} | removed=${removed}\n`,
      'utf8'
    );

    console.log(`Saved ${normalizedCards.length} words to ${outputPath}`);
    console.log(`Debug saved to ${debugPath}`);

    await browser.close();
  } catch (error) {
    console.error('[fetch-vocab-from-scratch] Failed:', error && error.stack ? error.stack : error);
    process.exitCode = 1;

    if (browser) {
      await browser.close().catch(() => {});
    }
  }
})();
