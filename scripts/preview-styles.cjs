#!/usr/bin/env node
// Render the same anonymous content in every preset. Never creates job approvals.
const fs=require('node:fs/promises');
const path=require('node:path');
const {render,styles}=require('./render-carousel.cjs');

async function main() {
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--output') throw new Error('Usage: preview-styles.cjs --output NEW_DIRECTORY');
 const output=path.resolve(args[1]);
 await fs.mkdir(output,{recursive:false});
 const assets=path.join(__dirname,'../assets');
 const source=JSON.parse(await fs.readFile(path.join(assets,'example-plan.json'),'utf8'));
 await fs.copyFile(path.join(assets,'demo-photo.jpg'),path.join(output,'demo-photo.jpg'));
 for(const style of styles) {
  const plan=structuredClone(source);
  plan.style=style.id;
  plan.pages[0].layout=style.default_cover;
  if(style.default_cover==='type') {
   delete plan.pages[0].image;
   delete plan.pages[0].image_note;
  }
  const input=path.join(output,style.id+'.json');
  await fs.writeFile(input,JSON.stringify(plan,null,2)+'\n');
  console.log(JSON.stringify(await render({input,output:path.join(output,style.id),preview:true})));
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
