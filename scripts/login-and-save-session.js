const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://app.duocards.com/', { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('Login in the opened browser window.');
  console.log('When DuoCards is fully open and your words are visible, press ENTER here.');
  console.log('');

  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.once('data', async () => {
    await context.storageState({ path: 'state/duocards-session.json' });
    console.log('Saved session to state/duocards-session.json');
    await browser.close();
    process.exit(0);
  });
})();
