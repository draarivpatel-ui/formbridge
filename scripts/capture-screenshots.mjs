import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { connectCdp, launchChrome, openPage, sleep } from './cdp.mjs';

const WIDTH = 1440;
const HEIGHT = 900;
const outDir = new URL('../assets/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const { server, origin } = await serve(0, '/formbridge/');
const browser = await launchChrome(WIDTH, HEIGHT);

async function shutdown(code) {
  await browser.cleanup();
  server.close();
  process.exit(code);
}

process.on('unhandledRejection', async (error) => {
  console.error(error);
  await shutdown(1);
});

try {
  const cdp = await connectCdp(browser.webSocketDebuggerUrl);
  const page = await openPage(cdp, `${origin}`, WIDTH, HEIGHT);
  await page.evaluate(`new Promise((resolve) => {
    const started = Date.now();
    (function check() {
      if (window.__formbridge && window.__formbridge.state.definition) return resolve(true);
      if (Date.now() - started > 10000) return resolve(false);
      setTimeout(check, 100);
    })();
  })`);
  await sleep(500);

  const capture = async (name) => {
    const shot = await page.page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(new URL(name, outDir), Buffer.from(shot.data, 'base64'));
    console.log(`captured assets/${name}`);
  };

  await page.evaluate(`window.__formbridge.go('fill')`);
  await sleep(350);
  await capture('fill-1440x900.png');

  await page.evaluate(`document.querySelector('[data-action="toggle-locale"]').click()`);
  await sleep(250);
  await page.evaluate(`window.__formbridge.go('review'); window.__formbridge.state.review.currentIndex = 2; window.__formbridge.render()`);
  await sleep(350);
  await capture('review-1440x900.png');

  await page.evaluate(`document.querySelector('[data-action="toggle-locale"]').click()`);
  await sleep(250);
  await page.evaluate(`window.__formbridge.confirmAllForDemo(); window.__formbridge.preparePrintPayload(); window.__formbridge.go('print')`);
  await sleep(450);
  await page.evaluate(`document.querySelector('.signing-page').scrollIntoView({ block: 'start' })`);
  await sleep(350);
  await capture('print-summary-1440x900.png');

  cdp.ws.close();
  await shutdown(0);
} catch (error) {
  console.error(error);
  await shutdown(1);
}
