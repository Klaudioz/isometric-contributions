import puppeteer from 'puppeteer';
import fs from 'fs';

// This is the JavaScript from the browser extension.
const isoJsCode = `
  // lodash functions will be available on the global 'window._' object
  const { toArray, groupBy, last } = window._;

  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const sameDay = (d1, d2) => d1.toDateString() === d2.toDateString()

  // ... (The rest of the isoJsCode string remains exactly the same as before) ...
  // ... I'm omitting it here for brevity, but you should keep the full code ...

  ;(async function () {
    if (document.querySelector('.vcard-names-container')) {
      await getSettings();
      const config = { attributes: true, childList: true, subtree: true };
      const callback = (mutationsList) => {
        for (const mutation of mutationsList) {
          if (mutation.type === 'childList' && document.querySelector('.js-calendar-graph') && !document.querySelector('.ic-contributions-wrapper')) {
            generateIsometricChart();
          }
        }
      };
      globalThis.matchMedia('(prefers-color-scheme: dark)').addListener(() => renderIsometricChart());
      const observedContainer = document.querySelector('html');
      const observer = new MutationObserver(callback);
      observer.observe(observedContainer, config);
    }
  })();
`;

// Read both library files from the local file system
const obeliskJsCode = fs.readFileSync('./obelisk.min.js', 'utf8');
const lodashJsCode = fs.readFileSync('./lodash.min.js', 'utf8'); // <-- ADD THIS LINE


async function generateImage() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  console.log('Navigating to GitHub profile...');
  await page.goto('https://github.com/klaudioz', { waitUntil: 'networkidle0' });

  console.log('Injecting scripts...');
  // Inject lodash from the local file content
  await page.addScriptTag({ content: lodashJsCode }); // <-- MODIFIED THIS LINE
  // Inject obelisk
  await page.addScriptTag({ content: obeliskJsCode });
  // Inject the main logic script
  await page.addScriptTag({ content: isoJsCode });

  console.log('Waiting for canvas to render...');
  await page.waitForSelector('#isometric-contributions', { timeout: 30000 });
  const canvasElement = await page.$('#isometric-contributions');

  console.log('Taking screenshot...');
  await canvasElement.screenshot({ path: 'iso-contributions.png' });

  console.log('Closing browser.');
  await browser.close();

  console.log('Image generated: iso-contributions.png');
}

generateImage().catch(console.error);
