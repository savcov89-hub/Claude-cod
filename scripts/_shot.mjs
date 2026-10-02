import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: Number(process.argv[4] || 1000), height: 900 } });
await p.goto('file://' + process.argv[2]);
// One row per exercise: photos, then start / middle / end; the filmstrip is left out.
await p.addStyleTag({ content: '.row{display:flex!important;flex-wrap:nowrap;align-items:center;gap:8px} .row>b{width:90px;flex:none;font-size:12px} .row>.pics:nth-of-type(3){display:none} .row img{height:120px}' });
await p.screenshot({ path: process.argv[3], fullPage: true });
await b.close();
