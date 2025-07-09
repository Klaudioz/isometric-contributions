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

  // Create the complete isometric view with stats
  console.log('Creating isometric view with stats...');
  await page.evaluate(() => {
    // Helper functions from iso.js
    const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const sameDay = (d1, d2) => d1.toDateString() === d2.toDateString();
    
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

    const precisionRound = (number, precision) => {
      const factor = 10 ** precision;
      return Math.round(number * factor) / factor;
    };

    const datesDayDifference = (date1, date2) => {
      let diffDays = null;
      if (date1 && date2) {
        const timeDiff = Math.abs(date2.getTime() - date1.getTime());
        diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
      }
      return diffDays;
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
    const currentWeekDays = window._.last(weeks);
    
    // Calculate stats
    let yearTotal = 0;
    let weekTotal = 0;
    let maxCount = 0;
    let streakLongest = 0;
    let streakCurrent = 0;
    let bestDay = null;
    let firstDay = null;
    let lastDay = null;
    let weekStartDay = null;
    let temporaryStreak = 0;
    let temporaryStreakStart = null;
    let longestStreakStart = null;
    let longestStreakEnd = null;
    let currentStreakStart = null;
    let currentStreakEnd = null;

    for (const d of days) {
      const currentDayCount = d.count;
      yearTotal += currentDayCount;

      if (days[0] === d) {
        firstDay = d.date;
      }

      if (sameDay(d.date, new Date())) {
        lastDay = d.date;
      } else if (!lastDay && days.at(-1) === d) {
        lastDay = d.date;
      }

      if (currentDayCount > maxCount) {
        bestDay = d.date;
        maxCount = currentDayCount;
      }

      if (currentDayCount > 0) {
        if (temporaryStreak === 0) {
          temporaryStreakStart = d.date;
        }
        temporaryStreak++;
        if (temporaryStreak >= streakLongest) {
          longestStreakStart = temporaryStreakStart;
          longestStreakEnd = d.date;
          streakLongest = temporaryStreak;
        }
      } else {
        temporaryStreak = 0;
        temporaryStreakStart = null;
      }
    }

    for (const d of currentWeekDays) {
      const currentDayCount = d.count;
      weekTotal += currentDayCount;
      if (currentWeekDays[0] === d) {
        weekStartDay = d.date;
      }
    }

    // Check for current streak
    const reversedDays = [...days].reverse();
    currentStreakEnd = reversedDays[0].date;

    for (let i = 0; i < reversedDays.length; i++) {
      const currentDayCount = reversedDays[i].count;
      if (i === 0 && currentDayCount === 0) {
        currentStreakEnd = reversedDays[1].date;
        continue;
      }
      if (currentDayCount > 0) {
        streakCurrent++;
        currentStreakStart = reversedDays[i].date;
      } else {
        break;
      }
    }

    // Format stats
    const countTotal = yearTotal.toLocaleString();
    const dateFirst = dateFormat.format(firstDay);
    const dateLast = dateFormat.format(lastDay);
    const datesTotal = `${dateFirst} → ${dateLast}`;
    const dayDifference = datesDayDifference(firstDay, lastDay);
    const averageCount = precisionRound(yearTotal / dayDifference, 2);
    const dateBest = bestDay ? dateFormat.format(bestDay) : 'No activity found';
    const weekCountTotal = weekTotal.toLocaleString();
    const weekDateFirst = dateFormat.format(weekStartDay);
    const weekDatesTotal = `${weekDateFirst} → ${dateLast}`;

    let datesCurrent = 'No current streak';
    if (streakCurrent > 0) {
      const currentStart = dateFormat.format(currentStreakStart);
      const currentEnd = dateFormat.format(currentStreakEnd);
      datesCurrent = `${currentStart} → ${currentEnd}`;
    }

    let datesLongest = 'No longest streak';
    if (streakLongest > 0) {
      const longestStart = dateFormat.format(longestStreakStart);
      const longestEnd = dateFormat.format(longestStreakEnd);
      datesLongest = `${longestStart} → ${longestEnd}`;
    }

    // Clear the page and create our container
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.padding = '20px';
    document.body.style.backgroundColor = '#ffffff';
    document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

    // Create main container
    const mainContainer = document.createElement('div');
    mainContainer.style.position = 'relative';
    mainContainer.style.width = '1000px';
    mainContainer.style.height = '600px';
    mainContainer.style.backgroundColor = '#ffffff';
    document.body.appendChild(mainContainer);

    // Create canvas container
    const canvasContainer = document.createElement('div');
    canvasContainer.style.position = 'absolute';
    canvasContainer.style.left = '0';
    canvasContainer.style.top = '0';
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = '100%';
    mainContainer.appendChild(canvasContainer);

    const canvas = document.createElement('canvas');
    canvas.id = 'isometric-contributions';
    canvas.width = 1000;
    canvas.height = 600;
    canvasContainer.appendChild(canvas);

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

    // Add stats overlay
    const statsTop = document.createElement('div');
    statsTop.style.position = 'absolute';
    statsTop.style.top = '40px';
    statsTop.style.right = '80px';
    statsTop.style.fontSize = '14px';
    statsTop.style.color = '#24292e';
    statsTop.innerHTML = `
      <div style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600;">Contributions</h3>
        <div style="display: flex; background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 8px;">
          <div style="padding: 12px 16px;">
            <div style="font-size: 32px; font-weight: bold; color: #28a745; line-height: 1;">${countTotal}</div>
            <div style="font-size: 12px; font-weight: 600; margin-top: 4px;">Total</div>
            <div style="font-size: 11px; color: #586069; margin-top: 2px;">${datesTotal}</div>
          </div>
          <div style="padding: 12px 16px;">
            <div style="font-size: 32px; font-weight: bold; color: #28a745; line-height: 1;">${maxCount}</div>
            <div style="font-size: 12px; font-weight: 600; margin-top: 4px;">Best day</div>
            <div style="font-size: 11px; color: #586069; margin-top: 2px;">${dateBest}</div>
          </div>
        </div>
        <p style="margin: 8px 0 0 0; text-align: right; font-size: 12px; color: #586069;">
          Average: <span style="font-weight: bold; color: #28a745;">${averageCount}</span> <span style="color: #586069;">/ day</span>
        </p>
      </div>
    `;
    mainContainer.appendChild(statsTop);

    const statsBottom = document.createElement('div');
    statsBottom.style.position = 'absolute';
    statsBottom.style.bottom = '40px';
    statsBottom.style.left = '80px';
    statsBottom.style.fontSize = '14px';
    statsBottom.style.color = '#24292e';
    statsBottom.innerHTML = `
      <div>
        <h3 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 600;">Streaks</h3>
        <div style="display: flex; background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; padding: 8px;">
          <div style="padding: 12px 16px;">
            <div style="font-size: 32px; font-weight: bold; color: #28a745; line-height: 1;">
              ${streakLongest} <span style="font-size: 16px; font-weight: normal;">days</span>
            </div>
            <div style="font-size: 12px; font-weight: 600; margin-top: 4px;">Longest</div>
            <div style="font-size: 11px; color: #586069; margin-top: 2px;">${datesLongest}</div>
          </div>
          <div style="padding: 12px 16px;">
            <div style="font-size: 32px; font-weight: bold; color: #28a745; line-height: 1;">
              ${streakCurrent} <span style="font-size: 16px; font-weight: normal;">days</span>
            </div>
            <div style="font-size: 12px; font-weight: 600; margin-top: 4px;">Current</div>
            <div style="font-size: 11px; color: #586069; margin-top: 2px;">${datesCurrent}</div>
          </div>
        </div>
      </div>
    `;
    mainContainer.appendChild(statsBottom);
  });

  // Wait a bit for rendering to complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Taking screenshot...');
  // Screenshot the entire container with stats
  const element = await page.$('body > div');
  if (!element) {
    throw new Error('Main container was not created');
  }
  
  await element.screenshot({ path: 'iso-contributions.png' });

  console.log('Closing browser.');
  await browser.close();

  console.log('Image generated: iso-contributions.png');
}

generateImage().catch(err => {
  console.error(err);
  process.exit(1);
});
