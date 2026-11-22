import { OpenSheetMusicDisplay } from "https://esm.sh/opensheetmusicdisplay@1.9.2";

const esc = value => String(value ?? "").replace(/[<>&"]/g, ch => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;"
}[ch]));

const KEY_FIFTHS = { C:0, G:1, D:2, A:3, E:4, B:5, "F#":6, "C#":7, F:-1, Bb:-2, Eb:-3, Ab:-4, Db:-5, Gb:-6, Cb:-7 };
const TYPES = [[4,"whole",0],[3,"half",1],[2,"half",0],[1.5,"quarter",1],[1,"quarter",0],[.75,"eighth",1],[.5,"eighth",0],[.375,"16th",1],[.25,"16th",0],[.1875,"32nd",1],[.125,"32nd",0],[.0625,"64th",0]];

function durationInfo(beats) {
  const value = TYPES.reduce((best,item) => Math.abs(item[0]-beats)<Math.abs(best[0]-beats)?item:best);
  return {type:value[1],dots:value[2]};
}
function pitchInfo(midi,key) {
  const flats=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  const sharps=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const name=([ "F","Bb","Eb","Ab","Db","Gb","Cb" ].includes(key)?flats:sharps)[((midi%12)+12)%12];
  return {step:name[0],alter:name.length>1?(name[1]==="#"?1:-1):0,octave:Math.floor(midi/12)-1};
}
function noteXml(note,duration,voice,state,tieStart,tieStop,chord) {
  const p=pitchInfo(note.midi,state.key),d=durationInfo(duration/960);
  const ties=(tieStop?'<tie type="stop"/>':"")+(tieStart?'<tie type="start"/>':"");
  const notations=ties?"<notations>"+(tieStop?'<tied type="stop"/>':"")+(tieStart?'<tied type="start"/>':"")+"</notations>":"";
  return "<note>"+(chord?"<chord/>":"")+"<pitch><step>"+p.step+"</step>"+(p.alter?"<alter>"+p.alter+"</alter>":"")+"<octave>"+p.octave+"</octave></pitch><duration>"+duration+"</duration>"+ties+"<voice>"+voice+"</voice><type>"+d.type+"</type>"+"<dot/>".repeat(d.dots)+"<staff>1</staff>"+notations+"</note>";
}
function restXml(duration,voice) {
  const d=durationInfo(duration/960);
  return "<note><rest/><duration>"+duration+"</duration><voice>"+voice+"</voice><type>"+d.type+"</type>"+"<dot/>".repeat(d.dots)+"</note>";
}
function makePart(track,index,state,measureCount,ticksPerMeasure) {
  const grouped=new Map();
  for(const note of track.notes) {
    const start=Math.max(0,Math.round(note.time*960)),duration=Math.max(1,Math.round(note.duration*960)),key=start+":"+duration;
    if(!grouped.has(key))grouped.set(key,{start,end:start+duration,notes:[]});
    grouped.get(key).notes.push(note);
  }
  const events=[...grouped.values()].sort((a,b)=>a.start-b.start||a.end-b.end),laneEnds=[];
  for(const event of events) {
    let lane=laneEnds.findIndex(end=>end<=event.start);
    if(lane<0)lane=laneEnds.length;
    laneEnds[lane]=event.end;event.voice=lane+1;
  }
  let measures="";
  for(let bar=0;bar<measureCount;bar++) {
    const from=bar*ticksPerMeasure,to=from+ticksPerMeasure;let body="";
    if(bar===0)body+="<attributes><divisions>960</divisions><key><fifths>"+(KEY_FIFTHS[state.key]??0)+"</fifths></key><time><beats>"+state.numerator+"</beats><beat-type>"+state.denominator+"</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>";
    for(let lane=1;lane<=laneEnds.length;lane++) {
      if(lane>1)body+="<backup><duration>"+ticksPerMeasure+"</duration></backup>";
      const laneEvents=events.filter(e=>e.voice===lane&&e.start<to&&e.end>from);let cursor=from;
      for(const event of laneEvents) {
        const start=Math.max(from,event.start),end=Math.min(to,event.end);
        if(start>cursor)body+=restXml(start-cursor,lane);
        event.notes.forEach((note,i)=>{body+=noteXml(note,end-start,lane,state,event.end>to,event.start<from,i>0)});
        cursor=Math.max(cursor,end);
      }
      if(cursor<to)body+=restXml(to-cursor,lane);
    }
    measures+='<measure number="'+(bar+1)+'">'+body+"</measure>";
  }
  return '<part id="P'+(index+1)+'">'+measures+"</part>";
}
export function buildMusicXml(state) {
  const tracks=state.tracks.filter(t=>t.notes.length);
  if(!tracks.length)throw new Error("There are no notes to engrave yet.");
  const beatsPerMeasure=state.numerator*4/state.denominator,ticksPerMeasure=Math.max(1,Math.round(beatsPerMeasure*960));
  const lastBeat=Math.max(0,...tracks.flatMap(t=>t.notes.map(n=>n.time+n.duration)));
  const measureCount=Math.max(1,Math.ceil(lastBeat/beatsPerMeasure));
  const partList=tracks.map((t,i)=>'<score-part id="P'+(i+1)+'"><part-name>'+esc(t.name||("Track "+(i+1)))+"</part-name></score-part>").join("");
  const parts=tracks.map((t,i)=>makePart(t,i,state,measureCount,ticksPerMeasure)).join("");
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>'+esc(state.name)+'</work-title></work><identification><encoding><software>MidiStudio</software></encoding></identification><part-list>'+partList+"</part-list>"+parts+"</score-partwise>";
}
export async function renderScore(state,host) {
  host.replaceChildren();host.classList.add("osmd-score");
  const osmd=new OpenSheetMusicDisplay(host,{
    backend:"svg",autoResize:true,drawTitle:true,drawSubtitle:false,drawComposer:false,
    drawPartNames:true,drawMeasureNumbers:true,drawCredits:false,pageFormat:"A4_P",
    pageBackgroundColor:"#fffdf7",defaultColorMusic:"#171717",defaultColorLabel:"#171717",
    spacingFactor:1.55,compactMode:false,followCursor:false
  });
  await osmd.load(buildMusicXml(state));osmd.render();return osmd;
}