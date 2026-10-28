// End-to-end check on two simulated phones: one week of a weekly event is
// cancelled offline on one phone, and the other phone sees it after reconnecting.
// Run like tests/run-e2e.sh does, with this file in place of e2e-offline-sync.mjs.
//
// Run: npm run test:e2e   (builds against the emulators and starts them)
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.APP_URL ?? 'http://localhost:4173';
const executablePath = process.env.CHROMIUM_PATH || undefined;
const phone = { ...devices['iPhone 13'], defaultBrowserType: undefined };
delete phone.defaultBrowserType;

const step = (m) => console.log(`\n▶ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);

/** Opens the calendar screen ('schedule'), or the tasks window on top of it ('tasks'). */
// The calendar's ⋮ menu and floating "+" open a sheet of actions.
async function calMenu(page, button, item) {
  await page.getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('dialog', { name: new RegExp(`^${button}`) }).getByRole('button', { name: item }).click();
}

// The calendar opens on the month grid; "upcoming" is the list of what comes next.
async function upcomingView(page) {
  const toList = page.getByRole('button', { name: 'תצוגת רשימה' });
  if (await toList.count()) await toList.click();
}

// The library's floating "+" offers a new note, list or folder.
async function addNew(scope, item) {
  await scope.getByRole('button', { name: 'הוספה', exact: true }).click();
  await scope.page().getByRole('dialog', { name: /^הוספה/ }).getByRole('button', { name: item }).click();
}

// A new folder from the library: its name, and whether it goes with the notes or the receipts.
async function libFolder(scope, name, where = 'פתקים') {
  await addNew(scope, 'תיקייה חדשה');
  await scope.getByLabel('שם התיקייה').fill(name);
  await scope.getByRole('radiogroup', { name: 'איפה התיקייה' }).getByRole('radio', { name: where }).click();
  await scope.getByRole('button', { name: 'יצירת התיקייה' }).click();
}

async function planner(page, side) {
  await page.getByRole('navigation').getByRole('button', { name: 'יומן' }).click();
  if (side === 'tasks') await calMenu(page, 'אפשרויות', 'משימות');
}

async function newPhone(browser, name) {
  const context = await browser.newContext({ ...phone, locale: 'he-IL' });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`  [${name} page error] ${e.message}`));
  // These phones chose the shopping list as their start screen (a personal setting).
  await context.addInitScript(() => {
    if (!localStorage.getItem('startScreen')) localStorage.setItem('startScreen', 'list');
  });
  await page.goto(BASE);
  await page.getByPlaceholder('שם לבדיקה (באנגלית)').fill(name);
  await page.getByRole('button', { name: 'כניסת בדיקה' }).click();
  return { context, page, name };
}

const list = (p) => p.page.locator('.list-page');
// The notes screen opens with no section open; this taps one of its three tiles (notes, lists, receipts) open.
async function openSection(page, name) {
  const tile = page.locator('.lists-page .lib-tile', { hasText: name });
  if ((await tile.getAttribute('aria-expanded')) !== 'true') await tile.click();
}
const row = (p, name) => p.page.locator('.row:not(.staple-row)', { has: p.page.locator('.name', { hasText: new RegExp(`^${name}$`) }) });

async function add(p, text) {
  const box = p.page.getByLabel('הוספת מוצרים');
  await box.fill(text);
  await box.press('Enter');
}

async function names(p) {
  return (await list(p).locator('.dept:not(.bought):not(.staples) .name').allTextContents()).sort();
}

async function waitSynced(p) {
  await p.page.locator('.sync.ok').waitFor({ timeout: 20000 });
}


// Focused check: one week of a weekly event is cancelled offline on one phone and synced to the other.
async function main() {
  const browser = await chromium.launch({ executablePath });
  const shot = (p, n) => process.env.SCREENSHOT_DIR && p.page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${n}.png` });
  try {
    step('Dad creates the family and approves the daughter');
    const dad = await newPhone(browser, 'dad');
    await dad.page.getByRole('button', { name: /ליצור משפחה חדשה/ }).click();
    await dad.page.getByLabel('שם המשפחה').fill('משפחת בדיקה');
    await dad.page.getByRole('button', { name: 'יצירת משפחה' }).click();
    await dad.page.getByRole('navigation').getByRole('button', { name: 'יומן' }).waitFor({ timeout: 20000 });
    await dad.page.getByLabel('הגדרות').click();
    await dad.page.getByLabel('תפקיד').selectOption('child');
    await dad.page.getByRole('button', { name: 'יצירת הזמנה' }).click();
    const code = (await dad.page.locator('.invite code').first().textContent()).trim();
    const kid = await newPhone(browser, 'kid');
    await kid.page.getByLabel('קוד הזמנה').fill(code);
    await kid.page.getByRole('button', { name: 'שליחת בקשה להצטרפות' }).click();
    await kid.page.getByText('ממתין לאישור').waitFor();
    await dad.page.getByRole('button', { name: 'אישור', exact: true }).click();
    await dad.page.getByRole('dialog').getByLabel('סגירה').click();
    await kid.page.getByRole('navigation').getByRole('button', { name: 'יומן' }).waitFor({ timeout: 15000 });
    ok('two phones in one family');

    step('Dad adds a weekly lesson');
    const dayLabelFor = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); };
    const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
    await planner(dad.page, 'schedule');
    await upcomingView(dad.page);
    await calMenu(dad.page, 'הוספה', 'אירוע חדש');
    await dad.page.getByPlaceholder('למשל: חוג כדורסל').fill('שיעור פרטי');
    await dad.page.getByLabel('תאריך', { exact: true }).fill(iso(1));
    await dad.page.locator('.sheet input[type=time]').fill('16:00');
    await dad.page.getByLabel('חוזר כל שבוע').check();
    await dad.page.getByRole('button', { name: 'שמירה' }).click();
    const week = (p, n) => p.page.locator('.dept', { hasText: dayLabelFor(n) }).locator('.row', { hasText: 'שיעור פרטי' });
    for (const n of [1, 8, 15]) await week(dad, n).waitFor({ timeout: 5000 });
    ok('a weekly event shows up every week');

    step('The daughter, offline, cancels one week only');
    await planner(kid.page, 'schedule');
    await upcomingView(kid.page);
    await week(kid, 8).waitFor({ timeout: 10000 });
    await kid.context.setOffline(true);
    await week(kid, 8).click();
    await kid.page.getByRole('button', { name: 'מחיקה' }).click();
    const ask = kid.page.getByRole('alertdialog');
    await ask.getByRole('button', { name: 'את כל הסדרה' }).waitFor();
    await shot(kid, 'delete-one-week');
    await ask.getByRole('button', { name: `רק ב־${dayLabelFor(8)}` }).click();
    await week(kid, 8).waitFor({ state: 'detached' });
    await week(kid, 1).waitFor();
    await week(kid, 15).waitFor();
    ok('offline: that week is gone, the others stay');
    assert.equal(await week(dad, 8).count(), 1, 'Dad still sees it while she is offline');

    await kid.context.setOffline(false);
    await week(dad, 8).waitFor({ state: 'detached', timeout: 15000 });
    await week(dad, 1).waitFor();
    await week(dad, 15).waitFor();
    await shot(dad, 'after-sync');
    ok('after reconnecting, Dad sees the week cancelled and the rest of the series');

    step('Deleting the whole series still works');
    await week(dad, 15).click();
    await dad.page.getByRole('button', { name: 'מחיקה' }).click();
    await dad.page.getByRole('alertdialog').getByRole('button', { name: 'את כל הסדרה' }).click();
    await week(dad, 1).waitFor({ state: 'detached' });
    await week(kid, 15).waitFor({ state: 'detached', timeout: 15000 });
    ok('"את כל הסדרה" removes every week on both phones');
    console.log('\nALL PASSED');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
