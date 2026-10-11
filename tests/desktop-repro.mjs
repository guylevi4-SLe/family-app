import { chromium } from 'playwright';
const BASE = 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('dialog', (d) => d.accept());
await page.goto(BASE);
await page.getByPlaceholder('שם לבדיקה (באנגלית)').fill('dad');
await page.getByRole('button', { name: 'כניסת בדיקה' }).click();
await page.getByRole('button', { name: /ליצור משפחה חדשה/ }).click();
await page.getByLabel('שם המשפחה').fill('בדיקה');
await page.getByRole('button', { name: 'יצירת משפחה' }).click();
await page.getByRole('navigation').waitFor();
const tabs = ['בית', 'קניות', 'יומן', 'רשימות', 'צ׳אט'];
let blank = 0;
for (let i = 0; i < 150; i++) {
  const t = tabs[Math.floor(Math.random() * tabs.length)];
  await page.getByRole('navigation').getByRole('button', { name: t }).click();
  if (t === 'יומן' && Math.random() < 0.5) await page.getByRole('tab', { name: Math.random() < 0.5 ? /^משימות/ : 'לו״ז' }).click();
  await page.waitForTimeout(Math.random() * 120);
  const state = await page.evaluate(() => ({ app: !!document.querySelector('.app'), main: document.querySelector('main')?.innerText.length ?? -1, root: document.getElementById('root')?.innerHTML.length }));
  if (!state.app || state.main <= 0) { blank++; console.log('BLANK at', i, t, JSON.stringify(state)); }
}
console.log('blank', blank, 'errors', errors.length);
console.log([...new Set(errors)].slice(0, 15).join('\n'));
await page.screenshot({ path: '/tmp/claude-0/-home-claude-family-app/b9b6bdac-6030-5b82-a90d-c3c43834ce65/scratchpad/desk.png' });
await browser.close();
