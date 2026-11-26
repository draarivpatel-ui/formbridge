import { serve } from './serve.mjs';
import { connectCdp, launchChrome, openPage, sleep } from './cdp.mjs';

const WIDTH = 1440;
const HEIGHT = 900;
const { server, origin } = await serve(0, '/formbridge/');
const browser = await launchChrome(WIDTH, HEIGHT);
const failures = [];

async function shutdown(code) {
  await browser.cleanup();
  server.close();
  process.exit(code);
}

function check(name, condition, detail = '') {
  if (condition) console.log(`ok ${name}`);
  else {
    failures.push(name);
    console.error(`not ok ${name}${detail ? `: ${detail}` : ''}`);
  }
}

try {
  const cdp = await connectCdp(browser.webSocketDebuggerUrl);
  const exceptions = [];
  cdp.listeners.push((message) => {
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails?.text || 'exception');
  });
  const page = await openPage(cdp, `${origin}`, WIDTH, HEIGHT);
  const ready = await page.evaluate(`new Promise((resolve) => {
    const started = Date.now();
    (function check() {
      if (window.__formbridge && window.__formbridge.state.definition) return resolve(true);
      if (Date.now() - started > 10000) return resolve(false);
      setTimeout(check, 100);
    })();
  })`);
  check('app boots with bundled definition', ready === true);
  check('fourteen definition fields load', await page.evaluate(`window.__formbridge.state.definition.fields.length`) === 14);

  const click = async (selector) => {
    const point = await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await sleep(120);
    if (!point) return false;
    await page.page('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await page.page('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await page.page('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await sleep(180);
    return true;
  };

  check('fill step click works', await click('[data-screen="fill"]'));
  check('fill fields render', await page.evaluate(`document.querySelectorAll('.fill-field').length`) === 14);
  check('profile answers are prefilled', await page.evaluate(`document.querySelector('[data-fill-input="student_first_name"]').value`) === 'Nadia');

  await page.evaluate(`(() => { const e = document.querySelector('[data-fill-input="student_birth_date"]'); e.value = '2026-02-30'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(150);
  check('invalid date produces inline message', await page.evaluate(`document.querySelector('[data-field-state="student_birth_date"] .field-message').textContent.includes('real calendar date')`));
  await page.evaluate(`(() => { const e = document.querySelector('[data-fill-input="student_birth_date"]'); e.value = '2011-04-18'; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  check('review click works', await click('[data-action="start-review"]'));
  check('review card renders plain question', await page.evaluate(`document.querySelector('.review-question').textContent.length > 8`));
  check('confirm click works', await click('[data-action="review-confirm"]'));
  check('first answer confirmed', await page.evaluate(`window.__formbridge.state.review.entries[0].status`) === 'confirmed');

  check('language toggle click works', await click('[data-action="toggle-locale"]'));
  check(' Spanish UI becomes active', await page.evaluate(`document.documentElement.lang`) === 'es');
  check('Spanish review question renders', await page.evaluate(`document.querySelector('.review-question').textContent.includes('¿')`));
  check('language toggle returns to English', await click('[data-action="toggle-locale"]'));

  const completed = await page.evaluate(`window.__formbridge.confirmAllForDemo()`);
  check('all review entries can be confirmed', completed === true);
  await page.evaluate(`window.__formbridge.preparePrintPayload(); window.__formbridge.go('print')`);
  await sleep(250);
  check('print rows render', await page.evaluate(`document.querySelectorAll('.print-section tr').length`) === 14);
  check('signing summary renders four items', await page.evaluate(`document.querySelectorAll('.signing-list li').length`) === 4);
  check('no runtime exceptions', exceptions.length === 0, exceptions.join('; '));

  cdp.ws.close();
  await shutdown(failures.length ? 1 : 0);
} catch (error) {
  console.error(error);
  await shutdown(1);
}
