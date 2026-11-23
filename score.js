import * as OSMDModule from "https://esm.sh/opensheetmusicdisplay@1.9.2";

const OpenSheetMusicDisplay = OSMDModule.OpenSheetMusicDisplay
  ?? OSMDModule.default?.OpenSheetMusicDisplay
  ?? OSMDModule.default;
if (typeof OpenSheetMusicDisplay !== "function") {
  throw new Error("OpenSheetMusicDisplay could not be resolved from the loaded module.");
}

const esc = value => String(value ?? "").replace(/[<>&"]/g, ch => ({
  "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;"
}[ch]));

const KEY_FIFTHS = {C:0,G:1,D:2,A:3,E:4,B:5,"F#":6,"C#":7,F:-1,Bb:-2,Eb:-3,Ab:-4,Db:-5,Gb:-6,Cb:-7};
const NOTE_VALUES = [
  {beats:4,type:"whole",dots:0},{beats:3,type:"half",dots:1},
  {beats:2,type:"half",dots:0},{beats:1.5,type:"quarter",dots:1},
  {beats:1,type:"quarter",dots:0},{beats:.75,type:"eighth",dots:1},
  {beats:.5,type:"eighth",dots:0},{beats:.375,type:"16th",dots:1},
  {beats:.25,type:"16th",dots:0},{beats:.1875,type:"32nd",dots:1},
  {beats:.125,type:"32nd",dots:0},{beats:.0625,type:"64th",dots:0}
];
const nearestValue = beats => NOTE_VALUES.reduce((best,item)=>
  Math.abs(item.beats-beats)<Math.abs(best.beats-beats)?item:best,NOTE_VALUES[0]);
function pitchInfo(midi,key){
 const flats=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
 const sharps=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
 const name=([ "F","Bb","Eb","Ab","Db","Gb","Cb" ].includes(key)?flats:sharps)[((midi%12)+12)%12];
 return {step:name[0],alter:name.length>1?(name[1]==="#"?1:-1):0,octave:Math.floor(midi/12)-1};
}
function noteXml(note,ticks,voice,staff,state,tieStart,tieStop,chord){
 const p=pitchInfo(note.midi,state.key),v=nearestValue(ticks/960);
 const ties=(tieStop?'<tie type="stop"/>':"")+(tieStart?'<tie type="start"/>':"");
 const notations=ties?'<notations>'+(tieStop?'<tied type="stop"/>':"")+(tieStart?'<tied type="start"/>':"")+"</notations>":"";
 return "<note>"+(chord?"<chord/>":"")+"<pitch><step>"+p.step+"</step>"+(p.alter?"<alter>"+p.alter+"</alter>":"")+"<octave>"+p.octave+"</octave></pitch><duration>"+ticks+"</duration>"+ties+"<voice>"+voice+"</voice><type>"+v.type+"</type>"+"<dot/>".repeat(v.dots)+"<staff>"+staff+"</staff>"+notations+"</note>";
}
function restXml(ticks,voice,staff){
 const v=nearestValue(ticks/960);
 return "<note><rest/><duration>"+ticks+"</duration><voice>"+voice+"</voice><type>"+v.type+"</type>"+"<dot/>".repeat(v.dots)+"<staff>"+staff+"</staff></note>";
}
function isGrandStaff(track){return track.instrument==="piano"&&track.notes.some(n=>n.midi<60)&&track.notes.some(n=>n.midi>=60);}
function clefFor(track){
 const avg=track.notes.length?track.notes.reduce((sum,n)=>sum+n.midi,0)/track.notes.length:60;
 return avg<60?{sign:"F",line:4}:{sign:"G",line:2};
}
function makePart(track,index,state,measureCount,ticksPerMeasure){
 const grand=isGrandStaff(track),staffCount=grand?2:1,defaultClef=clefFor(track);
 const grouped=new Map();
 for(const note of track.notes){
  const start=Math.max(0,Math.round(Number(note.time||0)*960));
  const rawDuration=Math.max(1,Number(note.duration||.25)*960);
  const duration=Math.max(60,Math.round(nearestValue(rawDuration/960).beats*960));
  const staff=grand?(note.midi<60?2:1):1;
  const key=start+":"+duration+":"+staff;
  if(!grouped.has(key))grouped.set(key,{start,end:start+duration,duration,staff,notes:[]});
  grouped.get(key).notes.push(note);
 }
 const events=[...grouped.values()].sort((a,b)=>a.start-b.start||a.staff-b.staff||a.end-b.end);
 const lanes=[[],[]],laneEnds=[[],[]];
 for(const event of events){
  const idx=event.staff-1;
  let lane=laneEnds[idx].findIndex(end=>end<=event.start);
  if(lane<0)lane=laneEnds[idx].length;
  laneEnds[idx][lane]=event.end;event.voice=lane+1;
  if(!lanes[idx][lane])lanes[idx][lane]=[];
  lanes[idx][lane].push(event);
 }
 const laneCounts=Array.from({length:staffCount},(_,i)=>Math.max(1,lanes[i].length));
 let measures="";
 for(let bar=0;bar<measureCount;bar++){
  const from=bar*ticksPerMeasure,to=from+ticksPerMeasure;
  let body="";
  if(bar===0){
   body+='<attributes><divisions>960</divisions><key><fifths>'+(KEY_FIFTHS[state.key]??0)+'</fifths></key><time><beats>'+state.numerator+'</beats><beat-type>'+state.denominator+'</beat-type></time>';
   if(grand)body+='<staves>2</staves><part-symbol>brace</part-symbol><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>';
   else body+='<clef><sign>'+defaultClef.sign+'</sign><line>'+defaultClef.line+'</line></clef>';
   body+="</attributes>";
   if(index===0)body+='<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>'+Math.max(20,Math.min(400,Math.round(state.bpm||120)))+'</per-minute></metronome></direction-type><sound tempo="'+Math.max(20,Math.min(400,Number(state.bpm)||120))+'"/></direction>';
  }
  let firstVoice=true;
  for(let staff=1;staff<=staffCount;staff++){
   const staffLanes=lanes[staff-1];
   for(let lane=0;lane<laneCounts[staff-1];lane++){
    if(!firstVoice)body+='<backup><duration>'+ticksPerMeasure+'</duration></backup>';
    firstVoice=false;
    const laneEvents=(staffLanes[lane]||[]).filter(e=>e.start<to&&e.end>from).sort((a,b)=>a.start-b.start);
    let cursor=from;
    for(const event of laneEvents){
     const start=Math.max(from,event.start),end=Math.min(to,event.end);
     if(start>cursor)body+=restXml(start-cursor,lane+1,staff);
     const segment=end-start;
     event.notes.forEach((note,i)=>body+=noteXml(note,segment,lane+1,staff,state,event.end>to,event.start<from,i>0));
     cursor=Math.max(cursor,end);
    }
    if(cursor<to)body+=restXml(to-cursor,lane+1,staff);
   }
  }
  measures+='<measure number="'+(bar+1)+'">'+body+"</measure>";
 }
 return '<part id="P'+(index+1)+'">'+measures+"</part>";
}
export function buildMusicXml(state){
 const tracks=state.tracks.filter(t=>Array.isArray(t.notes)&&t.notes.length);
 if(!tracks.length)throw new Error("There are no notes to engrave yet.");
 const beatsPerMeasure=Number(state.numerator||4)*4/Number(state.denominator||4);
 const ticksPerMeasure=Math.max(1,Math.round(beatsPerMeasure*960));
 const lastBeat=Math.max(0,...tracks.flatMap(t=>t.notes.map(n=>Number(n.time||0)+Math.max(.0625,Number(n.duration||.25)))));
 const measureCount=Math.max(1,Math.ceil(lastBeat/beatsPerMeasure));
 const partList=tracks.map((t,i)=>'<score-part id="P'+(i+1)+'"><part-name>'+esc(t.name||("Track "+(i+1)))+'</part-name></score-part>').join("");
 const parts=tracks.map((t,i)=>makePart(t,i,state,measureCount,ticksPerMeasure)).join("");
 return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>'+esc(state.name||"MidiStudio Score")+'</work-title></work><identification><encoding><software>MidiStudio</software></encoding></identification><part-list>'+partList+'</part-list>'+parts+'</score-partwise>';
}
function fallbackScore(state,host){
 const tracks=state.tracks.filter(t=>Array.isArray(t.notes)&&t.notes.length);
 if(!tracks.length)throw new Error("There are no notes to engrave yet.");
 const beatsPerBar=Number(state.numerator||4)*4/Number(state.denominator||4);
 const lastBeat=Math.max(1,...tracks.flatMap(t=>t.notes.map(n=>Number(n.time||0)+Number(n.duration||.25))));
 const measureCount=Math.max(1,Math.ceil(lastBeat/beatsPerBar));
 const measuresPerPage=4, pages=[];
 const escText=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const staffTop=130, rowHeight=tracks.reduce((h,t)=>h+(isGrandStaff(t)?150:100),0)+28;
 for(let first=0;first<measureCount;first+=measuresPerPage){
  const pageNo=pages.length+1, width=794,height=1123;
  let y=staffTop,body="";
  body+='<text x="55" y="58" font-size="24" font-family="serif" font-weight="bold">'+escText(state.name||"MidiStudio Score")+'</text>';
  body+='<text x="55" y="86" font-size="12" font-family="sans-serif">'+escText("Tempo: "+(state.bpm||120)+" BPM · "+state.numerator+"/"+state.denominator+" · Page "+pageNo)+'</text>';
  for(const tr of tracks){
   const grand=isGrandStaff(tr), staffCount=grand?2:1, clef=clefFor(tr);
   body+='<text x="55" y="'+(y-18)+'" font-size="13" font-family="sans-serif" font-weight="bold">'+escText(tr.name||"Track")+'</text>';
   for(let st=1;st<=staffCount;st++){
    const top=y+(st-1)*72;
    for(let line=0;line<5;line++)body+='<line x1="75" y1="'+(top+line*10)+'" x2="744" y2="'+(top+line*10)+'" stroke="#222" stroke-width="1"/>';
    body+='<text x="53" y="'+(top+39)+'" font-size="38" font-family="serif">'+(grand?(st===1?"𝄞":"𝄢"):(clef.sign==="G"?"𝄞":"𝄢"))+'</text>';
   }
   if(grand)body+='<path d="M68 '+(y+5)+' C40 '+(y+35)+',40 '+(y+105)+',68 '+(y+137)+'" fill="none" stroke="#222" stroke-width="2"/>';
   const firstBar=first,lastBar=Math.min(measureCount,first+measuresPerPage);
   for(let bar=firstBar;bar<lastBar;bar++){
    const x0=150+(bar-first)*145,x1=x0+145;
    body+='<line x1="'+x0+'" y1="'+(y-2)+'" x2="'+x0+'" y2="'+(y+(staffCount-1)*72+42)+'" stroke="#222"/>';
    body+='<line x1="'+x1+'" y1="'+(y-2)+'" x2="'+x1+'" y2="'+(y+(staffCount-1)*72+42)+'" stroke="#222"/>';
    body+='<text x="'+(x0+4)+'" y="'+(y-7)+'" font-size="9" fill="#555">'+(bar+1)+'</text>';
    for(const n of tr.notes){
     const beat=Number(n.time||0),dur=Number(n.duration||.25);
     if(Math.floor(beat/beatsPerBar)!==bar)continue;
     const staff=grand&&n.midi<60?2:1;
     const midi=n.midi, names=["C","D","E","F","G","A","B"];
     const semis=((midi%12)+12)%12, octave=Math.floor(midi/12)-1;
     const steps=octave*7+names.indexOf(["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][semis][0]);
     const ref=staff===1?4*7+2:2*7+4; // E4 treble, G2 bass
     const step=steps-ref;
     const baseY=y+(staff-1)*72+40-step*5;
     const x=x0+12+(beat-bar*beatsPerBar)/beatsPerBar*125;
     const filled=dur<1.5;
     body+='<ellipse cx="'+x+'" cy="'+baseY+'" rx="5.8" ry="4.1" transform="rotate(-18 '+x+' '+baseY+')" fill="'+(filled?"#171717":"white")+'" stroke="#171717" stroke-width="1.4"/>';
     if(dur<4)body+='<line x1="'+(x+5)+'" y1="'+(baseY-1)+'" x2="'+(x+5)+'" y2="'+(baseY-32)+'" stroke="#171717" stroke-width="1.4"/>';
     if(dur<=.5)body+='<path d="M'+(x+5)+' '+(baseY-32)+' q12 7 7 18" fill="none" stroke="#171717" stroke-width="1.5"/>';
     if(semis===1||semis===3||semis===6||semis===8||semis===10)body+='<text x="'+(x-14)+'" y="'+(baseY+4)+'" font-size="12">♯</text>';
    }
   }
   y+=staffCount===2?166:116;
  }
  pages.push('<div class="score-page"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 794 1123" role="img" aria-label="Engraved music score"><rect width="794" height="1123" fill="#fffdf7"/>'+body+'</svg></div>');
 }
 host.innerHTML=pages.join("");
}
export async function renderScore(state,host){
 host.replaceChildren();
 host.classList.add("osmd-score");
 const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
 await frame();await frame();
 // Render a deterministic A4 score first. The optional OSMD renderer can be
 // layered in later, but must never leave the user with a blank page.
 fallbackScore(state,host);
 return {backend:"MidiStudio A4 renderer"};
}