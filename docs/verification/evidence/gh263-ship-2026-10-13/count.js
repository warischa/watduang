const fs=require("fs");const dir=process.argv[2];
for(const w of ["320","1440"]){const d=JSON.parse(fs.readFileSync(dir+"/"+w+".json","utf8"));
let tot=0,rows=0,ube=0;const g={};
for(const p of d.pages){tot+=p.under44;for(const r of p.under44Rows){rows++;if(r.underByEffective)ube++;
 const k=r.component+" | "+r.tag+(r.classes?"."+r.classes.split(" ").join("."):"")+" | h"+Math.round(r.h)+" eff"+Math.round(r.effH);
 g[k]=g[k]||{n:0,u:0,pages:new Set()};g[k].n++;if(r.underByEffective)g[k].u++;g[k].pages.add(p.path);}}
console.log("== W"+w,"under44",tot,"rows",rows,"underByEffective",ube);
for(const [k,v] of Object.entries(g).sort((a,b)=>b[1].n-a[1].n))console.log(v.n,"ube"+v.u,"pages"+v.pages.size,k);}
