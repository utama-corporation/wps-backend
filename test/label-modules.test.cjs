const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=require('path').resolve(__dirname,'..')+'/';
const configs=[['moulding','Moulding','NoMoulding','moulding'],['fj','FJ','NoFJ','finger-join'],['lmt','Laminating','NoLaminating','laminating'],['cca','CCAkhir','NoCCAkhir','ccakhir'],['snd','Sanding','NoSanding','sanding'],['bj','BarangJadi','NoBJ','packing']];
for(const [id,,,production]of configs)for(const file of [`src/modules/label/${id}/label-${id}-service.js`,`src/modules/label/${id}/label-${id}-controller.js`,`src/modules/produksi/${production}/${production}-produksi-service.js`])new vm.Script(fs.readFileSync(root+file,'utf8'),{filename:file});
function harness(id,key){
 const queries=[],params=[],transactions=[];let failDelete=false;
 class Transaction{constructor(){transactions.push(this);}async begin(){this.began=true;}async commit(){this.committed=true;}async rollback(){this.rolledBack=true;}}
 class Request{constructor(tx){this.tx=tx;this.values=[];}input(...v){this.values.push(v);params.push(v);return this;}async query(q){queries.push({q,tx:this.tx});if(failDelete&&q.includes('DELETE FROM')&&q.includes('_h'))throw Error('blocked');
  const row={[key]:'TEST.000111',NoLabel:'TEST.000111',IdOrgTelly:5,DateCreate:'2026-10-30'};
  return {recordset:[row],recordsets:[[row],[{Total:123}]],rowsAffected:[1]};}}
 const db={sql:{Request,Transaction,VarChar:()=>{},Decimal:()=>{},Int:'int',Bit:'bit',Date:'date'},poolPromise:Promise.resolve({request:()=>new Request()})};
 function load(file){const module={exports:{}};vm.runInNewContext(fs.readFileSync(root+file,'utf8'),{module,console,require:n=>n.includes('/db')?db:n==='moment'?()=>({format:()=>''}):{assertPeriodeTerbuka:async()=>{}}});return module.exports;}
 return {queries,params,transactions,load,setFail(){failDelete=true;}};
}
(async()=>{
 for(const[id,table,key,production]of configs){
  const h=harness(id,key),service=h.load(`src/modules/label/${id}/label-${id}-service.js`);
  const page=await service.getAllLabels({search:'TEST',topRow:51,includeTotal:true});assert.equal(page.total,123);
  assert(h.queries.at(-1).q.includes('COUNT_BIG(*)'));assert.equal(h.queries.at(-1).q.split('DateUsage IS NULL').length-1,2);
  assert(Array.isArray(await service.getAllLabels({search:'',topRow:51})));
  const controller={exports:{}};
  vm.runInNewContext(fs.readFileSync(root+`src/modules/label/${id}/label-${id}-controller.js`,'utf8'),{exports:controller.exports,console,require:name=>name.includes('-service')?service:{}});
  let payload;
  await controller.exports.getAllLabels({query:{}},{status(code){assert.equal(code,200);return this;},json(body){payload=body;return body;}});
  assert.equal(payload.total,123);assert(Array.isArray(payload.data));
  await service.updateLabel('TEST.000111',{idJenisKayu:1,idGrade:7,idBarangJadi:9,noSPK:'SPK',noSPKAsal:'ASAL',idLokasi:'L01'});
  assert(h.params.some(p=>p[0]==='noSPKAsal'&&p[2]==='ASAL'));
  await service.deleteLabel('TEST.000111');assert(h.transactions.at(-1).committed);
  assert(h.queries.some(x=>x.tx&&x.q.includes(`DELETE FROM BongkarSusunOutput${table}`)));
  h.setFail();await assert.rejects(()=>service.deleteLabel('TEST.000111'));assert(h.transactions.at(-1).rolledBack);
  const prod=h.load(`src/modules/produksi/${production}/${production}-produksi-service.js`);
  const label=await prod.createLabel({idJenisKayu:1,idGrade:7,idBarangJadi:9,noBongkarSusun:'Z.000001',dateCreate:'2026-10-30',jam:'08:15',ukuran:[{tebal:25,lebar:100,panjang:1000,jmlhBatang:40}]});
  assert.equal(label,'TEST.000111');
  assert(h.params.some(p=>p[2]==='Z.000001'));assert(h.params.some(p=>p[2]==='2026-10-30'));
  assert(h.queries.some(x=>x.q.includes(`INSERT INTO BongkarSusunOutput${table}`)));
  if(id!=='fj'){
    const q=h.queries.find(x=>x.q.includes('INSERT INTO')&&x.q.includes('COMMIT TRANSACTION'))?.q;
    assert(q&&q.includes('ROLLBACK TRANSACTION'));assert(q.indexOf('BongkarSusun_h WITH')<q.indexOf(`INSERT INTO ${table}_h`));
  }
  console.log(`PASS ${id}: list total + legacy contract, edit, transactional delete/rollback, date and BS create link`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
