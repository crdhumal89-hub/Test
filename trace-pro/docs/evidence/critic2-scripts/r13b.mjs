/** My own tie-out for the other three R13 exports, plus the two exports no shipped test covers. */
import { openBrowser, watch, settle, save, BASE } from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path'; import * as XLSX from 'xlsx';
const TMP = '/tmp/claude-0/-home-user-Test/9010d790-6dea-5fb2-b3d6-f01548d88492/scratchpad/dl2';
fs.mkdirSync(TMP, { recursive: true });
function parseCsv(t){const rs=[];let r=[],c='',q=false;for(let i=0;i<t.length;i++){const ch=t[i];
 if(q){if(ch==='"'&&t[i+1]==='"'){c+='"';i++;}else if(ch==='"')q=false;else c+=ch;}
 else if(ch==='"')q=true;else if(ch===','){r.push(c);c='';}else if(ch==='\n'){r.push(c);rs.push(r);r=[];c='';}else if(ch!=='\r')c+=ch;}
 if(c!==''||r.length){r.push(c);rs.push(r);}return rs;}
const usd=(x)=>(x<0?'-$':'$')+Math.abs(x).toLocaleString('en-US',{maximumFractionDigits:0});
const parens=(x)=>{const c=Math.abs(x).toLocaleString('en-US',{maximumFractionDigits:0});return x<0?`($${c})`:`$${c}`;};
const { browser, context } = await openBrowser();
const out = {};
async function dl(page, re, tag){const w=page.waitForEvent('download',{timeout:30000});
 await page.getByRole('button',{name:new RegExp(re,'i')}).first().click();const d=await w;
 const f=path.join(TMP,`${tag}-${d.suggestedFilename()}`);await d.saveAs(f);
 return {f,bytes:fs.statSync(f).size,name:d.suggestedFilename()};}
const sv=(page,k)=>page.evaluate((k)=>{const n=document.querySelector(`[data-parity="${k}"]`);if(!n)return null;
 const b=n.getBoundingClientRect();const s=getComputedStyle(n);
 return {text:(n.textContent??'').replace(/\s+/g,' ').trim(),visible:b.height>0&&s.display!=='none'&&!n.closest('[hidden]')};},k);

for (const basis of ['before','after']) {
  const page = await context.newPage(); const problems = watch(page);
  await page.goto(`${BASE}/#/reconciliation`,{waitUntil:'load'});
  await page.waitForFunction(()=>!document.documentElement.dataset.fetching); await settle(page);
  await page.locator(`#view-toggle button[data-view="${basis}"]`).click(); await settle(page);
  // 1. look-through CSV
  const csv = await dl(page,'export csv',`lt-${basis}`);
  const rows = parseCsv(fs.readFileSync(csv.f,'utf8'));
  const head = rows[1]; const body = rows.slice(2);
  const at=(n)=>head.indexOf(n);
  const prod = body.find((r)=>r[at('Kind')]==='product');
  const ltCol = basis==='after' ? 'Look-through value at repriced marks USD' : 'Look-through value USD';
  const ties = [];
  for (const [fileCol,key,fmt] of [[ltCol,'reconciliation.totals.derived_mv',usd],
    ['Repriced value USD','reconciliation.totals.revised_mv',usd],['NAV USD','reconciliation.totals.nav',usd]]) {
    const num = Number(prod[at(fileCol)]); const s = await sv(page,key);
    ties.push({fileCol,fileValue:prod[at(fileCol)],formatted:fmt(num),key,screen:s?.text,visible:s?.visible,tie:fmt(num)===s?.text});
  }
  // 2. reconciliation workbook
  const xl = await dl(page,'download excel',`recon-${basis}`);
  const book = XLSX.read(fs.readFileSync(xl.f),{type:'buffer'});
  const summary = XLSX.utils.sheet_to_json(book.Sheets['Summary'],{header:1,raw:true,defval:null});
  const cell=(l)=>{const r=summary.find((r)=>String(r[0]??'').trim()===l);return r?r[1]:undefined;};
  const wf=(s)=>basis==='after'?`reconciliation.after.${s}`:`reconciliation.waterfall.${s}`;
  const startLabel = basis==='after'?'Look-through value at repriced marks':'Look-through value';
  const xlTies=[];
  for (const [label,slot,fmt] of [[startLabel,basis==='after'?'repriced_mv':'derived_mv',usd],
    ['= NAV','nav',usd],['+ Pricing difference','delta_pricing_usd',parens],['+ Non-position difference','delta_nonposition_usd',parens]]) {
    const num=Number(cell(label)); const s=await sv(page,wf(slot));
    xlTies.push({label,fileValue:cell(label),formatted:fmt(num),key:wf(slot),screen:s?.text,visible:s?.visible,tie:fmt(num)===s?.text});
  }
  out[`lookthroughCsv-${basis}`]={file:csv,basisRow:rows[0],ties,sheets:undefined,problems};
  out[`reconWorkbook-${basis}`]={file:xl,sheets:book.SheetNames,ties:xlTies};
  // 3. pricing workbook
  await page.evaluate(()=>(location.hash='#/pricing')); await settle(page);
  const pxl = await dl(page,'download excel',`pricing-${basis}`);
  const pb = XLSX.read(fs.readFileSync(pxl.f),{type:'buffer'});
  const sheet = XLSX.utils.sheet_to_json(pb.Sheets['Pricing'],{header:1,raw:true,defval:null});
  const ph = sheet[0].map(String); const prow = sheet.slice(1).find((r)=>String(r[ph.indexOf('Code')])==='ASCHON');
  const ptTies=[];
  for (const [c,key,fmt] of [['NAV','pricing.walk.fund.ASCHON.nav',usd],['Look-through value','pricing.walk.fund.ASCHON.value_before',usd],['Repriced value','pricing.walk.fund.ASCHON.value_after',usd]]) {
    const num=Number(prow[ph.indexOf(c)]); const s=await sv(page,key);
    ptTies.push({c,fileValue:prow[ph.indexOf(c)],formatted:fmt(num),key,screen:s?.text,visible:s?.visible,tie:fmt(num)===s?.text});
  }
  out[`pricingWorkbook-${basis}`]={file:pxl,sheets:pb.SheetNames,ties:ptTies};
  // 4. the two exports no shipped test ties
  const pcsv = await dl(page,'^CSV$',`pricingcsv-${basis}`);
  out[`pricingCsv-${basis}`]={file:pcsv,header:parseCsv(fs.readFileSync(pcsv.f,'utf8'))[0],rowCount:parseCsv(fs.readFileSync(pcsv.f,'utf8')).length-1};
  await page.close();
}
{
  const page = await context.newPage();
  await page.goto(`${BASE}/#/diagnose/data-quality`,{waitUntil:'load'});
  await page.waitForFunction(()=>!document.documentElement.dataset.fetching); await settle(page);
  const d = await dl(page,'download all issues','dq');
  out.dataQualityCsv={file:d,header:parseCsv(fs.readFileSync(d.f,'utf8'))[0],rowCount:parseCsv(fs.readFileSync(d.f,'utf8')).length-1};
  await page.close();
}
for (const [k,v] of Object.entries(out)) {
  console.log('==',k, v.file?.name, v.file?.bytes+'B',
    v.ties ? '| ties: ' + v.ties.map((t)=>`${t.fileCol??t.label??t.c}=${t.tie?'OK':'MISMATCH('+t.formatted+' vs '+t.screen+')'}${t.visible===false?' [NOT VISIBLE]':''}`).join(' ; ') : '| rows ' + v.rowCount);
}
save('critic2-r13b.json', out);
await browser.close();
