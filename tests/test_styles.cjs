const test=require('node:test');
const assert=require('node:assert/strict');
const {selectStyle,styles,options}=require('../scripts/render-carousel.cjs');

test('legacy plans default to editorial; every documented style has a valid cover default',()=>{
 assert.equal(selectStyle().id,'editorial');
 assert.equal(new Set(styles.map(s=>s.id)).size,5);
 for(const style of styles) {
  assert.equal(selectStyle(style.id),style);
  assert.ok(['photo','type'].includes(style.default_cover));
 }
});
test('unknown or unsafe style identifiers are rejected rather than injected',()=>{
 for(const id of ['random','../tech','tech" onclick="x',null,{},3]) assert.throws(()=>selectStyle(id),/Unknown style/);
});
test('CLI requires exactly one production mode and permits an explicit style',()=>{
 assert.deepEqual(options(['--list-styles']),{listStyles:true});
 assert.equal(options(['--input','a','--output','b','--preview','--style','tech']).style,'tech');
 assert.throws(()=>options(['--input','a','--output','b']),/exactly one/);
 assert.throws(()=>options(['--input','a','--output','b','--preview','--job','j']),/exactly one/);
 assert.throws(()=>options(['--list-styles','--preview']),/alone/);
});
