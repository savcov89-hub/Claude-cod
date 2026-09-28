// Turns the single-file build into artifact page content (the host adds doctype/head/body).
import fs from 'fs';
const html = fs.readFileSync('dist-artifact/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = '<title>Training Log</title>';
const links = pick(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g).join('\n');
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g).join('\n');
const scripts = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/g).join('\n');
const out = [title, links, styles, '<div id="root"></div>', scripts].join('\n');
fs.mkdirSync('artifact', { recursive: true });
fs.writeFileSync('artifact/training-log.html', out);
console.log('artifact bytes', out.length, 'scripts', scripts.length, 'styles', styles.length);
