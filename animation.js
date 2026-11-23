import * as Tone from "https://esm.sh/tone@15.1.22";
const $=id=>document.getElementById(id);
const LOW=24,HIGH=96,WIDTH=1280,HEIGHT=720,KEY_Y=624;
const BLACK=new Set([1,3,6,8,10]);
let getProject,getDuration,toast,active=false,previewing=false,recording=false,elapsed=0,startedAt=0,raf=0,canvas,ctx,noteCache=null;

function hexRgb(hex){const n=parseInt(String(hex).replace("#",""),16);return[(n>>16)&255,(n>>8)&255,n&255]}
function mixColor(a,b,t){const x=hexRgb(a),y=hexRgb(b);return"rgb("+x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(",")+")"}
function settings(){return{start:$("animStart").value,end:$("animEnd").value,bg:$("animBg").value,speed:+$("animSpeed").value||145,glow:$("animGlow").checked,pressed:$("animPressed").value,white:$("animWhiteKey").value,black:$("animBlackKey").value,opacity:(+$("animOpacity").value||85)/100,keyGlow:+$("animKeyGlow").value||0,noteSize:(+$("animNoteSize").value||90)/100,audioVolume:Number($("animAudioVolume").value)/100}}
function allNotes(){if(noteCache)return noteCache;const p=getProject();noteCache=p.tracks.flatMap((track,ti)=>track.muted?[]:track.notes.map(n=>({...n,trackIndex:ti}))).sort((a,b)=>a.time-b.time||a.midi-b.midi);noteCache.forEach((n,i)=>n.gradientIndex=i);return noteCache}
function colorFor(note,notes,s){const i=note.gradientIndex||0,t=notes.length<2?0:i/(notes.length-1);return mixColor(s.start,s.end,t)}
function isWhite(midi){return !BLACK.has(midi%12)}
function whiteKeysBefore(midi){let count=0;for(let m=LOW;m<midi;m++)if(isWhite(m))count++;return count}
function whiteKeyCount(){let count=0;for(let m=LOW;m<=HIGH;m++)if(isWhite(m))count++;return count}
function keyX(midi,keyW){const x=whiteKeysBefore(midi)*keyW;return isWhite(midi)?x:x-keyW*.31}
function drawKeyboard(c,s,notes,songTime){
 const keyW=WIDTH/whiteKeyCount(),white=s.white,black=s.black,blackW=keyW*.62,blackH=57;
 c.fillStyle="#252735";c.fillRect(0,KEY_Y-4,WIDTH,HEIGHT-KEY_Y+4);
 // White keys form the lower keyboard. Black keys overlap the gaps and are shorter.
 for(let m=LOW;m<=HIGH;m++)if(isWhite(m)){
  const x=keyX(m,keyW),w=keyW+.5;
  c.fillStyle=white;c.fillRect(x,KEY_Y,w,HEIGHT-KEY_Y);
  c.strokeStyle="#9fa2ad";c.lineWidth=1;c.strokeRect(x,KEY_Y,w,HEIGHT-KEY_Y);
  if(m%12===0){c.fillStyle="#333746";c.font="bold 11px sans-serif";c.fillText("C"+(Math.floor(m/12)-1),x+4,HEIGHT-13)}
 }
 for(let m=LOW;m<=HIGH;m++)if(!isWhite(m)){
  const x=keyX(m,keyW),y=KEY_Y,w=blackW;
  c.save();c.shadowColor="#000";c.shadowBlur=8;c.shadowOffsetY=3;
  c.fillStyle=black;c.beginPath();c.roundRect(x,y,w,blackH,[0,0,3,3]);c.fill();c.restore();
  c.fillStyle="#ffffff18";c.fillRect(x+3,y+2,Math.max(1,w-6),3);
  c.strokeStyle="#08090d";c.lineWidth=1;c.strokeRect(x,y,w,blackH);
 }
 const lit=new Map();for(const n of notes){const bpm=Math.max(1,getProject().bpm||120),at=n.time*60/bpm,dur=Math.max(.045,n.duration*60/bpm);if(songTime>=at&&songTime<at+dur)lit.set(n.midi,colorFor(n,notes,s))}
 // Illuminate the actual key silhouette, not a rectangular overlay.
 for(const [m,col] of lit){
  const x=keyX(m,keyW),isNatural=isWhite(m),w=isNatural?keyW-2:blackW,h=isNatural?HEIGHT-KEY_Y-2:blackH-2,y=KEY_Y+(isNatural?1:1);
  c.save();
  c.beginPath();
  c.roundRect(x+(isNatural?1:0),y,w,h,isNatural?[0,0,4,4]:[0,0,3,3]);
  c.clip();
  c.shadowColor=s.pressed;c.shadowBlur=s.keyGlow;
  c.fillStyle=s.pressed;c.globalAlpha=.58;
  c.fill();
  c.shadowBlur=0;c.globalAlpha=1;
  // Keep the key's bevel and edge definition visible while it is lit.
  const edge=c.createLinearGradient(x,0,x+w,0);
  edge.addColorStop(0,"#ffffff88");edge.addColorStop(.12,"#ffffff22");edge.addColorStop(.88,"#00000008");edge.addColorStop(1,"#00000066");
  c.strokeStyle=edge;c.lineWidth=2;
  c.beginPath();c.roundRect(x+(isNatural?1:0)+.5,y+.5,w-1,h-1,isNatural?[0,0,4,4]:[0,0,3,3]);c.stroke();
  c.restore();
 }
}
function drawFrame(elapsedSeconds){
 const p=getProject(),s=settings(),notes=allNotes(),bpm=Math.max(1,p.bpm||120),songTime=elapsedSeconds-3.6,travel=s.speed,hitY=KEY_Y;

 const grad=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);grad.addColorStop(0,s.bg);grad.addColorStop(1,"#11131d");ctx.fillStyle=grad;ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.save();ctx.globalAlpha=.16;for(let i=0;i<70;i++){const x=(i*197)%WIDTH,y=(i*113)%KEY_Y;ctx.fillStyle="#b9b0ff";ctx.fillRect(x,y,2,2)}ctx.restore();
 const keyW=WIDTH/whiteKeyCount();
 ctx.strokeStyle="#ffffff12";ctx.lineWidth=1;for(let m=LOW;m<=HIGH;m+=12){const x=keyX(m,keyW);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,KEY_Y);ctx.stroke()}
 // Soft horizon and hit line.
 const glow=ctx.createLinearGradient(0,hitY-100,0,hitY+5);glow.addColorStop(0,"#9b83ff00");glow.addColorStop(1,"#9b83ff35");ctx.fillStyle=glow;ctx.fillRect(0,hitY-100,WIDTH,100);
 ctx.strokeStyle="#c5b6ff";ctx.shadowColor="#a18aff";ctx.shadowBlur=14;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,hitY);ctx.lineTo(WIDTH,hitY);ctx.stroke();ctx.shadowBlur=0;
 for(const n of notes){if(n.midi<LOW||n.midi>HIGH)continue;const start=n.time*60/bpm,dur=Math.max(.045,n.duration*60/bpm),bottom=hitY-(start-songTime)*travel,top=bottom-dur*travel;if(bottom<-5||top>hitY+8)continue;const baseKeyW=isWhite(n.midi)?keyW:keyW*.62,w=Math.max(3,baseKeyW*s.noteSize),x=keyX(n.midi,keyW)+(baseKeyW-w)/2,h=Math.max(7,bottom-top),col=colorFor(n,notes,s),alpha=.7+.3*Math.max(0,Math.min(1,(n.velocity||90)/127));ctx.globalAlpha=alpha*s.opacity;
  if(s.glow){ctx.shadowColor=col;ctx.shadowBlur=18}
  const g=ctx.createLinearGradient(x,top,x+w,bottom);g.addColorStop(0,col);g.addColorStop(1,mixColor(col,s.end,.22));ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(x,top,w,h,Math.min(7,w/3));ctx.fill();ctx.shadowBlur=0;
  ctx.globalAlpha=.8;ctx.fillStyle="#ffffff";ctx.fillRect(x+2,top+2,Math.max(1,w*.12),Math.max(2,h-4));ctx.globalAlpha=1;
 }
 drawKeyboard(ctx,s,notes,songTime);

}
function frame(now){if(!active&&!recording){raf=0;return}if(previewing&&!recording){elapsed=(now-startedAt)/1000;const total=3.6+getDuration()+1.2;if(elapsed>=total){elapsed=total;previewing=false;$("animPlay").textContent="▶ Preview";$("animStatus").textContent="Preview finished"}}
 drawFrame(elapsed);if(previewing||recording||active)raf=requestAnimationFrame(frame);else raf=0}
function refresh(){noteCache=null;if(canvas&&active&&!previewing&&!recording)drawFrame(elapsed)}
function setActive(value){active=value;if(active){if(!raf)raf=requestAnimationFrame(frame)}else if(!previewing&&!recording&&raf){cancelAnimationFrame(raf);raf=0}}
function startPreview(){if(previewing){elapsed=(performance.now()-startedAt)/1000;previewing=false;$("animPlay").textContent="▶ Preview";$("animStatus").textContent="Preview paused";return}elapsed=0;startedAt=performance.now();previewing=true;$("animPlay").textContent="Ⅱ Pause";$("animStatus").textContent="Playing preview";setActive(true)}
async function createExportAudioStream(){
 await Tone.start();
 const raw=Tone.getContext().rawContext;
 const destination=raw.createMediaStreamDestination();
 const output=new Tone.Gain(settings().audioVolume).toDestination();
 output.connect(destination);
 const reverb=new Tone.Reverb({decay:3.2,wet:.24});
 reverb.connect(output);
 const piano=new Tone.Sampler({
  urls:{A0:"A0.mp3",C1:"C1.mp3","D#1":"Ds1.mp3","F#1":"Fs1.mp3",A1:"A1.mp3",C2:"C2.mp3","D#2":"Ds2.mp3","F#2":"Fs2.mp3",A2:"A2.mp3",C3:"C3.mp3","D#3":"Ds3.mp3","F#3":"Fs3.mp3",A3:"A3.mp3",C4:"C4.mp3","D#4":"Ds4.mp3","F#4":"Fs4.mp3",A4:"A4.mp3",C5:"C5.mp3","D#5":"Ds5.mp3","F#5":"Fs5.mp3",A5:"A5.mp3",C6:"C6.mp3","D#6":"Ds6.mp3","F#6":"Fs6.mp3",A6:"A6.mp3",C7:"C7.mp3","D#7":"Ds7.mp3","F#7":"Fs7.mp3",C8:"C8.mp3"},
  release:2.2,attack:.004,volume:-2,baseUrl:"https://tonejs.github.io/audio/salamander/"
 });
 piano.connect(reverb);
 await Tone.loaded();
 await reverb.ready;
 return{destination,piano,output,reverb};
}
function scheduleExportNotes(audioPack,songStartTime){
 const p=getProject(),bpm=Math.max(1,p.bpm||120);
 for(const n of allNotes()){
  const at=songStartTime+n.time*60/bpm,duration=Math.max(.045,n.duration*60/bpm),velocity=Math.max(1,Math.min(127,n.velocity||90))/127;
  audioPack.piano.triggerAttackRelease(Tone.Frequency(n.midi,"midi"),duration,at,velocity);
 }
}
async function exportVideo(){
 if(recording)return;
 if(!canvas.captureStream||!window.MediaRecorder){toast("Video recording is not supported in this browser");return}
 const formats=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];
 const total=3.6+getDuration()+1.2;if(total>900){toast("This animation is too long to export in one video");return}
 previewing=false;recording=true;elapsed=0;active=false;if(raf){cancelAnimationFrame(raf);raf=0}$("animPlay").textContent="▶ Preview";$("animExport").disabled=true;$("animStatus").textContent="Loading piano sound…";
 let audioPack;try{audioPack=await createExportAudioStream()}catch(e){console.error(e);recording=false;$("animExport").disabled=false;$("animStatus").textContent="Audio could not be loaded";toast("Could not load piano audio. Check your connection and try again.");return}
 const videoStream=canvas.captureStream(60),tracks=[...videoStream.getVideoTracks(),...audioPack.destination.stream.getAudioTracks()],stream=new MediaStream(tracks),chunks=[];let recorder=null,mime=null;
 for(const candidate of formats){if(!MediaRecorder.isTypeSupported(candidate))continue;try{recorder=new MediaRecorder(stream,{mimeType:candidate,videoBitsPerSecond:12000000,audioBitsPerSecond:192000});mime=candidate;break}catch(e){console.warn("Video format unavailable:",candidate,e)}}
 if(!recorder){stream.getTracks().forEach(t=>t.stop());audioPack.piano.dispose();audioPack.output.dispose();audioPack.reverb.dispose();recording=false;$("animExport").disabled=false;$("animStatus").textContent="No supported MP4/WebM encoder";toast("This browser cannot encode MP4 or WebM video");return}
 $("animStatus").textContent="Rendering video with piano audio…";
 recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
 recorder.onerror=()=>{$("animStatus").textContent="Video export failed";toast("Video export failed")};
 recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(audioPack){audioPack.piano.dispose();audioPack.output.dispose();audioPack.reverb.dispose()}recording=false;$("animExport").disabled=false;const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(getProject().name||"midistudio").replace(/[^a-z0-9-_]+/gi,"-")+"-visualizer."+(mime.startsWith("video/mp4")?"mp4":"webm");a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$("animStatus").textContent="Export complete · "+(mime.startsWith("video/mp4")?"MP4":"WebM fallback")+" · "+(blob.size/1048576).toFixed(1)+" MB";toast(mime.startsWith("video/mp4")?"MP4 video exported":"MP4 unavailable here; exported WebM instead")};
 // Draw the initial frame first and use the raw AudioContext clock for both
 // scheduled MIDI events and video-frame timestamps.
 const rawContext=Tone.getContext().rawContext;
 // Anchor both clocks to MediaRecorder's actual start event. Calling start()
 // does not mean the recorder has begun timestamping tracks yet.
 drawFrame(0);
 let recordWallStart=0;
 const exportFrame=now=>{elapsed=(now-recordWallStart)/1000;drawFrame(elapsed);$("animStatus").textContent="Rendering video · "+Math.min(100,Math.round(elapsed/total*100))+"%";if(elapsed>=total){elapsed=total;drawFrame(total);recorder.stop();return}requestAnimationFrame(exportFrame)};
 recorder.onstart=()=>{
  recordWallStart=performance.now();
  const recordAudioStart=rawContext.currentTime;
  scheduleExportNotes(audioPack,recordAudioStart+3.6);
  requestAnimationFrame(exportFrame);
 };
 recorder.start(1000);
}
export function initAnimation(api){
 getProject=api.getProject;getDuration=api.getDuration;toast=api.toast;canvas=$("animCanvas");ctx=canvas.getContext("2d");
 $("animPlay").onclick=startPreview;$("animReset").onclick=()=>{previewing=false;elapsed=0;$("animPlay").textContent="▶ Preview";$("animStatus").textContent="Ready";refresh()};
 $("animExport").onclick=exportVideo;
 ["animStart","animEnd","animBg","animSpeed","animGlow","animPressed","animWhiteKey","animBlackKey","animOpacity","animKeyGlow","animNoteSize","animAudioVolume"].forEach(id=>$(id).addEventListener("input",()=>{$("animSpeedValue").textContent=$("animSpeed").value+" px/s";$("animOpacityValue").textContent=$("animOpacity").value+"%";$("animKeyGlowValue").textContent=$("animKeyGlow").value;$("animNoteSizeValue").textContent=$("animNoteSize").value+"%";$("animAudioVolumeValue").textContent=$("animAudioVolume").value+"%";$("gradientSample").style.background="linear-gradient(90deg,"+$("animStart").value+","+$("animEnd").value+")";refresh()}));
 $("animSpeedValue").textContent=$("animSpeed").value+" px/s";$("animOpacityValue").textContent=$("animOpacity").value+"%";$("animKeyGlowValue").textContent=$("animKeyGlow").value;$("animNoteSizeValue").textContent=$("animNoteSize").value+"%";$("animAudioVolumeValue").textContent=$("animAudioVolume").value+"%";drawFrame(0);
 return{setActive,refresh};
}
