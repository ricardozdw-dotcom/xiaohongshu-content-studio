#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

function options(argv) {
 const result={};
 for(let i=0;i<argv.length;i++) {
  if(argv[i]==='--preview') result.preview=true;
  else if(['--input','--output','--job'].includes(argv[i]) && argv[i+1]) result[argv[i].slice(2)]=argv[++i];
  else throw new Error('Usage: render-carousel.cjs --input PLAN --output NEW_DIR [--job JOB | --preview]');
 }
 if(!result.input || !result.output || (!result.job && !result.preview) || (result.job && result.preview)) throw new Error('Specify input, output, and exactly one of --job or --preview');
 return result;
}
const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines = value=>escape(value).replace(/\n/g,'<br>');
const title = value=>[].concat(value).map(lines).join('<br>');
const sha = bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function within(root, target) {
 const relative=path.relative(root,target);
 return relative!=='' && !relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative);
}
async function verifyJob(job, plan) {
 const state=JSON.parse(await fs.readFile(path.join(job,'job.json'),'utf8'));
 if(state.phase!=='ready_to_publish' || !state.source_approval || !state.rewrite_approval || state.coverage!=='complete') throw new Error('Both reviewed document versions must be confirmed before rendering');
 for(const name of ['source','rewrite']) {
  const file=await fs.realpath(path.resolve(job,state[name].path));
  if(!within(job,file) || sha(await fs.readFile(file))!==state[name].sha256) throw new Error('Reviewed document changed: '+name);
  if(state[name+'_approval'].sha256!==state[name].sha256) throw new Error('Approval does not match '+name);
 }
 if(plan.draft_sha256!==state.rewrite.sha256) throw new Error('Plan must identify the currently approved draft hash');
 return state;
}
function blockHtml(block) {
 switch(block.type) {
  case 'paragraph':return `<p>${block.lead?`<b class="accent">${lines(block.lead)}</b><br>`:''}${lines(block.text)}</p>`;
  case 'meta':return `<p class="meta">${lines(block.text)}</p>`;
  case 'label':return `<div class="label">${lines(block.text)}</div>`;
  case 'quote':return `<div class="quote">${lines(block.text)}</div>`;
  case 'prompt':return `<div class="prompt">${[].concat(block.paragraphs).map(s=>`<p>${lines(s)}</p>`).join('')}</div>`;
  case 'steps':return block.items.map((s,i)=>`<div class="step"><div class="step-index">${i+1}</div><div class="step-text"><b class="accent">${lines(s.title)}</b><br>${lines(s.text)}</div></div>`).join('');
  case 'schedule':return `<div class="schedule">${block.items.map(s=>`<div class="day">${lines(s.period)}</div><div class="schedule-text"><b>${lines(s.title)}</b><br>${lines(s.text)}</div>`).join('')}</div>`;
  case 'code':return `<pre class="code">${escape(block.text)}</pre>`;
  default:throw new Error('Unsupported block: '+block.type);
 }
}

(async()=>{
 const args=options(process.argv.slice(2));
 const input=await fs.realpath(path.resolve(args.input));
 const output=path.resolve(args.output);
 const plan=JSON.parse(await fs.readFile(input,'utf8'));
 if(!Array.isArray(plan.pages) || plan.pages.length<2 || plan.pages[0].type!=='cover') throw new Error('Plan needs a cover and at least one content page');
 if(plan.pages.slice(1).some(p=>p.type!=='content')) throw new Error('Only first page may be a cover');
 if(args.job) await verifyJob(await fs.realpath(path.resolve(args.job)),plan);
 try {await fs.access(output);throw new Error('Output exists; select a new version directory');} catch(error){if(error.code!=='ENOENT') throw error;}
 let imageSrc='';
 const cover=plan.pages[0];
 if(cover.image) {
  if(path.isAbsolute(cover.image)) throw new Error('Cover image must be a relative local path');
  const asset=await fs.realpath(path.resolve(path.dirname(input),cover.image));
  if(!within(path.dirname(input),asset)) throw new Error('Cover image must be kept beside the plan or in its subdirectories');
  const ext=path.extname(asset).toLowerCase();
  const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
  if(!mime) throw new Error('Unsupported cover image type');
  imageSrc=`data:${mime};base64,${(await fs.readFile(asset)).toString('base64')}`;
 } else if(!args.preview) throw new Error('Release cover requires a real supplied or generated image');
 const css=await fs.readFile(path.join(__dirname,'../assets/carousel.css'),'utf8');
 const html=plan.pages.map((page,index)=>{
  const inner=page.type==='cover'
   ? `<div class="rule"></div><div class="eyebrow">${escape(plan.eyebrow||'AI 实操')}</div><h1>${[].concat(page.title).map(s=>`<span class="mark">${lines(s)}</span>`).join('<br>')}</h1><p class="lead">${lines(page.lead)}</p>${imageSrc?`<img class="visual" src="${imageSrc}" alt="${escape(page.image_alt||'封面示意')}">`:''}${page.blocks.map(blockHtml).join('')}`
   : `<h2>${page.number!==undefined?`<span class="num">${escape(page.number)}</span>`:''}${title(page.title)}</h2>${page.blocks.map(blockHtml).join('')}`;
  return `<section class="page" id="page-${index+1}"><div class="content">${inner}</div><div class="footer"><span>${String(index+1).padStart(2,'0')} / ${String(plan.pages.length).padStart(2,'0')} · ${escape(page.footer||'')}</span><span>${escape(index===0&&cover.image_note?cover.image_note:plan.brand||'')}</span></div></section>`;
 }).join('');
 const document=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(plan.title)}</title><style>${css}</style></head><body>${html}<script>const n=new URLSearchParams(location.search).get('page');if(n){document.querySelectorAll('.page').forEach(el=>{el.style.display=el.id==='page-'+n?'block':'none';el.style.marginTop='0';});document.body.style.background='#fff';}</script></body></html>`;
 await fs.mkdir(path.dirname(output),{recursive:true});
 const staging=await fs.mkdtemp(path.join(path.dirname(output),'.carousel-staging-'));
 let browser;
 try {
  const htmlPath=path.join(staging,'carousel.html');
  await fs.writeFile(htmlPath,document);
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--hide-scrollbars','--disable-background-networking','--disable-component-update']});
  const context=await browser.newContext({viewport:{width:1080,height:1800},deviceScaleFactor:1});
  await context.route(/^https?:\/\//,route=>route.abort());
  const tab=await context.newPage();
  const report={mode:args.preview?'preview':'release',draft_sha256:plan.draft_sha256||null,pages:[]};
  for(let i=0;i<plan.pages.length;i++) {
   await tab.goto(pathToFileURL(htmlPath).href+'?page='+(i+1),{waitUntil:'load'});
   await tab.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(image=>image.decode()));});
   const metrics=await tab.locator('.page:visible').evaluate(el=>{
    const bounds=el.getBoundingClientRect();
    const content=el.querySelector('.content').getBoundingClientRect();
    const footer=el.querySelector('.footer').getBoundingClientRect();
    const horizontalOverflow=Array.from(el.querySelectorAll('.content *')).some(node=>{const b=node.getBoundingClientRect();return b.left<bounds.left-1||b.right>bounds.right+1||node.scrollWidth>node.clientWidth+2;});
    return {width:el.offsetWidth,height:el.offsetHeight,scrollHeight:el.scrollHeight,contentBottom:Math.round(content.bottom),footerTop:Math.round(footer.top),horizontalOverflow,imagesLoaded:Array.from(el.querySelectorAll('img')).every(image=>image.naturalWidth>0)};
   });
   if(metrics.scrollHeight>1800||metrics.contentBottom>metrics.footerTop-40||metrics.horizontalOverflow||!metrics.imagesLoaded) throw new Error('Layout failed at page '+(i+1)+': '+JSON.stringify(metrics));
   const filename=String(i+1).padStart(2,'0')+(i===0?'-封面':'-正文')+'.png';
   await tab.screenshot({path:path.join(staging,filename)});
   report.pages.push({file:filename,sha256:sha(await fs.readFile(path.join(staging,filename))),...metrics});
  }
  await browser.close();browser=null;
  await fs.writeFile(path.join(staging,'render-report.json'),JSON.stringify(report,null,2)+'\n');
  await fs.rename(staging,output);
  console.log(JSON.stringify({output,pages:report.pages.length,mode:report.mode}));
 } finally {
  if(browser) await browser.close();
  await fs.rm(staging,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
