import * as Tone from "https://esm.sh/tone@15.1.22";
import {Midi} from "https://esm.sh/@tonejs/midi@2.0.28";
import {preloadVerovio, renderScore} from "./score.js";

// Start downloading and initializing the notation engine immediately.
// It runs in parallel with the editor startup and is reused by Sheet Music.
preloadVerovio().catch(error => console.warn("Verovio preloading failed; it will retry when Sheet Music is opened:", error));
const $=id=>document.getElementById(id),COLORS=["#a18aff","#58c7c0","#f3a65e","#e77fae","#7da8ff","#e0c46c","#77a7ed","#dc8b72"];
const S={name:"Untitled project",tracks:[{id:"t1",name:"Track 1",notes:[],instrument:"piano",muted:false,program:0}],active:0,selected:null,view:"piano",zoom:1,bpm:120,bars:4,numerator:4,denominator:4,key:"C",clef:"auto",playhead:0,history:[],future:[],playing:false};
let synths=[],ticker=null,saveTimer=null,drag=null;
const track=()=>S.tracks[S.active],uid=()=>Math.random().toString(36).slice(2,10),clone=x=>JSON.parse(JSON.stringify(x)),beatsPerBar=()=>S.numerator*4/S.denominator,maxBeat=()=>Math.max(S.bars*beatsPerBar(),beatsPerBar()*4,...S.tracks.flatMap(t=>t.notes.map(n=>n.time+n.duration))),pitchName=m=>["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][((m%12)+12)%12]+(Math.floor(m/12)-1);
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2200)}
function snapshot(){S.history.push(clone({tracks:S.tracks,bars:S.bars,bpm:S.bpm,numerator:S.numerator,denominator:S.denominator,key:S.key,clef:S.clef}));if(S.history.length>80)S.history.shift();S.future=[];historyButtons()}
function historyButtons(){$("undo").disabled=!S.history.length;$("redo").disabled=!S.future.length}
function restore(v){Object.assign(S,v);S.selected=null;render()}
function undo(){if(!S.history.length)return;S.future.push(clone({tracks:S.tracks,bars:S.bars,bpm:S.bpm,numerator:S.numerator,denominator:S.denominator,key:S.key,clef:S.clef}));restore(S.history.pop())}
function redo(){if(!S.future.length)return;S.history.push(clone({tracks:S.tracks,bars:S.bars,bpm:S.bpm,numerator:S.numerator,denominator:S.denominator,key:S.key,clef:S.clef}));restore(S.future.pop())}
function addNote(t,time,midi,duration=+$("length").value){let n={id:uid(),midi:Math.max(0,Math.min(127,Math.round(midi))),time:Math.max(0,time),duration,velocity:+$("velocity").value||90};t.notes.push(n);return n}
function changed(){scheduleAutosave();renderStats()}
function scheduleAutosave(){clearTimeout(saveTimer);$("autosave").textContent="Saving…";saveTimer=setTimeout(()=>{try{localStorage.setItem("midistudio-autosave",JSON.stringify(projectData()));$("autosave").textContent="Autosaved locally"}catch{$("autosave").textContent="Autosave unavailable"}},350)}
function projectData(){return{format:"MidiStudio",version:2,name:S.name,bpm:S.bpm,bars:S.bars,numerator:S.numerator,denominator:S.denominator,key:S.key,clef:S.clef,tracks:S.tracks}}
function renderStats(){$("noteStats").textContent=S.tracks.reduce((a,t)=>a+t.notes.length,0)+" notes · "+S.tracks.length+" tracks"}
function select(id){S.selected=id;renderInspector();piano();sheet()}
function renderTracks(){$("tracks").replaceChildren();S.tracks.forEach((t,i)=>{let d=document.createElement("div");d.className="track"+(i===S.active?" active":"");let c=document.createElement("i"),s=document.createElement("strong"),n=document.createElement("small"),m=document.createElement("button");c.style.background=COLORS[i%COLORS.length];s.textContent=t.name;n.textContent=t.notes.length+" notes";m.className="mute";m.textContent=t.muted?"Muted":"Mute";m.onclick=e=>{e.stopPropagation();t.muted=!t.muted;renderTracks();scheduleAutosave()};d.append(c,s,n,m);d.onclick=()=>{S.active=i;S.selected=null;render()};$("tracks").append(d)})}
function renderInspector(){let n=track()?.notes.find(n=>n.id===S.selected);$("empty").hidden=!!n;$("inspector").hidden=!n;if(n){$("pitch").value=n.midi;$("start").value=n.time;$("duration").value=n.duration;$("noteVelocity").value=n.velocity||90}}
function piano(){if(!track())return;const low=24,high=96,rh=14,lw=50,bw=48*S.zoom,beats=maxBeat(),w=Math.max(740,lw+beats*bw),h=(high-low+1)*rh;let a='<svg viewBox="0 0 '+w+' '+(h+25)+'" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#13151c"/>';for(let b=0;b<=beats;b++){let x=lw+b*bw;a+='<line x1="'+x+'" y1="0" x2="'+x+'" y2="'+h+'" stroke="'+(Math.abs(b%beatsPerBar())<.001?"#555b70":b%1===0?"#292d38":"#20232d")+'"/>';if(Math.abs(b%beatsPerBar())<.001)a+='<text x="'+(x+4)+'" y="16" fill="#aeb1c0" font-size="10">'+(Math.floor(b/beatsPerBar())+1)+'</text>'}for(let m=low;m<=high;m++){let y=25+(high-m)*rh,black=[1,3,6,8,10].includes(m%12);a+='<rect x="0" y="'+y+'" width="'+w+'" height="'+rh+'" fill="'+(black?"#191b24":m%12===0?"#252835":"#1e212b")+'"/><rect width="'+lw+'" height="'+rh+'" x="0" y="'+y+'" fill="#303440"/><text x="5" y="'+(y+10)+'" fill="#d5d7e0" font-size="9">'+pitchName(m)+'</text><line x1="'+lw+'" y1="'+(y+rh)+'" x2="'+w+'" y2="'+(y+rh)+'" stroke="#2b2e39"/>'}track().notes.forEach(n=>{let x=lw+n.time*bw,y=25+(high-n.midi)*rh+1,ww=Math.max(7,n.duration*bw-1),sel=n.id===S.selected;a+='<rect data-note="'+n.id+'" x="'+x+'" y="'+y+'" width="'+ww+'" height="12" rx="3" fill="'+(sel?"#e0d8ff":COLORS[S.active%COLORS.length])+'" opacity=".95"/><rect data-resize="'+n.id+'" x="'+(x+ww-5)+'" y="'+y+'" width="6" height="12" fill="#ffffff55"/>'});let px=lw+S.playhead*bw;a+='<line x1="'+px+'" y1="0" x2="'+px+'" y2="'+h+'" stroke="#ff647e" stroke-width="2"/>';a+='</svg>';$("piano").innerHTML=a;const svg=document.querySelector("#piano svg");svg.onpointerdown=e=>{let r=svg.getBoundingClientRect(),x=(e.clientX-r.left)*w/r.width,y=(e.clientY-r.top)*(h+25)/r.height;if(y<25)return;let target=e.target.closest("[data-note],[data-resize]"),id=target?.dataset.note||target?.dataset.resize;if(id){let n=track().notes.find(n=>n.id===id);S.selected=id;renderInspector();snapshot();drag={id,x,y,time:n.time,midi:n.midi,duration:n.duration,resize:!!target.dataset.resize};svg.setPointerCapture(e.pointerId)}else{snapshot();let n=addNote(track(),Math.max(0,Math.round((x-lw)/bw*4)/4),high-Math.floor((y-25)/rh));S.selected=n.id;render();changed()}};svg.onpointermove=e=>{if(!drag)return;let r=svg.getBoundingClientRect(),x=(e.clientX-r.left)*w/r.width,y=(e.clientY-r.top)*(h+25)/r.height,n=track().notes.find(q=>q.id===drag.id);if(drag.resize)n.duration=Math.max(.0625,Math.round((drag.duration+(x-drag.x)/bw)*16)/16);else{n.time=Math.max(0,Math.round((drag.time+(x-drag.x)/bw)*16)/16);n.midi=Math.max(0,Math.min(127,drag.midi-Math.round((y-drag.y)/rh)))}piano();renderInspector()};svg.onpointerup=()=>{if(drag){drag=null;render();changed()}}}
let scoreRenderId=0;
async function sheet(){
 const host=$("sheet"),token=++scoreRenderId;
 if(S.view!=="sheet")return;
 host.classList.add("osmd-score");
 host.textContent="Preparing A4 score…";
 try{
  if(token!==scoreRenderId||S.view!=="sheet")return;
  await renderScore(S,host);
  if(token!==scoreRenderId)return;
 }catch(err){
  console.error("Music engraving failed:",err);
  if(token===scoreRenderId)host.textContent="Could not engrave score: "+(err?.message||String(err));
 }
}
function render(){if(!S.tracks.length)S.tracks=[{id:uid(),name:"Track 1",notes:[],instrument:"piano",muted:false,program:0}];renderTracks();piano();renderInspector();historyButtons();$("bpm").value=S.bpm;$("timeSig").value=S.numerator+"/"+S.denominator;$("keySig").value=S.key;$("clef").value=S.clef;$("instrument").value=track().instrument||"piano";$("zoom").textContent=Math.round(S.zoom*100)+"%";$("pianoPane").hidden=S.view!=="piano";$("sheetPane").hidden=S.view!=="sheet";document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===S.view));$("projectName").textContent=S.name;renderStats();updatePositionUI();if(S.view==="sheet")sheet()}
function updatePositionUI(){let barBeats=beatsPerBar(),bar=Math.floor(S.playhead/barBeats)+1,within=S.playhead%barBeats,beat=Math.floor(within)+1,tick=Math.floor((within%1)*960);$("position").textContent=bar+":"+beat+":"+String(tick).padStart(3,"0");$("seek").max=maxBeat();$("seek").value=Math.min(S.playhead,maxBeat())}
function seek(v){S.playhead=Math.max(0,Math.min(maxBeat(),+v||0));if(S.playing){Tone.Transport.seconds=S.playhead*60/S.bpm}updatePositionUI();piano()}
function updateNote(){let n=track().notes.find(n=>n.id===S.selected);if(!n)return;snapshot();n.midi=Math.max(0,Math.min(127,+$("pitch").value||0));n.time=Math.max(0,+$("start").value||0);n.duration=Math.max(.0625,+$("duration").value||.25);n.velocity=Math.max(1,Math.min(127,+$("noteVelocity").value||90));render();changed()}
function download(blob,name){let u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function exportMidi(onlyTrack=false){let m=new Midi();m.header.setTempo(S.bpm);m.header.timeSignatures=[{ticks:0,timeSignature:[S.numerator,S.denominator],measures:0}];let list=onlyTrack?[track()]:S.tracks;list.forEach((t,i)=>{let tr=m.addTrack();tr.name=t.name;tr.channel=i%16;tr.instrument.number=t.program||0;t.notes.forEach(n=>tr.addNote({midi:n.midi,time:n.time*60/S.bpm,duration:n.duration*60/S.bpm,velocity:(n.velocity||90)/127}))});download(new Blob([m.toArray()],{type:"audio/midi"}),onlyTrack?"midistudio-track.mid":"midistudio.mid");toast(onlyTrack?"Track exported":"MIDI exported")}
function save(){download(new Blob([JSON.stringify(projectData(),null,2)],{type:"application/json"}),"midistudio-project.json");try{localStorage.setItem("midistudio-autosave",JSON.stringify(projectData()))}catch{}toast("Project saved")}
function applyProject(p){if(p.format!=="MidiStudio"||!Array.isArray(p.tracks))throw Error("Not a MidiStudio project");S.name=p.name||"Imported project";S.bpm=p.bpm||120;S.bars=p.bars||4;S.numerator=p.numerator||4;S.denominator=p.denominator||4;S.key=p.key||"C";S.clef=p.clef||"auto";S.tracks=p.tracks.map((t,i)=>({...t,id:t.id||uid(),notes:(t.notes||[]).map(n=>({...n,id:n.id||uid(),velocity:n.velocity||90})),instrument:t.instrument||"piano",muted:!!t.muted}));S.active=0;S.selected=null;S.playhead=0;render();scheduleAutosave()}
function loadProject(f){let r=new FileReader();r.onload=()=>{try{applyProject(JSON.parse(r.result));toast("Project loaded")}catch(e){toast("Invalid project file")}};r.readAsText(f)}
function midiVarLen(bytes,pos){let value=0,b,count=0;do{if(pos>=bytes.length||count++>=4)throw Error("Invalid MIDI variable-length value");b=bytes[pos++];value=(value<<7)|(b&127)}while(b&128);return{value,pos}}
function writeMidiVarLen(value){value=Math.max(0,Math.floor(value));let out=[value&127];while((value>>=7)>0)out.unshift((value&127)|128);return out}
function sanitizeMidiBuffer(buffer){
 const src=new Uint8Array(buffer);
 if(src.length<14||String.fromCharCode(...src.slice(0,4))!=="MThd")throw Error("Invalid MIDI header");
 const headerLength=((src[4]<<24)|(src[5]<<16)|(src[6]<<8)|src[7])>>>0;
 let pos=8+headerLength;if(pos>src.length)throw Error("Truncated MIDI header");
 const out=Array.from(src.slice(0,pos));
 while(pos+8<=src.length){
  const tag=String.fromCharCode(...src.slice(pos,pos+4)),len=((src[pos+4]<<24)|(src[pos+5]<<16)|(src[pos+6]<<8)|src[pos+7])>>>0;
  if(pos+8+len>src.length)throw Error("Truncated MIDI chunk");
  if(tag!=="MTrk"){out.push(...src.slice(pos,pos+8+len));pos+=8+len;continue}
  const bytes=src.slice(pos+8,pos+8+len),track=[],read=idx=>midiVarLen(bytes,idx),writeEvent=(delta,event)=>track.push(...writeMidiVarLen(delta),...event);
  let i=0,running=0,pending=0;
  while(i<bytes.length){
   const d=read(i);i=d.pos;const delta=d.value+pending;pending=0;
   let status=bytes[i],explicit=status>=128;
   if(explicit){i++;if(status<240)running=status}else{if(!running)throw Error("Invalid running status");status=running}
   let event=[];
   if(status===255){
    if(i>=bytes.length)throw Error("Truncated MIDI meta event");
    const type=bytes[i++],vl=read(i);i=vl.pos;
    if(i+vl.value>bytes.length)throw Error("Truncated MIDI meta payload");
    let payload=Array.from(bytes.slice(i,i+vl.value));i+=vl.value;
    if(type===0x59){pending=delta;continue}
    if(type===0x03)payload=payload.filter(v=>v!==0);
    event=[255,type,...writeMidiVarLen(payload.length),...payload];
   }else if(status===240||status===247){
    const vl=read(i);i=vl.pos;if(i+vl.value>bytes.length)throw Error("Truncated MIDI system-exclusive event");
    event=[status,...writeMidiVarLen(vl.value),...bytes.slice(i,i+vl.value)];i+=vl.value;
   }else{
    const kind=status&240,count=(kind===192||kind===208)?1:2;
    if(i+count>bytes.length)throw Error("Truncated MIDI channel event");
    event=[...(explicit?[status]:[]),...bytes.slice(i,i+count)];i+=count;
   }
   writeEvent(delta,event);
  }
  if(pending)track.push(...writeMidiVarLen(pending),255,47,0);
  const n=track.length;out.push(77,84,114,107,(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255,...track);
  pos+=8+len;
 }
 return new Uint8Array(out).buffer;
}
async function importMidi(f){
 try{
  const buffer=await f.arrayBuffer();let m,usedSanitizer=false;
  try{m=new Midi(buffer)}catch(firstError){console.warn("Standard MIDI parsing failed; retrying after metadata normalization:",firstError);m=new Midi(sanitizeMidiBuffer(buffer));usedSanitizer=true}
  const rawTempo=m.header.tempos[0]?.bpm||120,tempo=Number.isFinite(rawTempo)&&rawTempo>0?rawTempo:120;
  const rawTs=m.header.timeSignatures[0]?.timeSignature||[4,4],ts=Array.isArray(rawTs)&&rawTs.length===2?rawTs:[4,4];
  const tracks=m.tracks.map((t,i)=>({
   id:uid(),name:(t.name||"Track "+(i+1)).replace(/\0/g,"").trim()||"Track "+(i+1),
   muted:false,instrument:"piano",program:Number.isFinite(t.instrument?.number)?t.instrument.number:0,
   notes:t.notes.map(n=>({id:uid(),midi:Math.max(0,Math.min(127,Math.round(n.midi))),time:Math.max(0,n.time*tempo/60),duration:Math.max(.0625,n.duration*tempo/60),velocity:Math.max(1,Math.min(127,Math.round((n.velocity||.7)*127)))}))
  }));
  if(!tracks.length)tracks.push({id:uid(),name:"Track 1",notes:[],instrument:"piano",muted:false,program:0});
  snapshot();S.bpm=Math.round(tempo);S.numerator=Math.max(1,Math.min(32,Number(ts[0])||4));S.denominator=[1,2,4,8,16,32].includes(Number(ts[1]))?Number(ts[1]):4;
  S.tracks=tracks;S.active=Math.max(0,S.tracks.findIndex(t=>t.notes.length>0));S.selected=null;S.name=f.name;S.playhead=0;S.bars=Math.max(4,Math.ceil(maxBeat()/beatsPerBar()));
  render();changed();toast("Imported "+f.name+(usedSanitizer?" (metadata normalized)":""));
 }catch(e){
  console.error("MIDI import failed:",e);
  toast("MIDI import failed: "+(e?.message||String(e)));
 }
}
let pianoReverb=null;
function instrumentSynth(kind){
 if(kind==="piano"){
  if(!pianoReverb)pianoReverb=new Tone.Reverb({decay:2.5,wet:.17}).toDestination();
  return new Tone.Sampler({
   urls:{A0:"A0.mp3",C1:"C1.mp3","D#1":"Ds1.mp3","F#1":"Fs1.mp3",A1:"A1.mp3",C2:"C2.mp3","D#2":"Ds2.mp3","F#2":"Fs2.mp3",A2:"A2.mp3",C3:"C3.mp3","D#3":"Ds3.mp3","F#3":"Fs3.mp3",A3:"A3.mp3",C4:"C4.mp3","D#4":"Ds4.mp3","F#4":"Fs4.mp3",A4:"A4.mp3",C5:"C5.mp3","D#5":"Ds5.mp3","F#5":"Fs5.mp3",A5:"A5.mp3",C6:"C6.mp3","D#6":"Ds6.mp3","F#6":"Fs6.mp3",A6:"A6.mp3",C7:"C7.mp3","D#7":"Ds7.mp3","F#7":"Fs7.mp3",C8:"C8.mp3"},
   release:1.8,attack:.003,volume:-1,baseUrl:"https://tonejs.github.io/audio/salamander/"
  }).connect(pianoReverb);
 }
 const type={electric:"sine",organ:"square",strings:"sawtooth",brass:"sawtooth",bass:"triangle",pluck:"triangle",pad:"sine"}[kind]||"triangle";
 const env={electric:{attack:.01,decay:.5,sustain:.3,release:1},organ:{attack:.02,decay:.1,sustain:.9,release:.15},strings:{attack:.25,decay:.4,sustain:.7,release:1.5},brass:{attack:.08,decay:.2,sustain:.65,release:.3},bass:{attack:.01,decay:.2,sustain:.6,release:.25},pluck:{attack:.003,decay:.3,sustain:.05,release:.3},pad:{attack:.5,decay:.3,sustain:.8,release:2}}[kind]||{};
 return new Tone.PolySynth(Tone.Synth,{oscillator:{type},envelope:env}).toDestination();
}
async function play(){await Tone.start();if(S.playing){Tone.Transport.pause();S.playing=false;$("play").textContent="▶";$("hint").textContent="Paused";return}if(!synths.length)synths=S.tracks.map(t=>instrumentSynth(t.instrument));while(synths.length<S.tracks.length)synths.push(instrumentSynth(S.tracks[synths.length].instrument));try{await Tone.loaded()}catch(e){console.warn("Instrument samples could not be loaded",e);toast("Piano samples could not load. Check your connection.");return}Tone.Transport.stop();Tone.Transport.cancel();Tone.Transport.bpm.value=S.bpm;S.tracks.forEach((t,i)=>t.notes.forEach(n=>Tone.Transport.schedule(time=>{if(!t.muted)synths[i].triggerAttackRelease(Tone.Frequency(n.midi,"midi"),Math.max(.04,n.duration*60/S.bpm),time,(n.velocity||90)/127)},n.time*60/S.bpm)));let end=maxBeat()*60/S.bpm;Tone.Transport.scheduleOnce(()=>{S.playing=false;S.playhead=maxBeat();$("play").textContent="▶";$("hint").textContent="Playback finished";updatePositionUI();piano()},end+.05);Tone.Transport.seconds=S.playhead*60/S.bpm;Tone.Transport.start();S.playing=true;$("play").textContent="Ⅱ";$("hint").textContent="Playback running"}
function stop(){Tone.Transport.stop();Tone.Transport.cancel();S.playing=false;S.playhead=0;$("play").textContent="▶";$("hint").textContent="Stopped";updatePositionUI();piano()}
function tick(){if(!S.playing)return;S.playhead=Tone.Transport.seconds*S.bpm/60;updatePositionUI();piano()}
async function exportPdf(){
 const win=window.open("","_blank");
 if(!win){toast("Allow pop-ups to export PDF");return}
 S.view="sheet";render();await sheet();
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const score=$("sheet").innerHTML;
 if(!$("sheet").querySelector("svg")){win.close();toast("Create a score with notes before exporting");return}
 const title=String(S.name).replace(/[<>&"]/g,"");
 win.document.open();
 win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+title+' — Sheet Music</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Georgia,serif}.osmd-score{display:block!important;width:100%!important;padding:0!important;background:#fff!important}.osmd-score>div{width:210mm!important;max-width:none!important;margin:0!important;background:#fff!important;box-shadow:none!important;break-after:page;page-break-after:always}.osmd-score>div:last-child{break-after:auto;page-break-after:auto}.osmd-score svg{display:block;width:100%!important;height:auto!important}@media screen{body{background:#ddd}.osmd-score>div{margin:12px auto!important;box-shadow:0 2px 16px #0003!important}}</style></head><body><div class="osmd-score">'+score+'</div></body></html>');
 win.document.close();
 const printNow=()=>{win.focus();win.print()};
 if(win.document.readyState==="complete")setTimeout(printNow,350);else win.addEventListener("load",()=>setTimeout(printNow,350),{once:true});
 toast("Print dialog opened — choose Save as PDF");
}
function buildKeyboard(){let notes=[];for(let m=60;m<84;m++){let b=[1,3,6,8,10].includes(m%12),btn=document.createElement("button");btn.className="key"+(b?" black":"");btn.title=pitchName(m);btn.textContent=b?"":pitchName(m);btn.onpointerdown=async e=>{e.preventDefault();await Tone.start();if(!synths[S.active])synths[S.active]=instrumentSynth(track().instrument);synths[S.active].triggerAttack(Tone.Frequency(m,"midi"))};btn.onpointerup=()=>synths[S.active]?.triggerRelease(Tone.Frequency(m,"midi"));btn.onpointerleave=()=>synths[S.active]?.triggerRelease(Tone.Frequency(m,"midi"));notes.push(btn)}$("keyboard").replaceChildren(...notes)}
function addTrack(){snapshot();S.tracks.push({id:uid(),name:"Track "+(S.tracks.length+1),notes:[],instrument:"piano",muted:false,program:0});S.active=S.tracks.length-1;S.selected=null;render();changed()}
$("open").onclick=()=>$("file").click();$("file").onchange=e=>{if(e.target.files[0])importMidi(e.target.files[0]);e.target.value=""};$("openProject").onclick=()=>$("projectFile").click();$("projectFile").onchange=e=>{if(e.target.files[0])loadProject(e.target.files[0]);e.target.value=""};$("save").onclick=save;$("exportMidi").onclick=()=>exportMidi(false);$("exportTrack").onclick=()=>exportMidi(true);$("exportPdf").onclick=exportPdf;$("addTrack").onclick=addTrack;$("renameTrack").onclick=()=>{let v=prompt("Track name",track().name);if(v?.trim()){snapshot();track().name=v.trim();render();changed()}};$("removeTrack").onclick=()=>{if(S.tracks.length===1){toast("Keep at least one track");return}snapshot();S.tracks.splice(S.active,1);S.active=Math.max(0,S.active-1);S.selected=null;render();changed()};$("undo").onclick=undo;$("redo").onclick=redo;$("delete").onclick=()=>{snapshot();track().notes=track().notes.filter(n=>n.id!==S.selected);S.selected=null;render();changed()};["pitch","start","duration","noteVelocity"].forEach(id=>$(id).onchange=updateNote);$("bpm").onchange=e=>{S.bpm=Math.max(30,Math.min(300,+e.target.value||120));e.target.value=S.bpm;if(S.playing){let was=S.playing;stop();S.playhead=0;if(was)play()}changed()};$("timeSig").onchange=e=>{snapshot();[S.numerator,S.denominator]=e.target.value.split("/").map(Number);S.bars=Math.max(S.bars,Math.ceil(maxBeat()/beatsPerBar()));render();changed()};$("keySig").onchange=e=>{snapshot();S.key=e.target.value;render();changed()};$("clef").onchange=e=>{snapshot();S.clef=e.target.value;render();changed()};$("instrument").onchange=e=>{snapshot();track().instrument=e.target.value;if(synths[S.active]){synths[S.active].dispose();synths[S.active]=instrumentSynth(track().instrument)}changed()};$("velocity").oninput=e=>$("velVal").textContent=e.target.value;document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{S.view=b.dataset.view;render()});$("zoomIn").onclick=()=>{S.zoom=Math.min(3,S.zoom+.1);render()};$("zoomOut").onclick=()=>{S.zoom=Math.max(.4,S.zoom-.1);render()};$("clear").onclick=()=>{snapshot();track().notes=[];S.selected=null;render();changed()};$("bars").onclick=()=>{snapshot();S.bars+=4;render();changed()};$("play").onclick=play;$("stop").onclick=stop;$("rewind").onclick=()=>seek(0);$("seek").oninput=e=>seek(e.target.value);$("projectName").ondblclick=()=>{let v=prompt("Project name",S.name);if(v?.trim()){S.name=v.trim();render();changed()}};window.addEventListener("keydown",e=>{if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName))return;if(e.code==="Space"){e.preventDefault();play()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();save()}if(e.key==="Delete"&&S.selected)$("delete").click()});buildKeyboard();render();try{let saved=localStorage.getItem("midistudio-autosave");if(saved){let p=JSON.parse(saved);if(p.format==="MidiStudio"&&p.version>=1)applyProject(p)}}catch{}ticker=setInterval(tick,80);