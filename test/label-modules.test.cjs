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
function stHarness(kbGroupId=6,labelGroups={5:6,2:7}){
  const queries=[],transactions=[];
  class Transaction{constructor(){transactions.push(this);}async begin(){this.began=true;}async commit(){this.committed=true;}async rollback(){this.rolledBack=true;}}
  class Request{constructor(tx){this.tx=tx;this.values=[];}input(...v){this.values.push(v);return this;}async query(q){queries.push({q,tx:this.tx});
    if(q.includes('C.Jenis AS JenisKB'))return {recordset:kbGroupId==null?[]:[{NoKayuBulat:'A.000001',IdGroup:kbGroupId}]};
    if(q.includes('KbIdGroup')){
      const idInput=this.values.find(v=>v[0]==='idJenisKayu');
      const labelId=idInput?.[2];
      return {recordset:kbGroupId==null?[]:[{KbIdGroup:kbGroupId,LabelIdGroup:labelGroups[labelId]}]};
    }
    if(q.includes("SELECT 'E.'"))return {recordset:[{NoST:'E.000777'}]};
    return {recordset:[],rowsAffected:[1]};
  }}
  const db={sql:{Request,Transaction,VarChar:()=>{},Decimal:()=>{},Int:'int',Bit:'bit',Date:'date'},poolPromise:Promise.resolve({request:()=>new Request()})};
  function load(file){const module={exports:{}};vm.runInNewContext(fs.readFileSync(root+file,'utf8'),{module,console,require:n=>n.includes('/db')?db:n.includes('print-limit')?{claimPrint:async()=>true,releasePrint:async()=>{}}:n.includes('upah-stick')?{parseJumlahTingkat:()=>undefined,simpanUpahStick:async()=>null,hitungUlangUpahStick:async()=>null,previewUpah:async()=>({tingkat:1,upah:999}),bacaUpahStick:async()=>({})}:{}});return module.exports;}
  return {queries,transactions,load};
}
function upahHarness(tarifRow={TarifBundlePendek:1000,TarifBundlePanjang:1500}){
  const queries=[];
  class Request{constructor(tx){this.tx=tx;this.values=[];}input(...v){this.values.push(v);return this;}async query(q){queries.push(q);
    if(q.includes('OBJECT_ID'))return {recordset:[{ok:1}]};
    if(q.includes('MstTarifUpahStick'))return {recordset:tarifRow?[tarifRow]:[]};
    return {recordset:[],rowsAffected:[1]};}}
  const db={sql:{Request,VarChar:()=>{},Decimal:()=>{},Int:'int',Date:'date'},poolPromise:Promise.resolve({request:()=>new Request()})};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(root+'src/modules/label/st/upah-stick.js','utf8'),{module,exports:module.exports,console,require:n=>n.includes('/db')?db:n.includes('http-error')?{badReq:(m)=>{const e=Error(m);e.statusCode=400;return e;}}:{}});
  return {svc:module.exports,queries};
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
  const st=stHarness(),stService=st.load('src/modules/label/st/label-st-service.js');
  const lookup=await stService.lookupNoKB('A.000001');
  assert.equal(lookup.IdGroup,6);
  assert(st.queries.some(x=>x.q.includes('C.IdGroup')&&!x.q.includes('C.IsLokal')&&!x.q.includes('C.IsInternal')));
  await stService.getMasters();
  const masterQuery=st.queries.find(x=>x.q.includes('FROM MstJenisKayu WHERE IsST = 1'));
  assert(masterQuery&&masterQuery.q.includes('IdGroup')&&!masterQuery.q.includes('IsLokal')&&!masterQuery.q.includes('IsInternal'));
  await stService.createLabel({noST:'E.000777',idJenisKayu:5,noKayuBulat:'A.000001',details:[]});
  assert(st.transactions.at(-1).committed);
  assert(st.queries.some(x=>x.q.includes('FROM KayuBulat_h kb WITH (UPDLOCK, HOLDLOCK)')));
  assert(st.queries.some(x=>x.q.includes('INNER JOIN MstJenisKayu k WITH (UPDLOCK, HOLDLOCK)')));
  const beforeMismatch=st.queries.length;
  await assert.rejects(()=>stService.createLabel({noST:'E.000778',idJenisKayu:2,noKayuBulat:'A.000001'}),e=>e.statusCode===400&&e.message.includes('satu kelompok'));
  assert(st.transactions.at(-1).rolledBack);
  assert.equal(st.queries.length,beforeMismatch+1);
  const beforeUpdate=st.queries.length;
  await assert.rejects(()=>stService.updateLabel('E.000777',{idJenisKayu:2,noKayuBulat:'A.000001'}),e=>e.statusCode===400&&e.message.includes('satu kelompok'));
  assert.equal(st.queries.length,beforeUpdate+1);
  await stService.updateLabel('E.000777',{idJenisKayu:5,noKayuBulat:'A.000001'});
  assert(st.queries.at(-1).q.includes('UPDATE ST_h'));
  assert(st.queries.at(-1).tx);
  assert(st.transactions.at(-1).committed);
  await assert.rejects(()=>stService.createLabel({idJenisKayu:null,noKayuBulat:'A.000001'}),e=>e.statusCode===400&&e.message.includes('Jenis kayu wajib diisi'));
  const controller={exports:{}};
  vm.runInNewContext(fs.readFileSync(root+'src/modules/label/st/label-st-controller.js','utf8'),{exports:controller.exports,console,require:name=>name.includes('-service')?stService:name.includes('upah-stick')?{parseJumlahTingkat:()=>undefined,simpanUpahStick:async()=>null,hitungUlangUpahStick:async()=>null,previewUpah:async()=>({tingkat:1,upah:999}),bacaUpahStick:async()=>({})}:{}});
  let statusCode;
  await controller.exports.createLabel({body:{idJenisKayu:2,noKayuBulat:'A.000001'}},{status(code){statusCode=code;return this;},json(){return this;}});
  assert.equal(statusCode,400);
  const missing=stHarness(null),missingService=missing.load('src/modules/label/st/label-st-service.js');
  await assert.rejects(()=>missingService.createLabel({idJenisKayu:5,noKayuBulat:'A.404'}),e=>e.statusCode===400&&e.message.includes('tidak ditemukan'));
  console.log('PASS st: No Kayu Bulat dan jenis kayu label wajib satu IdGroup saat create/update');
  let previewBody;
  await controller.exports.previewUpah({body:{jumlahTingkat:1}},{status(code){assert.equal(code,200);return this;},json(body){previewBody=body;return this;}});
  assert.equal(previewBody.data.upah,999);
  const upah=upahHarness();
  const dasar={idJenisKayu:5,dateCreate:'2026-11-01',idUOMTblLebar:1,idUOMPanjang:4,jumlahTingkat:3};
  const panjang=await upah.svc.previewUpah({...dasar,details:[{tebal:25,panjang:4,jmlhBatang:10},{tebal:25,panjang:3,jmlhBatang:10}]});
  assert.equal(panjang.jenisBundle,'PANJANG');assert.equal(panjang.tarif,1500);assert.equal(panjang.upah,4500);
  const pendek=await upah.svc.previewUpah({...dasar,details:[{tebal:25,panjang:3,jmlhBatang:10},{tebal:25,panjang:2,jmlhBatang:10}]});
  assert.equal(pendek.jenisBundle,'PENDEK');assert.equal(pendek.tarif,1000);assert.equal(pendek.upah,3000);
  const tanpaTingkat=await upah.svc.previewUpah({...dasar,jumlahTingkat:undefined,details:[]});
  assert.equal(tanpaTingkat.upah,null);assert.match(tanpaTingkat.keterangan,/belum diisi/);
  await assert.rejects(()=>upah.svc.previewUpah({...dasar,jumlahTingkat:1000,details:[]}),e=>e.statusCode===400);
  const tanpaTarif=upahHarness(null);
  const gagal=await tanpaTarif.svc.previewUpah({...dasar,details:[{tebal:25,panjang:4,jmlhBatang:10}]});
  assert.match(gagal.keterangan,/Tarif belum diatur/);
  console.log('PASS st: preview upah memakai tarif bundle yang sama dengan simpan, tanpa menulis database');
})().catch(e=>{console.error(e);process.exitCode=1;});
