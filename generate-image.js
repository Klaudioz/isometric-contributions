import puppeteer from 'puppeteer';
import fs from 'fs';

// This is a simplified and corrected version of the iso.js logic
// It removes unnecessary browser extension features and directly generates the chart.
const isoJsCode = `
  // lodash functions are available on the global 'window._' object
  const { toArray, groupBy, last } = window._;

  const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const sameDay = (d1, d2) => d1.toDateString() === d2.toDateString();

  let days, weeks, calendarGraph, contributionsBox;
  let maxCount = 0;

  const getCountFromNode = (node) => {
    const contributionMatches = node.innerHTML.match(/(\\d*|No) contributions? on (.*)./);
    if (!contributionMatches) return 0;
    const dataCount = contributionMatches[1];
    return dataCount === 'No' ? 0 : Number.parseInt(dataCount, 10);
  };

  const getSquareColor = (rect) => {
    const rgb = getComputedStyle(rect).getPropertyValue('fill');
    const separator = rgb.includes(',') ? ',' : ' ';
    const rgbParts = rgb.slice(4).split(')')[0].split(separator);
    let r = Number(rgbParts[0]).toString(16), g = Number(rgbParts[1]).toString(16), b = Number(rgbParts[2]).toString(16);
    if (r.length === 1) r = '0' + r;
    if (g.length === 1) g = '0' + g;
    if (b.length === 1) b = '0' + b;
    return r + g + b;
  };

  const loadData = () => {
    const dayNodes = [...document.querySelectorAll('.js-calendar-graph-table tbody td.ContributionCalendar-day')].map(d => ({
      date: new Date(d.dataset.date),
      week: d.dataset.ix,
      color: getSquareColor(d),
      tid: d.getAttribute('aria-labelledby')
    }));

    const tooltipNodes = [...document.querySelectorAll('.js-calendar-graph tool-tip')].map(t => ({
      tid: t.id,
      count: getCountFromNode(t)
    }));

    const data = dayNodes.map(d => ({ ...d, ...tooltipNodes.find(t => t.tid === d.tid) }));
    days = data.sort((a, b) => a.date.getTime() - b.date.getTime());
    weeks = toArray(groupBy(days, 'week'));

    for (const d of days) {
      if (d.count > maxCount) {
        maxCount = d.count;
      }
    }
  };

  const renderIsometricChart = () => {
    const SIZE = 16, MAX_HEIGHT = 100, GH_OFFSET = 14;
    const canvas = document.querySelector('#isometric-contributions');
    const point = new obelisk.Point(130, 90);
    const pixelView = new obelisk.PixelView(canvas, point);
    let transform = GH_OFFSET;

    for (const w of weeks) {
      const x = transform / (GH_OFFSET + 1);
      transform += GH_OFFSET;
      let offsetY = 0;
      for (const d of w) {
        const y = offsetY / GH_OFFSET;
        offsetY += 13;
        const currentDayCount = d.count;
        let cubeHeight = 3;
        if (maxCount > 0) {
          cubeHeight += Number.parseInt((MAX_HEIGHT / maxCount) * currentDayCount, 10);
        }
        const dimension = new obelisk.CubeDimension(SIZE, SIZE, cubeHeight);
        const color = new obelisk.CubeColor().getByHorizontalColor(Number.parseInt(d.color, 16));
        const cube = new obelisk.Cube(dimension, color, false);
        const p3d = new obelisk.Point3D(SIZE * x, SIZE * y, 0);
        pixelView.renderObject(cube, p3d);
      }
    }
  };

  const generateIsometricChart = () => {
    calendarGraph = document.querySelector('.js-calendar-graph');
    contributionsBox = document.querySelector('.js-yearly-contributions');

    if (!calendarGraph || !contributionsBox) {
      console.error('Could not find GitHub contribution graph elements.');
      return;
    }

    const contributionsWrapper = document.createElement('div');
    contributionsWrapper.className = 'ic-contributions-wrapper position-relative';
    calendarGraph.before(contributionsWrapper);

    const canvas = document.createElement('canvas');
    canvas.id = 'isometric-contributions';
    canvas.width = 1000;
    canvas.height = 600;
    canvas.style.width = '100%';
    contributionsWrapper.append(canvas);

    loadData();
    renderIsometricChart();
  };

  // Directly call the function instead of waiting for observers
  generateIsometricChart();
`;

// Read both library files from the local file system
const obeliskJsCode = fs.readFileSync('./obelisk.min.js', 'utf8');
const lodashJsCode = fs.readFileSync('./lodash.min.js', 'utf8');


async function generateImage() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  console.log('Navigating to GitHub profile...');
  await page.goto('https://github.com/klaudioz', { waitUntil: 'networkidle0' });

  console.log('Injecting scripts...');
  // Inject lodash from the local file content
  await page.addScriptTag({ content: lodashJsCode });
  // Inject obelisk
  await page.addScriptTag({ content: obeliskJsCode });
  // Inject the main logic script
  await page.addScriptTag({ content: isoJsCode });

  console.log('Waiting for canvas to render...');
  // Increased timeout just in case, but the main fix is in the script logic
  await page.waitForSelector('#isometric-contributions', { timeout: 60000 });
  const canvasElement = await page.$('#isometric-contributions');

  if (!canvasElement) {
    throw new Error('Canvas element was not created on the page.');
  }

  console.log('Taking screenshot...');
  await canvasElement.screenshot({ path: 'iso-contributions.png' });

  console.log('Closing browser.');
  await browser.close();

  console.log('Image generated: iso-contributions.png');
}

generateImage().catch(err => {
  console.error(err);
  process.exit(1); // Exit with an error code to make sure the GitHub Action fails
});
