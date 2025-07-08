import puppeteer from 'puppeteer';
import fs from 'fs';

// Read library files
const obeliskJsCode = fs.readFileSync('./obelisk.min.js', 'utf8');
const lodashJsCode = fs.readFileSync('./lodash.min.js', 'utf8');

async function generateImage() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  console.log('Navigating to GitHub profile...');
  await page.goto('https://github.com/klaudioz', { waitUntil: 'networkidle0' });

  // Wait for the contribution graph to load
  console.log('Waiting for contribution graph...');
  try {
    await page.waitForSelector('.js-calendar-graph', { timeout: 30000 });
    await page.waitForSelector('.js-yearly-contributions', { timeout: 30000 });
  } catch (error) {
    console.error('Failed to find contribution graph elements:', error);
    await browser.close();
    process.exit(1);
  }

  console.log('Injecting scripts...');
  
  // Inject lodash
  await page.evaluate(lodashJsCode);
  
  // Make lodash available on window._
  await page.evaluate(() => {
    window._ = _;
  });
  
  // Inject obelisk
  await page.evaluate(obeliskJsCode);

  // Create the canvas and render the isometric view
  console.log('Creating isometric view...');
  await page.evaluate(() => {
    // Helper functions from iso.js
    const getCountFromNode = (node) => {
      const contributionMatches = node.innerHTML.match(/(\d*|No) contributions? on (.*)./);
      if (!contributionMatches) return 0;
      const dataCount = contributionMatches[1];
      return dataCount === 'No' ? 0 : Number.parseInt(dataCount, 10);
    };

    const getSquareColor = (rect) => {
      const rgb = getComputedStyle(rect).getPropertyValue('fill');
      const separator = rgb.includes(',') ? ',' : ' ';
      const rgbParts = rgb.slice(4).split(')')[0].split(separator);
      let r = Number(rgbParts[0]).toString(16);
      let g = Number(rgbParts[1]).toString(16);
      let b = Number(rgbParts[2]).toString(16);
      if (r.length === 1) r = '0' + r;
      if (g.length === 1) g = '0' + g;
      if (b.length === 1) b = '0' + b;
      return r + g + b;
    };

    // Load contribution data
    const dayNodes = [...document.querySelectorAll('.js-calendar-graph-table tbody td.ContributionCalendar-day')].map(
      (d) => ({
        date: new Date(d.dataset.date),
        week: d.dataset.ix,
        color: getSquareColor(d),
        tid: d.getAttribute('aria-labelledby')
      })
    );

    const tooltipNodes = [...document.querySelectorAll('.js-calendar-graph tool-tip')].map((t) => ({
      tid: t.id,
      count: getCountFromNode(t)
    }));

    const data = dayNodes.map((d) => ({
      ...d,
      ...tooltipNodes.find((t) => t.tid === d.tid)
    }));

    const days = data.sort((a, b) => a.date.getTime() - b.date.getTime());
    const weeks = window._.toArray(window._.groupBy(days, 'week'));
    
    let maxCount = 0;
    for (const d of days) {
      if (d.count > maxCount) {
        maxCount = d.count;
      }
    }

    // Create canvas
    const contributionsWrapper = document.createElement('div');
    contributionsWrapper.className = 'ic-contributions-wrapper position-relative';
    contributionsWrapper.style.width = '1000px';
    contributionsWrapper.style.height = '600px';
    contributionsWrapper.style.margin = '20px';
    document.body.appendChild(contributionsWrapper);

    const canvas = document.createElement('canvas');
    canvas.id = 'isometric-contributions';
    canvas.width = 1000;
    canvas.height = 600;
    contributionsWrapper.appendChild(canvas);

    // Render isometric chart
    const SIZE = 16;
    const MAX_HEIGHT = 100;
    const GH_OFFSET = 14;
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
  });

  // Wait a bit for rendering to complete
  await page.waitForTimeout(2000);

  console.log('Taking screenshot...');
  const canvas = await page.$('#isometric-contributions');
  if (!canvas) {
    throw new Error('Canvas element was not created');
  }
  
  await canvas.screenshot({ path: 'iso-contributions.png' });

  console.log('Closing browser.');
  await browser.close();

  console.log('Image generated: iso-contributions.png');
}

generateImage().catch(err => {
  console.error(err);
  process.exit(1);
});
