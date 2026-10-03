/* AeroPulse · application (démo et données réelles). */
(function(){
"use strict";
/* ---------- utilitaires ---------- */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
var R=rng(20261003);
function pad(n){return String(n).padStart(2,"0");}
function hhmm(m){m=((Math.round(m)%1440)+1440)%1440;return pad(Math.floor(m/60))+":"+pad(m%60);}
function pct(x,d){return isFinite(x)?(x*100).toFixed(d==null?1:d):"—";}
function fmt(n){return isFinite(n)?Math.round(n).toLocaleString("fr-FR"):"—";}
function fx(n,d){return isFinite(n)?n.toFixed(d):"—";}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function hav(a,b){var t=Math.PI/180,dl=(b.lat-a.lat)*t,dn=(b.lon-a.lon)*t,x=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dn/2)*Math.sin(dn/2);return 12742*Math.asin(Math.sqrt(x));}
function dur(m){m=Math.max(0,Math.round(m));var h=Math.floor(m/60);return(h?h+" h ":"")+pad(m%60)+" min";}

/* ---------- horloge (heure de Paris) ---------- */
function parisNow(){
  try{var p=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),g={};
    p.forEach(function(x){g[x.type]=x.value;});return(+g.hour%24)*60+(+g.minute)+(+g.second)/60;}
  catch(e){var d=new Date();return d.getHours()*60+d.getMinutes();}
}
var d0=new Date(),utcNow=d0.getUTCHours()*60+d0.getUTCMinutes()+d0.getUTCSeconds()/60;
var START=parisNow(),OFFSET=Math.round((START-utcNow)/60)*60;OFFSET=((OFFSET+720)%1440+1440)%1440-720;
var REPLAY=false;
if(START<6*60+20||START>23*60+20){START=14*60;REPLAY=true;document.getElementById("replayTag").hidden=false;}
var simNow=START,speed=20,lastTs=performance.now();
var CF_DEP=23*60+15,CF_ARR=23*60+30,CF_END=6*60;   /* couvre-feu Orly : départ du poste avant 23:15, aucun mouvement 23:30–06:00 */

/* ---------- référentiel ---------- */
var AP={
 ORY:{n:"Paris-Orly",lat:48.72,lon:2.38,reg:"Hub"},
 NCE:{n:"Nice",lat:43.66,lon:7.21,reg:"France"},TLS:{n:"Toulouse",lat:43.63,lon:1.37,reg:"France"},MRS:{n:"Marseille",lat:43.44,lon:5.22,reg:"France"},
 MPL:{n:"Montpellier",lat:43.58,lon:3.96,reg:"France"},BIQ:{n:"Biarritz",lat:43.47,lon:-1.52,reg:"France"},BES:{n:"Brest",lat:48.45,lon:-4.42,reg:"France"},PGF:{n:"Perpignan",lat:42.74,lon:2.87,reg:"France"},
 AJA:{n:"Ajaccio",lat:41.92,lon:8.80,reg:"Corse"},BIA:{n:"Bastia",lat:42.55,lon:9.48,reg:"Corse"},
 LIS:{n:"Lisbonne",lat:38.77,lon:-9.13,reg:"Europe"},OPO:{n:"Porto",lat:41.24,lon:-8.68,reg:"Europe"},MAD:{n:"Madrid",lat:40.47,lon:-3.56,reg:"Europe"},
 BCN:{n:"Barcelone",lat:41.30,lon:2.08,reg:"Europe"},FCO:{n:"Rome",lat:41.80,lon:12.25,reg:"Europe"},AGP:{n:"Malaga",lat:36.67,lon:-4.50,reg:"Europe"},FAO:{n:"Faro",lat:37.01,lon:-7.97,reg:"Europe"},
 ALG:{n:"Alger",lat:36.69,lon:3.22,reg:"Maghreb"},ORN:{n:"Oran",lat:35.62,lon:-0.62,reg:"Maghreb"},CZL:{n:"Constantine",lat:36.28,lon:6.62,reg:"Maghreb"},
 TUN:{n:"Tunis",lat:36.85,lon:10.23,reg:"Maghreb"},DJE:{n:"Djerba",lat:33.88,lon:10.78,reg:"Maghreb"},CMN:{n:"Casablanca",lat:33.37,lon:-7.59,reg:"Maghreb"},RAK:{n:"Marrakech",lat:31.61,lon:-8.04,reg:"Maghreb"},
 PTP:{n:"Pointe-à-Pitre",lat:16.27,lon:-61.53,reg:"Outre-mer"},FDF:{n:"Fort-de-France",lat:14.59,lon:-61.00,reg:"Outre-mer"},RUN:{n:"La Réunion",lat:-20.89,lon:55.51,reg:"Outre-mer"},CAY:{n:"Cayenne",lat:4.82,lon:-52.36,reg:"Outre-mer"},
 EWR:{n:"New York",lat:40.69,lon:-74.17,reg:"Amérique du Nord"}
};
var AL={SX:{n:"Seine Air",d:"Low-cost basée à Orly",base:true,m:1.1},LB:{n:"Ligne Bleue",d:"Domestique et Corse",base:true,m:.8},ME:{n:"Médina Express",d:"Spécialiste Maghreb",base:false,m:1.3},AV:{n:"Azur Vacances",d:"Loisirs",base:true,m:1},OC:{n:"Océane",d:"Long-courrier",base:false,m:.9}};
var TYPES={A320:{n:"A320",seats:180,co2:82,wide:false},A321:{n:"A321neo",seats:220,co2:68,wide:false},B738:{n:"B737-800",seats:189,co2:80,wide:false},A359:{n:"A350-900",seats:411,co2:66,wide:true},A332:{n:"A330-200",seats:340,co2:79,wide:true}};
var ROUTES=[
 ["SX","LIS","B738",4],["SX","OPO","B738",4],["SX","MAD","B738",3],["SX","BCN","B738",4],["SX","FCO","B738",3],["SX","AGP","B738",3],["SX","FAO","B738",3],["SX","RAK","B738",4],["SX","CMN","B738",3],["SX","TUN","B738",3],["SX","DJE","B738",2],["SX","ALG","B738",3],["SX","ORN","B738",2],["SX","NCE","B738",3],
 ["LB","NCE","A321",7],["LB","TLS","A321",7],["LB","MRS","A320",6],["LB","MPL","A320",5],["LB","BIQ","A320",4],["LB","BES","A320",4],["LB","AJA","A320",5],["LB","BIA","A320",5],["LB","PGF","A320",3],
 ["ME","ALG","A320",6],["ME","ORN","A320",4],["ME","CZL","A320",3],["ME","TUN","A320",4],["ME","CMN","A320",4],["ME","RAK","A320",3],["ME","DJE","A320",2],
 ["AV","AJA","A320",2],["AV","BIA","A320",2],["AV","DJE","A320",2],["AV","FAO","A320",2],["AV","AGP","A320",2],["AV","RAK","A320",2],["AV","TUN","A320",2],
 ["OC","PTP","A359",3],["OC","FDF","A359",3],["OC","RUN","A359",2],["OC","CAY","A332",1],["OC","EWR","A332",1]
];
var STANDS={"1":["11","12","13","14","15","16","17","18"],"2":["21","22","23","24","25","26","27","28","29","30"],"3":["31","32","33","34","35","36","37","38"],"4":["41","42","43","44","45","46","47","48"]};
function termOf(al,dest){var r=AP[dest].reg;if(r==="France"||r==="Corse")return"2";if(r==="Europe")return"1";if(r==="Maghreb")return al==="ME"?"4":"3";return"4";}
var REASONS=[["93","Rotation (avion en retard)",.30],["41","Technique",.13],["15","Embarquement",.14],["81","ATFM / contrôle aérien",.17],["71","Météo",.09],["63","Équipage",.08],["32","Chargement / assistance",.09]];
function reason(){var x=R(),c=0;for(var i=0;i<REASONS.length;i++){c+=REASONS[i][2];if(x<c)return REASONS[i];}return REASONS[0];}

/* ---------- génération du programme de la journée ---------- */
var MV=[],SLOTS=[],fno={SX:300,LB:6100,ME:700,AV:2400,OC:900},regN={};
function nextNo(al){fno[al]+=1+Math.floor(R()*3);return al+fno[al];}
function tail(al){regN[al]=(regN[al]||0)+1;var n=regN[al];return"F-H"+al.charAt(0)+String.fromCharCode(65+(n*7)%26)+String.fromCharCode(65+(n*11+3)%26);}
function blockOf(dest,ty){return Math.round(hav(AP.ORY,AP[dest])/(TYPES[ty].wide?840:760)*60+24);}
function genDelay(al){var x=R(),d;if(x<.025)return -1;if(x<.66)d=Math.floor(R()*12);else if(x<.88)d=12+Math.floor(R()*20);else d=32+Math.floor(R()*70);return Math.round(d*AL[al].m);}
function base(al,dest,ty,tl,dir){return{al:al,id:nextNo(al),dir:dir,from:dir==="D"?"ORY":dest,to:dir==="D"?dest:"ORY",dest:dest,ty:ty,reg:tl,seats:TYPES[ty].seats,term:termOf(al,dest)};}
function mkArr(al,dest,ty,tl,sta){
  var f=base(al,dest,ty,tl,"A"),b=blockOf(dest,ty),d=genDelay(al);
  f.sta=Math.round(sta/5)*5;f.std=f.sta-b;
  if(d<0){f.cx=true;d=0;}
  f.delay=d;f.atd=f.std+d;f.ata=Math.max(f.sta-12,f.sta+d+Math.round(R()*14-8));
  f.rsn=d>5?reason():null;f.pax=f.cx?0:Math.round(f.seats*(.6+R()*.38));f.taxi=4+R()*5;
  if(!f.cx&&f.ata>CF_ARR)f.cf=true;
  MV.push(f);return f;
}
function mkDep(al,dest,ty,tl,std,prev){
  var f=base(al,dest,ty,tl,"D"),b=blockOf(dest,ty),d=genDelay(al);
  f.std=Math.round(std/5)*5;f.sta=f.std+b;
  if(d<0||(prev&&prev.cx)){f.cx=true;d=0;}
  f.rsn=d>5?reason():null;
  if(prev&&!prev.cx){var minTurn=TYPES[ty].wide?95:35,late=Math.round(prev.ata+minTurn-f.std);if(late>d){d=late;f.rsn=REASONS[0];}}
  f.delay=d;f.atd=f.std+d;
  var hr=Math.floor(f.std/60),peak=(hr>=7&&hr<=9)||(hr>=18&&hr<=20);
  f.taxi=9+R()*8+(peak?3+R()*3:0);
  f.ata=f.atd+f.taxi+b-12+Math.round(R()*10-5);
  f.pax=f.cx?0:Math.round(f.seats*(.6+R()*.38));
  if(!f.cx&&f.atd>CF_DEP)f.cf=true;
  MV.push(f);return f;
}
ROUTES.forEach(function(r){
  var al=r[0],dest=r[1],ty=r[2],n=r[3],wide=TYPES[ty].wide,fw=AL[al].base&&n>=2,lw=AL[al].base&&n>=3,m=n-(fw?1:0)-(lw?1:0);
  for(var k=0;k<n;k++){
    var tl=tail(al),j=k-(fw?1:0),u=m>0?(j+R()*.9)/m:R();
    if(fw&&k===0){var dp=mkDep(al,dest,ty,tl,6*60+R()*150,null);SLOTS.push({s:0,e:dp.atd,d:dp,term:dp.term});continue;}        /* 1re vague : avion ayant passé la nuit à Orly */
    if(lw&&k===n-1){var ar=mkArr(al,dest,ty,tl,21*60+30+R()*100);SLOTS.push({s:ar.ata,e:1440,a:ar,term:ar.term});continue;} /* dernière vague : nuit à Orly */
    var sta=6*60+20+u*(wide?14*60:15*60+30),turn=wide?130+R()*30:45+R()*20;
    var a=mkArr(al,dest,ty,tl,sta),d=mkDep(al,dest,ty,tl,a.sta+turn,a);
    SLOTS.push({s:a.cx?a.sta:a.ata,e:d.cx?a.sta+turn:d.atd,a:a,d:d,term:a.term});
  }
});
/* attribution des postes (au large si le terminal est plein) */
(function(){
  var busy={},remote=0;Object.keys(STANDS).forEach(function(t){STANDS[t].forEach(function(s){busy[s]=-100;});});
  SLOTS.sort(function(x,y){return x.s-y.s;});
  SLOTS.forEach(function(sl){
    if((sl.a&&sl.a.cx&&!sl.d)||(sl.d&&sl.d.cx&&!sl.a)){sl.stand=null;return;}
    var st=null;STANDS[sl.term].some(function(s){if(busy[s]+10<=sl.s){st=s;return true;}return false;});
    if(st){busy[st]=sl.e;}else{st="L"+(++remote%12+1);}
    sl.stand=st;if(sl.a)sl.a.stand=st;if(sl.d)sl.d.stand=st;
  });
})();
MV.sort(function(a,b){return ref(a)-ref(b);});
function ref(f){return f.dir==="D"?f.std:f.sta;}
var DAY_TOTAL=MV.length;

/* ---------- état d'un vol ---------- */
function isCx(f,t){if(f.real)return f.cx;return f.cx||(f.cf&&t>=(f.dir==="D"?CF_DEP:CF_ARR));}
function done(f,t){return !isCx(f,t)&&t>=(f.dir==="D"?f.atd:f.ata);}
function known(f,t){return f.dir==="D"?t>f.std-120:t>f.std-60;}
function late(f){return f.dir==="D"?f.delay:(f.real?f.etaShow:f.ata)-f.sta;}
function status(f,t){
  if(f.real)return realStatus(f,t);
  if(isCx(f,t)){if(f.cf)return f.dir==="D"?{l:"Annulé · couvre-feu",c:"bad"}:{l:"Dérouté vers CDG",c:"bad"};return{l:"Annulé",c:"bad"};}
  var k=known(f,t),risk=f.cf&&k;
  if(f.dir==="D"){
    if(t>=f.atd+f.taxi)return{l:"Décollé",c:"ok"};
    if(t>=f.atd)return{l:"Roulage",c:"air"};
    if(risk)return{l:"Risque couvre-feu",c:"bad"};
    if(t>=f.std-35)return f.delay>15&&t>f.std?{l:"Retardé",c:"warn"}:{l:"Embarquement",c:""};
    return f.delay>15&&k?{l:"Retard prévu",c:"warn"}:{l:"Programmé",c:""};
  }
  if(t>=f.ata)return{l:"Atterri",c:"ok"};
  if(risk)return{l:"Risque couvre-feu",c:"bad"};
  if(t>=f.atd)return{l:"En vol",c:"air"};
  return late(f)>15&&k?{l:"Retard prévu",c:"warn"}:{l:"Programmé",c:""};
}
function sev(f,t){
  if(isCx(f,t))return"bad";if(!known(f,t))return"";
  if(f.cf)return"bad";var l=late(f);if(l>30)return"bad";if(l>15)return"warn";return"";
}

/* ---------- calcul des KPI ---------- */
function kpis(t,flt){
  if(REAL)return realKpis(t,flt);
  var o={sch:0,cx:0,dep:0,depOT:0,arr:0,arrOT:0,dm:0,pax:0,seats:0,air:0,paxAir:0,taxiR:0,taxiRn:0,taxiA:0,taxiAn:0,tin:0,tinN:0,cf:0,pkm:0,co2:0,byR:{}};
  REASONS.forEach(function(r){o.byR[r[0]]=0;});
  MV.forEach(function(f){
    if(flt&&!flt(f))return;
    var cx=isCx(f,t);
    if(!cx&&t>=f.atd&&t<f.ata){o.air++;o.paxAir+=f.pax;}
    if(f.cf&&!cx&&known(f,t)&&!done(f,t))o.cf++;
    if(ref(f)>t)return;
    o.sch++;if(cx){o.cx++;return;}
    if(f.dir==="D"){if(t<f.atd)return;o.dep++;if(f.delay<=15)o.depOT++;o.dm+=Math.max(0,f.delay);if(f.rsn&&f.delay>5)o.byR[f.rsn[0]]+=f.delay;
      o.taxiA+=f.taxi;o.taxiAn++;if(f.atd>t-120){o.taxiR+=f.taxi;o.taxiRn++;}}
    else{if(t<f.ata)return;o.arr++;if(f.ata-f.sta<=15)o.arrOT++;o.tin+=f.taxi;o.tinN++;}
    var km=hav(AP[f.from],AP[f.to]);o.pax+=f.pax;o.seats+=f.seats;o.pkm+=f.pax*km;o.co2+=f.pax*km*TYPES[f.ty].co2;
  });
  o.otpD=o.dep?o.depOT/o.dep:NaN;o.otpA=o.arr?o.arrOT/o.arr:NaN;o.reg=o.sch?(o.sch-o.cx)/o.sch:NaN;o.dmF=o.dep?o.dm/o.dep:NaN;
  o.slf=o.seats?o.pax/o.seats:NaN;o.mv=o.dep+o.arr;o.taxi=o.taxiRn?o.taxiR/o.taxiRn:(o.taxiAn?o.taxiA/o.taxiAn:NaN);o.taxiAll=o.taxiAn?o.taxiA/o.taxiAn:NaN;
  o.taxiIn=o.tinN?o.tin/o.tinN:NaN;o.co2pk=o.pkm?o.co2/o.pkm:NaN;
  return o;
}
function series(key,n){var out=[];for(var i=n-1;i>=0;i--)out.push(kpis(simNow-i*60)[key]);return out;}

/* ---------- graphiques ---------- */
var CSS=getComputedStyle(document.documentElement);
function tok(n){return CSS.getPropertyValue(n).trim();}
function spark(vals,col){
  var first=vals.filter(isFinite)[0];if(first==null)first=0;var prev=first;
  vals=vals.map(function(v){if(isFinite(v)){prev=v;return v;}return prev;});
  var w=200,h=30,mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);if(mx-mn<1e-6){mx+=.5;mn-=.5;}
  var pts=vals.map(function(v,i){return[(i/(vals.length-1))*(w-6)+3,h-4-(v-mn)/(mx-mn)*(h-8)];});
  var d=pts.map(function(p,i){return(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1);}).join(" "),last=pts[pts.length-1];
  return'<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-hidden="true"><path d="'+d+' L'+last[0]+' '+h+' L3 '+h+' Z" fill="'+col+'" fill-opacity=".12"/><path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="2.6" fill="'+col+'"/></svg>';
}
function hoursSvg(t){
  var H0=6,H1=23,dep={},arr={},mx=0;
  for(var h=H0;h<=H1;h++){dep[h]=0;arr[h]=0;}
  MV.forEach(function(f){if(f.cx)return;var h=Math.floor(ref(f)/60);if(h<H0||h>H1)return;(f.dir==="D"?dep:arr)[h]++;});
  for(h=H0;h<=H1;h++)mx=Math.max(mx,dep[h],arr[h]);mx=Math.ceil(mx/5)*5||5;
  var W=420,Hh=160,l=26,r=6,top=8,bot=22,cw=(W-l-r)/(H1-H0+1),bw=cw/2-2,y=function(v){return top+(Hh-top-bot)*(1-v/mx);};
  var mut=tok("--muted"),ln=tok("--line"),acc=tok("--accent"),alt=tok("--bar-alt"),cur=Math.floor(t/60);
  var s='<svg viewBox="0 0 '+W+' '+Hh+'" role="img" aria-label="Mouvements programmés par heure">';
  [0,mx/2,mx].forEach(function(v){s+='<line x1="'+l+'" x2="'+(W-r)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="'+ln+'" stroke-width="1"/><text x="'+(l-5)+'" y="'+(y(v)+3.5)+'" text-anchor="end" font-size="10" fill="'+mut+'" font-family="IBM Plex Mono">'+v+'</text>';});
  for(h=H0;h<=H1;h++){
    var x=l+(h-H0)*cw+1,op=h<cur?1:(h===cur?1:.35);
    if(h===cur)s+='<rect x="'+(x-1)+'" y="'+top+'" width="'+cw+'" height="'+(Hh-top-bot)+'" fill="'+acc+'" fill-opacity=".08"/>';
    s+='<rect x="'+x+'" y="'+y(dep[h])+'" width="'+bw+'" height="'+(y(0)-y(dep[h]))+'" fill="'+acc+'" fill-opacity="'+op+'"><title>'+h+' h : '+dep[h]+' départs</title></rect>';
    s+='<rect x="'+(x+bw+1)+'" y="'+y(arr[h])+'" width="'+bw+'" height="'+(y(0)-y(arr[h]))+'" fill="'+alt+'" fill-opacity="'+op+'"><title>'+h+' h : '+arr[h]+' arrivées</title></rect>';
    if((h-H0)%3===0)s+='<text x="'+(x+cw/2-1)+'" y="'+(Hh-6)+'" text-anchor="middle" font-size="10" fill="'+mut+'" font-family="IBM Plex Mono">'+pad(h)+'h</text>';
  }
  return s+'</svg>';
}

/* ---------- navigation ---------- */
var IC={
 ov:'<path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
 fl:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 wx:'<path d="M7 18a4 4 0 1 1 .8-7.9A6 6 0 0 1 19 12a3 3 0 0 1-1 6Z"/><path d="m11 20-1 2M15 20l-1 2"/>',
 ap:'<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>',
 bm:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
 kp:'<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
 al:'<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17v.5"/>'
};
var WS=[["ov","Vue d'ensemble"],["fl","Vols"],["wx","Météo"],["ap","Plateforme"],["bm","Benchmark"],["kp","Catalogue KPI"],["al","Alertes"]];
var cur="ov";
try{var saved=localStorage.getItem("apo-ws");if(saved&&WS.some(function(w){return w[0]===saved;}))cur=saved;}catch(e){}
if(/^#(ov|fl|wx|ap|bm|kp|al)$/.test(location.hash))cur=location.hash.slice(1);
var nav=document.getElementById("nav");
nav.innerHTML=WS.map(function(w){return'<button data-ws="'+w[0]+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+IC[w[0]]+'</svg><span>'+w[1]+'</span></button>';}).join("")+
 '<div class="rail-foot" id="railFoot">Prototype indépendant, sans lien avec le gestionnaire de l\'aéroport. Compagnies et données fictives. Inspiré de <i>The Definitive Airline Operations &amp; KPI Guide</i>.</div>';
nav.addEventListener("click",function(e){var b=e.target.closest("button[data-ws]");if(b){stopWall();go(b.dataset.ws);}});
var main=document.getElementById("main");
function go(ws){
  cur=ws;try{localStorage.setItem("apo-ws",ws);}catch(e){}
  nav.querySelectorAll("button").forEach(function(b){if(b.dataset.ws===ws)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");});
  mapEl=null;
  main.scrollTop=0;render(true);
}

/* ---------- état UI ---------- */
var flView="dep",flAl="all",bmKpi="otpD",catQ="",catF="all",mapZone="eu";
var RULES=[
 {id:"otp",on:true,t:"La ponctualité départ baisse de 2 points ou plus en 60 min",d:"Comparée à la valeur d'il y a une heure, toutes compagnies."},
 {id:"cf",on:true,t:"Un vol risque de dépasser le couvre-feu",d:"Départ du poste estimé après 23:15 ou atterrissage estimé après 23:30."},
 {id:"dly",on:true,t:"Un vol dépasse 60 min de retard",d:"Une alerte par vol, dès que le retard est connu."},
 {id:"cx",on:true,t:"Un vol est annulé",d:"Départs et arrivées d'Orly."},
 {id:"taxi",on:true,t:"Le roulage sortie moyen dépasse 18 min",d:"Moyenne glissante sur les deux dernières heures."},
 {id:"wx",on:false,t:"Orage ou rafales > 30 kt sur Orly",d:"Source : METAR LFPO."}
];
var EVENTS=[],seen={},unread=0;

/* ---------- espaces de travail ---------- */
var wall=false,wallT=0,WALL_MS=20000;
function head(t,p,extra){return'<div class="progress" id="prog"'+(wall?'':' hidden')+'><i></i></div><div class="ws-head"><h1>'+t+'</h1><p>'+p+'</p><span class="spacer"></span>'+(extra?'<div class="tools">'+extra+'</div>':'')+'</div>';}
function cls(v,target,higher,warnBand){if(!isFinite(v))return"";var ok=higher?v>=target:v<=target,near=higher?v>=target-warnBand:v<=target+warnBand;return ok?"ok":near?"warn":"bad";}

function vOverview(first){
  var t=simNow,k=kpis(t),k1=kpis(t-60),colOf={ok:tok("--ok"),warn:tok("--warn"),bad:tok("--bad"),"":tok("--muted")};
  var tiles=[
   {l:"Ponctualité départ",v:pct(k.otpD),u:"%",tg:"Objectif 80 %",c:cls(k.otpD,.8,true,.05),s:series("otpD",12),dl:(k.otpD-k1.otpD)*100,hb:true},
   {l:"Ponctualité arrivée",v:pct(k.otpA),u:"%",tg:"Objectif 80 %",c:cls(k.otpA,.8,true,.05),s:series("otpA",12),dl:(k.otpA-k1.otpA)*100,hb:true},
   {l:"Mouvements",v:fmt(k.mv),u:"",tg:"sur "+DAY_TOTAL+" prévus · régularité "+pct(k.reg)+" %",c:cls(k.reg,.98,true,.015),s:series("mv",12),dl:k.mv-k1.mv,hb:true,abs:true},
   {l:"Passagers traités",v:fmt(k.pax),u:"",tg:"Remplissage "+pct(k.slf,0)+" %",c:cls(k.slf,.8,true,.06),s:series("pax",12),dl:k.pax-k1.pax,hb:true,abs:true},
   {l:"Roulage sortie moyen",v:fx(k.taxi,1),u:"min",tg:"Objectif ≤ 15 min · 2 dernières h",c:cls(k.taxi,15,false,3),s:series("taxi",12),dl:k.taxi-k1.taxi,hb:false,unit:" min"},
   {l:"Risque couvre-feu",v:isFinite(k.cf)?k.cf:"—",u:isFinite(k.cf)?"vols":"",tg:(REAL&&!HOME_CURFEW)?"Pas de couvre-feu configuré":"Poste ≤ "+hhmm(CF_DEP)+" · posé ≤ "+hhmm(CF_ARR),c:!isFinite(k.cf)?"":k.cf===0?"ok":k.cf===1?"warn":"bad",s:series("cf",12),dl:k.cf-k1.cf,hb:false,abs:true}
  ];
  var tilesH=tiles.map(function(x){
    var dl=isFinite(x.dl)?x.dl:0,dir=Math.abs(dl)<.05?"flat":((dl>0)===x.hb?"up":"down");
    var dtxt=x.abs?(dl>=0?"+":"−")+fmt(Math.abs(dl))+" en 1 h":(dl>=0?"+":"−")+Math.abs(dl).toFixed(1)+(x.unit||" pt")+" en 1 h";
    return'<div class="panel kpi '+x.c+'"><span class="label">'+x.l+'</span><span class="v">'+x.v+(x.u?'<small>'+x.u+'</small>':'')+'</span>'+spark(x.s,colOf[x.c])+'<span class="t"><span>'+x.tg+'</span><span class="delta '+dir+'">'+dtxt+'</span></span></div>';
  }).join("");
  var maxR=Math.max.apply(null,REASONS.map(function(r){return k.byR[r[0]];}))||1;
  var bars=REASONS.slice().sort(function(a,b){return k.byR[b[0]]-k.byR[a[0]];}).map(function(r){var v=k.byR[r[0]];return'<div class="bar"><span class="lab"><code>'+r[0]+'</code>'+r[1]+'</span><span class="track"><span class="fill" style="width:'+(v/maxR*100)+'%"></span></span><span class="n">'+fmt(v)+'</span></div>';}).join("");
  if(first||!document.getElementById("map")){
    var zone='<div class="seg" role="group" aria-label="Zone de la carte"><button data-zone="eu" aria-pressed="'+(mapZone==="eu")+'">Europe &amp; Maghreb</button><button data-zone="world" aria-pressed="'+(mapZone==="world")+'">Monde</button></div>';
    main.innerHTML=head("Vue d'ensemble",REAL?"Trafic de "+HOME_NAME+", toutes compagnies, données réelles":"Trafic de Paris-Orly, toutes compagnies, mis à jour en continu")+
    '<div class="ov"><section class="panel"><div class="panel-h"><h2>Vols vers et depuis '+(REAL?HOME_NAME:"Orly")+'</h2><span class="meta" style="margin-left:auto">'+zone+'</span></div><div class="map-wrap"><div id="map"></div>'+
    '<div class="map-stats" id="mapStats"></div><div class="map-legend"><span><i style="background:var(--ok)"></i>À l\'heure</span><span><i style="background:var(--bad)"></i>En retard &gt; 15 min</span></div></div></section>'+
    '<section class="kpis" id="tiles"></section></div>'+
    '<div class="row2"><section class="panel"><div class="panel-h"><h2>Retards par motif</h2><span class="meta">Minutes au départ, codes IATA</span></div><div class="panel-b bars" id="reasons"></div></section>'+
    '<section class="panel"><div class="panel-h"><h2>Mouvements par heure</h2><span class="meta">Programme du jour</span></div><div class="panel-b hours"><div id="hours"></div><div class="leg"><span><i style="background:var(--accent)"></i>Départs</span><span><i style="background:var(--bar-alt)"></i>Arrivées</span><span>Barres pâles : heures à venir</span></div></div></section>'+
    '<section class="panel"><div class="panel-h"><h2>Derniers événements</h2></div><div class="panel-b" style="padding-block:4px"><ul class="feed" id="feedOv"></ul></div></section></div>';
    initMap();
  }
  document.getElementById("tiles").innerHTML=tilesH;
  document.getElementById("reasons").innerHTML=bars||'<p class="note" style="margin:0">Aucun motif de retard transmis par la source de données.</p>';
  document.getElementById("hours").innerHTML=hoursSvg(t);
  document.getElementById("mapStats").innerHTML='<span><span class="label">En vol</span><b>'+k.air+'</b></span><span><span class="label">Pax en vol</span><b>'+fmt(k.paxAir)+'</b></span><span><span class="label">Annulés</span><b>'+k.cx+'</b></span>';
  document.getElementById("feedOv").innerHTML=feedHtml(6);
  updateMap();
}
main.addEventListener("click",function(e){
  var z=e.target.closest("[data-zone]");if(z){mapZone=z.dataset.zone;render(true);return;}
  var b=e.target.closest("[data-fv]");if(b){flView=b.dataset.fv;render(true);}
  if(e.target.closest("#impBtn")){var fi=document.getElementById("impFile");if(fi)fi.click();}
  if(e.target.closest("#impClose")){IMPORT_RESULT=null;render(true);}
});

/* carte autonome : fond de carte intégré, dessinée en SVG sans bibliothèque externe */
var WORLD="M612 -356l10 4l8 -2l2 -4l8 -2l6 -4l2 -8l8 -2l2 -2l4 2l4 0l4 0l8 2l4 2l6 -4l4 2l4 -4l6 0l0 -2l2 -4l4 -2l6 2l-2 2l4 0l-2 10l4 2l4 -2l4 0l6 -4l8 0l10 0l2 2l-6 2l-6 2l-10 0l-12 2l-6 6l2 4l2 4l-4 4l0 4l-4 4l-8 0l4 6l-8 2l-4 6l2 6l-4 4l-4 -2l-8 2l-2 2l-6 0l-6 6l0 10l-14 4l-6 -2l-2 2l-6 0l-10 0l-18 -4l10 -10l-2 -6l-6 -2l-2 -6l-2 -8l4 -6l-4 0l2 -8l4 -12zM164 58l2 8l2 6l2 4l4 4l8 0l2 -2l6 2l2 -2l2 -6l6 0l0 -2l6 0l0 2l12 0l0 8l2 4l-2 6l0 6l4 2l0 12l2 0l4 0l6 -2l6 2l0 2l0 6l0 4l0 4l0 4l-20 -2l-2 32l8 8l6 8l-18 4l-24 -2l-8 -4l-40 0l-2 0l-6 -4l-6 0l-6 2l-4 2l-2 -8l2 -8l4 -10l0 -4l4 -8l2 -4l6 -8l2 -4l2 -8l-2 -4l-2 -4l-2 -6l-4 -6l2 -2l2 -4l-2 -10l-2 -6l-6 -8l2 0l4 -2l2 0l4 -2l30 0zM124 56l-2 2l-2 -8l4 -4l2 -2l4 4l-4 2l-2 2l0 4zM206 -418l-2 2l2 6l4 2l0 2l-4 2l0 2l-4 6l-2 0l0 -4l-6 -2l0 -6l0 -6l2 -4l-2 0l0 -4l4 -4l2 0l2 2l4 2l0 4zM516 -242l2 0l0 2l8 -2l8 0l6 0l6 -6l8 -6l6 -6l2 2l2 8l-6 0l0 8l2 0l-4 2l0 4l-4 4l0 4l-2 4l-30 -6l-4 -10l0 -2zM-656 552l-8 0l-6 -4l-6 0l-10 0l0 -22l4 6l4 6l14 6l14 4l-6 4zM-650 220l6 8l4 -8l12 0l2 2l18 16l8 2l12 8l10 4l2 4l-10 16l10 2l12 2l8 -2l8 -8l2 -8l4 -2l6 6l0 8l-8 4l-8 4l-10 10l-14 14l-2 8l-4 10l0 10l-2 2l0 8l0 4l12 8l-2 8l6 4l0 6l-10 12l-14 6l-20 2l-12 -2l2 6l-2 8l2 4l-6 4l-10 2l-10 -4l-4 2l2 10l6 4l6 -4l4 6l-10 2l-8 6l-2 12l-2 4l-10 0l-6 6l-4 8l10 6l10 2l-4 10l-12 4l-6 12l-10 4l-4 6l4 10l6 6l-4 -2l-8 0l-26 -2l-4 -6l0 -8l-6 2l-4 -4l0 -10l8 -6l2 -6l0 -4l4 -10l4 -12l0 -6l4 -2l-2 -4l-4 -2l4 -4l-6 -4l-2 -12l4 -2l-2 -12l4 -10l2 -8l6 -4l-4 -10l0 -10l8 -6l0 -8l6 -10l0 -10l-2 -2l-6 -16l6 -10l0 -10l4 -10l6 -8l8 -8l-4 -2l2 -4l0 -16l10 -6l4 -10l-2 -2l10 -10l12 2zM436 -410l14 -2l2 2l4 2l-2 2l4 4l-2 4l4 2l4 2l2 6l-4 0l-4 -6l-6 0l-2 -4l-2 0l-4 -2l-8 -2l2 -6l-2 -2zM690 486l6 4l10 0l0 2l-4 6l-14 0l0 -6l0 -4l2 -2zM1454 408l10 4l6 -2l6 -2l6 0l2 12l-4 4l0 8l-4 -2l-8 6l-2 0l-6 0l-6 -10l-2 -6l-4 -8l0 -4l6 0zM1436 138l4 8l6 -4l2 4l6 4l-2 4l2 8l2 6l2 2l4 8l-2 4l4 8l10 4l8 6l6 4l0 2l4 6l4 12l4 -2l4 4l4 -2l0 10l8 6l4 4l8 8l4 8l0 6l-2 6l6 10l0 8l-2 4l-4 10l0 6l-2 6l-4 10l-6 4l-4 8l-4 6l-2 8l-4 4l-4 8l0 8l0 2l-6 4l-10 0l-10 4l-4 4l-6 4l-10 -4l-6 -2l2 -6l-6 2l-8 8l-8 -2l-6 -2l-6 0l-10 -4l-6 -6l-2 -8l-2 -4l-6 -4l-8 -2l2 -4l-2 -8l-4 6l-10 2l6 -4l2 -6l2 -6l0 -6l-8 8l-6 2l-4 8l-8 -4l0 -4l-6 -8l-6 -4l2 -2l-12 -6l-8 0l-8 -6l-18 2l-14 4l-10 2l-10 0l-12 6l-8 2l-2 4l-4 4l-8 2l-6 0l-10 -2l-6 2l-8 0l-6 6l-2 -2l-4 4l-6 2l-8 0l-6 0l-10 -6l-6 -2l0 -6l6 -2l2 -2l-2 -2l2 -8l-2 -6l-4 -10l-2 -6l0 -6l-4 -6l0 -2l-4 -4l-2 -8l-6 -8l0 -4l4 4l-4 -10l6 4l2 2l0 -4l-4 -8l-2 -4l-2 -2l2 -6l2 -2l0 -6l0 -6l4 -6l0 8l4 -8l8 -4l6 -4l8 -2l4 -2l2 2l8 -4l6 -2l2 -2l2 0l6 0l10 -4l6 -4l2 -4l6 -6l0 -4l2 -6l6 -8l4 8l4 -2l-2 -4l2 -4l4 2l2 -8l6 -6l2 -4l4 0l0 -4l6 2l0 -4l4 0l4 -2l8 4l6 6l6 0l6 2l-2 -6l4 -8l6 -2l-2 -2l4 -6l6 -4l6 2l8 -2l0 -6l-8 -4l6 0l6 2l6 4l8 2l2 0l6 2l6 -2l4 0l2 -2l6 6l-4 4l-2 4l-4 2l0 4l-2 4l-4 6l2 2l6 6l8 2l6 4l8 6l2 0l6 2l0 4l10 4l6 -4l2 -6l2 -4l2 -6l4 -8l-2 -4l0 -4l0 -6l0 -6l2 -2l-2 -4l4 -6l2 -4l0 -4l4 -4l2 6l0 6l4 2l0 4l4 4l0 6l0 4zM170 -482l0 4l-6 0l2 4l-4 6l-2 2l-8 0l-6 2l-8 -2l-14 -2l-2 -4l-10 2l-2 2l-6 0l-4 -2l-6 -2l2 -2l0 -2l2 0l6 2l2 -2l8 0l8 -2l4 2l4 2l0 -2l-2 -6l4 -2l4 -4l8 2l6 -4l2 0l8 2l4 0l6 2l-2 2l2 2zM450 -398l2 4l6 0l4 6l-8 0l-4 -6l-2 -4l2 0zM474 -412l4 0l2 -2l6 -4l6 6l4 6l4 0l4 4l-8 0l-2 8l-2 4l-4 2l0 4l-2 2l-6 -6l4 -4l-4 -4l-4 0l-10 8l-2 -6l-4 -2l-4 -2l2 -4l-4 -4l2 -2l-4 -2l-2 -2l2 -2l8 2l6 2l0 -2l-4 -6l2 0l2 0l8 6zM294 44l-2 -12l-2 -4l6 2l4 -6l4 0l2 4l2 2l0 4l-2 2l-4 4l-4 4l-4 0zM34 -514l6 2l10 -2l6 4l6 2l-2 6l-2 2l-2 4l-8 -4l-6 0l-6 -4l-4 -4l-6 0l0 -4l8 -2zM26 -62l-8 0l-2 -6l0 -24l-2 -2l0 -4l-4 -4l-2 -2l0 -6l4 -2l2 -4l6 0l2 -4l2 -2l4 0l8 6l0 2l2 6l-2 4l2 4l-6 6l-2 2l-2 6l0 8l-2 16zM-28 -96l-8 -4l-4 2l-4 2l-4 -2l-2 -4l-4 -2l0 -6l2 -4l0 -4l8 -8l2 -6l2 -2l4 0l4 -2l2 -2l8 -4l2 -4l10 -4l4 -2l4 2l6 0l-2 6l2 4l6 6l0 6l12 2l0 6l-2 4l-6 0l-2 4l-4 2l-8 0l-4 0l-4 0l-4 0l-18 0l0 6l2 8zM926 -220l0 6l-2 0l0 8l-4 -6l0 -6l-2 -4l-4 -6l-10 0l2 4l-4 6l-4 -2l0 2l-4 -2l-4 0l-2 -8l-2 -8l0 -6l-6 -4l4 -2l6 -4l-8 -6l4 -6l8 4l4 0l2 8l8 0l10 0l6 2l-4 8l-6 2l-2 4l6 6l0 -6l4 0l4 16zM226 -442l4 4l4 0l8 0l14 2l4 -4l12 -2l8 4l6 0l-6 6l-4 6l4 6l-8 -2l-10 4l0 4l-10 2l-8 -4l-8 2l-6 0l-2 -6l-4 -4l2 0l-2 -2l2 -2l4 -4l-4 -4l-2 -4l2 -2zM-776 -238l-2 0l-2 -4l-4 -4l2 -6l4 0l2 8l0 6zM-778 -266l-12 2l0 -4l4 0l8 0l0 2zM-770 -266l-2 8l-2 -2l0 -6l-4 -4l8 4zM190 -448l4 0l-2 4l4 4l-2 4l-2 0l-2 2l-2 2l-2 6l-10 -4l-4 -4l-2 -2l-6 -4l-2 -4l-4 -4l2 -4l4 2l2 -2l4 0l8 2l8 0l4 2zM234 -540l10 0l12 -2l2 -6l8 -4l-2 -4l8 -2l10 -4l10 2l2 4l4 -2l10 2l2 6l-2 2l6 6l4 2l0 2l6 2l2 2l-2 2l-10 0l0 2l2 2l2 6l-8 2l-4 2l0 4l-4 0l-10 0l-2 -2l-4 2l-4 -2l-8 0l-10 -2l-10 -2l-8 2l-6 2l-4 0l0 -4l-4 -4l6 -2l0 -4l-2 -4l-2 -6zM-892 -178l0 -2l2 0l2 2l4 -6l2 0l0 4l0 4l0 2l-2 2l2 2l-2 4l-2 4l-2 0l-2 4l-2 0l0 -12l0 -8zM-648 -324l0 2l0 -2l0 2l0 -2l2 0l-2 0l2 0l-2 0zM-628 220l-12 0l-4 8l-6 -8l-12 -2l-10 10l-6 0l-4 -14l-6 -10l4 -10l-6 -4l-2 -8l-4 -6l6 -10l-4 -10l2 -2l-2 -4l4 -6l0 -8l2 -8l2 -2l-10 -16l8 0l6 0l2 -2l8 -4l6 -4l12 -2l0 8l0 2l0 8l10 8l12 2l4 4l6 2l4 2l8 0l4 4l2 6l2 2l0 4l-4 0l4 12l20 0l-2 6l2 4l4 4l4 6l-2 8l-4 4l2 6l-4 2l0 -4l-10 -4l-8 0l-18 2l-4 10l0 4l-4 12l-2 -2zM-576 302l14 -14l10 -10l8 -4l8 -4l0 -8l-6 -6l-4 2l2 -6l2 -6l0 -6l-4 -2l-4 2l-4 0l-2 -4l0 -10l-2 -2l-6 -4l-4 2l-12 -2l2 -12l-4 -6l4 -2l-2 -6l4 -4l2 -8l-4 -6l-4 -4l-2 -4l2 -6l-20 0l-4 -12l4 0l0 -4l-2 -2l-2 -6l-4 -4l-8 0l-4 -2l-6 -2l-4 -4l-12 -2l-10 -8l0 -8l0 -2l0 -8l-12 2l-6 4l-8 4l-2 2l-6 0l-8 0l-4 2l-6 -2l2 -16l-10 6l-8 0l-4 -4l-6 -2l2 -4l-6 -6l-4 -8l2 -2l0 -4l6 -4l0 -6l2 -2l2 -6l10 -6l8 -2l2 -2l10 0l4 -26l0 -4l-2 -6l-4 -4l0 -8l6 -2l2 2l0 -4l-6 0l0 -8l20 2l2 -4l4 2l2 6l2 0l4 4l8 0l2 -2l8 -4l4 0l2 -6l6 -2l0 -2l-8 0l-2 -8l0 -6l-4 -2l2 -2l8 2l8 2l2 -2l8 -2l10 -4l4 -4l-2 -2l6 0l2 2l-2 4l4 2l2 4l-2 4l-2 8l2 6l2 4l6 4l4 2l2 -2l2 -2l6 0l2 -4l6 2l2 0l6 0l0 -2l0 -2l0 -4l4 2l6 -2l4 2l6 2l2 -2l2 0l2 4l4 -2l4 -4l4 -6l6 -10l2 0l4 6l4 16l6 2l0 8l-6 8l2 2l18 2l0 10l8 -6l12 4l16 6l6 6l-2 4l12 -2l20 6l14 -2l14 10l14 10l8 4l8 0l4 2l4 14l0 6l-4 16l-4 6l-14 14l-6 12l-8 8l-2 0l-4 8l2 18l-4 16l0 6l-4 4l-2 14l-10 14l-2 10l-8 4l-2 6l-10 0l-16 4l-8 4l-10 2l-12 8l-8 10l-2 8l2 6l-2 10l-2 4l-8 6l-10 18l-10 8l-6 4l-6 10l-6 6l-2 -6l4 -4l-6 -8l-8 -6l-10 -6l-4 0l-10 -6l-6 0zM1142 -46l4 -4l8 -4l0 4l0 6l-6 0l-2 4l-4 -6zM916 -278l6 4l-2 6l-8 0l-8 0l-6 0l-10 -2l0 -2l6 -8l6 -2l8 2l4 0l4 2zM256 186l2 2l4 4l10 12l6 0l0 4l2 6l8 2l6 4l-14 8l-8 8l-4 6l-4 4l-4 0l-2 6l-2 2l-6 4l-8 -2l-4 -2l-4 -2l-6 4l-2 4l-4 2l-6 6l-8 0l-2 -4l2 -6l-6 -8l-4 -2l0 -30l10 0l2 -36l6 0l16 -4l4 4l6 -4l4 0l4 -2l2 2l4 8zM152 -74l10 0l0 -4l2 0l4 2l12 -2l4 -4l6 -4l-2 -4l2 0l10 0l10 -4l8 -12l4 -4l6 -2l2 4l6 8l0 4l-2 4l0 2l4 4l8 4l6 4l0 2l6 6l4 4l2 6l8 4l2 4l-4 0l-6 0l-8 0l-4 0l0 2l-4 2l-4 -4l-12 6l-4 -2l0 2l-4 6l-8 -2l-6 -2l-8 -2l-8 -4l-4 2l-4 6l-2 6l-6 0l-6 -2l-6 6l-6 10l0 -4l-2 -4l-4 -4l-4 -4l0 -4l-6 -6l2 -2l-2 -4l2 -8l2 -2l4 -10zM-636 -466l6 2l10 0l-6 4l-2 0l-14 -4l-2 -4l4 -2l4 4zM-618 -492l-4 2l-14 -4l-10 -4l4 -2l14 2l10 6zM-1236 -486l-4 2l-16 -4l-4 -4l-8 -4l-2 -2l-10 -2l-4 -6l0 -2l10 2l8 2l8 2l4 2l4 6l10 4l4 4zM-562 -506l-6 8l6 -4l8 2l-4 4l8 2l6 -2l10 4l-4 6l8 0l0 4l4 6l-4 10l-6 0l-6 -2l2 -8l-2 -2l-12 10l-6 -2l8 -4l-10 -2l-12 0l-18 0l-2 -2l6 -4l-4 -4l8 -6l10 -16l6 -4l10 -4l4 0l-2 2l-6 8zM-1328 -540l10 -2l-2 12l8 8l-4 0l-6 -4l-4 -6l-4 -2l-2 -4l0 -4l4 2zM-792 -622l-4 6l-4 -2l-4 -2l4 -4l4 0l4 2zM-818 -628l-12 6l-8 0l-2 -2l8 -6l14 0l0 2zM-852 -656l2 4l6 -2l6 2l10 4l12 4l0 4l8 0l6 2l-8 4l-16 -2l-6 -6l-10 6l-14 6l-2 -6l-14 0l8 -4l2 -8l4 -10l6 2zM-758 -672l-12 2l-2 -6l4 -6l10 0l6 2l0 4l0 2l-6 2zM-956 -692l-6 4l-14 -2l-8 0l-14 -4l8 -4l8 -4l10 4l6 2l4 2l6 2zM-906 -694l0 10l14 -8l12 6l-4 8l10 6l10 -8l8 -8l0 -10l14 0l16 2l14 4l0 6l-8 4l8 6l-2 4l-20 8l-14 2l-10 -4l-2 6l-10 8l-4 4l-10 8l-16 0l-8 4l0 6l-12 2l-12 8l-10 12l-4 6l0 12l14 2l4 10l6 8l14 -2l18 4l10 4l6 4l14 2l10 4l16 2l12 0l-2 10l2 10l8 10l14 10l8 -4l6 -10l-6 -16l-6 -4l16 -6l12 -6l4 -8l0 -6l-8 -8l-12 -8l12 -10l-4 -10l-4 -16l8 -2l18 4l10 0l8 -2l8 2l14 6l2 4l18 2l0 8l4 12l8 2l8 6l14 -6l10 -10l6 -6l8 10l12 12l12 12l-4 6l14 6l8 6l16 2l6 4l4 8l8 2l4 4l2 10l-8 4l-8 4l-16 4l-12 8l-18 2l-20 -2l-16 0l-10 0l-8 6l-14 6l-14 12l-12 10l10 -2l16 -14l20 -8l16 0l8 4l-10 8l4 10l4 8l12 4l16 0l10 -12l2 8l6 2l-12 8l-22 6l-10 4l-12 6l-8 0l0 -8l18 -8l-16 0l-12 0l-6 -6l0 -12l-4 -4l-8 2l-2 -2l-8 8l-4 6l-2 6l-4 0l-4 2l-2 2l-18 0l-14 0l-6 2l-10 8l-4 4l-10 0l-10 0l-4 2l2 2l0 2l0 2l-12 4l-10 2l-12 6l-2 0l-4 -2l-2 -2l4 -4l4 -6l2 -6l-2 -8l-2 -10l-10 -4l2 -2l-2 -2l-2 0l-2 0l-2 -4l-2 2l-2 0l0 -2l-2 0l0 -4l-8 -2l-8 -4l-10 -4l-10 -4l-8 4l-4 0l-12 -2l-8 0l-10 -2l-10 -2l-8 0l-2 -2l-2 -6l-4 0l0 4l-20 0l-34 0l-34 0l-30 0l-30 0l-30 0l-30 0l-10 0l-30 0l-28 0l-2 0l-20 -10l-6 -4l-18 -4l-6 -10l2 -6l-14 -4l-2 -8l-12 -6l0 -6l6 -4l0 -8l-18 -6l-10 -10l-6 -8l-8 -4l-8 -4l-4 -6l-10 4l-10 4l-10 -6l-6 -4l-10 -2l-10 -2l0 -56l0 -38l18 4l16 4l10 2l10 -6l12 -2l14 0l16 -4l16 -2l6 4l8 -2l2 -4l8 0l16 10l14 -8l2 8l12 -2l4 -2l12 0l14 4l24 4l14 2l10 -2l14 6l-16 4l20 4l26 -2l8 -2l12 6l10 -4l-10 -6l6 -2l12 -2l8 0l8 2l10 6l12 0l18 4l14 -2l16 0l-2 -6l10 -2l14 4l0 10l8 -8l8 0l4 -10l-12 -6l-10 -4l0 -12l12 -8l14 2l10 4l12 12l-8 6l18 2zM-1142 -732l-4 6l22 -4l14 6l10 -6l10 4l8 10l6 -4l-8 -10l8 -2l10 2l12 4l6 10l4 6l16 6l18 4l0 4l-18 0l8 4l-4 4l-18 -2l-18 -2l-12 0l-18 4l-26 2l-18 0l-4 -4l-14 -2l-10 0l-12 -8l8 0l14 -2l14 0l14 -2l-20 -2l-20 0l-16 0l-4 -4l22 -4l-14 2l-18 -4l8 -8l8 -4l26 -6l10 2zM-1044 -734l-10 6l-16 -6l4 -2l14 0l8 2zM-764 -732l2 4l-12 0l-10 0l-10 0l-4 0l-10 -6l0 -2l4 -2l24 2l16 4zM-866 -732l8 6l10 -8l24 -4l18 10l-2 8l20 -4l10 -4l22 6l14 4l2 4l18 -2l10 6l24 4l8 4l10 10l-18 4l24 8l16 2l14 8l16 2l-4 6l-18 12l-12 -4l-16 -10l-12 2l-2 6l12 4l12 6l4 2l8 10l-4 8l-12 -4l-26 -8l14 10l10 6l2 2l-26 -4l-22 -6l-12 -4l4 -2l-16 -6l-14 -4l0 2l-30 2l-8 -4l8 -8l18 0l20 0l-2 -4l2 -6l14 -8l-4 -6l-4 -2l-14 -6l-20 -2l6 -4l-10 -6l-10 0l-8 -4l-4 4l-20 0l-36 -2l-20 -2l-16 -2l-10 -4l12 -4l-14 0l-4 -10l8 -10l10 -4l26 -2l-8 6zM-1004 -738l12 2l18 -2l2 4l-8 4l14 4l-2 10l-16 4l-10 -2l-6 -4l-24 -8l0 -2l20 0l-12 -6l12 -4zM-932 -728l-10 8l-12 0l-6 -10l0 -4l6 -4l8 -4l22 0l18 4l-14 8l-12 2zM-1204 -714l-26 4l-6 -4l-24 -4l4 -4l8 -8l8 -6l-10 -6l34 -2l14 2l26 0l10 4l10 4l-12 2l-24 6l-12 8l0 4zM-936 -750l-6 4l-14 0l-12 -4l6 -4l14 -2l8 4l4 2zM-984 -768l6 6l0 4l-4 8l-16 2l-10 -2l0 -6l-18 0l0 -8l12 0l14 -2l14 0l2 -2zM-1082 -762l4 4l8 -2l12 0l0 6l-6 4l-32 2l-26 4l-16 0l0 -4l20 -4l-46 2l-14 -2l14 -10l10 -2l28 2l18 6l18 2l-14 -10l8 -4l10 2l4 4zM-946 -770l10 2l20 0l8 4l-2 4l12 2l6 2l14 0l14 2l16 -2l20 -2l16 0l12 4l2 4l-6 4l-16 2l-12 -2l-28 2l-22 0l-16 -2l-26 -2l-4 -6l0 -4l-10 -6l-22 0l-12 -4l4 -4l22 2zM-1162 -776l-2 8l-8 2l-8 2l-18 4l-16 0l-14 -2l16 -6l20 -8l16 2l14 -2zM-938 -776l-4 2l-20 -2l-2 -2l20 0l6 2zM-1102 -776l-18 2l-16 -4l8 -2l16 -2l14 2l-4 4zM-1096 -786l-12 2l-18 0l0 -2l10 -2l6 0l14 2zM-958 -780l-16 2l-8 -2l-4 -4l0 -4l12 0l6 0l12 4l-2 4zM-1000 -784l4 4l-18 0l-16 -4l-22 0l10 -2l-12 -4l0 -4l18 2l28 4l8 4zM-870 -796l12 2l-14 4l-18 8l-18 0l-20 -2l-12 -4l0 -4l8 -2l-18 0l-10 -4l-8 -4l8 -4l6 -4l12 0l-6 -2l24 0l12 4l18 2l16 2l8 8zM-684 -832l26 2l22 2l18 2l0 2l-26 4l-24 2l-8 2l22 0l-24 8l-16 2l-18 8l-20 2l-6 2l-32 0l14 2l-6 2l8 4l-10 4l-14 4l-6 2l-14 4l2 2l16 0l2 2l-28 6l-26 -2l-30 2l-14 -2l-18 0l-2 -6l18 -2l-4 -8l6 0l26 4l-14 -6l-16 -2l8 -4l18 -2l4 -4l-16 -4l-4 -4l28 0l8 2l16 -4l-22 -2l-36 0l-18 -2l-8 -4l-12 -4l-2 -2l16 -2l10 -2l20 0l14 -4l14 0l10 2l8 -4l12 -2l18 -2l32 0l4 2l30 -2l22 0l22 0zM96 -476l0 2l-2 2l6 2l4 2l0 4l-4 0l-8 0l-2 4l-6 0l0 -2l-6 4l-6 0l-4 -2l-2 -4l-6 2l0 -6l8 -4l0 -4l4 2l2 -2l10 0l2 -2l10 2zM-686 526l0 22l10 0l6 0l-2 6l-10 2l-4 0l-6 -2l-8 -2l-10 -2l-12 -6l-10 -4l-14 -12l8 2l14 8l12 2l6 -4l4 -6l8 -4l8 0zM-682 214l4 14l6 0l2 2l-4 10l-10 6l0 16l-2 4l4 2l-8 8l-6 8l-4 10l0 10l-6 10l6 16l2 2l0 10l-6 10l0 8l-8 6l0 10l4 10l-6 4l-2 8l-4 10l2 12l-4 2l2 12l6 4l-4 4l4 2l2 4l-4 2l0 6l-4 12l-4 10l0 4l-2 6l-8 6l0 10l4 4l6 -2l0 8l4 6l26 2l8 0l-8 0l-6 4l-8 2l-2 10l-4 0l-12 -2l-12 -8l-12 -6l-2 -6l2 -6l-4 -6l-2 -18l4 -8l10 -8l-14 -4l10 -8l2 -16l12 2l4 -20l-6 -2l-4 12l-6 -2l4 -14l4 -18l4 -8l-4 -10l0 -10l4 0l6 -16l8 -16l4 -16l-2 -14l2 -10l0 -12l4 -12l2 -18l4 -22l4 -22l-2 -16l-2 -14l6 -4l2 -4l4 6l2 8l6 4l-4 10l6 10zM1104 -186l-10 4l-8 -4l0 -8l6 -4l10 -4l6 2l2 4l-4 4l-2 6zM1276 -498l18 4l12 6l4 10l16 0l8 -4l16 -2l-4 8l-4 4l-4 10l-8 10l-12 -2l-8 4l2 8l0 12l-6 0l0 6l-6 -6l-4 6l-16 4l2 6l-8 -2l-6 -2l-6 6l-12 6l-8 6l-14 4l-6 4l-12 4l6 -6l-2 -4l8 -6l-6 -6l-8 4l-12 8l-6 6l-10 0l-4 4l4 8l8 2l2 4l8 2l10 -6l10 4l6 0l2 4l-14 4l-6 4l-10 6l-4 6l10 6l4 10l6 10l8 8l-2 6l-6 4l4 4l4 4l0 8l-4 8l-4 0l-8 12l-8 12l-10 12l-14 10l-14 8l-10 2l-6 4l-4 -4l-6 6l-14 4l-10 2l-4 10l-6 2l-2 -8l2 -4l-12 -4l-6 2l-10 -2l-4 -4l2 -6l-10 -2l-4 -4l-10 6l-8 0l-8 0l-6 4l-6 0l2 12l-6 0l0 -2l0 -4l-8 2l-4 -2l-8 -4l4 -8l-8 -2l-2 -8l-10 2l2 -12l8 -10l2 -8l-2 -8l-4 -2l-2 -6l-6 2l-12 -2l4 -4l-4 -6l-8 4l-8 -2l-12 6l-8 8l-10 0l-4 -2l-4 0l-8 -2l-6 2l-6 8l0 -8l-6 2l-12 -2l-12 -2l-8 -4l-8 -2l-4 -6l-4 0l-10 -8l-8 -2l-4 2l-14 -6l-10 -8l-4 -10l8 2l0 -6l-4 -6l2 -8l-12 -10l-16 -4l-4 -8l-6 -6l-2 -2l-2 -6l0 -4l-6 -2l-2 0l-4 -8l4 -2l-2 -2l10 -6l6 -2l12 2l4 -6l12 -2l4 -4l16 -6l0 -2l0 -6l6 -2l-8 -18l20 -4l4 -2l8 -18l20 4l6 -4l0 -10l8 -2l8 -6l4 0l2 6l8 6l14 4l8 8l-4 10l4 6l12 0l12 2l12 6l8 2l4 8l6 6l10 0l22 2l12 0l10 0l16 6l12 0l4 4l12 -6l16 -2l14 -2l12 -2l8 -6l6 -4l-2 -2l-2 -4l4 -8l6 2l10 2l10 -6l16 -4l8 -6l6 -2l14 -2l8 2l2 -4l-10 -8l-8 -2l-8 4l-8 -2l-6 0l-4 -4l8 -10l4 -6l12 2l14 -6l0 -4l10 -10l6 -4l0 -6l-6 -2l8 -4l12 -2l14 0l14 2l10 4l6 10l4 4l2 6l4 10zM-28 -50l-6 0l-6 -2l-6 0l-12 2l-8 2l-10 4l-2 0l2 -8l0 -2l0 -4l-4 -4l-4 0l-2 -2l2 -6l0 -4l0 -2l2 0l0 -6l0 -2l4 -2l-2 -8l-4 -4l2 -4l2 0l2 0l2 0l8 0l2 -2l2 0l2 -2l2 6l2 -2l4 -2l4 2l2 4l4 2l4 -2l4 -2l8 4l2 14l-4 8l-2 12l4 8l0 4zM130 -22l0 -2l-6 2l-6 -2l-6 2l-16 0l2 -8l-4 -8l-4 -2l-2 -4l-4 0l2 -4l2 -6l4 -10l4 0l6 -6l2 0l6 4l8 -4l0 -4l2 -4l2 -6l6 -4l2 -6l2 -2l2 -6l2 -6l8 -8l0 -4l2 0l-4 -4l0 -4l2 0l4 6l2 6l0 8l4 8l-4 0l-4 0l-4 0l-2 4l6 6l4 2l2 4l2 8l-2 2l-4 10l-2 2l-2 8l2 4l-2 2l6 6l0 4l4 4l4 4l2 4l0 4l0 4l-8 -2l-8 -2l-14 0zM308 -36l0 12l4 2l-4 4l-4 2l-4 6l-2 4l0 8l-2 4l0 8l-4 2l0 6l-2 6l2 4l2 12l2 10l-2 6l2 6l6 4l6 14l-4 -2l-14 2l-2 2l-4 6l2 4l-2 12l0 10l2 2l8 4l2 -2l0 10l-6 0l-4 -6l-4 -4l-8 0l-2 -6l-6 4l-8 -2l-4 -4l-6 -2l-4 0l-2 -2l-2 0l-6 -2l-6 2l-4 0l-2 0l0 -12l-4 -2l0 -6l2 -6l-2 -4l0 -8l-12 0l0 -2l-6 0l0 2l-6 0l-2 6l-2 2l-6 -2l-2 2l-8 0l-4 -4l-2 -4l-2 -6l-2 -8l-30 0l-4 2l-2 0l-4 2l-2 -4l2 -2l0 -4l2 -2l4 -2l2 0l4 -2l6 0l0 2l4 2l6 -6l6 -6l2 -2l0 -8l4 -10l4 -6l8 -4l0 -4l0 -4l2 -2l0 -6l0 -10l2 -6l4 -6l0 -6l2 -6l4 -6l4 -2l8 4l8 2l6 2l8 2l4 -6l0 -2l4 2l12 -6l4 4l4 -2l0 -2l4 0l8 0l6 0l4 0l6 8l4 2l2 -2l6 0l6 -2l2 4l8 6zM130 48l-4 -4l-2 2l-4 4l-10 -10l8 -6l-4 -6l4 -2l6 -2l2 -4l6 4l8 0l2 -4l2 -6l0 -8l-6 -6l4 -12l-2 -2l-8 0l-2 -4l0 -4l14 0l8 2l8 2l0 -4l6 -10l6 -6l6 2l6 0l0 6l-4 6l-2 6l0 10l0 6l-2 2l0 4l0 4l-8 4l-4 6l-4 10l0 8l-2 2l-6 6l-6 6l-4 -2l0 -2l-6 0l-4 2l-2 0zM-754 2l-4 -2l-4 -4l-4 2l-8 -2l-2 -4l-2 0l-10 -6l-2 -2l4 -2l0 -4l2 -4l4 0l4 -8l4 -4l-2 -2l0 -6l-2 -10l2 -2l0 -8l-4 -6l0 -6l4 2l2 -4l-2 -6l6 0l8 -8l4 0l0 -4l2 -8l4 -4l8 -2l0 -2l8 2l8 -6l4 -2l4 -4l4 0l2 2l-2 4l-6 2l-2 4l-4 4l-4 4l0 6l-4 6l6 2l2 4l2 2l0 4l0 4l0 2l2 0l2 4l14 0l6 0l6 10l4 -2l8 0l6 0l2 2l-2 4l-2 4l0 6l2 8l2 2l0 2l-4 6l4 2l2 4l4 10l-2 0l-2 -6l-4 -2l-2 4l-20 -2l0 8l6 0l0 4l-2 -2l-6 2l0 8l4 4l2 6l0 4l-4 26l-6 -4l-2 0l6 -10l-8 -6l-6 2l-4 -2l-6 2l-6 0l-6 -12l-6 -2l-2 -4l-8 -6l-2 2zM-830 -82l-6 -2l-2 -2l2 -2l0 -2l-4 -2l-4 -2l-2 -2l-2 -4l-2 0l0 2l-2 2l-2 -2l-2 -2l-2 -2l0 -2l2 -4l-4 0l2 -2l2 -2l6 2l4 0l2 0l2 2l4 0l2 -2l2 6l4 4l4 4l-4 2l0 4l2 0l0 2l0 2l-2 2l0 2zM-822 -232l8 0l8 0l10 4l4 4l8 -2l4 4l8 6l6 4l4 0l6 2l0 2l6 2l8 4l0 2l-8 0l-6 2l-8 -2l-14 2l8 -6l-4 -2l-8 -2l-2 -2l-4 -6l-4 0l-10 -2l-4 -2l-12 -2l-4 -2l4 -2l-10 0l-6 4l-6 0l0 2l-6 2l-4 0l6 -4l2 -4l4 -2l6 -2l6 0l4 -2zM328 -352l2 -2l6 0l10 -2l-6 4l0 2l-2 0l-2 0l-2 0l0 -2l-2 0l-2 2l-2 -2zM340 -350l-10 4l-6 -2l-2 -4l6 0l2 2l2 -2l2 0l0 2l2 0l2 0l2 0zM170 -486l-6 -2l-4 0l-8 -2l-2 0l-6 4l-8 -2l-6 -6l-4 -2l-2 -4l-2 -2l8 -2l4 -4l6 -2l4 -2l2 2l4 -2l4 4l8 2l0 2l6 2l0 -2l8 0l0 4l8 0l4 6l-2 0l-2 0l-2 2l0 2l-2 0l-2 0l-2 2l-4 0l-2 2zM100 -550l0 4l10 2l0 4l10 -2l6 -2l10 4l6 2l2 6l-4 2l4 4l2 6l0 2l4 6l-4 2l-2 -2l-4 2l-6 2l-4 4l-8 2l2 2l2 4l4 2l6 6l-4 4l-4 2l2 6l0 2l-4 -2l-4 -2l-8 2l-8 0l-2 2l-6 -2l-2 0l-10 -2l-2 2l-10 0l2 -8l4 -6l-14 -2l-4 -2l0 -6l-2 -2l2 -6l-2 -10l6 0l2 -4l2 -10l0 -2l2 -2l8 -2l2 2l6 -4l-2 -4l0 -6l6 2l8 -2zM430 -126l4 2l-2 4l-4 2l4 4l-4 4l-2 -2l-2 2l-6 0l0 -4l-2 -2l4 -4l4 -6l4 2l2 -2zM126 -556l-6 8l-10 -6l0 -4l14 -4l2 6zM110 -564l-4 4l-2 -2l-8 8l4 4l-8 2l-6 -2l-4 -6l-2 -10l2 -2l4 -4l8 0l4 -2l8 -4l0 6l-4 4l2 2l6 2zM-718 -198l2 0l8 0l6 2l2 0l2 4l6 -2l0 4l4 0l4 4l-2 4l-6 -2l-4 0l-4 0l-2 2l-4 0l0 -2l-4 2l-4 6l-2 -2l-2 -2l2 -4l-4 -2l2 -2l2 -4l-2 -6zM120 -234l-34 18l-30 20l-14 4l-10 2l0 -6l-6 -2l-6 -4l-2 -4l-34 -22l-34 -22l-36 -24l0 -2l0 -12l16 -8l10 -2l8 -2l4 -6l12 -2l0 -8l6 -2l4 -2l12 -2l2 -4l-2 -2l-4 -12l0 -6l-4 -6l10 -6l10 0l8 -6l8 -2l18 -2l16 0l6 0l8 -4l12 0l4 4l6 -2l-2 6l2 10l-2 8l-6 6l0 6l8 6l0 2l6 4l4 18l4 10l0 4l-2 8l2 6l-2 4l2 6l-4 6l6 6l0 4l4 6l4 -2l8 6l4 6zM-804 34l6 -8l-2 -4l-4 4l-6 -4l2 -2l-2 -10l4 0l2 -8l4 -6l0 -4l4 -2l8 -4l10 6l2 0l2 4l8 2l4 -2l4 4l4 2l2 8l-4 6l-10 10l-12 4l-6 8l-2 8l-6 4l-4 -6l-4 0l-4 0l0 -4l2 -2l-2 -4zM350 -296l-4 6l-2 6l-2 6l-2 2l-4 -4l-4 -4l-8 -14l4 10l6 12l8 14l2 6l4 6l8 10l-2 2l2 6l10 10l2 2l-40 0l-38 0l-40 0l0 -36l0 -36l-2 -8l2 -6l-2 -4l4 -6l12 0l10 2l10 4l6 2l6 -4l4 -2l10 -2l6 2l4 4l2 -2l8 2l8 0l4 -2l8 16zM424 -126l-4 -2l-4 -6l-4 -4l-4 -4l-8 -4l-6 0l-4 -2l-4 2l-6 -4l-4 8l-12 -2l0 -4l4 -14l0 -8l4 -2l8 -2l4 -6l6 12l2 8l6 6l14 10l6 4l4 6l4 4l4 4l-2 2l-4 -2zM-90 -418l0 -8l-4 -4l14 -8l12 2l14 0l10 2l8 0l16 0l4 4l20 4l4 -2l10 4l12 0l0 6l-10 6l-12 2l0 4l-6 4l-4 8l4 6l-6 6l-2 6l-8 2l-8 8l-12 0l-10 0l-6 2l-4 4l-4 0l-4 -4l-4 -6l-8 0l-2 -4l4 -4l2 -2l-4 -4l4 -6l-4 -6l4 -2l0 -4l2 -2l0 -8l4 -2l-2 -4l-6 -2l-2 2l-6 0l-2 -4l-4 0l-4 4zM244 -578l0 -6l-4 2l-6 -4l0 -6l12 -2l12 -2l12 2l10 0l2 0l-8 6l4 10l-6 4l-8 0l-8 -4l-4 -2l-8 2zM380 -150l6 4l4 -2l4 2l6 0l8 4l4 4l4 4l4 6l4 2l-4 6l-4 4l2 2l0 4l6 0l2 -2l2 2l-2 4l4 6l2 4l4 4l34 12l8 0l-28 30l-14 0l-8 8l-6 0l-4 2l-6 0l-4 -2l-10 4l-2 4l-8 -2l-2 0l-2 0l-2 0l-14 -8l-6 0l-4 -4l0 -6l-6 -2l-4 -10l-6 -2l-2 -4l-4 -6l-6 0l2 -6l6 0l2 -2l0 -10l2 -10l6 -4l0 -4l4 -6l6 -6l4 -10l2 -8l12 2l4 -8zM286 -690l-2 6l16 8l-10 6l12 12l-6 8l8 8l-4 6l16 8l-4 4l-10 6l-22 12l-18 2l-18 4l-16 2l-6 -6l-8 -4l2 -10l-6 -8l6 -6l8 -6l24 -12l6 -2l-2 -4l-12 -4l-4 -4l0 -16l-16 -6l-14 -6l6 -2l12 6l12 0l12 2l8 -4l6 -8l16 -4l12 4l-4 8zM1784 174l4 2l-2 6l-6 0l-6 0l-2 -4l4 -4l6 2l2 -2zM1794 168l-6 2l-2 -4l4 -2l4 0l6 -4l0 6l-6 2zM-1800 166l0 -6l2 0l-2 6zM-612 518l12 -6l8 4l6 -4l8 4l-2 4l-14 2l-4 -4l-10 6l-4 -6zM96 -422l-4 8l-4 -2l-2 -6l2 -4l6 -4l2 8zM36 -504l6 4l6 0l8 4l2 2l4 0l4 2l14 2l-4 6l-2 8l-2 2l-4 -2l0 4l-8 4l0 6l6 -2l2 4l0 2l2 4l-2 4l2 8l6 0l-2 6l-8 4l-20 -2l-14 4l-2 6l-12 0l-10 -4l-4 2l-20 -4l-4 -4l6 -6l2 -20l-10 -10l-8 -6l-14 -4l-2 -6l14 -4l16 4l-4 -12l10 4l24 -8l2 -8l10 -2l0 4l6 0l4 4zM110 40l-10 -10l-6 -8l-6 -10l0 -4l2 -4l2 -6l2 -8l4 0l14 0l0 -12l6 -2l6 2l6 -2l0 2l0 4l2 4l8 0l2 2l-4 12l6 6l0 8l-2 6l-2 4l-8 0l-6 -4l-2 4l-6 2l-4 2l4 6l-8 6zM-56 -546l-6 8l-8 -2l-6 0l2 -6l-2 -6l8 0l12 6zM-30 -586l-10 10l10 0l10 0l-2 8l-10 8l12 0l0 2l8 12l8 2l6 10l2 4l12 2l0 8l-6 2l4 6l-8 4l-14 0l-16 2l-6 0l-6 4l-10 -2l-6 4l-6 -2l14 -10l10 -2l-16 -2l-2 -4l10 -4l-6 -4l2 -6l16 0l0 -6l-6 -6l-12 -2l-2 -2l2 -6l-2 -2l-6 4l0 -8l-6 -6l4 -10l8 -8l8 0l12 0zM416 -416l2 -4l-4 -6l-6 -4l-4 -2l-4 -2l0 -2l10 2l14 2l14 4l2 2l6 -2l8 2l4 6l6 2l-2 0l4 6l0 2l-6 -2l-8 -2l-2 2l-14 2l-10 -6l-10 0zM10 -60l-16 6l-4 4l-10 2l-8 -2l0 -4l-4 -8l2 -12l4 -8l-2 -14l-2 -8l0 -6l18 0l4 0l4 0l4 0l0 2l4 6l0 8l0 8l4 2l-4 10l2 4l2 8l2 2zM-84 -76l-4 -2l-2 4l-2 0l-2 -2l0 -4l-4 -6l-2 2l-2 0l-4 0l2 -4l-2 -2l0 -2l-2 -4l-4 -4l-8 0l-2 2l-2 0l-2 2l-2 2l-4 4l-4 -4l-4 -4l-4 -2l-2 -2l0 -4l-2 -2l-4 -2l6 -6l2 0l2 0l2 0l2 -2l0 -4l0 -4l6 0l8 2l2 0l6 0l2 4l2 0l2 -2l2 0l2 2l4 2l4 -2l2 -2l2 -2l2 0l2 4l2 2l4 4l-2 2l0 4l2 -2l2 2l-2 4l4 2l-2 0l-2 4l4 4l2 8l-4 2l0 2l0 6l-2 0zM-168 -132l0 -4l12 0l2 -2l4 0l4 2l2 0l4 -2l2 2l-4 4l-6 0l-4 -4l-4 4l-4 0l-8 0zM-152 -110l-4 -4l-4 -2l-4 -2l0 -2l-2 -2l0 -2l4 -2l4 0l2 0l18 0l0 4l0 4l-2 2l-2 0l-2 0l-2 0l-6 6zM94 -10l0 -2l2 -10l16 0l0 12l-14 0l-4 0zM236 -358l6 4l8 0l8 0l0 2l4 0l0 2l-14 0l-12 -2l0 -6zM266 -416l-4 6l-2 2l-6 0l-4 -2l-12 4l6 4l-6 2l-4 0l-6 -4l-2 2l2 6l6 4l-4 2l6 4l4 4l0 6l-8 -4l2 6l-6 0l4 10l-8 0l-8 -4l-4 -8l0 -8l-4 -4l-6 -6l0 -2l4 -6l0 -2l4 -2l0 -2l6 -2l4 -2l6 0l2 -2l2 0l6 0l8 -2l8 4l10 -2l0 -4l4 2zM-468 -826l34 -6l36 0l12 -4l36 0l78 0l64 8l-18 4l-40 2l-54 0l6 2l36 -2l30 4l18 -2l10 2l-12 6l26 -4l48 -4l30 2l6 6l-40 6l-6 2l-32 2l22 0l-10 8l-10 6l2 12l12 6l-16 0l-16 4l18 6l2 8l-10 0l12 10l-22 0l12 4l-4 4l-14 0l-14 0l12 8l2 4l-20 -4l-6 2l14 4l12 6l4 8l-18 2l-8 -4l-12 -6l4 6l-12 6l26 0l14 0l-26 10l-28 8l-28 2l-12 0l-10 4l-14 12l-22 6l-6 0l-14 4l-14 2l-8 6l0 6l-6 8l-16 8l4 6l-4 10l-6 10l-14 0l-14 -8l-20 0l-10 -6l-8 -10l-16 -12l-6 -6l0 -10l-14 -8l2 -8l-6 -4l10 -12l16 -4l4 -4l2 -8l-12 4l-6 2l-8 2l-12 -4l-2 -6l4 -6l10 0l20 2l-18 -6l-8 -4l-10 2l-8 -2l10 -10l-6 -4l-8 -6l-12 -12l-12 -2l0 -6l-26 -6l-22 0l-26 0l-26 2l-10 -4l-18 -6l26 -4l20 0l-42 -2l-22 -4l0 -4l38 -6l36 -4l4 -4l-26 -4l8 -4l36 -6l14 -2l-4 -4l24 -2l30 -2l30 0l12 4l26 -6l24 4l14 0l20 4l-24 -6l2 -4zM-900 -138l-6 -2l-6 0l-4 -2l-6 -4l0 -2l2 -2l-2 -2l4 -8l14 0l0 -4l-2 0l-2 -2l-2 -4l-4 -2l4 0l0 -6l10 0l8 0l0 8l0 12l2 0l4 0l4 0l-4 4l-6 4l0 2l0 2l-2 2l-2 0l0 2l-2 0l-2 4zM-526 -26l-4 4l-4 2l-2 -4l-2 0l-2 2l-6 -2l4 -4l0 -4l2 -4l-4 -6l0 -6l4 -10l4 2l8 2l10 8l2 4l-6 10l-4 6zM-598 -84l6 4l8 6l0 6l4 0l4 4l4 4l-2 10l-6 2l2 2l-2 6l4 6l4 0l0 6l6 10l-2 0l-6 -2l-2 4l-6 0l-2 2l-2 2l-4 -2l-6 -4l-2 -4l-2 -6l2 -8l2 -4l-2 -4l-4 -2l2 -4l-2 -2l-6 0l-6 -8l2 -2l0 -4l6 -2l4 -2l-4 -4l0 -4l8 -6zM-874 -130l0 -2l-4 -2l0 -4l-2 -2l-6 2l0 -2l-2 -2l-2 -2l-4 0l2 -2l0 -2l0 -2l6 -4l4 -4l0 2l2 -2l4 0l2 0l4 0l6 0l2 0l2 -2l4 0l2 2l2 -2l2 0l4 2l2 0l4 2l2 2l4 2l2 2l-2 0l-2 2l-4 0l-2 0l-2 2l-2 0l-2 -2l-2 0l0 2l-2 0l0 2l-4 4l-2 2l-2 -2l-4 2l-2 0l-2 0l0 6l-2 2l-4 0zM188 -460l2 4l4 4l-4 4l-4 -2l-8 0l-8 -2l-4 0l-2 2l-4 -2l-2 4l4 4l2 4l6 4l2 2l4 4l10 4l-2 2l-8 -4l-6 -4l-10 -4l-8 -6l2 -2l-4 -4l0 -2l-8 -2l-2 4l-4 -4l0 -2l2 -2l6 2l2 -2l4 2l4 0l0 -4l2 0l2 -4l8 -4l2 2l8 4l8 2l4 -2zM-732 -200l6 2l8 0l2 6l-2 4l-2 2l4 2l-2 4l-6 -2l-4 0l-6 0l-6 2l-4 -4l0 -2l10 0l8 2l2 -2l-4 -6l0 -2l-6 -2l2 -4zM162 -468l4 -6l-2 -4l6 0l0 -4l4 4l4 0l8 0l2 -2l4 -2l4 0l2 0l4 -2l2 -2l4 0l10 2l2 0l6 2l2 4l-8 2l-4 6l-6 6l-8 2l-6 0l-8 2l-4 2l-8 -2l-8 -4l-2 -2l-2 -2l-2 0zM1208 102l-6 0l-12 -6l10 -2l4 2l4 4l0 2zM1244 102l-8 2l-2 -2l2 -2l4 -8l10 -4l0 2l0 4l-6 8zM1180 80l2 4l6 -2l4 6l-12 2l-8 0l-4 0l2 -6l6 0l4 -4zM1230 80l-2 6l-16 4l-12 -2l0 -4l8 -2l6 4l6 -2l10 -4zM1086 68l20 0l2 -4l18 6l4 6l14 2l14 6l-12 4l-12 -4l-8 0l-10 0l-10 -2l-12 -4l-8 -2l-4 2l-18 -4l-2 -4l-8 -2l6 -10l12 2l8 4l4 0l2 4zM1348 62l-6 6l0 -6l0 -4l2 -4l4 4l0 4zM1272 34l-4 4l-6 -2l-2 -4l10 0l2 2zM1304 30l4 8l-8 -4l-8 0l-6 0l-8 0l4 -6l12 0l10 2zM1342 12l2 16l10 6l8 -10l12 -6l10 0l8 2l8 4l10 2l0 32l0 34l-8 -10l-10 -2l-4 4l-12 0l4 -8l6 -2l-2 -12l-4 -8l-20 -8l-8 -2l-16 -8l-2 4l-4 2l-2 -4l0 -4l-8 -6l10 -4l8 0l-2 -2l-14 0l-4 -6l-8 -2l-4 -4l12 -4l6 -2l16 4l2 4zM1252 -14l-8 10l-8 2l-8 -2l-18 0l-8 2l-2 8l10 8l4 -4l20 -4l-2 4l-4 0l-4 6l-8 4l8 12l-2 4l10 10l0 8l-6 2l-4 -4l6 -8l-10 4l-4 -2l2 -4l-8 -6l2 -10l-6 4l0 10l0 16l-6 0l-4 -2l2 -10l-2 -10l-4 0l-2 -6l4 -6l2 -8l4 -16l2 -4l8 -8l8 4l14 2l10 -2l10 -6l2 2zM1286 -12l0 10l-4 -2l-2 6l4 6l-2 0l-6 -6l-2 -12l2 -8l4 -4l0 6l6 0l0 4zM1178 -18l12 8l-12 2l-4 6l2 10l-10 6l0 10l-4 16l-2 -4l-12 6l-4 -8l-6 0l-6 -2l-12 2l-2 -4l-8 0l-8 0l-2 -14l-4 -2l-6 -10l0 -8l0 -10l6 -6l2 6l8 6l6 -2l6 0l6 -4l4 0l10 2l8 -2l6 -14l4 -4l2 -12l12 0l8 2l-4 10l6 10l-2 4zM1058 58l-10 0l-10 -8l-12 -8l-4 -6l-8 -8l-4 -8l-8 -14l-10 -8l-2 -8l-4 -8l-10 -6l-4 -10l-8 -4l-10 -12l-2 -4l8 0l14 2l10 10l8 6l4 4l10 12l10 0l8 6l6 8l8 4l-4 10l6 2l4 0l2 8l2 6l8 0l6 6l-4 14l0 14zM778 -354l12 10l-2 8l4 6l0 6l-8 -2l4 10l10 8l14 6l-8 4l-4 10l10 4l10 4l14 6l12 2l6 4l8 2l12 2l8 0l2 -4l-2 -6l2 -4l6 -2l0 8l0 2l10 2l6 0l8 0l8 0l2 -6l-6 -4l10 0l8 -8l12 -6l8 2l8 -4l4 6l-4 4l12 2l0 4l-4 2l2 6l-8 -2l-12 6l0 6l-6 8l0 6l-4 8l-8 -2l-2 10l-2 2l2 6l-6 2l-4 -16l-4 0l0 6l-6 -6l2 -4l6 -2l4 -8l-6 -2l-10 0l-8 0l-2 -8l-4 0l-8 -4l-4 6l8 6l-6 4l-4 2l6 4l0 6l2 8l2 8l-2 4l-6 -2l-12 4l0 6l-6 6l-14 8l-10 10l-8 8l-10 6l0 4l-6 2l-8 4l-4 2l-4 6l2 14l0 8l-4 10l0 16l-4 0l-6 8l4 4l-10 2l-2 8l-4 2l-10 -8l-4 -14l-4 -12l-4 -4l-6 -10l-2 -12l-2 -6l-8 -14l-4 -20l-4 -12l0 -12l-2 -10l-14 6l-8 0l-12 -12l4 -4l-2 -4l-12 -8l6 -8l22 0l-2 -8l-6 -6l0 -6l-6 -6l10 -10l12 0l10 -10l6 -10l10 -10l0 -6l8 -6l-8 -6l-2 -6l-4 -10l4 -4l16 2l10 0l10 -8zM-62 -538l2 6l-8 10l-18 6l-14 -2l8 -10l-4 -10l12 -8l8 -6l2 6l-2 6l6 0l8 2zM540 -372l8 -2l8 -6l6 0l4 -2l8 2l10 4l8 2l12 8l8 2l0 8l-4 12l-2 8l4 0l-4 6l2 8l2 6l6 2l2 6l-10 10l6 4l4 8l10 4l0 8l4 2l2 4l-16 6l-4 12l-18 -4l-10 -2l-12 -2l-4 -12l-6 -2l-6 2l-10 6l-14 -4l-10 -8l-8 -2l-8 -10l-6 -14l-6 2l-6 -4l-4 4l-6 -4l0 -6l-4 0l2 -8l-4 -6l-12 -6l-8 -10l2 -8l6 -2l-2 -6l-6 -4l-6 -12l-6 -8l2 -2l-2 -12l6 -4l2 4l4 6l8 0l4 0l10 -8l4 0l4 4l-4 4l6 6l2 -2l4 8l10 2l6 6l14 0l16 -2l2 -2zM454 -360l6 4l2 6l-6 2l-2 8l8 10l12 6l4 6l-2 8l4 0l0 6l6 4l-6 0l-6 0l-8 10l-18 -2l-30 -20l-14 -6l-12 -4l-4 -12l22 -10l4 -12l-2 -8l6 -2l6 -6l4 -2l12 2l2 2l6 -2l6 12zM-146 -664l-2 6l12 6l-14 8l-28 8l-8 2l-14 -2l-28 -4l10 -4l-22 -4l18 -2l0 -4l-22 -2l8 -6l14 -2l16 6l16 -4l12 2l16 -6l16 2zM358 -328l-2 4l-4 -2l-2 8l2 0l-2 2l0 2l4 0l0 2l-4 16l-8 -16l4 -4l-2 0l4 -4l2 -8l0 -2l2 0l2 0l2 -2l2 0l0 4zM156 -382l-4 8l2 2l-4 6l-6 -4l-6 -2l-14 -4l2 -6l12 2l10 -2l8 0zM92 -412l6 6l-2 14l-4 0l-4 2l-4 -2l0 -12l-2 -6l6 2l4 -4zM124 -468l14 2l-2 6l4 4l-8 -2l-8 4l0 6l-2 2l4 6l10 4l4 8l12 8l8 0l2 2l-4 2l10 4l8 4l8 4l0 2l-2 4l-4 -4l-10 -2l-4 6l8 4l-2 4l-4 2l-4 8l-6 0l0 -2l2 -6l4 -2l-4 -6l-4 -4l-4 -2l-2 -4l-8 -2l-4 -4l-8 0l-6 -6l-10 -6l-6 -6l-4 -10l-4 0l-10 -4l-4 2l-6 4l-4 2l2 -6l-6 0l-2 -8l2 -4l-2 -4l0 -2l4 2l6 0l6 -4l0 2l6 0l2 -4l8 0l4 0l0 -4l6 0l2 -2l10 -2l2 4zM-776 -184l8 0l4 2l2 4l-8 0l-2 0l-6 0l-6 -4l2 -2l4 -2l2 2zM356 -324l2 -4l10 4l20 -10l4 12l-2 2l-20 4l10 10l-4 2l0 4l-8 2l-2 2l-6 4l-10 -2l0 -2l4 -16l0 -2l2 -4l0 -6zM1346 -342l2 4l-6 6l-4 -4l-6 4l-2 4l-6 -2l0 -4l6 -6l4 0l6 -4l6 2zM1410 -372l-4 8l2 6l-6 6l-12 6l-18 0l-14 12l-6 -4l-2 -8l-16 2l-12 4l-12 2l10 6l-6 18l-8 4l-4 -4l2 -10l-6 -2l-4 -6l10 -4l4 -6l10 -6l8 -6l20 -4l10 2l12 -18l6 6l14 -10l6 -4l6 -12l-2 -12l6 -6l10 -2l6 14l-2 8l-8 10l0 10zM1440 -442l6 2l8 -4l2 12l-16 2l-8 10l-16 -6l-6 10l-10 0l-2 -10l6 -8l10 0l2 -14l4 -8l12 10l8 4zM710 -422l-6 2l-14 6l-4 8l-4 0l-2 -6l-12 0l-2 -8l-6 0l0 -10l-10 -8l-18 2l-12 0l-10 -8l-8 -4l-16 -8l-26 6l0 36l-6 2l-6 -8l-8 -4l-10 2l-4 4l-2 -2l2 -4l0 -4l-12 -4l-6 -8l-4 -2l0 -4l8 0l2 -6l8 -2l8 2l2 -10l-2 -6l-10 0l-8 -2l-12 4l-8 2l-6 -2l0 -4l-6 -8l-6 0l-10 -6l6 -8l-2 -2l8 -10l10 6l2 -8l20 -10l16 -2l22 8l12 4l10 -4l16 0l12 4l4 -2l14 0l2 -4l-16 -8l10 -4l-2 -4l8 -2l-6 -6l4 -4l38 -4l4 -2l26 -4l8 -4l18 2l4 10l10 -2l14 4l-2 6l10 -2l24 -8l-2 2l12 8l22 26l6 -6l14 6l14 -2l6 2l4 4l8 2l4 6l12 -2l6 6l-8 6l-8 2l0 10l-6 4l-20 -4l-8 18l-4 2l-20 4l8 18l-6 2l0 6l-6 0l-4 -4l-16 -2l-16 0l-4 2l-14 -4l-6 2l-2 4l-16 -2l-6 0l-2 6zM410 8l6 8l-8 4l-2 4l-4 2l0 6l-4 4l-2 8l-4 2l-14 -10l-2 -6l-36 -20l-2 -12l4 -4l4 -6l4 -8l-4 -10l-2 -6l-4 -6l6 -6l6 -8l6 2l0 6l4 4l6 0l14 8l2 0l2 0l2 0l8 2l2 -4l10 -4l4 2l6 0l-8 12l0 36zM710 -422l2 -6l6 0l16 2l2 -4l6 -2l14 4l4 -2l16 0l16 2l4 4l6 0l0 2l-16 6l-4 4l-12 2l-4 6l-12 -2l-6 2l-10 6l2 2l-4 2l-18 2l-12 -4l-12 0l2 -6l10 2l4 -2l8 0l12 -6l-12 -6l-6 2l-8 -4l8 -6l-2 0zM1034 -106l-4 -6l-4 -10l-2 -12l6 -8l12 -2l10 2l8 4l4 -8l10 4l2 6l-2 12l-16 8l4 6l-10 2l-8 4l-10 -2zM1284 -386l8 12l2 6l0 12l-4 6l-8 2l-8 4l-10 0l0 -6l2 -6l-4 -12l6 0l-6 -10l4 0l4 -4l8 -2l4 0l2 -2zM208 -420l0 2l-2 0l0 -4l-4 -2l-2 -2l2 -2l2 0l2 -4l2 0l2 0l2 2l2 2l2 2l2 0l-2 2l0 2l-2 0l-6 2zM480 -300l2 4l-2 2l4 8l-6 0l-4 -4l-8 0l8 -10l6 0zM1052 -142l4 -6l0 -8l-8 -8l0 -10l-8 -8l-8 -2l-2 4l-6 0l-2 -2l-12 6l0 -8l2 -10l-6 -2l0 -6l-4 -2l2 -4l8 -6l0 2l6 0l-2 -12l6 0l6 8l4 8l12 0l4 10l-6 2l-4 4l12 6l10 12l6 8l8 6l2 8l-2 10l-10 -4l-4 8l-8 -4zM358 -332l-2 0l-2 2l-2 0l2 -10l6 -6l4 0l2 4l-6 4l-2 6zM-78 -44l-2 0l-10 -4l-10 -8l-8 -6l-6 -6l2 -4l0 -2l6 -6l4 -4l2 0l2 -2l4 6l0 4l2 2l2 0l2 -4l4 2l0 2l0 4l-2 6l2 2l4 0l4 4l0 4l0 2l-2 8zM148 -228l-6 4l-6 -6l-16 -4l-4 -6l-8 -6l-4 2l-4 -6l0 -4l-6 -6l4 -6l-2 -6l2 -4l-2 -6l2 -8l0 -4l-4 -10l6 -2l0 -4l0 -4l6 -4l4 -2l4 -4l0 -8l12 4l4 0l10 0l12 6l6 8l8 2l14 4l10 6l6 -4l4 -4l-2 -8l4 -4l6 -6l8 0l12 2l4 4l4 0l4 2l10 2l2 2l-4 6l2 4l-2 6l2 8l0 36l0 36l0 20l-12 0l0 4l-40 -18l-40 -20l-10 6zM818 -76l-2 12l-4 2l-8 2l-6 -8l-2 -14l6 -16l6 6l6 6l4 10zM290 290l4 2l-4 6l-2 2l-6 2l0 4l-4 0l-8 -8l6 -6l4 -4l6 -2l4 4zM228 -544l-2 -2l2 -2l-4 -2l-12 -2l-2 -8l12 -4l16 2l10 -2l2 2l6 0l8 6l2 4l-8 4l-2 6l-12 2l-10 0l-2 -2l-4 -2zM60 -502l2 2l0 6l-4 0l-2 -2l2 -4l2 -2zM210 -560l0 -8l6 -6l10 -4l8 8l8 0l2 -8l8 -2l4 2l8 4l8 0l6 2l0 4l4 6l-10 4l-8 2l-8 -6l-6 0l-2 -2l-10 2l-16 -2l-12 4zM-52 -358l6 4l10 0l10 2l4 0l4 6l0 6l4 12l2 2l-2 4l-12 2l-4 2l-6 2l0 8l-12 2l-4 6l-8 2l-10 2l-16 8l0 12l-2 0l0 4l-6 2l-4 2l-4 0l-4 -2l-8 2l-4 6l-2 2l-6 12l-12 12l-4 12l-4 6l-2 2l-22 2l0 -4l4 -4l4 -4l-2 -4l4 -8l6 -6l4 -2l2 -6l0 -4l4 -6l6 -4l6 -10l6 -4l10 -2l6 -6l6 -2l8 -10l-2 -12l4 -8l0 -6l8 -6l10 -4l6 -6l8 -10l2 -6l8 0zM266 -482l2 -2l8 0l6 2l4 0l6 4l-2 2l4 2l2 4l4 4l-2 0l2 2l-2 0l-6 0l-2 -2l-2 2l2 2l-4 2l-2 4l-2 2l-2 -6l2 -4l0 -4l-6 -6l-4 -4l-2 -4l-4 0zM496 124l2 4l2 8l2 12l2 4l0 6l-2 2l-4 -6l-2 4l2 6l0 4l-4 4l0 8l-4 12l-4 12l-6 20l-4 14l-6 12l-8 2l-8 4l-6 -2l-8 -4l-2 -6l-2 -8l-2 -8l-2 -8l2 -6l4 -2l0 -4l6 -8l0 -6l-2 -4l-2 -6l0 -10l4 -6l0 -6l6 0l6 -2l2 -2l6 0l4 -6l10 -6l2 -6l-2 -4l4 2l6 -8l0 -6l4 -4l4 4zM-972 -258l-4 8l-2 8l0 12l0 6l2 6l2 4l2 8l6 8l4 4l2 6l12 2l4 4l8 -2l8 -2l8 -2l6 0l6 -4l2 -6l2 -10l2 -2l6 -2l10 -2l10 0l6 -2l2 2l0 6l-6 6l-2 6l2 2l-2 4l-2 8l-2 -4l-4 2l-4 6l-2 -2l-2 0l0 2l-8 0l-10 0l0 6l-4 0l4 2l2 4l2 2l2 0l0 4l-14 0l-4 8l2 2l-2 2l0 2l-12 -10l-4 -4l-8 -2l-6 0l-8 4l-6 2l-6 -4l-8 -2l-10 -4l-6 -2l-12 -4l-8 -4l-4 -4l-4 0l-12 -2l-4 -6l-10 -6l-4 -6l-4 -4l4 -2l-2 -2l4 -2l0 -4l-4 -4l0 -4l-4 -6l-10 -10l-10 -8l-4 -6l-8 -4l-2 -2l2 -6l-6 -2l-6 -6l-2 -6l-6 -2l-6 -4l-4 -6l0 -2l-6 -8l-4 -8l0 -4l-6 -4l-4 0l-6 -2l-2 4l2 4l2 8l2 4l8 8l2 2l2 0l0 4l2 0l2 6l4 2l2 4l6 6l4 8l2 6l2 4l2 6l4 0l4 4l4 4l0 2l-4 4l-2 0l-2 -6l-8 -6l-6 -4l-6 -4l0 -6l-2 -6l-4 -4l-6 -4l-2 2l-2 -4l-6 -2l-6 -6l4 0l4 -4l0 -4l-8 -6l-6 -4l-2 -6l-4 -6l-6 -8l-4 -10l12 0l12 -2l0 2l14 6l24 6l20 0l8 0l0 -4l16 0l4 4l6 4l6 4l2 4l4 6l4 4l8 2l8 -8l8 0l6 4l6 8l2 4l6 6l4 8l2 4l8 4l6 2l4 0zM206 -418l2 0l0 -2l6 -2l2 0l4 -2l4 0l4 4l2 6l-2 0l-2 2l-6 0l-4 2l-6 2l-4 -2l-2 -6l2 -2zM-122 -146l4 -2l2 -6l2 0l8 2l6 -2l2 2l2 -2l40 -2l2 -6l0 -2l-6 -42l-4 -44l14 0l34 22l34 22l2 4l6 4l6 2l0 6l10 -2l0 24l-4 6l-2 6l-8 2l-14 0l-4 4l-6 0l-6 0l-4 -2l-4 2l-10 4l-2 4l-8 4l-2 2l-4 2l-4 0l-2 2l-2 6l-8 8l0 4l-2 4l0 6l-4 2l-2 2l-2 -6l-2 2l-2 0l-2 2l-8 0l-2 0l-2 0l-4 -2l2 -4l-2 -2l-2 2l0 -4l2 -2l-4 -4l-2 -2l-2 -4l-2 0l-2 2l-2 2l-4 2l-4 -2l-2 -2l-2 0l-2 2l-2 0l-2 -4l2 -4l-2 -4l-4 -2l-2 -6l0 -6zM146 -358l-2 0l0 -2l2 2zM996 -202l-6 4l-8 0l-4 12l-4 2l4 8l6 8l6 6l-4 8l-4 2l2 6l6 8l2 6l0 4l4 10l-6 8l-4 10l-2 -6l4 -8l-4 -6l2 -12l-4 -4l-4 -12l-2 -14l-4 -8l-6 6l-12 6l-6 0l-6 -2l4 -12l-2 -10l-8 -12l0 -4l-6 0l-6 -8l0 -8l2 0l0 -6l6 -2l-2 -6l2 -2l2 -10l8 2l4 -8l0 -6l6 -8l0 -6l12 -6l8 2l-2 -6l4 -2l0 -4l6 -2l2 6l4 2l2 8l-2 8l-8 10l-2 12l10 -2l2 8l8 2l-4 8l8 4l4 2l8 -2l0 4l-8 6l-2 4l-6 2zM198 -426l-4 4l0 4l-2 -2l-4 -2l-4 -2l2 -2l2 -6l2 -2l2 -2l2 2l2 2l4 0l4 4l-2 0l-2 2l-2 0zM878 -492l10 -2l20 -10l14 -4l10 4l10 0l6 4l10 0l14 2l10 -6l-4 -6l10 -10l12 4l8 0l12 4l2 6l14 6l10 -2l12 -2l10 2l10 4l6 6l10 0l12 0l10 -2l12 -2l16 -6l6 0l4 4l12 0l-4 6l-8 10l4 4l6 0l8 2l8 -4l8 2l10 8l-2 4l-8 -2l-14 2l-6 2l-8 6l-16 4l-10 6l-10 -2l-6 -2l-4 8l2 4l2 2l-6 4l-8 6l-12 2l-14 2l-16 2l-12 6l-4 -4l-12 0l-16 -6l-10 0l-12 0l-22 -2l-10 0l-6 -6l-4 -8l-8 -2l-12 -6l-12 -2l-12 0l-4 -6l4 -10l-8 -8l-14 -4l-8 -6l-2 -6zM346 116l8 -2l12 4l2 -2l6 0l4 -4l6 0l12 -4l8 -4l0 4l0 10l2 8l0 16l2 4l-4 8l-4 8l-6 6l-8 4l-12 4l-12 10l-4 2l-6 8l-4 2l0 6l4 8l2 6l0 4l2 -2l0 10l-2 6l2 2l-2 4l-4 2l-8 4l-12 6l-4 4l0 4l4 0l-2 6l-8 0l0 -6l-2 -4l0 -4l2 -10l-4 -8l-4 -14l10 -10l4 -8l2 -6l-2 -4l0 -8l2 -6l0 -12l-4 -4l-6 0l-2 -4l-4 -2l-8 0l-2 -2l0 -8l30 -8l6 4l2 0l4 2l2 4l-2 4l0 8l6 6l4 -6l4 -4l-2 -12l-4 -8l-2 -2l-4 0l-4 -14l4 -6zM-122 -146l-6 -8l-6 -6l-6 -4l-6 -2l-6 0l-4 2l-6 0l-2 2l-2 -4l4 -6l0 -10l0 -8l-2 -6l2 -4l-4 -6l-4 -4l2 -4l38 0l-2 -14l4 -4l8 -2l0 -26l34 2l0 -16l36 24l-14 0l4 44l6 42l0 2l-2 6l-40 2l-2 2l-2 -2l-6 2l-8 -2l-2 0l-2 6l-4 2zM346 116l-4 6l4 14l4 0l2 2l4 8l2 12l-4 4l-4 6l-6 -6l0 -8l2 -4l-2 -4l-4 -2l-2 0l-6 -4l-6 -2l4 -10l4 -4l-2 -8l2 -8l0 -2l-2 -10l-4 -4l10 2l2 2l2 6l4 14zM1010 -62l2 6l6 -2l4 -4l2 0l6 6l4 8l0 6l0 4l0 4l2 6l2 2l4 10l0 4l-6 0l-10 -8l-12 -8l-2 -4l-6 -8l0 -8l-4 -6l2 -6l-4 -4l2 -2l8 4zM1186 -44l-8 2l-8 -2l-12 0l-2 12l-4 4l-6 14l-8 2l-10 -2l-4 0l-6 4l-6 0l-6 2l-8 -6l-2 -6l8 4l8 -2l2 -8l4 -2l12 -4l8 -6l4 -8l4 6l2 -4l6 0l0 -6l0 -4l8 -8l6 -8l4 0l4 6l0 4l8 2l8 4l0 4l-8 0l2 6zM164 286l-8 -8l-4 -8l-2 -8l-2 -8l-4 -16l0 -12l-2 -4l-4 -6l-4 -8l-6 -12l-2 -6l-8 -10l0 -6l4 -2l6 -2l6 0l6 4l2 0l40 0l8 4l24 2l18 -4l8 -4l6 2l4 2l-4 2l-4 0l-6 4l-4 -4l-16 4l-6 0l-2 36l-10 0l0 30l0 36l-8 6l-6 0l-6 -2l-4 0l-2 -4l-4 -4l-4 6zM1658 210l8 8l6 4l-4 2l-6 -2l-8 -6l-6 -4l-6 -8l-2 -2l4 0l6 2l4 4l4 2zM22 -120l0 -6l-12 -2l0 -6l-6 -6l-2 -4l2 -6l6 0l4 -4l14 0l8 -2l2 -6l4 -6l0 -24l14 -4l30 -20l34 -18l16 4l6 6l6 -4l2 14l4 4l0 2l6 4l-4 4l-2 20l-2 14l-12 10l-4 12l4 4l0 6l6 0l-2 6l-2 0l0 4l-2 0l-6 -12l-4 0l-6 6l-8 -4l-6 0l-2 2l-6 0l-6 4l-6 0l-12 -6l-4 4l-6 -2l-4 -2l-10 -4l-10 0l-2 2l-2 6l-4 4l0 10l-8 -6l-4 0l-2 2zM86 -48l-12 4l-4 0l-4 2l-8 0l-4 -6l-4 -8l-6 -6l-8 0l-10 0l2 -16l0 -8l2 -6l2 -2l6 -6l-2 -4l2 -4l-2 -6l0 -2l0 -10l4 -4l2 -6l2 -2l10 0l10 4l4 2l6 2l4 -4l12 6l6 0l6 -4l6 0l2 -2l6 0l8 4l6 -6l4 0l6 12l2 0l4 4l-2 0l0 4l-8 8l-2 6l-2 6l-2 2l-2 6l-6 4l-2 6l-2 4l0 4l-8 4l-6 -4l-2 0l-6 6l-4 0l-4 10l-2 6zM-858 -110l-2 -4l-6 -4l-2 -4l-4 -2l-4 -6l2 0l4 0l2 -2l0 -6l2 0l2 0l4 -2l2 2l2 -2l4 -4l0 -2l2 0l0 -2l2 0l2 2l2 0l2 -2l2 0l4 0l2 -2l2 0l0 2l0 2l0 2l-2 4l-2 4l0 4l2 4l0 4l-2 0l-2 6l2 2l-2 2l0 2l2 2l-2 2l-4 0l-2 -2l-2 0l-4 0l-6 -2l-2 2zM60 -536l10 2l0 2l-2 10l-2 4l-6 0l2 10l-6 -2l-6 -4l-10 2l-6 -2l4 -2l10 -14l12 -6zM282 -712l30 8l-12 2l12 6l-18 4l-8 2l4 -8l-12 -4l-16 4l-6 8l-8 4l-12 -2l-12 0l-12 -6l-6 2l-6 2l-2 6l-18 -2l-2 6l-10 0l-6 6l-10 12l-16 14l4 4l-4 4l-10 0l-6 8l0 14l6 6l-2 10l-10 8l-4 6l-6 -6l-20 10l-14 4l-14 -6l-2 -10l-4 -24l10 -6l26 -8l20 -10l18 -14l24 -20l16 -8l28 -12l22 -4l16 0l16 -8l18 0l18 -2zM248 -778l-24 4l-16 -2l6 -4l-6 -2l20 -2l4 4l16 2zM182 -798l34 8l-26 4l-6 8l-8 2l-4 8l-12 0l-22 -6l8 -4l-14 -2l-20 -8l-8 -8l28 -4l6 4l14 0l4 -4l14 0l12 2zM254 -804l20 4l-14 4l-30 2l-30 -2l-2 -2l-14 0l-10 -6l30 -2l16 2l10 -2l24 2zM882 -278l-2 4l2 6l-2 4l-8 0l-12 -2l-8 -2l-6 -4l-12 -2l-14 -6l-10 -4l-10 -4l4 -10l8 -4l4 -2l8 2l10 8l4 0l4 6l8 2l8 4l12 2l12 2zM1730 410l2 4l8 -4l2 4l0 4l-4 4l-6 8l-4 4l2 4l-6 0l-10 4l-2 6l-6 12l-8 4l-4 2l-10 0l-6 -4l-12 0l0 -4l4 -6l14 -10l6 -2l6 -4l10 -6l6 -4l4 -8l4 -2l0 -6l8 -6l2 6zM1746 362l8 10l0 -6l4 2l2 8l8 2l6 2l6 -4l6 0l-4 10l-2 6l-8 0l-2 2l0 4l-2 2l-2 6l-6 6l-8 4l-2 -2l-4 -2l6 -8l-2 -4l-12 -4l0 -4l8 -4l2 -8l-2 -6l-4 -6l2 -2l-6 -4l-8 -10l-4 -6l4 -2l6 6l8 2l2 10zM588 -212l-4 8l-4 0l-2 2l-2 4l2 8l-2 0l-4 0l-6 4l0 6l-4 2l-6 0l-4 2l0 4l-4 2l-6 0l-6 2l-4 2l-4 -8l-8 -16l30 -10l6 -20l-4 -8l0 -4l4 -4l0 -4l4 -2l-2 0l0 -8l6 0l4 8l6 4l8 0l6 2l4 6l2 4l4 0l0 2l-4 6l-2 4l-4 2zM564 -258l-2 0l-2 -2l4 -4l0 6zM752 -372l6 6l4 8l16 4l-10 8l-10 0l-16 -2l-4 4l4 10l2 6l8 6l-8 6l0 6l-10 10l-6 10l-10 10l-12 0l-10 10l6 6l0 6l6 6l2 8l-22 0l-6 8l-8 -4l-2 -6l-8 -8l-18 2l-16 0l-16 2l4 -12l16 -6l-2 -4l-4 -2l0 -8l-10 -4l-4 -8l-6 -4l18 4l10 0l6 0l2 -2l6 2l14 -4l0 -10l6 -6l6 0l2 -2l8 -2l4 2l4 -4l-2 -6l4 -6l8 -2l-4 -6l8 0l4 -4l0 -4l4 -4l-2 -4l-2 -4l6 -6l12 -2l10 0l6 -2l6 -2zM-778 -72l-4 -4l-2 -4l2 -4l-2 0l-2 -4l-6 -2l-4 0l-2 4l-4 2l-2 2l0 2l4 4l-2 2l-2 2l-4 0l-2 -6l-2 2l-4 -2l-2 -4l-4 0l-2 0l-4 0l0 2l-2 -2l0 -2l2 -2l0 -2l0 -2l-2 0l0 -4l4 -2l4 4l0 2l4 0l4 2l4 0l4 -4l6 -2l4 -2l6 0l0 2l4 0l6 2l2 2l4 4l2 6l-2 4l-4 -2l0 6zM-696 176l-2 4l-6 4l-10 -6l0 -4l-20 -10l-18 -12l-8 -6l-4 -8l2 -2l-10 -14l-8 -18l-10 -20l-4 -4l-4 -8l-8 -6l-6 -4l2 -6l-4 -8l4 -8l6 -6l2 4l-2 2l0 4l4 0l4 0l4 6l6 -4l2 -8l6 -8l12 -4l10 -10l4 -6l-2 -8l2 -2l8 6l2 4l6 2l6 12l6 0l6 -2l4 2l6 -2l8 6l-6 10l2 0l6 4l-10 0l-2 2l-8 2l-10 6l-2 6l-2 2l0 6l-6 4l0 4l-2 2l4 8l6 6l-2 4l6 2l4 4l8 0l10 -6l-2 16l6 2l4 -2l10 16l-2 2l-2 8l0 8l-4 6l2 4l-2 2l4 10l-6 10zM1264 -84l0 6l2 6l-4 10l-4 -10l-4 4l2 8l-2 4l-12 -6l-2 -6l2 -6l-6 -4l-4 4l-4 0l-8 6l0 -4l4 -8l6 -4l4 -2l4 4l8 -4l2 -4l6 0l0 -8l8 6l2 4l0 4zM1240 -102l-4 2l-2 6l-4 4l-6 -8l2 -2l2 -2l2 -6l4 -2l0 8l6 -10l0 10zM1186 -94l-14 10l4 -6l8 -6l6 -8l6 -10l0 8l-6 6l-4 6zM1218 -118l6 2l8 0l0 4l-6 4l-6 4l0 -6l0 -4l-2 -4zM1256 -122l2 12l-8 -4l0 4l2 6l-4 2l0 -6l-4 0l0 -6l4 0l0 -4l-6 -8l10 0l4 4zM1216 -130l-4 8l-4 -6l-4 -6l8 0l4 4zM1214 -186l6 4l2 -2l2 2l-2 4l4 8l-4 8l-6 2l0 8l2 8l4 2l6 -2l12 6l-2 6l4 2l-2 4l-8 -4l-2 -6l-4 4l-6 -6l-8 2l-6 -2l0 -4l4 -4l-4 -2l0 4l-6 -6l0 -4l-2 -10l4 4l2 -16l4 -10l6 0zM1558 68l-2 2l-4 -4l-4 -6l-2 -8l0 -2l2 4l2 2l6 6l4 4l-2 2zM1520 54l-6 2l0 2l-6 2l-6 4l-4 0l-10 -4l-4 -2l0 -4l8 2l6 0l2 -6l2 0l0 6l6 -2l2 -2l6 -4l0 -6l6 0l2 2l0 4l-4 6zM1472 74l8 6l8 12l6 -2l-2 6l8 0l-2 2l10 4l-2 4l-6 0l-2 -2l-8 -2l-10 0l-8 -8l-6 -4l-6 -10l-12 -4l-10 4l-6 2l2 8l-8 4l-6 -2l-10 0l0 -34l0 -32l18 6l18 6l6 6l6 4l2 6l16 6l2 6l-8 2l2 6zM1532 44l-4 4l-2 -6l-2 -4l-4 -4l-6 -4l-8 -2l4 -2l4 2l4 2l4 2l4 4l4 4l2 4zM150 -512l-4 -6l0 -2l-2 -6l-4 -4l4 -2l-2 -6l6 -2l16 -6l12 -2l10 2l0 2l10 0l12 0l20 0l4 2l2 2l2 6l2 4l0 4l-6 2l4 4l0 4l4 8l0 4l-6 0l-8 10l2 4l-2 0l-10 -4l-8 0l-4 0l-6 2l-4 -4l-4 2l-2 0l-4 -6l-8 0l0 -4l-8 0l0 2l-6 -2l0 -2l-8 -2l-4 -4zM-662 -186l4 2l2 2l-2 2l-8 0l-6 0l0 -4l0 -2l10 0zM1306 -424l2 2l-4 0l-4 2l-4 4l2 8l-6 2l-2 2l-4 2l-6 2l-4 2l0 4l-2 2l4 2l6 4l-2 2l-4 0l-8 2l-4 4l-4 0l-6 -2l0 2l-4 2l0 -2l-2 -2l-2 -2l2 -4l2 0l0 -2l2 -6l0 -2l-6 0l-6 -4l8 -6l12 -6l6 -6l6 2l8 2l-2 -6l16 -4l4 -6l6 6zM-90 -418l4 -4l4 0l2 4l6 0l2 -2l6 2l2 4l-4 2l0 8l-2 2l0 4l-4 2l4 6l-4 6l4 4l-2 2l-4 4l2 4l-4 2l-6 -2l-4 2l0 -8l0 -6l-4 -2l-4 -4l2 -6l4 -4l0 -4l2 -6l0 -4l-2 -4l0 -2zM-626 222l4 -12l0 -4l4 -10l18 -2l8 0l10 4l0 4l4 6l-2 12l12 2l4 -2l6 4l2 2l0 10l2 4l4 0l4 -2l4 2l0 6l-2 6l-2 6l-2 8l-8 8l-8 2l-12 -2l-10 -2l10 -16l-2 -4l-10 -4l-12 -8l-8 -2l-18 -16zM508 -248l0 -6l2 -6l2 -2l4 4l0 6l-2 6l-2 0l-4 -2zM228 -478l4 -2l6 0l6 0l4 2l4 0l8 -2l2 -2l4 0l4 0l2 4l4 4l6 6l0 4l-2 4l2 6l4 0l6 0l4 2l0 2l-4 2l-4 -2l-2 12l-6 0l-8 -4l-12 2l-4 4l-14 -2l-8 0l-4 0l-4 -4l-2 -2l4 -2l-4 -2l-2 4l-6 -4l-2 -4l-6 -2l0 -4l-6 -4l8 -2l6 -6l4 -6l8 -2zM1436 -508l10 18l-14 -4l-6 16l10 10l0 6l-8 -6l-8 8l0 -8l0 -10l0 -10l2 -8l0 -14l-6 -10l0 -14l10 -4l-4 -4l4 -2l4 6l2 10l0 10l4 10zM228 -544l-20 0l-12 0l2 -4l14 -4l12 2l4 2l-2 2l2 2zM-1750 -666l6 2l-2 -6l28 0l20 10l-10 4l-18 2l0 10l-4 2l-8 0l-8 -4l-14 -4l-2 -4l-10 -2l-12 2l-6 -4l4 -4l-12 4l4 4l-6 4l0 -40l24 8l26 10l0 6zM1800 -708l-10 0l-2 -2l12 -6l0 8zM-1786 -708l-14 0l0 -8l2 0l8 0l14 4l-10 4zM1436 -732l-16 0l-20 -2l-2 0l10 -4l12 0l14 4l2 2zM1508 -750l-12 4l-16 -2l-18 -4l2 -2l18 0l26 4zM1450 -756l-6 8l-38 0l-16 2l-20 -6l6 -8l12 -2l26 2l36 4zM576 -708l-6 2l-34 -2l-2 -4l-18 -2l-2 -6l10 -2l0 -6l20 -8l-8 -2l24 -8l-4 -4l22 -6l34 -6l32 -2l18 -4l20 -2l6 4l-6 4l-36 4l-30 6l-32 8l-14 10l-16 10l2 8l20 8zM1070 -770l2 6l10 -4l28 0l24 6l8 4l-4 4l-10 4l-26 6l-8 2l12 2l16 2l8 -2l6 6l4 -2l16 -2l32 2l2 4l42 2l0 -8l22 2l16 0l16 6l4 6l-6 4l14 8l14 4l10 -10l16 4l18 -2l18 2l8 -2l16 2l-6 -10l12 -4l92 6l8 6l26 8l40 -2l20 2l8 4l0 6l12 4l12 -2l18 0l20 2l18 -2l18 10l12 -4l-8 -6l4 -4l32 2l22 0l28 4l14 4l0 40l-12 4l-14 0l10 6l6 8l4 2l0 4l-2 2l-18 -2l-28 8l-10 2l-14 6l-16 6l-2 6l-14 -8l-28 8l-4 -4l-10 4l-12 0l-4 6l-12 10l0 4l12 2l-2 14l-8 0l-4 10l4 4l-18 4l-4 12l-14 2l-4 10l-14 10l-4 -6l-4 -16l-6 -22l6 -14l8 -6l0 -4l16 -2l18 -14l16 -10l18 -8l8 -14l-12 2l-6 8l-24 10l-8 -12l-26 4l-26 16l8 6l-22 4l-16 0l2 -8l-16 0l-12 4l-32 -2l-32 4l-32 20l-38 22l16 2l4 6l10 2l6 -4l12 0l14 12l0 8l-8 10l0 12l-6 16l-14 14l-4 6l-14 12l-12 12l-8 6l-12 6l-6 0l-8 -4l-12 6l-2 4l-2 -2l0 -6l6 0l0 -12l-2 -8l8 -4l12 2l8 -10l4 -10l4 -4l4 -8l-16 2l-8 4l-16 0l-4 -10l-12 -6l-18 -4l-4 -10l-2 -6l-4 -4l-6 -10l-10 -4l-14 -2l-14 0l-12 2l-8 4l6 2l0 6l-6 4l-10 10l0 4l-14 6l-12 -2l-12 0l-4 -4l-6 0l-16 6l-12 2l-10 2l-12 0l-10 0l-6 -6l-10 -4l-10 -2l-12 2l-10 2l-14 -6l-2 -6l-12 -4l-8 0l-12 -4l-10 10l4 6l-10 6l-14 -2l-10 0l-6 -4l-10 0l-10 -4l-14 4l-20 10l-10 2l-4 0l-6 -6l-12 2l-4 -6l-8 -2l-4 -4l-6 -2l-14 2l-14 -6l-6 6l-22 -26l-12 -8l2 -2l-24 8l-10 2l2 -6l-14 -4l-10 2l-4 -10l-18 -2l-8 4l-26 4l-4 2l-38 4l-4 4l6 6l-8 2l2 4l-10 4l16 8l-2 4l-14 0l-4 2l-12 -4l-16 0l-10 4l-12 -4l-22 -8l-16 2l-20 10l-2 8l-10 -6l-8 10l2 2l-6 8l10 6l6 0l6 8l0 4l6 2l-6 6l-10 2l-10 10l10 10l-2 6l12 12l-6 4l-2 2l-4 0l-8 -6l-2 0l-6 -2l-4 -6l-8 -2l-6 2l-2 -2l-14 -4l-14 -2l-10 -2l0 2l-14 -8l-10 -4l-10 -6l8 -2l8 -8l-6 -4l16 -4l0 -2l-10 0l0 -4l6 -2l10 0l0 -4l-2 -6l4 -6l0 -2l-14 -4l-6 0l-6 -4l-8 2l-12 -4l0 -2l-4 -4l-8 0l0 -4l2 -2l-6 -6l-10 2l-4 0l-2 2l-4 -2l-2 -6l-2 -2l0 -2l10 0l2 -2l-2 -2l-6 -2l0 -2l-4 -2l-6 -6l2 -2l-2 -6l-10 -2l-4 2l-2 -4l-10 -2l-4 -6l0 -4l-6 -2l6 -4l-4 -10l8 -6l-2 0l12 -6l-12 -6l22 -12l10 -6l4 -4l-16 -8l4 -6l-8 -8l6 -8l-12 -12l10 -6l-16 -8l2 -6l8 -2l18 -4l10 -4l16 6l28 4l36 10l8 6l2 6l-12 6l-16 2l-44 -8l-8 2l16 6l0 6l2 10l12 2l8 4l2 -6l-6 -4l6 -4l24 6l8 -2l-6 -6l22 -10l10 0l10 4l6 -8l-10 -6l6 -6l-8 -6l28 4l6 6l-12 0l0 6l8 4l14 -2l4 -8l20 -4l36 -8l6 0l-10 6l14 2l6 -4l20 0l14 -4l12 6l10 -8l-10 -6l6 -2l30 2l12 4l38 12l6 -6l-10 -6l0 -2l-12 0l2 -6l-4 -8l-2 -2l20 -10l6 -8l8 -2l26 2l2 6l-10 8l6 4l4 6l-2 14l10 6l-4 6l-20 14l12 2l4 -4l12 -2l2 -4l8 -6l-6 -6l6 -6l-12 0l-2 -6l8 -10l-12 -8l16 -8l-2 -6l6 0l4 4l-4 10l12 2l-4 -6l16 -4l20 -2l20 6l-10 -8l0 -10l16 -2l24 0l22 -2l-8 -4l12 -8l12 0l18 -4l28 -2l2 -2l26 -2l8 2l24 -4l18 0l2 -4l10 -4l24 -4l16 2l-12 2l22 2zM1050 -784l-56 4l18 -12l8 -2l8 2l26 4l-4 4zM512 -806l-14 2l-10 0l0 2l-12 2l-10 -2l4 -4l-22 0l20 -2l16 0l2 2l4 -2l10 -2l16 4l-4 0zM1000 -788l-22 0l-28 -2l-16 -4l-8 -8l-14 -2l26 -6l22 -2l18 4l24 10l-2 10zM304 12l4 4l0 6l-4 2l-4 0l-4 6l-6 -2l2 -6l0 -6l4 -2l2 0l6 -2zM-88 -272l0 -4l2 0l0 2l0 16l-34 -2l0 26l-8 2l-4 4l2 14l-38 0l-2 4l0 -4l22 -2l2 -2l4 -6l4 -12l12 -12l6 -12l2 -2l4 -6l8 -2l4 2l4 0l4 -2l6 -2zM428 -164l-2 -4l-2 -2l-2 -4l-4 -4l-6 -8l-2 -8l-8 -8l-4 -2l-6 -8l-2 -8l0 -6l-6 -10l-4 -4l-6 -2l-2 -6l0 -2l-2 -6l-4 -2l-4 -8l-6 -8l-4 -6l-6 0l2 -6l0 -4l2 -4l10 2l6 -4l2 -2l8 -2l0 -4l4 -2l-10 -10l20 -4l2 -2l12 4l14 6l30 20l18 2l8 0l4 4l6 0l4 10l4 2l2 2l8 6l0 4l0 2l0 4l4 2l0 4l2 2l4 2l2 0l2 4l0 2l4 10l30 6l2 -4l4 8l-6 20l-30 10l-28 4l-10 4l-8 10l-4 2l-2 -2l-4 0l-10 -2l-2 0l-12 0l-2 0l-4 -2l-2 6l0 4l-4 2zM340 -94l-2 0l0 -6l0 -4l-6 -4l-2 -6l2 -8l-4 0l-2 2l-6 0l4 4l0 6l-6 4l-4 8l-6 0l-8 -4l-4 2l0 2l-6 2l0 2l-10 0l-2 -2l-6 0l-4 2l-4 -2l-4 -6l-2 -2l-8 2l-2 4l-2 8l-4 2l-4 2l-4 -4l0 -2l2 -4l0 -4l-6 -8l-2 -4l0 -2l-2 -2l-2 -6l-2 -4l-2 0l0 -4l2 -4l0 -4l4 -2l-2 -4l2 -6l4 -6l8 0l0 -40l0 -4l12 0l0 -20l40 0l38 0l40 0l4 10l-2 2l2 10l2 12l4 2l6 4l-4 6l-8 2l-4 2l0 8l-4 14l0 4l-2 8l-4 10l-6 6l-4 6l0 4l-6 4l-2 10l0 2zM340 -94l0 8l-2 2l-6 0l-2 6l6 0l4 6l2 4l6 2l4 10l-6 8l-6 6l-6 4l-8 0l-8 2l-6 -2l-4 2l-8 -6l-2 -4l-6 2l-6 0l-2 2l-4 -2l-6 -8l-2 -4l-8 -4l-2 -6l-4 -4l-6 -6l0 -2l-6 -4l-8 -4l4 -2l4 -2l2 -8l2 -4l8 -2l2 2l4 6l4 2l4 -2l6 0l2 2l10 0l0 -2l6 -2l0 -2l4 -2l8 4l6 0l4 -8l6 -4l0 -6l-4 -4l6 0l2 -2l4 0l-2 8l2 6l6 4l0 4l0 6l2 0zM-168 -136l-4 -8l-4 -4l4 -2l4 -6l4 -6l2 -2l6 0l4 -2l6 0l6 2l6 4l6 6l6 8l0 6l2 6l4 2l2 4l-2 4l-6 0l-2 0l-8 -2l-6 0l-18 0l-2 0l-4 0l-4 2l-2 -8l8 0l4 0l4 -4l4 4l6 0l4 -4l-2 -2l-4 2l-2 0l-4 -2l-4 0l-2 2l-12 0zM1622 104l2 4l-6 0l-4 -6l6 2l2 0zM1608 98l-4 0l-6 0l-2 -2l2 -4l6 2l2 2l2 2zM1616 96l0 2l-8 -8l-2 -6l4 0l2 8l4 4zM1598 84l2 2l-8 -4l-6 -4l-4 -4l2 0l4 2l8 4l2 4zM1576 74l-2 0l-4 -2l-6 -4l2 -2l6 4l4 4zM-114 -68l-4 0l-6 -4l-6 -6l-2 -4l0 -8l4 -4l2 -2l2 -2l2 0l2 -2l8 0l4 4l2 4l0 2l2 2l-2 4l4 0l-4 4l-6 6l0 2l-2 4zM-878 -134l-2 2l-4 0l-4 0l-4 -2l-6 -2l-2 -2l2 -4l2 0l0 -2l2 0l4 0l2 2l2 2l0 2l6 -2l2 2l0 4zM490 -94l-6 6l-6 8l-8 0l-34 -12l-4 -4l-2 -4l-4 -6l2 -4l4 -4l2 2l2 4l6 4l4 0l10 -2l10 -2l10 -4l4 0l4 -2l6 0l0 4l0 10l0 6zM498 -116l4 0l6 -4l4 0l0 2l-2 6l0 6l-2 4l-2 10l-6 12l-6 12l-8 14l-8 12l-12 14l-10 8l-16 10l-8 8l-12 12l-2 4l-2 2l-6 -8l0 -36l8 -12l4 -2l6 0l8 -8l14 0l28 -30l6 -8l6 -6l0 -6l0 -10l0 -4l2 0l6 -2zM208 -454l6 2l2 4l6 4l2 -4l4 2l-4 2l2 2l-2 2l2 4l4 4l-4 4l-2 2l2 2l-2 0l-4 0l-4 2l0 -2l2 -2l-2 0l-2 -2l-2 -2l-2 -2l-2 0l-2 0l-2 4l-2 0l2 0l-4 -4l-4 0l-2 -2l-2 -2l2 0l2 -4l-4 -4l2 -4l-4 0l4 -4l-4 -4l-2 -4l8 -2l6 0l6 4l0 4zM-572 -60l12 2l2 -2l8 0l10 2l-4 10l0 6l4 6l-2 4l0 4l-4 4l-4 -2l-6 2l-4 -2l0 4l0 2l0 2l-6 0l-6 -10l0 -6l-4 0l-4 -6l2 -6l-2 -2l6 -2l2 -10zM188 -494l2 0l4 -2l4 4l6 -2l4 0l8 0l10 4l-4 2l-2 4l-2 0l-10 -2l-4 0l-2 2l-4 2l-2 0l-4 0l-4 2l-2 2l-8 0l-4 0l-4 -4l-2 -2l2 -2l2 -2l4 0l2 -2l2 0l2 0l0 -2l2 -2l2 0l2 0zM138 -466l8 2l6 -2l8 0l2 -2l2 0l2 2l-8 4l-2 4l-2 0l0 4l-4 0l-4 -2l-2 2l-6 -2l2 0l-4 -4l2 -6zM222 -658l-10 8l2 6l-16 8l-20 8l-6 14l6 8l10 6l-10 10l-10 2l-4 18l-6 8l-12 0l-4 8l-12 0l-4 -10l-8 -10l-8 -14l4 -6l10 -8l2 -10l-6 -6l0 -14l6 -8l10 0l4 -4l-4 -4l16 -14l10 -12l6 -6l10 0l2 -6l18 2l2 -6l6 -2l14 6l16 6l0 16l4 4l-18 2zM170 -574l2 0l-8 12l0 -4l6 -8zM194 -580l-6 4l0 2l2 0l-4 0l2 2l-4 0l0 2l-2 2l0 -4l-2 0l2 -2l-2 -2l6 -4l4 0l2 0l2 0zM208 -638l2 0l-2 2l-2 0l2 -2zM320 268l-2 4l-6 0l-6 -4l0 -4l4 -4l0 -2l4 -2l4 2l2 4l0 6zM388 -334l-20 10l-10 -4l0 -4l2 -6l6 -4l-2 -4l-4 0l0 -8l2 -4l2 -2l2 -2l2 -6l2 2l12 -4l4 2l10 0l10 -2l6 0l12 -2l-6 6l-6 2l2 8l-4 12l-22 10zM144 -128l2 -6l-6 0l0 -6l-4 -4l4 -12l12 -10l2 -14l2 -20l4 -4l-6 -4l0 -2l-4 -4l-2 -14l10 -6l40 20l40 18l0 40l-8 0l-4 6l-2 6l2 4l-4 2l0 4l-2 4l0 4l2 0l2 4l2 6l2 2l0 2l-6 2l-4 4l-8 12l-10 4l-10 0l-2 0l2 4l-6 4l-4 4l-12 2l-4 -2l-2 0l0 4l-10 0l2 -2l-2 -8l-2 -4l-4 -2l-6 -6l2 -4l4 0l4 0l4 0l-4 -8l0 -8l-2 -6l-4 -6zM18 -62l-8 2l-2 -2l-2 -8l-2 -4l4 -10l-4 -2l0 -8l0 -8l-4 -6l0 -2l8 0l0 6l2 2l4 4l0 4l2 2l0 24l2 6zM1026 -122l-10 -4l-8 0l2 -8l-10 0l0 10l-6 16l-2 8l0 8l6 0l4 10l2 8l6 6l6 0l6 6l-4 4l-6 2l-2 -6l-8 -4l-2 2l-4 -4l0 -6l-6 -6l-4 -4l-2 6l-2 -6l0 -6l4 -10l4 -10l6 -8l-4 -10l0 -4l-2 -6l-6 -8l-2 -6l4 -2l4 -8l-6 -6l-6 -8l-4 -8l4 -2l4 -12l8 0l6 -4l6 -2l4 2l0 6l6 2l-2 10l0 8l12 -6l2 2l6 0l2 -4l8 2l8 8l0 10l8 8l0 8l-4 6l-10 -2l-12 2l-6 8l2 12zM710 -402l-4 2l-10 -2l-2 6l12 0l12 4l18 -2l4 8l2 0l6 2l0 4l2 6l-10 0l-8 0l-6 4l-4 0l-4 2l-4 -2l2 -10l-4 0l2 -2l-6 -2l-4 2l-2 4l0 2l-6 0l-4 4l-4 -2l-6 4l-4 -2l6 -10l-2 -8l-8 -2l4 -4l8 0l4 -4l4 -8l12 -2l-2 6l2 2l4 0zM612 -356l0 -8l-8 -2l-12 -8l-8 -2l-10 -4l-8 -2l-4 2l-6 0l-8 6l-8 2l-2 -8l0 -10l-6 -2l2 -8l-8 0l4 -8l8 2l10 -4l-8 -6l-2 -6l-8 4l-2 6l-2 -6l4 -4l10 -2l8 4l6 8l6 -2l10 0l0 -4l8 -4l8 -6l14 6l0 8l4 2l12 0l2 2l6 10l12 6l6 6l10 4l14 4l0 6l-4 0l-4 -2l-2 2l-8 2l-2 8l-6 4l-8 2l-2 4l-8 2l-10 -4zM1250 88l0 -2l10 -2l6 0l4 -2l4 2l-4 2l-10 6l-10 2l0 -4l0 -2zM-616 -108l4 0l4 0l-2 6l-8 2l-2 0l4 -4l0 -4zM94 -304l-4 -18l-6 -4l0 -2l-8 -6l0 -6l6 -6l2 -8l-2 -10l2 -6l12 -4l6 2l0 4l8 -2l2 2l-6 4l0 4l4 4l-2 8l-6 4l2 6l4 0l4 6l2 0l0 8l-4 4l-4 2l-6 4l0 4l0 4l-6 2zM370 -414l14 4l12 -2l8 2l12 -6l10 0l10 6l2 2l-2 6l8 2l4 2l-6 4l2 12l-2 2l6 8l-6 2l-2 -2l-12 -2l-4 2l-12 2l-6 0l-10 2l-10 0l-4 -2l-12 4l-2 -2l-2 6l-2 2l-2 2l-4 -4l4 -4l-6 0l-8 -2l-8 6l-14 0l-10 -4l-10 0l-2 4l-8 0l-8 -4l-12 0l-6 -10l-6 -6l4 -8l-6 -4l10 -10l16 0l4 -8l20 2l12 -8l12 -2l16 0l18 6zM272 -406l-8 4l-4 -4l0 -2l2 -2l4 -6l-4 -2l10 -4l8 2l2 4l8 4l-2 2l-12 0l-4 4zM1218 -244l-6 16l-4 8l-6 -8l0 -8l4 -10l8 -6l6 2l-2 6zM340 10l36 20l2 6l14 10l-4 14l0 4l6 4l0 4l-2 6l0 2l0 4l4 8l4 8l4 4l-8 4l-12 4l-6 0l-4 4l-6 0l-2 2l-12 -4l-8 2l-4 -14l-2 -6l-2 -2l-10 -2l-6 -2l-6 -2l-4 -2l-4 -2l-6 -14l-6 -4l-2 -6l2 -6l-2 -10l4 0l4 -4l4 -4l2 -2l0 -4l-2 -2l-2 -4l4 -2l0 -6l-4 -4l4 -2l10 0l22 0zM318 10l-10 0l-4 2l-6 2l-2 0l0 -8l2 -4l0 -8l2 -4l4 -6l4 -2l4 -4l-4 -2l0 -12l4 -2l6 2l8 -2l8 0l6 -4l4 6l2 6l4 10l-4 8l-4 6l-4 4l2 12l-22 0zM318 -522l4 2l2 -2l4 0l10 -2l6 6l-2 2l0 4l8 0l4 4l0 2l12 4l8 -2l6 4l6 0l14 4l0 2l-4 6l2 6l0 4l-10 0l-6 2l0 4l-8 2l-6 4l-10 0l-8 4l0 6l6 2l10 0l-2 2l-12 2l-14 6l-4 -2l2 -4l-12 -4l2 -2l10 -2l-4 -2l-14 -4l-2 -4l-8 2l-4 6l-8 8l-4 -2l-6 0l-4 0l2 -2l2 -4l4 -2l-2 -2l2 -2l2 2l6 0l2 0l-2 -2l2 0l-4 -4l-2 -4l-4 -2l2 -2l-6 -4l-4 0l-6 -2l-8 0l-2 2l-4 0l-2 2l-8 2l-4 0l-4 -2l-6 0l-6 0l-4 2l-2 -4l-6 -2l2 -4l4 -2l2 0l-2 -4l8 -10l6 0l0 -4l-4 -8l4 0l6 -2l8 -2l10 2l10 2l8 0l4 2l4 -2l2 2l10 0l4 0l0 -4l4 -2l8 -2zM-576 302l6 0l10 6l4 0l10 6l8 6l6 8l-4 4l2 6l-4 6l-12 6l-6 -2l-6 0l-10 -4l-6 0l-6 -4l0 -8l2 -2l0 -10l4 -10l2 -8zM-1556 -190l-4 0l0 -4l0 -4l2 -2l-2 -2l2 0l4 2l2 0l2 2l2 2l0 2l-4 2l-4 2zM-1560 -206l-4 0l-2 -2l-2 0l0 -2l2 0l4 0l2 2l0 2zM-1568 -212l0 2l-6 0l2 -2l4 0zM-1576 -214l-2 2l-4 -2l0 -2l2 -2l0 2l4 2zM-1594 -220l0 2l-4 -2l0 -2l2 0l2 0l0 2zM-948 -494l2 6l2 2l8 0l10 2l10 2l8 0l12 2l4 0l8 -4l10 4l10 4l8 4l8 2l0 4l2 0l0 2l2 0l2 -2l2 4l2 0l2 0l2 2l-2 2l10 4l2 10l2 8l-2 6l-4 6l-4 4l2 2l4 2l2 0l12 -6l10 -2l12 -4l0 -2l0 -2l-2 -2l4 -2l10 0l10 0l4 -4l10 -8l6 -2l14 0l18 0l2 -2l4 -2l4 0l2 -6l4 -6l8 -8l2 2l8 -2l4 4l0 12l6 6l2 4l-10 4l-10 4l-12 4l-4 6l-2 2l0 4l4 6l4 0l-2 -4l4 2l-2 4l-6 2l-6 0l-6 0l-4 2l-6 0l-10 2l16 -2l2 2l-14 4l-6 0l0 -2l-2 4l2 0l-2 6l-8 8l0 -2l-2 0l-4 -2l2 4l4 2l0 4l-4 4l-6 8l2 -8l-4 -4l-2 -8l-2 4l2 8l-6 -2l6 2l2 10l2 2l2 2l0 10l-6 8l-10 2l-6 6l-6 2l-4 4l-2 2l-12 6l-4 6l-6 6l0 6l0 8l4 8l4 8l0 4l6 12l0 6l-2 4l-2 6l-2 2l-6 -2l-2 -4l-4 -2l-4 -10l-6 -6l0 -4l2 -8l-4 -6l-8 -8l-2 0l-12 4l-6 -6l-6 -2l-12 2l-8 -2l-8 0l-4 2l2 4l0 4l2 2l-2 0l-4 -2l-4 2l-6 0l-8 -4l-8 0l-8 -2l-6 0l-8 4l-10 6l-10 4l-6 6l-2 4l0 8l0 4l2 4l-4 0l-6 -2l-8 -4l-2 -4l-4 -8l-6 -6l-2 -4l-6 -8l-6 -4l-8 0l-8 8l-8 -2l-4 -4l-4 -6l-2 -4l-6 -4l-6 -4l-4 -4l-16 0l0 4l-8 0l-20 0l-24 -6l-14 -6l0 -2l-12 2l-12 0l0 -4l-8 -6l-4 -2l-2 -2l-4 0l-4 -4l-10 0l-2 -2l-2 -6l-10 -10l-8 -14l0 -2l-4 -4l-8 -8l0 -8l-6 -6l2 -8l0 -8l-4 -8l4 -10l2 -8l2 -10l-2 -12l-4 -10l-2 -4l0 -2l14 4l6 10l2 -4l0 -8l-4 -8l28 0l30 0l10 0l30 0l30 0l30 0l30 0l34 0l34 0l20 0l0 -4l4 0zM-1530 -572l-10 4l-6 -2l0 -4l8 -4l6 -2l6 0l4 4l-8 4zM-1656 -600l-6 2l-6 -2l-6 -2l10 -2l8 2l0 2zM-1718 -638l6 2l8 0l8 2l10 2l-2 0l-8 2l-6 -2l-4 -2l-10 0l-2 0l0 -4zM-1550 -712l6 6l4 -2l18 0l0 2l14 2l10 -2l22 4l20 0l6 2l14 -2l16 4l10 0l0 38l0 56l10 2l10 2l6 4l10 6l10 -4l10 -4l4 6l8 4l8 4l6 8l10 10l18 6l0 8l-6 4l-4 -4l-10 -2l-2 -10l-14 -8l-4 -10l-10 0l-16 0l-12 -2l-20 -12l-10 -2l-18 -2l-14 0l-20 -4l-12 -4l-10 2l2 6l-6 0l-12 2l-8 4l-12 2l0 -6l4 -10l10 -2l-2 -2l-12 4l-8 8l-14 6l8 6l-10 6l-12 4l-10 4l-2 4l-16 6l-2 4l-12 4l-6 0l-10 2l-10 4l-8 4l-18 2l-2 -2l12 -4l10 -4l10 -4l12 -2l6 -4l14 -6l2 -2l6 -4l2 -8l6 -6l-12 4l-4 -2l-4 4l-8 -6l-2 4l-4 -4l-10 4l-6 0l0 -6l2 -4l-8 -4l-12 2l-8 -4l-8 -4l0 -4l-8 -6l4 -4l8 -6l4 -6l8 0l8 2l8 -6l6 2l8 -4l-2 -4l-6 -2l8 -4l-6 0l-10 2l-4 2l-8 -2l-14 2l-14 -2l-4 -4l-14 -6l14 -4l24 -6l8 0l-2 6l22 -2l-8 -6l-14 -4l-6 -4l-10 -4l-14 -4l6 -4l18 -2l12 -4l2 -4l10 -6l10 0l20 -4l8 0l16 -6l16 2zM666 -374l0 -6l-14 -4l-10 -4l-6 -6l-12 -6l-6 -10l-2 -2l-12 0l-4 -2l0 -8l-14 -6l-8 6l-8 4l0 4l-10 0l0 -36l26 -6l16 8l8 4l10 8l12 0l18 -2l10 8l0 10l6 0l2 8l12 0l2 6l4 0l4 -8l14 -6l6 -2l2 0l-8 6l8 4l6 -2l12 6l-12 6l-8 0l-4 0l-2 -2l2 -6l-12 2l-4 8l-4 4l-8 0l-4 4l8 2l2 8l-6 10l-8 -2l-4 0zM-714 -118l0 2l-6 2l4 4l0 6l-4 6l4 8l4 -2l2 -6l-4 -4l0 -8l12 -4l0 -4l2 -4l4 8l8 0l6 6l0 2l10 0l10 0l6 4l8 2l4 -4l0 -2l14 -2l12 0l-10 4l4 4l8 2l8 4l2 8l4 0l4 2l-8 6l0 4l4 4l-4 2l-6 2l0 4l-2 2l6 8l2 2l-4 4l-10 4l-8 2l-2 2l-8 -2l-8 -2l-2 2l4 2l0 6l2 8l8 0l0 2l-6 2l-2 6l-4 0l-8 4l-2 2l-8 0l-4 -4l-4 -10l-2 -4l-4 -2l4 -6l0 -2l-2 -2l-2 -8l0 -6l2 -4l2 -4l-2 -2l-6 0l-8 0l-4 2l-6 -10l-6 0l-14 0l-2 -4l-2 0l0 -2l0 -4l0 -4l-2 -2l-2 -4l-6 -2l4 -6l0 -6l4 -4l4 -4l2 -4l6 -2zM1080 -216l-12 10l-10 8l-2 8l8 10l10 14l8 6l6 8l6 18l-2 18l-8 6l-12 6l-8 8l-12 10l-4 -6l2 -8l-6 -4l8 -4l10 -2l-4 -6l16 -8l2 -12l-2 -6l2 -10l-2 -8l-8 -6l-6 -8l-10 -12l-12 -6l4 -4l6 -2l-4 -10l-12 0l-4 -8l-6 -8l6 -4l8 0l8 0l10 -6l4 4l10 2l-2 6l4 4l10 2zM1678 164l-2 2l-4 -4l0 -4l6 6zM1672 150l0 8l-2 -2l-2 0l-2 -2l0 -8l6 4zM356 -324l0 6l-2 4l-4 0l0 -2l2 -2l-2 0l2 -8l4 2zM532 -166l-8 2l-2 4l0 4l-10 4l-16 4l-10 8l-4 0l-2 0l-6 4l-6 2l-10 0l-2 2l-2 2l-2 0l-2 4l-6 -2l-2 2l-8 0l-2 -6l0 -6l-2 -2l-2 -8l-2 -4l2 0l0 -6l0 -2l0 -4l4 -2l0 -4l2 -6l4 2l2 0l12 0l2 0l10 2l4 0l2 2l4 -2l8 -10l10 -4l28 -4l8 16l4 8zM316 292l-2 2l-4 6l-4 4l-6 8l-10 10l-8 6l-8 4l-10 4l-4 0l-2 4l-6 -2l-6 2l-10 -2l-6 2l-4 -2l-10 4l-10 2l-6 4l-4 0l-4 -4l-4 0l-4 -4l0 2l-2 -4l0 -6l-2 -6l2 -2l0 -8l-6 -8l-6 -10l-6 -12l4 -6l4 4l2 4l4 0l6 2l6 0l8 -6l0 -36l4 2l6 8l-2 6l2 4l8 0l6 -6l4 -2l2 -4l6 -4l4 2l4 2l8 2l6 -4l2 -2l2 -6l4 0l4 -4l4 -6l8 -8l14 -8l4 2l6 0l2 0l6 0l4 14l4 8l-2 10l0 4l-4 -2l-4 2l0 2l-4 4l0 4l6 4l6 0l2 -4l8 0l-2 6l-2 10l-2 4l-6 4zM328 92l4 4l2 10l0 2l-2 8l2 8l-4 4l-4 10l6 2l-30 8l0 8l-6 0l-6 4l-2 4l-4 0l-8 8l-6 8l-2 0l-4 -2l-12 0l-2 -2l-4 -2l-6 -2l-8 4l-6 -8l-8 -8l2 -32l20 2l0 -4l0 -4l0 -4l0 -6l0 -2l2 0l2 2l4 0l6 2l4 4l8 2l6 -4l2 6l8 0l4 4l4 6l6 0l0 -10l-2 2l-8 -4l-2 -2l0 -10l2 -12l-2 -4l4 -6l2 -2l14 -2l4 2l4 2l4 2l6 2l6 2zM312 222l-6 0l-2 0l-6 0l-4 -2l-6 -4l-8 -2l-2 -6l0 -4l-6 0l-10 -12l-4 -4l-2 -2l-4 -8l12 0l4 2l2 0l6 -8l8 -8l4 0l2 -4l6 -4l6 0l2 2l8 0l4 2l2 4l6 0l4 4l0 12l-2 6l0 8l2 4l-2 6l-4 8l-10 10z";
var PLANE_D="M12 2c.8 0 1.4.9 1.4 2v5.2l7.6 4.6v2l-7.6-2.3v4.6l2.2 1.7v1.6L12 20.6l-3.6.8v-1.6l2.2-1.7v-4.6L3 15.8v-2l7.6-4.6V4c0-1.1.6-2 1.4-2z";
var mapEl=null,mapTips=[];
function initMap(){
  var el=document.getElementById("map");if(!el)return;
  var z=ZONES[mapZone],kx=Math.cos((z[0][1]+z[1][1])/2*Math.PI/180);
  var x0=z[0][0]*10*kx,x1=z[1][0]*10*kx,y0=-z[0][1]*10,y1=-z[1][1]*10;
  el.innerHTML='<svg viewBox="'+x0+' '+y0+' '+(x1-x0)+' '+(y1-y0)+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" role="img" aria-label="Carte des vols en cours"><g transform="scale('+kx+',1)"><path d="'+WORLD+'" style="fill:var(--land);stroke:var(--border-land)" stroke-width="0.7" vector-effect="non-scaling-stroke"/></g><g id="mapDyn"></g></svg><div class="map-tip" id="mapTip" hidden></div>';
  mapEl={el:el,kx:kx,w:x1-x0,h:y1-y0};
  var tip=el.querySelector("#mapTip");
  function show(e){var t=e.target.closest&&e.target.closest("[data-tip]");if(!t){tip.hidden=true;return;}
    var r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;tip.innerHTML=mapTips[+t.getAttribute("data-tip")]||"";tip.hidden=false;
    tip.style.left=Math.min(x+12,r.width-tip.offsetWidth-6)+"px";tip.style.top=Math.max(6,y-tip.offsetHeight-10)+"px";}
  el.addEventListener("pointermove",show);el.addEventListener("click",show);el.addEventListener("pointerleave",function(){tip.hidden=true;});
}
function drawMap(fl,hub,labelSet){
  if(!mapEl||!document.body.contains(mapEl.el))return;
  var el=mapEl.el,kx=mapEl.kx,s=Math.min(el.clientWidth/mapEl.w,el.clientHeight/mapEl.h)||1,u=1/s,out="";
  function P(o){return[o.lon*10*kx,-o.lat*10];}
  mapTips=[];
  fl.forEach(function(f){var a=P(f.a),b=P(f.b);out+='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" style="stroke:'+(f.late?"var(--bad)":"var(--ok)")+'" stroke-opacity=".35" stroke-width="1" vector-effect="non-scaling-stroke"/>';});
  Object.keys(AP).forEach(function(c){
    if(!AP[c]||!isFinite(AP[c].lat)||!isFinite(AP[c].lon))return;
    var p=P(AP[c]),h=c===hub;if(labelSet&&!labelSet[c]&&!h)return;
    mapTips.push("<b>"+c+"</b> "+AP[c].n);
    out+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(h?5:2.6)*u+'" style="fill:'+(h?"var(--accent)":"var(--muted)")+'" data-tip="'+(mapTips.length-1)+'"/><text x="'+(p[0]+6*u)+'" y="'+(p[1]+3.5*u)+'" font-size="'+10*u+'" font-family="IBM Plex Mono,monospace" style="fill:'+(h?"var(--accent)":"var(--muted)")+'">'+c+'</text>';
  });
  fl.forEach(function(f){
    var a=P(f.a),b=P(f.b),x=a[0]+(b[0]-a[0])*f.p,y=a[1]+(b[1]-a[1])*f.p,ang=Math.atan2(b[0]-a[0],-(b[1]-a[1]))*180/Math.PI,k=16*u/24;
    mapTips.push(f.tip);
    out+='<path d="'+PLANE_D+'" transform="translate('+x+' '+y+') rotate('+ang+') scale('+k+') translate(-12 -12)" style="fill:'+(f.late?"var(--bad)":"var(--ok)")+';cursor:pointer" data-tip="'+(mapTips.length-1)+'"/>';
  });
  var g=el.querySelector("#mapDyn");if(g)g.innerHTML=out;
}
window.addEventListener("resize",function(){if(typeof updateMap==="function")updateMap();});
var ZONES={eu:[[-12,52.5],[16,30]],world:[[-80,58],[62,-27]]};
function updateMap(){
  var t=simNow,fl=[],used={};used[HUB]=1;
  MV.forEach(function(f){
    var s=f.atd,e=f.real?(isFinite(f.ata)?f.ata:f.etaShow):f.ata;
    if(isCx(f,t)||!isFinite(s)||t<s||t>=e)return;
    var a=AP[f.from],b=AP[f.to];if(!a||!b||!isFinite(a.lat)||!isFinite(b.lat))return;
    var eta=f.real?f.etaShow:f.ata,lt=eta-f.sta>15;used[f.dest]=1;
    fl.push({a:a,b:b,p:Math.min(.98,(t-s)/(e-s)),late:lt,
      tip:"<b>"+f.id+"</b> · "+AL[f.al].n+"<br>"+f.from+" → "+f.to+" · "+TYPES[f.ty].n+"<br>ETA "+hhmm(eta)+(lt?" · <span style='color:var(--bad)'>+"+Math.round(eta-f.sta)+" min</span>":" · à l'heure")+(f.pax!=null?"<br>"+f.pax+" passagers":"")});
  });
  drawMap(fl,HUB,(REAL||mapZone==="world")?used:null);
}

/* ---------- vols ---------- */
function vFlights(){
  var t=simNow,dep=[],arr=[];
  MV.forEach(function(f){
    if(flAl!=="all"&&f.al!==flAl)return;
    var r=ref(f),st=status(f,t);
    if(f.dir==="D"){if(done(f,t)&&t-(f.atd+(f.taxi||12))>25)return;}else if(done(f,t)&&t-f.ata>25)return;
    if(r>t+240)return;if(r<t-150&&!(t>=f.atd&&!done(f,t)))return;
    (f.dir==="D"?dep:arr).push(f);
  });
  var all=dep.concat(arr),w=0,b=0;all.forEach(function(f){var s=sev(f,t);if(s==="warn")w++;if(s==="bad")b++;});
  function rows(list,isDep){
    return list.slice(0,30).map(function(f){
      var st=status(f,t),s=sev(f,t),k=known(f,t),cx=isCx(f,t),other=isDep?f.to:f.from,l=late(f);
      var est=cx?"—":(k?hhmm(isDep?(f.real?f.etdShow:f.atd):(f.real?f.etaShow:f.ata)):"—");
      return'<tr class="'+(cx?"cx bad":s)+'"><td class="mono fl">'+f.id+'</td><td><span class="alc" title="'+AL[f.al].n+'">'+f.al+'</span></td><td class="mono">'+hhmm(isDep?f.std:f.sta)+'</td><td class="mono">'+est+'</td><td><b class="mono">'+other+'</b> '+AP[other].n+'</td><td class="mono">'+(REAL?(f.term?'T'+f.term:'—'):'Orly '+f.term)+(f.stand?' · '+f.stand:'')+'</td><td>'+TYPES[f.ty].n+'</td><td class="num">'+(cx||f.pax==null?"—":f.pax)+'</td><td class="num">'+(cx||!k?"—":(l>0?"+"+Math.round(l):Math.round(l)))+'</td><td class="mono">'+(f.rsn&&k&&!cx&&f.delay>5?f.rsn[0]:"")+'</td><td><span class="pill '+st.c+'">'+st.l+'</span></td></tr>';
    }).join("");
  }
  function table(list,isDep,title){
    return'<section class="panel"><div class="panel-h"><h2>'+title+'</h2><span class="meta">'+list.length+' vols</span></div><div class="tbl-wrap"><table><thead><tr><th>Vol</th><th>Cie</th><th>'+(isDep?"STD":"STA")+'</th><th>'+(isDep?"ETD":"ETA")+'</th><th>'+(isDep?"Destination":"Provenance")+'</th><th>Terminal · poste</th><th>Avion</th><th>Pax</th><th>Retard</th><th>Motif</th><th>Statut</th></tr></thead><tbody>'+(rows(list,isDep)||'<tr><td colspan="11" style="color:var(--muted)">Aucun vol dans cette fenêtre.</td></tr>')+'</tbody></table></div></section>';
  }
  var seg='<div class="seg" role="group" aria-label="Affichage"><button data-fv="both" aria-pressed="'+(flView==="both")+'">Les deux</button><button data-fv="dep" aria-pressed="'+(flView==="dep")+'">Départs</button><button data-fv="arr" aria-pressed="'+(flView==="arr")+'">Arrivées</button></div>';
  var sel='<select id="flAl" aria-label="Compagnie"><option value="all">Toutes les compagnies</option>'+Object.keys(AL).map(function(c){return'<option value="'+c+'"'+(flAl===c?" selected":"")+'>'+c+' · '+AL[c].n+'</option>';}).join("")+'</select>';
  main.innerHTML=head("Départs et arrivées","Fenêtre glissante de 4 h, surlignée selon la gravité",sel+seg+importTools())+importResult()+
   '<div class="summary-strip"><span class="s"><b>'+(all.length-w-b)+'</b> normaux</span><span class="s"><span class="sev warn"></span><b>'+w+'</b> retard 16–30 min</span><span class="s"><span class="sev bad"></span><b>'+b+'</b> retard &gt; 30 min, annulé ou risque couvre-feu</span></div>'+
   '<div class="flights" style="'+(flView==="both"?"":"grid-template-columns:minmax(0,1fr)")+'">'+(flView!=="arr"?table(dep,true,"Départs "+HUB):"")+(flView!=="dep"?table(arr,false,"Arrivées "+HUB):"")+'</div>'+
   '<p class="note">Motifs : codes de retard IATA (93 rotation, 41 technique, 15 embarquement, 81 ATFM, 71 météo, 63 équipage, 32 chargement). '+(REAL?'Heures estimées et réelles transmises par la source de données. « Départ non confirmé » : heure prévue dépassée sans information.':'Postes « L » : stationnement au large. Les estimations apparaissent 2 h avant le départ.')+'</p>';
}
main.addEventListener("change",function(e){
  if(e.target.id==="flAl"){flAl=e.target.value;render(true);}
  if(e.target.id==="impFile"&&e.target.files&&e.target.files[0]){runImport(e.target.files[0]);}
  if(e.target.id==="bmSel"){bmKpi=e.target.value;render(true);}
  if(e.target.classList.contains("switch")){var r=RULES.filter(function(x){return x.id===e.target.dataset.rule;})[0];if(r)r.on=e.target.checked;}
});

/* ---------- météo : décodage METAR ---------- */
var METAR=[["LFPO","Paris-Orly","22014KT 9999 -SHRA FEW018 BKN035 14/10 Q1012"],["LFMN","Nice","04015G28KT 8000 TSRA SCT040CB 20/14 Q1010"],["LFKJ","Ajaccio","05008KT CAVOK 21/12 Q1016"],["DAAG","Alger","VRB03KT 9999 FEW030 22/15 Q1015"],["GMMX","Marrakech","36005KT 9999 NSC 24/09 Q1017"],["LPPT","Lisbonne","33012KT 9999 FEW020 19/13 Q1020"],["TFFR","Pointe-à-Pitre","09012KT 9999 VCSH FEW018CB SCT030 29/24 Q1013"],["FMEE","La Réunion","11016KT 9999 SCT025 24/18 Q1018"]];
var WXT={TS:"orage",RA:"pluie",SN:"neige",DZ:"bruine",FG:"brouillard",BR:"brume",DU:"poussière",SA:"sable",HZ:"brume sèche",SH:"averses",GR:"grêle"};
var CLD={FEW:"Peu",SCT:"Épars",BKN:"Fragmenté",OVC:"Couvert"};
function decode(raw){
  var o={wind:null,vis:9999,wx:[],clouds:[],ceil:99999,cb:false};
  raw.split(/\s(?:TEMPO|BECMG|NOSIG|RMK)\b/)[0].split(/\s+/).forEach(function(p){
    var m;
    if((m=p.match(/^(\d{3}|VRB)(\d{2})(?:G(\d{2}))?KT$/)))o.wind={dir:m[1]==="VRB"?null:+m[1],spd:+m[2],gst:m[3]?+m[3]:null};
    else if(p==="CAVOK"){o.vis=10000;o.cavok=true;}
    else if(p==="NSC"){}
    else if(/^\d{4}$/.test(p))o.vis=+p;
    else if((m=p.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/))){var h=+m[2]*100;o.clouds.push({c:m[1],h:h,cb:m[3]});if(m[3]==="CB")o.cb=true;if(m[1]==="BKN"||m[1]==="OVC")o.ceil=Math.min(o.ceil,h);}
    else if((m=p.match(/^VV(\d{3})$/))){o.ceil=Math.min(o.ceil,+m[1]*100);o.clouds.push({c:"VV",h:+m[1]*100});}
    else if((m=p.match(/^(M?\d{2})\/(M?\d{2})$/))){o.t=+m[1].replace("M","-");o.td=+m[2].replace("M","-");}
    else if((m=p.match(/^Q(\d{4})$/)))o.q=+m[1];
    else if((m=p.match(/^([-+]?)(VC)?([A-Z]{2,6})$/))){
      var txt=(m[3].match(/.{2}/g)||[]).map(function(c){return WXT[c]||"";}).filter(Boolean);
      if(txt.length){o.wx.push((m[1]==="-"?"faible ":m[1]==="+"?"forte ":"")+txt.join(" + ")+(m[2]?" au voisinage":""));if(/TS/.test(m[3])&&!m[2])o.ts=true;}
    }
  });
  var v=o.vis,c=o.ceil;
  o.cat=(v<1600||c<500)?"LIFR":(v<5000||c<1000)?"IFR":(v<8000||c<3000)?"MVFR":"VFR";
  o.flags=[];
  if(o.ts||o.cb)o.flags.push(["bad","Orage / cumulonimbus"]);
  if(o.wind&&(o.wind.gst||0)>=30)o.flags.push(["bad","Rafales "+o.wind.gst+" kt"]);
  else if(o.wind&&(o.wind.gst||o.wind.spd)>=25)o.flags.push(["warn","Vent fort"]);
  if(v<1500)o.flags.push(["bad","Visibilité "+v+" m"]);else if(v<5000)o.flags.push(["warn","Visibilité réduite"]);
  if(c<500)o.flags.push(["bad","Plafond "+c+" ft"]);else if(c<1000)o.flags.push(["warn","Plafond bas"]);
  return o;
}
function rwyConfig(){if(!METAR.length)return"—";var w=decode(METAR[0][2]).wind;if(!w||w.dir==null)return"Face à l'ouest";return(w.dir>=130&&w.dir<=310)?"Face à l'ouest":"Face à l'est";}
function windSvg(w){
  var mut=tok("--muted"),acc=tok("--accent"),ln=tok("--line"),txt=tok("--text");
  var s='<svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="30" fill="none" stroke="'+ln+'"/>';
  ["N","E","S","O"].forEach(function(l,i){var a=i*Math.PI/2;s+='<text x="'+(38+Math.sin(a)*24)+'" y="'+(41-Math.cos(a)*24)+'" text-anchor="middle" font-size="8" fill="'+mut+'" font-family="IBM Plex Mono">'+l+'</text>';});
  if(w&&w.dir!=null){var a=w.dir*Math.PI/180,x1=38+Math.sin(a)*29,y1=38-Math.cos(a)*29,x2=38-Math.sin(a)*10,y2=38+Math.cos(a)*10;
    s+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+acc+'" stroke-width="2.4" stroke-linecap="round"/><circle cx="'+x2+'" cy="'+y2+'" r="3" fill="'+acc+'"/>';}
  s+='<text x="38" y="'+(w&&w.dir!=null?62:42)+'" text-anchor="middle" font-size="9" fill="'+txt+'" font-family="IBM Plex Mono">'+(w?(w.dir==null?"VRB ":"")+w.spd+"kt":"")+'</text></svg>';
  return s;
}
function vWeather(){
  var d=new Date(),stamp=pad(d.getUTCDate())+pad(d.getUTCHours())+(d.getUTCMinutes()<30?"00":"30")+"Z";
  main.innerHTML=head("Météo",REAL?HOME_NAME+" et principales escales, METAR réels (aviationweather.gov)":"Orly et principales escales, METAR décodés")+'<div class="wx">'+METAR.map(function(m,i){
    var o=decode(m[2]),w=o.wind;
    var cl=o.cavok?"CAVOK (rien à signaler)":o.clouds.length?o.clouds.map(function(c){return(c.c==="VV"?"Ciel invisible":CLD[c.c])+" "+fmt(c.h)+" ft"+(c.cb?" "+c.cb:"");}).join(", "):"Pas de nuage significatif";
    var extra=i===0&&HUB==="ORY"?'<span class="pill air">Configuration '+rwyConfig().toLowerCase()+'</span>':'';
    return'<article class="panel wx-card'+(i===0?" home":"")+'"><div class="wx-top"><div><h3 class="mono">'+m[0]+'</h3><span class="city">'+m[1]+'</span></div><span class="cat '+o.cat+'" title="Catégorie de vol">'+o.cat+'</span></div>'+
     '<div class="wx-grid"><div class="wind">'+windSvg(w)+'</div><div class="wx-facts">'+
     '<span><span class="label">Vent</span><b>'+(w?(w.dir==null?"Variable":w.dir+"°")+" / "+w.spd+" kt"+(w.gst?" rafales "+w.gst:""):"—")+'</b></span>'+
     '<span><span class="label">Visibilité</span><b>'+(o.vis>=9999?"≥ 10 km":fmt(o.vis)+" m")+'</b></span>'+
     '<span><span class="label">Temp. / rosée</span><b>'+o.t+'° / '+o.td+'°</b></span>'+
     '<span><span class="label">QNH</span><b>'+o.q+' hPa</b></span>'+
     '<span style="grid-column:1/-1"><span class="label">Temps / nuages</span><b>'+(o.wx.length?o.wx.join(", ")+" · ":"")+cl+'</b></span></div></div>'+
     '<div class="flags">'+extra+o.flags.map(function(f){return'<span class="pill '+f[0]+'">'+f[1]+'</span>';}).join("")+'</div>'+
     '<div class="raw">'+(m[3]?esc(m[2])+' · reçu à '+m[3]:'METAR '+m[0]+' '+stamp+' '+m[2])+'</div></article>';
  }).join("")+'</div><p class="note">Catégories : VFR, MVFR (visibilité &lt; 8 km ou plafond &lt; 3 000 ft), IFR (&lt; 5 km ou &lt; 1 000 ft), LIFR (&lt; 1 600 m ou &lt; 500 ft). '+(REAL?'':'Messages d\'exemple.')+(REAL&&!METAR.length?' Aucune observation reçue : vérifiez la collecte météo (table watched_stations).':'')+'</p>';
}

/* ---------- plateforme Orly ---------- */
function vAirport(){
  if(REAL)return vAirportReal();
  var t=simNow,occ={},remote=0,k=kpis(t);
  SLOTS.forEach(function(sl){
    if(!sl.stand||t<sl.s||t>=sl.e)return;
    if(sl.a&&!sl.d&&isCx(sl.a,t))return;if(sl.d&&isCx(sl.d,t)&&!sl.a)return;
    if(sl.a&&t<sl.a.ata)return;
    if(sl.stand.charAt(0)==="L"){remote++;return;}occ[sl.stand]=sl;
  });
  var ln=tok("--line"),mut=tok("--muted"),pan2=tok("--panel-2"),txt=tok("--text"),col={"":txt,warn:tok("--warn"),bad:tok("--bad")};
  var W=760,H=470,s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Plan schématique des postes de stationnement d\'Orly">';
  function rwy(y,a,b,lbl){return'<rect x="34" y="'+y+'" width="692" height="16" rx="2" fill="'+pan2+'" stroke="'+ln+'"/><text x="42" y="'+(y+12)+'" fill="'+mut+'" font-size="10" font-family="IBM Plex Mono">'+a+'</text><text x="718" y="'+(y+12)+'" text-anchor="end" fill="'+mut+'" font-size="10" font-family="IBM Plex Mono">'+b+'</text><text x="380" y="'+(y+12)+'" text-anchor="middle" fill="'+mut+'" font-size="9" font-family="IBM Plex Mono" letter-spacing="1">'+lbl+'</text>';}
  s+=rwy(14,"07","25","PISTE 07/25 · 3 320 m");
  s+='<line x1="34" y1="44" x2="726" y2="44" stroke="'+ln+'" stroke-dasharray="6 5"/>';
  function stand(id,x,y){
    var sl=occ[id],f=sl?(sl.d||sl.a):null,sv=sl&&sl.d?sev(sl.d,t):"",c=f?col[sv]:ln;
    var g='<rect x="'+x+'" y="'+y+'" width="36" height="96" rx="3" fill="none" stroke="'+ln+'"/><text x="'+(x+18)+'" y="'+(y+12)+'" text-anchor="middle" font-size="9.5" fill="'+mut+'" font-family="IBM Plex Mono">'+id+'</text>';
    if(f){g+='<path transform="translate('+(x+5)+','+(y+17)+') scale(1.08)" d="M12 2c.8 0 1.4.9 1.4 2v5.2l7.6 4.6v2l-7.6-2.3v4.6l2.2 1.7v1.6L12 20.6l-3.6.8v-1.6l2.2-1.7v-4.6L3 15.8v-2l7.6-4.6V4c0-1.1.6-2 1.4-2z" fill="'+c+'"/>'+
      '<text x="'+(x+18)+'" y="'+(y+56)+'" text-anchor="middle" font-size="8.5" fill="'+txt+'" font-family="IBM Plex Mono">'+f.id+'</text>'+
      '<text x="'+(x+18)+'" y="'+(y+70)+'" text-anchor="middle" font-size="8.5" fill="'+(sv?c:mut)+'" font-family="IBM Plex Mono">'+(sl.d?sl.d.to:"nuit")+'</text>'+
      '<text x="'+(x+18)+'" y="'+(y+83)+'" text-anchor="middle" font-size="8.5" fill="'+(sv?c:mut)+'" font-family="IBM Plex Mono">'+(sl.d?hhmm(sl.d.atd):"—")+'</text>';}
    else g+='<text x="'+(x+18)+'" y="'+(y+54)+'" text-anchor="middle" font-size="8.5" fill="'+mut+'" font-family="IBM Plex Sans">libre</text>';
    return g;
  }
  function row(y,terms){
    var n=terms.reduce(function(a,tm){return a+STANDS[tm].length;},0),wid=n*38-2+24*(terms.length-1),x=(W-wid)/2,out="";
    terms.forEach(function(tm){
      var len=STANDS[tm].length*38-2;
      out+='<rect x="'+x+'" y="'+y+'" width="'+len+'" height="20" rx="3" fill="'+pan2+'" stroke="'+ln+'"/><text x="'+(x+len/2)+'" y="'+(y+14)+'" text-anchor="middle" fill="'+mut+'" font-size="11" font-family="IBM Plex Sans" letter-spacing="2">ORLY '+tm+'</text>';
      STANDS[tm].forEach(function(id,i){out+=stand(id,x+i*38,y+28);});
      x+=len+24;
    });
    return out;
  }
  s+=row(58,["1","2"])+row(206,["3","4"]);
  s+='<line x1="34" y1="350" x2="726" y2="350" stroke="'+ln+'" stroke-dasharray="6 5"/>';
  s+='<line x1="120" y1="440" x2="300" y2="372" stroke="'+ln+'" stroke-width="10" stroke-linecap="round" opacity=".55"/><text x="306" y="374" fill="'+mut+'" font-size="9" font-family="IBM Plex Mono">02/20 · 2 400 m</text>';
  s+=rwy(440,"06","24","PISTE 06/24 · 3 650 m");
  s+='</svg>';
  var used=Object.keys(occ).length,totSt=Object.keys(STANDS).reduce(function(a,x){return a+STANDS[x].length;},0);
  var inCF=t<CF_END||t>=CF_ARR,toDep=CF_DEP-t,toArr=CF_ARR-t;
  var cf=inCF?'<span class="label">Couvre-feu</span><b style="color:var(--bad)">En cours</b><span style="color:var(--muted);font-size:12.5px">Aucun mouvement jusqu\'à 06:00.</span>':
    '<span class="label">Avant le couvre-feu</span><b>'+(toDep>0?dur(toDep):"Départs clos")+'</b><span style="color:var(--muted);font-size:12.5px">Dernier départ du poste à 23:15'+(toDep<=0?' · derniers atterrissages avant 23:30 ('+dur(toArr)+')':', dernier atterrissage à 23:30')+'.</span>';
  var risks=MV.filter(function(f){return f.cf&&!isCx(f,t)&&known(f,t)&&!done(f,t);});
  var rl=risks.length?'<ul class="risk">'+risks.map(function(f){return'<li><span class="mono">'+f.id+'</span><span>'+(f.dir==="D"?"→ "+f.to+", départ poste estimé ":"← "+f.from+", atterrissage estimé ")+'<b class="mono" style="color:var(--bad)">'+hhmm(f.dir==="D"?f.atd:f.ata)+'</b></span></li>';}).join("")+'</ul>':'<p class="note" style="margin:0">Aucun vol à risque pour l\'instant.</p>';
  main.innerHTML=head("Plateforme Orly","Postes, pistes, roulage et couvre-feu")+
   '<div class="apt"><section class="panel apron"><div class="panel-h"><h2>Postes au contact</h2><span class="meta">'+used+' / '+totSt+' occupés · '+remote+' au large</span></div><div class="panel-b tbl-wrap">'+s+'</div><p class="note" style="padding:0 14px 12px;margin:0">Plan schématique, non à l\'échelle. Couleur de l\'avion : blanc = à l\'heure, jaune = retard 16–30 min, rouge = retard &gt; 30 min ou risque couvre-feu. Sous l\'avion : prochain vol, destination et heure de départ estimée.</p></section>'+
   '<section class="panel"><div class="panel-h"><h2>Pistes &amp; couvre-feu</h2></div><div class="panel-b rwy">'+
   '<div class="rwy-item"><b>Config.</b><span>'+rwyConfig()+' (vent LFPO)</span></div>'+
   '<div class="rwy-item"><b>06 / 24</b><span>3 650 m</span><span class="pill ok">En service</span></div>'+
   '<div class="rwy-item"><b>07 / 25</b><span>3 320 m</span><span class="pill ok">En service</span></div>'+
   '<div class="rwy-item"><b>02 / 20</b><span>2 400 m</span><span class="pill">Peu utilisée</span></div>'+
   '<div class="curfew">'+cf+'</div>'+
   '<div class="minis"><div class="mini"><span class="label">Roulage sortie</span><b>'+fx(k.taxi,1)+' min</b></div><div class="mini"><span class="label">Roulage entrée</span><b>'+fx(k.taxiIn,1)+' min</b></div>'+
   '<div class="mini"><span class="label">Postes occupés</span><b>'+pct(used/totSt,0)+' %</b></div><div class="mini"><span class="label">Risque couvre-feu</span><b style="color:'+(risks.length?"var(--bad)":"var(--text)")+'">'+risks.length+'</b></div></div>'+
   '<div><span class="label">Vols à risque couvre-feu</span>'+rl+'</div>'+
   '</div></section></div>';
}

/* ---------- benchmark ---------- */
var BM_K=[["otpD","Ponctualité départ","%",true],["otpA","Ponctualité arrivée","%",true],["reg","Régularité","%",true],["dmF","Retard moyen par départ","min",false],["taxiAll","Roulage sortie moyen","min",false],["slf","Remplissage","%",true],["co2pk","CO₂ par passager-km","g",false]];
function val(o,key){var v=o[key];return(key==="otpD"||key==="otpA"||key==="reg"||key==="slf")?v*100:v;}
function vBench(){
  var t=simNow,def=BM_K.filter(function(x){return x[0]===bmKpi;})[0],dec=def[0]==="co2pk"?0:1;
  var data={};Object.keys(AL).forEach(function(c){data[c]=kpis(t,function(f){return f.al===c;});});
  var list=Object.keys(AL).map(function(c){return{c:c,v:val(data[c],bmKpi)};}).filter(function(x){return isFinite(x.v);}).sort(function(a,b){return def[3]?b.v-a.v:a.v-b.v;});
  var mx=Math.max.apply(null,list.map(function(x){return x.v;}))||1;
  var sel='<label class="label" for="bmSel">Indicateur</label><select id="bmSel">'+BM_K.map(function(x){return'<option value="'+x[0]+'"'+(x[0]===bmKpi?" selected":"")+'>'+x[1]+'</option>';}).join("")+'</select>';
  var bars=list.length?list.map(function(x,i){return'<div class="bar'+(i===0?" top":"")+'"><span class="lab">'+(i+1)+'. <span class="alc">'+x.c+'</span> '+AL[x.c].n+'</span><span class="track"><span class="fill" style="width:'+(x.v/mx*100)+'%"></span></span><span class="n">'+x.v.toFixed(dec)+' '+def[2]+'</span></div>';}).join(""):'<p class="note" style="margin:0">Pas encore assez de vols aujourd\'hui pour comparer.</p>';
  var best={};BM_K.forEach(function(kk){var vals=Object.keys(AL).map(function(c){return val(data[c],kk[0]);}).filter(isFinite);var mxv=Math.max.apply(null,vals),mnv=Math.min.apply(null,vals);best[kk[0]]=(vals.length>1&&mxv-mnv>1e-9)?(kk[3]?mxv:mnv):null;});
  var heat='<table class="heat"><thead><tr><th>Compagnie</th><th style="text-align:right">Mouvements</th>'+BM_K.map(function(x){return'<th style="text-align:right">'+x[1]+(x[2]?' ('+x[2]+')':'')+'</th>';}).join("")+'</tr></thead><tbody>'+Object.keys(AL).map(function(c){return'<tr><td><span class="alc">'+c+'</span> '+AL[c].n+' <span style="color:var(--muted);font-size:12px">· '+AL[c].d+'</span></td><td class="h">'+data[c].mv+'</td>'+BM_K.map(function(x){var v=val(data[c],x[0]);return'<td class="h'+(isFinite(v)&&v===best[x[0]]?" best":"")+'">'+(isFinite(v)?v.toFixed(x[0]==="co2pk"?0:1):"—")+'</td>';}).join("")+'</tr>';}).join("")+'</tbody></table>';
  function internal(keyFn,labels){
    var g={};MV.forEach(function(f){if(f.dir!=="D"||isCx(f,t)||t<f.atd)return;var key=keyFn(f);g[key]=g[key]||{n:0,ot:0};g[key].n++;if(f.delay<=15)g[key].ot++;});
    var ks=Object.keys(g).sort(function(a,b){return g[b].ot/g[b].n-g[a].ot/g[a].n;});
    if(!ks.length)return'<p class="note" style="margin:0">Pas encore de départs.</p>';
    return ks.map(function(key){var v=g[key].ot/g[key].n;return'<div class="bar"><span class="lab">'+(labels?labels(key):key)+' <span style="color:var(--muted)">('+g[key].n+')</span></span><span class="track"><span class="fill" style="width:'+(v*100)+'%;background:'+(v>=.8?"var(--ok)":v>=.7?"var(--warn)":"var(--bad)")+'"></span></span><span class="n">'+pct(v,0)+' %</span></div>';}).join("");
  }
  main.innerHTML=head("Benchmark des compagnies","Comparaison des compagnies opérant à "+(REAL?esc(HOME_NAME):"Orly")+", sur les vols du jour",sel)+
   '<div class="bm"><section class="panel"><div class="panel-h"><h2>'+def[1]+'</h2><span class="meta">Classement du jour</span></div><div class="panel-b rank">'+bars+'</div></section>'+
   '<section class="panel"><div class="panel-h"><h2>Benchmark de la plateforme</h2><span class="meta">Ponctualité départ du jour</span></div><div class="panel-b"><span class="label">Par terminal</span><div class="bars" style="margin:8px 0 16px">'+internal(function(f){return f.term;},function(x){return"Orly "+x;})+'</div><span class="label">Par région de destination</span><div class="bars" style="margin-top:8px">'+internal(function(f){return AP[f.dest].reg;})+'</div></div></section></div>'+
   '<section class="panel" style="margin-top:14px"><div class="panel-h"><h2>Tableau comparatif</h2><span class="meta">Souligné vert : meilleure valeur</span></div><div class="tbl-wrap">'+heat+'</div></section>'+
   '<p class="note">'+(REAL?'Valeurs calculées sur les vols réels de la journée, avec les définitions certifiées AeroPulse.':'Compagnies fictives. Les valeurs sont calculées sur les vols simulés de la journée ; le CO₂ par passager-km est une estimation par type d\'avion.')+'</p>';
}

/* ---------- catalogue KPI ---------- */
var CAT=[
 ["Plateforme aéroportuaire",[["Mouvements","Décollages et atterrissages réalisés, à rapprocher du plafond de 250 000 mouvements par an."],["Vols à risque couvre-feu","Départs estimés après 23:15 au poste, ou atterrissages estimés après 23:30."],["Occupation des postes","Postes au contact occupés rapportés aux postes disponibles, et avions placés au large."],["Mouvements par heure","Départs et arrivées programmés et réalisés, heure par heure."]]],
 ["Opérations générales",[["Retard à l'arrivée","Minutes de retard cumulées sur les vols arrivés."],["Ponctualité arrivée","Part des vols arrivés avec 15 min de retard au plus.","67 %"],["Arrivées","Nombre de vols arrivés."],["Annulations","Nombre de vols annulés sur la période."],["Taux d'annulation","Vols annulés rapportés aux vols programmés."],["Minutes de retard","Minutes de retard cumulées des vols partis.","82 %"],["Motifs de retard","Minutes de retard ventilées par code motif."],["Retard départ par passager","Minutes de retard rapportées au nombre de passagers transportés."],["Retard départ par vol","Minutes de retard rapportées au nombre de vols effectués."],["Départs","Nombre de vols partis."],["Ponctualité départ","Part des vols partis avec 15 min de retard au plus.","100 %"],["Déroutements","Nombre de vols déroutés."],["Régularité","Vols effectués rapportés aux vols programmés.","90 %"],["Utilisation","Passagers enregistrés ou embarqués rapportés aux sièges offerts.","71 %"],["Coefficient de remplissage","Passagers-kilomètres transportés rapportés aux sièges-kilomètres offerts."]]],
 ["Passagers",[["Passagers en vol","Passagers embarqués sur les vols en cours."],["Passagers transportés","Passagers transportés sur la période, souvent par classe."],["Passagers satisfaits","Part des passagers arrivés à l'heure."],["Passagers insatisfaits","Part des passagers arrivés en retard ou pas arrivés à destination."],["Passagers touchés par une perturbation","Passagers concernés par une annulation, un déroutement ou un retard."]]],
 ["Contrôle des opérations",[["Changements d'avion","Nombre de changements d'appareil."],["Changements d'équipement","Nombre de changements de version ou d'équipement."],["Changements de porte","Nombre de changements de porte."],["Changements d'équipage","Nombre de changements d'équipage."],["Irrégularités","Nombre d'irrégularités : retards, changements d'avion, déroutements…"],["Ratio d'irrégularité","Vols touchés par une irrégularité rapportés aux vols effectués."]]],
 ["Correspondances",[["Correspondances manquées","Passagers enregistrés n'ayant pas pu prendre leur vol suivant."],["Taux de correspondances manquées","Correspondances manquées rapportées aux passagers en correspondance.","45 %"],["Suffisance du temps minimum de connexion","Part des correspondances manquées malgré un temps supérieur au minimum."]]],
 ["Masse & centrage",[["Poids des bagages","Bagages transportés, en tonnes."],["Bagages à bord","Bagages des vols partis et pas encore arrivés."],["Poids du fret","Fret transporté, en tonnes."]]],
 ["Bagages",[["Indice bagages laissés","Part des bagages restés à l'aéroport de départ."],["Bagages laissés","Nombre de bagages restés à l'aéroport de départ."],["Indice bagages mal acheminés","Part des bagages non arrivés à destination."],["Bagages mal acheminés","Nombre de bagages non arrivés à destination."]]],
 ["Gestion de la ponctualité",[["Récupération au sol","Part des arrivées en retard suivies d'un départ à l'heure."],["Suffisance du temps au sol","Part des vols arrivés à l'heure et repartis à l'heure."],["Récupération en vol","Part des départs en retard arrivés à l'heure."],["Suffisance du temps bloc","Part des vols partis et arrivés à l'heure."],["Avion prêt à l'embarquement","Part des vols dont l'avion était prêt au début de l'embarquement."],["Avions de réserve disponibles","Nombre d'avions de réserve disponibles."],["Temps de roulage moyen","Temps entre atterrissage et calage, ou entre départ du poste et décollage."]]],
 ["Carburant & environnement",[["Consommation de carburant","Carburant consommé sur la période."],["Carburant par passager","Carburant rapporté aux passagers transportés."],["Carburant par passager-km","Carburant rapporté aux passagers-kilomètres."],["Émissions de CO₂","CO₂ émis sur la période."],["CO₂ par passager","CO₂ rapporté aux passagers transportés."],["CO₂ par passager-km","CO₂ rapporté aux passagers-kilomètres."]]],
 ["Maintenance",[["Événements planifiés","Opérations de maintenance prévues, par type."],["Événements non planifiés","Opérations de maintenance imprévues."],["Utilisation des avions de réserve","Temps d'utilisation des avions de réserve rapporté au temps disponible."],["Remise en service à l'heure","Part des avions remis en service à l'heure."],["AOG","Nombre d'avions immobilisés au sol."]]],
 ["Équipages",[["Équipages de réserve disponibles","Équipages de réserve disponibles, par fonction."],["Ponctualité du bus équipage","Vols où le bus équipage est arrivé à l'heure à l'avion."],["Changements d'avion de l'équipage","Vols où l'équipage change d'appareil, cockpit et cabine."],["Équipage prêt à l'embarquement","Vols où l'équipage était prêt au début de l'embarquement."],["Équipage en vol","Personnels navigants actuellement en vol."]]],
 ["Performance",[["Productivité avion","Heures bloc rapportées aux heures disponibles."],["Rentabilité","Rentabilité globale, par type d'avion, ligne ou région."],["Taux de vols rentables","Vols rentables rapportés aux vols effectués."],["Indemnisations","Montant des indemnisations dues aux retards et annulations."]]]
];
function vCatalog(first){
  var total=CAT.reduce(function(s,c){return s+c[1].length;},0);
  if(first||!document.getElementById("catBody")){
    main.innerHTML=head("Catalogue KPI",total+" indicateurs répartis en "+CAT.length+" familles")+
     '<div class="cat-tools"><input type="search" id="catQ" placeholder="Rechercher un indicateur" aria-label="Rechercher un indicateur" value="'+esc(catQ)+'"><select id="catF" aria-label="Famille"><option value="all">Toutes les familles</option>'+CAT.map(function(c,i){return'<option value="'+i+'"'+(String(i)===catF?" selected":"")+'>'+c[0]+'</option>';}).join("")+'</select></div><div id="catBody"></div>'+
     '<p class="note">Le pourcentage indique la part des compagnies qui suivent cet indicateur sur leur tableau de bord, d\'après l\'étude citée dans le guide. La famille « Plateforme aéroportuaire » est ajoutée pour Orly.</p>';
    document.getElementById("catQ").addEventListener("input",function(e){catQ=e.target.value;drawCat();});
    document.getElementById("catF").addEventListener("change",function(e){e.stopPropagation();catF=e.target.value;drawCat();});
  }
  drawCat();
}
function drawCat(){
  var q=catQ.trim().toLowerCase(),h="";
  CAT.forEach(function(c,i){
    if(catF!=="all"&&String(i)!==catF)return;
    var items=c[1].filter(function(k){return!q||(k[0]+" "+k[1]).toLowerCase().indexOf(q)>=0;});
    if(!items.length)return;
    h+='<section class="panel"><div class="panel-h"><h2>'+c[0]+'</h2><span class="meta">'+items.length+'</span></div>'+items.map(function(k){return'<div class="kdef"><b>'+k[0]+'</b>'+(k[2]?'<span class="top6" title="Part des compagnies qui suivent cet indicateur">'+k[2]+'</span>':'<span></span>')+'<p>'+k[1]+'</p></div>';}).join("")+'</section>';
  });
  document.getElementById("catBody").innerHTML=h?'<div class="catgrid">'+h+'</div>':'<p class="note">Aucun indicateur ne correspond à « '+esc(catQ)+' ».</p>';
}

/* ---------- alertes ---------- */
function vAlerts(){
  unread=0;updBell();
  main.innerHTML=head("Alertes","Règles de notification et historique")+
   '<div class="al"><section class="panel"><div class="panel-h"><h2>Règles</h2><span class="meta">Envoyées sur mobile, tablette et montre</span></div><div>'+RULES.map(function(r){return'<div class="rule"><input type="checkbox" class="switch" id="rule-'+r.id+'" data-rule="'+r.id+'"'+(r.on?" checked":"")+'><label for="rule-'+r.id+'">'+r.t+'</label><p>'+r.d+'</p></div>';}).join("")+'</div></section>'+
   '<section class="panel"><div class="panel-h"><h2>Historique</h2><span class="meta">'+EVENTS.length+' notifications</span></div><div class="panel-b" style="padding-block:4px"><ul class="feed" id="feedAl">'+feedHtml(40)+'</ul></div></section></div>';
}
function feedHtml(n){
  if(!EVENTS.length)return'<li><time></time><span></span><span style="color:var(--muted)">Aucune alerte pour l\'instant. Elles apparaîtront ici dès qu\'une règle se déclenche.</span></li>';
  return EVENTS.slice(0,n).map(function(e){return'<li><time>'+hhmm(e.t)+'</time><span class="sev '+e.s+'"></span><span>'+e.m+'</span></li>';}).join("");
}
function rule(id){return RULES.filter(function(x){return x.id===id;})[0];}
function push(id,s,m,key,silent){
  if(seen[key])return;seen[key]=1;var r=rule(id);if(!r||!r.on)return;
  EVENTS.unshift({t:simNow,s:s,m:m});if(EVENTS.length>80)EVENTS.pop();
  if(silent)return;
  if(cur!=="al"){unread++;updBell();}
  var box=document.getElementById("toasts"),el=document.createElement("div");
  el.className="toast "+s;el.innerHTML="<b>"+hhmm(simNow)+" Paris · Alerte</b>"+m;box.prepend(el);
  while(box.children.length>3)box.lastChild.remove();
  setTimeout(function(){el.remove();},6500);
}
function updBell(){var b=document.getElementById("bellCount");b.textContent=unread;b.hidden=!unread;}
document.getElementById("bellBtn").addEventListener("click",function(){stopWall();go("al");});
function checkRules(silent){
  var t=simNow,k=kpis(t),hr=Math.floor(t/60);
  MV.forEach(function(f){
    var k2=known(f,t);
    if(f.cx&&ref(f)>t-90&&ref(f)<t+120)push("cx","bad","Vol <b>"+f.id+"</b> ("+AL[f.al].n+") "+f.from+" → "+f.to+" annulé.","cx"+f.id,silent);
    else if(f.cf&&k2&&!isCx(f,t))push("cf","bad","Vol <b>"+f.id+"</b> "+f.from+" → "+f.to+" : "+(f.dir==="D"?"départ du poste estimé à "+hhmm(f.real?f.etdShow:f.atd)+" (limite "+hhmm(CF_DEP)+").":"atterrissage estimé à "+hhmm(f.real?f.etaShow:f.ata)+" (limite "+hhmm(CF_ARR)+")."),"cf"+f.id,silent);
    else if(!f.cx&&k2&&late(f)>60&&!done(f,t))push("dly","bad","Vol <b>"+f.id+"</b> ("+AL[f.al].n+") "+f.from+" → "+f.to+" : retard estimé de "+Math.round(late(f))+" min"+(f.rsn?" (code "+f.rsn[0]+", "+f.rsn[1].toLowerCase()+")":"")+".","d"+f.id,silent);
  });
  if(!silent){var k1=kpis(t-60);if(k1.otpD-k.otpD>=.02)push("otp","warn","La ponctualité départ a perdu "+((k1.otpD-k.otpD)*100).toFixed(1)+" points en une heure : "+pct(k.otpD)+" %.","otp"+hr);}
  if(k.taxi>18)push("taxi","warn","Roulage sortie moyen à "+fx(k.taxi,1)+" min sur les deux dernières heures.","taxi"+hr,silent);
}
EVENTS.push({t:START-14,s:"info",m:"METAR LFMN : orage et pluie à Nice, rafales à 28 kt. Rotations vers NCE à surveiller."});
checkRules(true);

/* ---------- mode mur et boucle ---------- */
var wallBtn=document.getElementById("wallBtn");
wallBtn.addEventListener("click",function(){wall=!wall;wallBtn.setAttribute("aria-pressed",wall);wallT=performance.now();var p=document.getElementById("prog");if(p)p.hidden=!wall;});
function stopWall(){if(wall){wall=false;wallBtn.setAttribute("aria-pressed","false");}}
var speedBtn=document.getElementById("speedBtn");
speedBtn.addEventListener("click",function(){speed=speed===1?20:1;speedBtn.setAttribute("aria-pressed",speed!==1);document.getElementById("speedLbl").textContent=speed===1?"Temps réel":"Simulation ×20";});
function render(first){({ov:vOverview,fl:vFlights,wx:vWeather,ap:vAirport,bm:vBench,kp:vCatalog,al:vAlerts})[cur](first);}
var lastRender=0;
function loop(ts){
  var dt=ts-lastTs;lastTs=ts;simNow=REAL?realNow():Math.min(simNow+dt/60000*speed,23*60+59);
  document.getElementById("clock").textContent=hhmm(simNow);
  document.getElementById("clockUtc").textContent=(REAL?new Date(D0+simNow*MIN).toISOString().slice(11,16):hhmm(simNow-OFFSET))+" UTC";
  if(REAL&&!fetching&&Date.now()-LAST_FETCH>60000){fetching=true;refreshData(false).then(function(){fetching=false;render(false);});}
  if(wall){var p=(ts-wallT)/WALL_MS,bar=document.querySelector("#prog i");if(bar)bar.style.width=Math.min(100,p*100)+"%";
    if(p>=1){wallT=ts;var order=["ov","fl","wx","ap","bm"],i=order.indexOf(cur);go(order[(i+1)%order.length]);}}
  if(ts-lastRender>(REAL?15000:3000)){lastRender=ts;checkRules(false);
    var act=document.activeElement;
    if(cur==="ov"||cur==="ap"||((cur==="fl"||cur==="bm")&&!(act&&act.matches("select"))))render(false);
    if(cur==="al"&&document.getElementById("feedAl"))document.getElementById("feedAl").innerHTML=feedHtml(40);}
  requestAnimationFrame(loop);
}
/* ---------- données réelles (Supabase) ---------- */
var CFG=window.AEROPULSE_CONFIG||{},REAL=false,SB=null,SESSION=null,TEN=null,ROLE="viewer",MIN=60000;
var HOME_ICAO="LFPO",HUB="ORY",HOME_NAME="Paris-Orly",HOME_TZ="Europe/Paris",HOME_CURFEW=null;
var DAY=null,D0=0,D1=0,RAWN=[],APX={},DELAY_LBL={},LAST_FETCH=0,LAST_WX=0,LAST_UPDATE=null,FETCH_ERR=null,fetching=false,loopStarted=false,IMPORT_RESULT=null;
function realNow(){return(Date.now()-D0)/MIN;}
function localDay(tz){return new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function hm(str){var p=String(str||"").split(":");return(+p[0]||0)*60+(+p[1]||0);}
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement("script");s.src=src;s.onload=res;s.onerror=function(){rej(new Error("Chargement impossible : "+src));};document.head.appendChild(s);});}
function frErr(e){var m=(e&&(e.message||e.error_description))||String(e);
  if(/Invalid login credentials/i.test(m))return"E-mail ou mot de passe incorrect.";
  if(/Email not confirmed/i.test(m))return"Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.";
  if(/Failed to fetch|NetworkError|Load failed/i.test(m))return"Serveur injoignable. Vérifiez votre connexion.";
  return m;}

function boot(){
  if(!CFG.supabaseUrl||!CFG.supabaseAnonKey){startDemo();return;}
  main.innerHTML='<p class="note">Connexion…</p>';
  loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js").then(function(){
    if(!window.supabase||!window.supabase.createClient)throw new Error("Bibliothèque de connexion indisponible.");
    SB=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
    return SB.auth.getSession();
  }).then(function(r){
    SESSION=r&&r.data&&r.data.session;
    if(SESSION)return startReal();
    showLogin();
  }).catch(function(e){showLogin(frErr(e));});
}
function startDemo(){
  REAL=false;document.getElementById("login").hidden=true;
  if(SB){document.getElementById("logoutBtn").hidden=true;}
  go(cur);
  if(!loopStarted){loopStarted=true;requestAnimationFrame(loop);}
}
function showLogin(msg){
  var l=document.getElementById("login");l.hidden=false;
  document.getElementById("lgErr").textContent=msg||"";
  document.getElementById("lgDemo").hidden=CFG.allowDemo===false;
  document.getElementById("lgMagic").hidden=!SB;
  setTimeout(function(){var e=document.getElementById("lgEmail");if(e)e.focus();},50);
}
document.getElementById("loginForm").addEventListener("submit",function(e){
  e.preventDefault();if(!SB)return;
  var email=document.getElementById("lgEmail").value.trim(),pw=document.getElementById("lgPw").value,btn=document.getElementById("lgBtn"),err=document.getElementById("lgErr");
  if(!pw){err.textContent="Saisissez votre mot de passe, ou demandez un lien de connexion par e-mail.";return;}
  btn.disabled=true;btn.textContent="Connexion…";err.textContent="";
  SB.auth.signInWithPassword({email:email,password:pw}).then(function(r){
    if(r.error)throw r.error;SESSION=r.data.session;return startReal();
  }).catch(function(x){err.textContent=frErr(x);}).then(function(){btn.disabled=false;btn.textContent="Se connecter";});
});
document.getElementById("lgMagic").addEventListener("click",function(){
  var email=document.getElementById("lgEmail").value.trim(),err=document.getElementById("lgErr");
  if(!email){err.textContent="Saisissez d'abord votre adresse e-mail.";return;}
  SB.auth.signInWithOtp({email:email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname}}).then(function(r){
    if(r.error)throw r.error;err.style.color="var(--ok)";err.textContent="Lien envoyé à "+email+". Ouvrez-le sur cet appareil.";
  }).catch(function(x){err.style.color="";err.textContent=frErr(x);});
});
document.getElementById("lgDemo").addEventListener("click",startDemo);
document.getElementById("logoutBtn").addEventListener("click",function(){if(SB)SB.auth.signOut().then(function(){location.reload();});});

function emptyState(title,text){
  main.innerHTML='<div class="panel empty"><h2>'+title+'</h2><p>'+text+'</p></div>';
  document.getElementById("logoutBtn").hidden=false;
}
async function startReal(){
  document.getElementById("login").hidden=true;
  main.innerHTML='<p class="note">Chargement des données…</p>';
  try{
    var uid=SESSION.user.id;
    var res=await Promise.all([
      SB.from("tenants").select("id,name,kind,home_airport,airline_iata").order("name"),
      SB.from("memberships").select("tenant_id,role").eq("user_id",uid),
      SB.from("delay_codes").select("code,label")
    ]);
    if(res[0].error)throw res[0].error;
    var tenants=res[0].data||[];
    if(!tenants.length)return emptyState("Compte sans client","Votre compte n'est rattaché à aucun client. Demandez à votre administrateur de vous ajouter.");
    var saved=null;try{saved=localStorage.getItem("ap-tenant");}catch(e){}
    TEN=tenants.filter(function(x){return x.id===saved;})[0]||tenants[0];
    var mem=(res[1].data||[]).filter(function(x){return x.tenant_id===TEN.id;})[0];ROLE=mem?mem.role:"viewer";
    (res[2].data||[]).forEach(function(d){DELAY_LBL[d.code]=d.label;});
    if(!TEN.home_airport)return emptyState("Aéroport non configuré","Le client « "+esc(TEN.name)+" » n'a pas d'aéroport de référence. Renseignez tenants.home_airport.");
    var ap=await SB.from("airports").select("*").eq("icao",TEN.home_airport).single();
    if(ap.error)throw ap.error;
    APX[ap.data.icao]=ap.data;
    HOME_ICAO=ap.data.icao;HUB=ap.data.iata||ap.data.icao;HOME_NAME=String(ap.data.name||ap.data.city).replace(/\s+(International\s+)?Airport$/i,"").replace(/\s+A[ée]roport.*$/i,"");HOME_TZ=ap.data.tz||"UTC";HOME_CURFEW=ap.data.curfew||null;
    if(HOME_CURFEW){CF_DEP=hm(HOME_CURFEW.last_offblock);CF_ARR=hm(HOME_CURFEW.last_landing);CF_END=hm(HOME_CURFEW.reopen||"06:00");}
    else{CF_DEP=CF_ARR=99999;CF_END=-1;}
    if(isFinite(ap.data.lat)&&isFinite(ap.data.lon))ZONES.eu=[[ap.data.lon-14,ap.data.lat+4],[ap.data.lon+14,ap.data.lat-18]];
    REAL=true;applyChrome();
    await refreshData(true);
    go(cur);
    if(!loopStarted){loopStarted=true;requestAnimationFrame(loop);}
  }catch(e){emptyState("Chargement impossible",esc(frErr(e))+" Rechargez la page dans quelques instants.");}
}
function applyChrome(){
  document.getElementById("brandSub").textContent=TEN.name+" · "+HOME_NAME+" ("+HUB+")";
  ["sampleTag","replayTag","speedBtn","wallBtn"].forEach(function(id){var el=document.getElementById(id);if(el)el.hidden=id!=="wallBtn"?true:el.hidden;});
  document.getElementById("freshChip").hidden=false;
  document.getElementById("logoutBtn").hidden=false;
  document.getElementById("clockTz").textContent="LOCAL";
  document.getElementById("railFoot").innerHTML="Client : "+esc(TEN.name)+"<br>Rôle : "+({admin:"administrateur",editor:"éditeur",viewer:"lecteur"}[ROLE]||ROLE)+"<br>KPI calculés selon les définitions AeroPulse (seuil de ponctualité : 15 min).";
}
function updFresh(){
  var dot=document.getElementById("freshDot"),lbl=document.getElementById("freshLbl");if(!dot)return;
  var age=LAST_UPDATE?(Date.now()-LAST_UPDATE)/MIN:Infinity;
  if(FETCH_ERR){dot.className="dot bad";lbl.textContent="Hors ligne · "+(LAST_FETCH?"dernière lecture "+hhmm((LAST_FETCH-D0)/MIN):"aucune donnée");lbl.title=FETCH_ERR;}
  else if(!RAWN.length){dot.className="dot warn";lbl.textContent="Aucun vol aujourd'hui";}
  else if(age>30){dot.className="dot warn";lbl.textContent="Données datant de "+Math.round(age)+" min";}
  else{dot.className="dot";lbl.textContent="À jour · "+hhmm((LAST_UPDATE-D0)/MIN);}
}
function cityOf(a){var nm=String(a.name||"").replace(/\s+(International\s+)?Airport$/i,"").replace(/^A[ée]roport (international )?(de |d'|du )?/i,"").trim();return nm||String(a.city||a.icao||"").split(",")[0].replace(/\s*\(.*?\)/g,"").trim();}
function disp(icao){var a=APX[icao];return a&&a.iata?a.iata:icao;}
function regionOf(a){
  if(!a)return"Autre";if(a.country==="FR")return"France";if({DZ:1,MA:1,TN:1}[a.country])return"Maghreb";
  return{EU:"Europe",AF:"Afrique",AS:"Asie et Moyen-Orient",NA:"Amérique du Nord",SA:"Amérique du Sud",OC:"Océanie"}[a.continent]||"Autre";
}
async function refreshData(first){
  try{
    var day=localDay(HOME_TZ);
    if(day!==DAY){DAY=day;var b=AeroKPI.dayBounds(DAY,HOME_TZ);D0=b.d0;D1=b.d1;EVENTS=[];seen={};first=true;}
    var i0=new Date(D0).toISOString(),i1=new Date(D1).toISOString(),rows=[],from=0,page=1000;
    for(;;){
      var q=await SB.from("flights").select("*").eq("tenant_id",TEN.id)
        .or("and(dep_airport.eq."+HOME_ICAO+",std.gte."+i0+",std.lt."+i1+"),and(arr_airport.eq."+HOME_ICAO+",sta.gte."+i0+",sta.lt."+i1+")")
        .order("id").range(from,from+page-1);
      if(q.error)throw q.error;
      rows=rows.concat(q.data||[]);if(!q.data||q.data.length<page)break;from+=page;
    }
    var need={};rows.forEach(function(r){[r.dep_airport,r.arr_airport].forEach(function(c){if(!APX[c])need[c]=1;});});
    var nk=Object.keys(need);
    for(var i=0;i<nk.length;i+=200){var a=await SB.from("airports").select("icao,iata,name,city,country,continent,lat,lon").in("icao",nk.slice(i,i+200));(a.data||[]).forEach(function(x){APX[x.icao]=x;});}
    buildFromRows(rows);
    if(first||Date.now()-LAST_WX>5*MIN){
      var freq={};MV.forEach(function(f){var c=f.dir==="D"?f.row.arr_airport:f.row.dep_airport;freq[c]=(freq[c]||0)+1;});
      var st=[HOME_ICAO].concat(Object.keys(freq).sort(function(x,y){return freq[y]-freq[x];}).slice(0,11));
      var w=await SB.from("metar_latest").select("station,observed_at,raw").in("station",st);
      var byS={};(w.data||[]).forEach(function(x){byS[x.station]=x;});
      METAR=st.filter(function(s){return byS[s];}).map(function(s){var x=byS[s],a=APX[s];return[s,a?cityOf(a):s,x.raw,hhmm((Date.parse(x.observed_at)-D0)/MIN)];});
      LAST_WX=Date.now();
    }
    LAST_FETCH=Date.now();FETCH_ERR=null;
    if(first)checkRules(true);
  }catch(e){FETCH_ERR=frErr(e);}
  updFresh();
}
function buildFromRows(rows){
  var nap={},nal={},nty={},mv=[],codes={},maxUpd=0;
  RAWN=rows.map(function(r){var n=Object.assign({},r);["std","sta","etd","eta","atd","takeoff","landing","ata"].forEach(function(k){n[k]=r[k]?Date.parse(r[k]):null;});var u=Date.parse(r.updated_at);if(u>maxUpd)maxUpd=u;return n;});
  LAST_UPDATE=maxUpd||null;
  Object.keys(APX).forEach(function(ic){var a=APX[ic];nap[disp(ic)]={n:cityOf(a),lat:a.lat,lon:a.lon,reg:regionOf(a),icao:ic};});
  function m(v){return v==null?null:(v-D0)/MIN;}
  RAWN.forEach(function(r){
    var isD=r.dep_airport===HOME_ICAO;if(!isD&&r.arr_airport!==HOME_ICAO)return;
    var aoff=AeroKPI.actualOff(r),ain=AeroKPI.actualIn(r),std=m(r.std),sta=m(r.sta);
    var al=r.airline_iata||r.flight_no.slice(0,2);
    if(!nal[al])nal[al]={n:r.airline_name||al,d:"",m:1};
    var ty=r.aircraft_type||"—";
    if(!nty[ty])nty[ty]={n:ty,seats:r.seats||null,co2:NaN,wide:/A33|A35|A38|B74|B77|B78|330|350|380|747|777|787/.test(ty)};
    var f={real:true,row:r,id:r.flight_no,al:al,dir:isD?"D":"A",from:disp(r.dep_airport),to:disp(r.arr_airport),ty:ty,reg:r.registration||"",seats:r.seats,pax:r.pax,
      term:(isD?r.dep_terminal:r.arr_terminal)||"",stand:(isD?(r.dep_stand||r.dep_gate):(r.arr_stand||r.arr_gate))||null};
    f.dest=isD?f.to:f.from;
    f.std=std!=null?std:sta-120;f.sta=sta!=null?sta:std+120;
    f.atd=aoff!=null?m(aoff):Infinity;f.ata=ain!=null?m(ain):Infinity;
    f.etdShow=aoff!=null?f.atd:(r.etd!=null?m(r.etd):f.std);
    f.etaShow=ain!=null?f.ata:(r.eta!=null?m(r.eta):f.sta);
    f.delay=f.etdShow-f.std;
    f.taxi=r.takeoff!=null&&r.atd!=null?(r.takeoff-r.atd)/MIN:null;
    f.cx=r.status==="cancelled"||(!isD&&r.status==="diverted");
    var dc=(r.delay_codes||[])[0];f.rsn=dc?[dc.code,DELAY_LBL[dc.code]||"Code "+dc.code]:null;
    (r.delay_codes||[]).forEach(function(c){codes[c.code]=1;});
    if(HOME_CURFEW){
      f.cf=isD?(!f.cx&&aoff==null&&(r.atd||r.etd||r.std)>D0+CF_DEP*MIN):(!f.cx&&ain==null&&(r.ata||r.eta||r.sta)>D0+CF_ARR*MIN);
    }
    [f.from,f.to].forEach(function(c){if(!nap[c])nap[c]={n:c,lat:NaN,lon:NaN,reg:"Autre"};});
    mv.push(f);
  });
  mv.sort(function(a,b){return ref(a)-ref(b);});
  AP=nap;AL=nal;TYPES=nty;MV=mv;SLOTS=[];DAY_TOTAL=MV.length;
  REASONS=Object.keys(codes).sort().map(function(c){return[c,DELAY_LBL[c]||"Code "+c,0];});
  if(flAl!=="all"&&!AL[flAl])flAl="all";
}
function realKpis(t,flt){
  var rows=flt?MV.filter(flt).map(function(f){return f.row;}):RAWN,at=D0+t*MIN;
  var s=AeroKPI.summary(rows,{airport:HOME_ICAO,day:DAY,tz:HOME_TZ,at:at,curfew:HOME_CURFEW});
  function n(v){return v==null?NaN:v;}
  var o={sch:s.scheduled,cx:s.cancelled,dep:s.dep_done,arr:s.arr_done,otpD:n(s.otp_dep),otpA:n(s.otp_arr),reg:n(s.regularity),dmF:n(s.avg_delay_per_dep),
    mv:s.movements,pax:n(s.pax),slf:n(s.load_factor),taxiAll:n(s.taxi_out_avg),taxiIn:n(s.taxi_in_avg),cf:n(s.curfew_risk),co2pk:NaN,byR:s.delay_by_code||{},air:0,paxAir:0};
  REASONS.forEach(function(r){if(o.byR[r[0]]==null)o.byR[r[0]]=0;});
  var tx=[];
  MV.forEach(function(f){
    if(flt&&!flt(f))return;var r=f.row;
    if(f.dir==="D"&&r.takeoff!=null&&r.atd!=null&&r.atd<=at&&r.atd>at-120*MIN)tx.push((r.takeoff-r.atd)/MIN);
    if(!f.cx&&isFinite(f.atd)&&t>=f.atd&&!(isFinite(f.ata)&&t>=f.ata)){o.air++;if(f.pax)o.paxAir+=f.pax;}
  });
  o.taxi=tx.length?tx.reduce(function(a,b){return a+b;},0)/tx.length:o.taxiAll;
  return o;
}
function realStatus(f,t){
  var r=f.row,s=r.status,lt=late(f),now=D0+t*MIN;
  if(s==="cancelled")return{l:"Annulé",c:"bad"};
  if(s==="diverted")return{l:"Dérouté",c:"bad"};
  if(f.dir==="D"){
    if(r.takeoff!=null&&r.takeoff<=now)return{l:"Décollé",c:"ok"};
    if(isFinite(f.atd)&&t>=f.atd)return{l:"Parti du poste",c:"air"};
    if(f.cf&&known(f,t))return{l:"Risque couvre-feu",c:"bad"};
    if(t>f.etdShow+15)return{l:"Départ non confirmé",c:"warn"};
    if(s==="boarding")return{l:"Embarquement",c:lt>15?"warn":""};
    return lt>15?{l:t>f.std?"Retardé":"Retard prévu",c:"warn"}:{l:"Programmé",c:""};
  }
  if(isFinite(f.ata)&&t>=f.ata)return{l:"Arrivé",c:"ok"};
  if(r.landing!=null&&r.landing<=now)return{l:"Atterri",c:"ok"};
  if(f.cf&&known(f,t))return{l:"Risque couvre-feu",c:"bad"};
  if((isFinite(f.atd)&&t>=f.atd)||s==="airborne"||s==="departed")return{l:"En vol",c:lt>15?"warn":"air"};
  return lt>15?{l:"Retard prévu",c:"warn"}:{l:"Programmé",c:""};
}
function vAirportReal(){
  var t=simNow,k=kpis(t),byT={},next=[];
  MV.forEach(function(f){
    if(f.dir!=="D"||f.cx||done(f,t))return;if(f.std>t+120||f.etdShow<t-90)return;
    next.push(f);var tm=f.term?"T"+f.term:"Sans terminal";byT[tm]=(byT[tm]||0)+1;
  });
  next.sort(function(a,b){return a.etdShow-b.etdShow;});
  var rows=next.slice(0,40).map(function(f){var st=status(f,t),s=sev(f,t);
    return'<tr class="'+s+'"><td class="mono">'+(f.term?"T"+esc(f.term):"—")+'</td><td class="mono">'+(f.stand?esc(f.stand):"—")+'</td><td class="mono">'+f.id+'</td><td><b class="mono">'+f.to+'</b> '+esc(AP[f.to].n)+'</td><td class="mono">'+hhmm(f.std)+'</td><td class="mono">'+hhmm(f.etdShow)+'</td><td><span class="pill '+st.c+'">'+st.l+'</span></td></tr>';}).join("");
  var cf="";
  if(HOME_CURFEW){
    var inCF=t<CF_END||t>=CF_ARR,toDep=CF_DEP-t,toArr=CF_ARR-t;
    cf='<div class="curfew">'+(inCF?'<span class="label">Couvre-feu</span><b style="color:var(--bad)">En cours</b><span style="color:var(--muted);font-size:12.5px">Aucun mouvement jusqu\'à '+hhmm(CF_END)+'.</span>':
      '<span class="label">Avant le couvre-feu</span><b>'+(toDep>0?dur(toDep):"Départs clos")+'</b><span style="color:var(--muted);font-size:12.5px">Dernier départ du poste à '+hhmm(CF_DEP)+(toDep<=0?' · derniers atterrissages avant '+hhmm(CF_ARR)+' ('+dur(toArr)+')':', dernier atterrissage à '+hhmm(CF_ARR))+'.</span>')+'</div>';
  }
  var risks=MV.filter(function(f){return f.cf&&!isCx(f,t)&&known(f,t)&&!done(f,t);});
  var rl=HOME_CURFEW?'<div><span class="label">Vols à risque couvre-feu</span>'+(risks.length?'<ul class="risk">'+risks.map(function(f){return'<li><span class="mono">'+f.id+'</span><span>'+(f.dir==="D"?"→ "+f.to+", départ estimé ":"← "+f.from+", arrivée estimée ")+'<b class="mono" style="color:var(--bad)">'+hhmm(f.dir==="D"?f.etdShow:f.etaShow)+'</b></span></li>';}).join("")+'</ul>':'<p class="note" style="margin:0">Aucun vol à risque pour l\'instant.</p>')+'</div>':'';
  main.innerHTML=head(esc(HOME_NAME),"Portes, roulage et couvre-feu, données réelles")+
   '<div class="apt"><section class="panel"><div class="panel-h"><h2>Prochains départs par porte</h2><span class="meta">'+Object.keys(byT).sort().map(function(x){return esc(x)+" : "+byT[x];}).join(" · ")+'</span></div>'+
   '<div class="tbl-wrap"><table><thead><tr><th>Terminal</th><th>Porte</th><th>Vol</th><th>Destination</th><th>STD</th><th>ETD</th><th>Statut</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" style="color:var(--muted)">Aucun départ dans les deux prochaines heures.</td></tr>')+'</tbody></table></div>'+
   '<p class="note" style="padding:0 14px 12px;margin:0">Le plan des postes s\'affiche quand la source de données transmet les numéros de poste.</p></section>'+
   '<section class="panel"><div class="panel-h"><h2>Roulage &amp; couvre-feu</h2></div><div class="panel-b rwy">'+cf+
   '<div class="minis"><div class="mini"><span class="label">Roulage sortie (2 h)</span><b>'+fx(k.taxi,1)+' min</b></div><div class="mini"><span class="label">Roulage entrée (jour)</span><b>'+fx(k.taxiIn,1)+' min</b></div>'+
   '<div class="mini"><span class="label">Départs à venir (2 h)</span><b>'+next.length+'</b></div><div class="mini"><span class="label">Annulés aujourd\'hui</span><b>'+k.cx+'</b></div></div>'+rl+'</div></section></div>';
}

/* ---------- import de fichiers ---------- */
function importTools(){
  if(!REAL||(ROLE!=="editor"&&ROLE!=="admin"))return"";
  return'<button class="chip" id="impBtn" type="button">Importer un fichier CSV</button><input type="file" id="impFile" accept=".csv,text/csv,text/plain" hidden>';
}
function importResult(){
  var r=IMPORT_RESULT;if(!r)return"";
  var ok=r.ok&&!r.error;
  return'<section class="panel imp"><div class="panel-h"><h2>Import · '+esc(r.file)+'</h2><span class="meta"><button class="chip" id="impClose" type="button">Fermer</button></span></div><div class="panel-b">'+
    (r.error?'<p style="margin:0;color:var(--bad)">'+esc(r.error)+'</p>':
    '<p style="margin:0"><b style="color:'+(ok?'var(--ok)':'var(--warn)')+'">'+r.saved+' vols enregistrés</b> sur '+r.lines+' lignes'+(r.rejected?', <b style="color:var(--bad)">'+r.rejected+' refusées</b>':'')+'.</p>'+
    (r.errors&&r.errors.length?'<ul>'+r.errors.slice(0,15).map(function(x){return'<li>'+(x.line?'Ligne '+x.line+' : ':'')+esc(x.message)+'</li>';}).join("")+(r.errors.length>15?'<li>… et '+(r.errors.length-15)+' autres</li>':'')+'</ul>':''))+'</div></section>';
}
async function runImport(file){
  IMPORT_RESULT={file:file.name,ok:false,saved:0,lines:0,rejected:0,errors:[],error:"Import en cours…"};render(true);
  try{
    if(file.size>5*1024*1024)throw new Error("Fichier trop volumineux (5 Mo maximum).");
    var text=await file.text(),sess=(await SB.auth.getSession()).data.session;
    var res=await fetch(CFG.supabaseUrl+"/functions/v1/import-flights?tenant="+encodeURIComponent(TEN.id),{method:"POST",
      headers:{"Authorization":"Bearer "+sess.access_token,"apikey":CFG.supabaseAnonKey,"Content-Type":"text/csv"},body:text});
    var body=await res.json().catch(function(){return{error:"Réponse illisible du serveur ("+res.status+")"};});
    IMPORT_RESULT=Object.assign({file:file.name},body);
    if(!res.ok&&!body.saved)IMPORT_RESULT.error=body.error||("Erreur "+res.status);
    await refreshData(false);
  }catch(e){IMPORT_RESULT={file:file.name,error:frErr(e)};}
  render(true);
}

boot();
})();
