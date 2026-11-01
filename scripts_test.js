const fs=require('fs');const {parse}=require('csv-parse/sync');
const {buildDraft}=require('./lib/model');const {build}=require('./lib/deck');
const recs=parse(fs.readFileSync('sample/sample-data.csv'),{columns:true}).map(r=>({channel:{'Private Messages':'pm','Public Comments':'pc','Seeded Posts':'sp','Seeded Replies':'sr'}[r.Channel],theme:r['Inquiry Theme'],count:+r.Count,message:r['Actual Message'],response:r['Response / Seeded Reply'],period:r.Period}));
const rep=buildDraft({meta:{start:'2026-09-24',end:'2026-10-07'},records:recs});
fs.writeFileSync(process.argv[2]+'/draft.json',JSON.stringify(rep,null,1));
build(rep).writeFile({fileName:process.argv[2]+'/t.pptx'}).then(()=>console.log('built'));
