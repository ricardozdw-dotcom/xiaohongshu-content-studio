// Real browser integration; requires Playwright + Chinese fonts. Fixtures are not user approvals.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {render,styles}=require('../scripts/render-carousel.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const command='python -c "print(\'你好 & <world>\')"\nnode run.js --input "目录/资料.json" --limit 12';

test('five styles export cover + every block, preserve text, and enforce failures',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'xhs-style-test-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const example=JSON.parse(await fs.readFile(path.join(__dirname,'../assets/example-plan.json'),'utf8'));
 await fs.copyFile(path.join(__dirname,'../assets/demo-photo.jpg'),path.join(root,'photo.jpg'));
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 t.after(()=>browser.close());
 const tab=await browser.newPage();
 const signatures=new Set();
 async function run(plan,name,extra={}) {
  const input=path.join(root,name+'.json');
  await fs.writeFile(input,JSON.stringify(plan));
  const output=path.join(root,name);
  const result=await render({input,output,preview:true,...extra});
  return {result,output,input,report:JSON.parse(await fs.readFile(path.join(output,'render-report.json'),'utf8'))};
 }
 for(const style of styles) {
  await t.test(style.id+' photo + type and technical blocks',async()=>{
   const plan=structuredClone(example);
   plan.style=style.id;
   plan.pages[0].image='photo.jpg';
   plan.pages.push({type:'content',number:2,title:'按顺序检查环境',blocks:[
    {type:'steps',items:[{title:'检查前置条件',text:'确认版本与目录，再运行命令。'},{title:'执行后核对',text:'检查返回值，不把预览当正式稿。'}]},
    {type:'code',text:command},
    {type:'schedule',items:[{period:'第一步',title:'先运行',text:'保存原始结果。'},{period:'第二步',title:'再核对',text:'记录实际错误。'}]},
    {type:'meta',text:'<script>window.__injected=true</script>'}
   ]});
   const photo=await run(plan,style.id+'-photo');
   assert.equal(photo.report.style,style.id);
   assert.equal(photo.report.cover_layout,'photo');
   assert.equal(photo.report.mode,'preview');
   assert.equal(photo.report.pages.length,3);
   signatures.add(photo.report.pages[1].sha256);
   for(const page of photo.report.pages) {
    assert.equal(page.width,1080);assert.equal(page.height,1800);
    assert.equal(page.horizontalOverflow,false);assert.equal(page.footerOverflow,false);
    const data=await fs.readFile(path.join(photo.output,page.file));
    assert.equal(data.readUInt32BE(16),1080);assert.equal(data.readUInt32BE(20),1800);
    assert.equal(hash(data),page.sha256);
   }
   await tab.goto(pathToFileURL(path.join(photo.output,'carousel.html')).href+'?page=3');
   assert.equal(await tab.locator('.page:visible .code').textContent(),command);
   assert.equal(await tab.evaluate(()=>window.__injected),undefined);
   assert.equal(await tab.locator('.page:visible .step').count(),2);
   const type=structuredClone(plan);
   type.pages[0].layout='type';delete type.pages[0].image;delete type.pages[0].image_note;
   const typography=await run(type,style.id+'-type');
   assert.equal(typography.report.cover_layout,'type');
   await tab.goto(pathToFileURL(path.join(typography.output,'carousel.html')).href+'?page=1');
   assert.equal(await tab.locator('.page:visible img').count(),0);
   assert.ok(await tab.locator('.page:visible .cover-art').isVisible());
  });
 }
 assert.equal(signatures.size,5,'inner pages must actually differ, not only covers');
 const legacy=structuredClone(example);delete legacy.style;legacy.pages[0].image='photo.jpg';
 assert.equal((await run(legacy,'legacy')).report.style,'editorial');
 assert.equal((await run(legacy,'override',{style:'cards'})).report.style,'cards');

 await t.test('bad styles, assets, output reuse, and overflow fail safely',async()=>{
  const input=path.join(root,'legacy.json');
  await assert.rejects(render({input,output:path.join(root,'no-mode')}),/exactly one/);
  await assert.rejects(render({input,output:path.join(root,'unknown'),preview:true,style:'unknown'}),/Unknown style/);
  await assert.rejects(render({input,output:path.join(root,'legacy'),preview:true}),/Output exists/);
  const bad=structuredClone(legacy);
  bad.pages[0].layout='type';
  await assert.rejects(run(bad,'unused'),/unused image/);
  delete bad.pages[0].image;bad.pages[0].layout='photo';
  await assert.rejects(run(bad,'missing'),/requires.*image/);
  bad.pages[0].image='../escape.jpg';
  await assert.rejects(run(bad,'escape'),/ENOENT|beside/);
  for(const style of styles) {
   const overflow=structuredClone(legacy);overflow.style=style.id;
   overflow.pages[1].blocks=[{type:'paragraph',text:'这是一段过长的测试文字。'.repeat(600)}];
   await assert.rejects(run(overflow,'overflow-'+style.id),/Layout failed at page 2/);
   await assert.rejects(fs.access(path.join(root,'overflow-'+style.id)));
  }
 });

 await t.test('no gate bypass for new themes; confirmed type covers can release',async()=>{
  const plan=structuredClone(legacy);plan.style='tech';delete plan.pages[0].image;plan.pages[0].layout='type';
  const input=path.join(root,'release.json');await fs.writeFile(input,JSON.stringify(plan));
  await fs.writeFile(path.join(root,'job.json'),JSON.stringify({phase:'capture'}));
  await assert.rejects(render({input,output:path.join(root,'blocked'),job:root}),/must be confirmed/);
  for(const name of ['source','rewrite']) await fs.writeFile(path.join(root,name+'.txt'),'TEST FIXTURE ONLY '+name);
  const state={phase:'ready_to_publish',coverage:'complete'};
  for(const name of ['source','rewrite']) {
   state[name]={path:name+'.txt',sha256:hash(await fs.readFile(path.join(root,name+'.txt')))};
   state[name+'_approval']={sha256:state[name].sha256,evidence:'TEST FIXTURE ONLY'};
  }
  await fs.writeFile(path.join(root,'job.json'),JSON.stringify(state));
  plan.draft_sha256=state.rewrite.sha256;await fs.writeFile(input,JSON.stringify(plan));
  const result=await render({input,output:path.join(root,'release'),job:root});
  assert.equal(result.mode,'release');assert.equal(result.cover_layout,'type');
  await fs.appendFile(path.join(root,'rewrite.txt'),' changed');
  await assert.rejects(render({input,output:path.join(root,'stale'),job:root}),/changed/);
 });
});
