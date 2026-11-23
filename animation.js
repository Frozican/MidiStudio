const $=id=>document.getElementById(id);
const LOW=24,HIGH=96,WIDTH=1280,HEIGHT=720,KEY_Y=624;
const BLACK=new Set([1,3,6,8,10]);
let getProject,getDuration,toast,active=false,previewing=false,recording=false,elapsed=0,startedAt=0,raf=0,canvas,ctx;

function hexRgb(hex){const n=parseInt(String(hex).replace("#",""),16);return[(n>>16)&255,(n>>8)&255,n&255]}
function mixColor(a,b,t){const x=hexRgb(a),y=hexRgb(b);return"rgb("+x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(",")+")"}
function settings(){return{start:$("animStart").value,end:$("animEnd").value,bg:$("animBg").value,speed:+$("animSpeed").value||145,glow:$("animGlow").checked,pressed:$("animPressed").value,white:$("animWhiteKey").value,black:$("animBlackKey").value,opacity:(+$("animOpacity").value||85)/100}}
function allNotes(){const p=getProject();return p.tracks.flatMap((track,ti)=>track.muted?[]:track.notes.map(n=>({...n,trackIndex:ti}))).sort((a,b)=>a.time-b.time||a.midi-b.midi)}
function colorFor(note,notes,s){const i=notes.indexOf(note),t=notes.length<2?0:i/(notes.length-1);return mixColor(s.start,s.end,t)}
function keyX(midi,keyW){return(midi-LOW)*keyW}
function drawKeyboard(c,s,notes,songTime){
 const keyW=WIDTH/(HIGH-LOW+1),white=s.white,black=s.black;
 c.fillStyle="#252735";c.fillRect(0,KEY_Y-4,WIDTH,HEIGHT-KEY_Y+4);
 for(let m=LOW;m<=HIGH;m++){
  const x=keyX(m,keyW),isBlack=BLACK.has(m%12),w=keyW+(m===HIGH?1:0);
  if(!isBlack){c.fillStyle=white;c.fillRect(x,KEY_Y,w,HEIGHT-KEY_Y);c.strokeStyle="#b8b9c4";c.lineWidth=1;c.strokeRect(x,KEY_Y,w,HEIGHT-KEY_Y);if(m%12===0){c.fillStyle="#333746";c.font="bold 11px sans-serif";c.fillText("C"+(Math.floor(m/12)-1),x+4,HEIGHT-13)}}
 }
 for(let m=LOW;m<=HIGH;m++)if(BLACK.has(m%12)){const x=keyX(m,keyW),w=keyW*.64;c.fillStyle=black;c.shadowColor="#000";c.shadowBlur=8;c.fillRect(x+(keyW-w)/2,KEY_Y,w,92);c.shadowBlur=0;c.fillStyle="#35394a";c.fillRect(x+(keyW-w)/2+3,KEY_Y+2,w-6,4)}
 const lit=new Map();for(const n of notes){const bpm=Math.max(1,getProject().bpm||120),at=n.time*60/bpm,dur=Math.max(.045,n.duration*60/bpm);if(songTime>=at&&songTime<at+dur)lit.set(n.midi,colorFor(n,notes,s))}
 for(const [m,col] of lit){const x=keyX(m,keyW);c.fillStyle=s.pressed;if(BLACK.has(m%12)){const w=keyW*.64;c.fillRect(x+(keyW-w)/2,KEY_Y,w,92)}else c.fillRect(x+1,KEY_Y+1,keyW-2,HEIGHT-KEY_Y-2)}
}
function drawFrame(elapsedSeconds){
 const p=getProject(),s=settings(),notes=allNotes(),bpm=Math.max(1,p.bpm||120),songTime=elapsedSeconds-3.6,travel=s.speed,hitY=KEY_Y;
 notes.forEach((n,i)=>n.gradientIndex=i);
 const grad=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);grad.addColorStop(0,s.bg);grad.addColorStop(1,"#11131d");ctx.fillStyle=grad;ctx.fillRect(0,0,WIDTH,HEIGHT);
 ctx.save();ctx.globalAlpha=.16;for(let i=0;i<70;i++){const x=(i*197)%WIDTH,y=(i*113)%KEY_Y;ctx.fillStyle="#b9b0ff";ctx.fillRect(x,y,2,2)}ctx.restore();
 const keyW=WIDTH/(HIGH-LOW+1);
 ctx.strokeStyle="#ffffff12";ctx.lineWidth=1;for(let m=LOW;m<=HIGH;m+=12){const x=keyX(m,keyW);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,KEY_Y);ctx.stroke()}
 // Soft horizon and hit line.
 const glow=ctx.createLinearGradient(0,hitY-100,0,hitY+5);glow.addColorStop(0,"#9b83ff00");glow.addColorStop(1,"#9b83ff35");ctx.fillStyle=glow;ctx.fillRect(0,hitY-100,WIDTH,100);
 ctx.strokeStyle="#c5b6ff";ctx.shadowColor="#a18aff";ctx.shadowBlur=14;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,hitY);ctx.lineTo(WIDTH,hitY);ctx.stroke();ctx.shadowBlur=0;
 for(const n of notes){if(n.midi<LOW||n.midi>HIGH)continue;const start=n.time*60/bpm,dur=Math.max(.045,n.duration*60/bpm),bottom=hitY-(start-songTime)*travel,top=bottom-dur*travel;if(bottom<-5||top>hitY+8)continue;const x=keyX(n.midi,keyW)+2,w=keyW-4,h=Math.max(7,bottom-top),col=colorFor(n,notes,s),alpha=.7+.3*Math.max(0,Math.min(1,(n.velocity||90)/127));ctx.globalAlpha=alpha*s.opacity;
  if(s.glow){ctx.shadowColor=col;ctx.shadowBlur=18}
  const g=ctx.createLinearGradient(x,top,x+w,bottom);g.addColorStop(0,col);g.addColorStop(1,mixColor(col,s.end,.22));ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(x,top,w,h,Math.min(7,w/3));ctx.fill();ctx.shadowBlur=0;
  ctx.globalAlpha=.8;ctx.fillStyle="#ffffff";ctx.fillRect(x+2,top+2,Math.max(1,w*.12),Math.max(2,h-4));ctx.globalAlpha=1;
 }
 drawKeyboard(ctx,s,notes,songTime);
 ctx.fillStyle="#ffffff";ctx.globalAlpha=.9;ctx.font="600 15px Inter,system-ui";ctx.fillText(p.name||"MidiStudio",24,32);ctx.globalAlpha=.55;ctx.font="11px Inter,system-ui";ctx.fillText("PIANO VISUALIZER  ·  "+Math.round(bpm)+" BPM",24,52);ctx.globalAlpha=1;
}
function frame(now){if(!active&&!recording){raf=0;return}if(previewing&&!recording){elapsed=(now-startedAt)/1000;const total=3.6+getDuration()+1.2;if(elapsed>=total){elapsed=total;previewing=false;$("animPlay").textContent="▶ Preview";$("animStatus").textContent="Preview finished"}}
 drawFrame(elapsed);if(previewing||recording||active)raf=requestAnimationFrame(frame);else raf=0}
function refresh(){if(canvas&&active&&!previewing&&!recording)drawFrame(elapsed)}
function setActive(value){active=value;if(active){if(!raf)raf=requestAnimationFrame(frame)}else if(!previewing&&!recording&&raf){cancelAnimationFrame(raf);raf=0}}
function startPreview(){if(previewing){elapsed=(performance.now()-startedAt)/1000;previewing=false;$("animPlay").textContent="▶ Preview";$("animStatus").textContent="Preview paused";return}elapsed=0;startedAt=performance.now();previewing=true;$("animPlay").textContent="Ⅱ Pause";$("animStatus").textContent="Playing preview";setActive(true)}
function createExportAudioStream(){
 const AudioCtx=window.AudioContext||window.webkitAudioContext;
 if(!AudioCtx)return null;
 const audio=new AudioCtx(),destination=audio.createMediaStreamDestination(),p=getProject(),bpm=Math.max(1,p.bpm||120),base=audio.currentTime+.12+3.6;
 for(const n of allNotes()){
  const start=base+n.time*60/bpm,duration=Math.max(.045,n.duration*60/bpm),velocity=Math.max(1,Math.min(127,n.velocity||90))/127;
  const osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();
  osc.type="triangle";osc.frequency.value=440*Math.pow(2,(n.midi-69)/12);filter.type="lowpass";filter.frequency.value=7000;
  gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(.16*velocity,start+.012);
  gain.gain.setValueAtTime(.16*velocity,Math.max(start+.013,start+duration-.035));gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(filter);filter.connect(gain);gain.connect(destination);osc.start(start);osc.stop(start+duration+.02);
 }
 return{audio,destination};
}
async function exportVideo(){
 if(recording)return;
 if(!canvas.captureStream||!window.MediaRecorder){toast("Video recording is not supported in this browser");return}
 const mime=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported(t));if(!mime){toast("No supported video format found");return}
 const total=3.6+getDuration()+1.2;if(total>900){toast("This animation is too long to export in one video");return}
 previewing=false;recording=true;elapsed=0;active=true;$("animPlay").textContent="▶ Preview";$("animExport").disabled=true;$("animStatus").textContent="Rendering video…";
 const videoStream=canvas.captureStream(60),audioPack=createExportAudioStream(),tracks=[...videoStream.getVideoTracks(),...(audioPack?audioPack.destination.stream.getAudioTracks():[])],stream=new MediaStream(tracks),chunks=[];let recorder;
 try{if(audioPack)await audioPack.audio.resume();recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:12000000,audioBitsPerSecond:192000})}catch(e){stream.getTracks().forEach(t=>t.stop());recording=false;$("animExport").disabled=false;toast("Could not start video export");return}
 recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
 recorder.onerror=()=>{$("animStatus").textContent="Video export failed";toast("Video export failed")};
 recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());recording=false;$("animExport").disabled=false;const blob=new Blob(chunks,{type:mime});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(getProject().name||"midistudio").replace(/[^a-z0-9-_]+/gi,"-")+"-visualizer.webm";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$("animStatus").textContent="Export complete · "+(blob.size/1048576).toFixed(1)+" MB";toast("Visualizer video exported")};
 const begin=performance.now();recorder.start(500);
 const exportFrame=now=>{elapsed=(now-begin)/1000;drawFrame(elapsed);$("animStatus").textContent="Rendering video · "+Math.min(100,Math.round(elapsed/total*100))+"%";if(elapsed>=total){drawFrame(total);recorder.stop();return}requestAnimationFrame(exportFrame)};
 requestAnimationFrame(exportFrame);
}
export function initAnimation(api){
 getProject=api.getProject;getDuration=api.getDuration;toast=api.toast;canvas=$("animCanvas");ctx=canvas.getContext("2d");
 $("animPlay").onclick=startPreview;$("animReset").onclick=()=>{previewing=false;elapsed=0;$("animPlay").textContent="▶ Preview";$("animStatus").textContent="Ready";refresh()};
 $("animExport").onclick=exportVideo;
 ["animStart","animEnd","animBg","animSpeed","animGlow","animPressed","animWhiteKey","animBlackKey","animOpacity"].forEach(id=>$(id).addEventListener("input",()=>{$("animSpeedValue").textContent=$("animSpeed").value+" px/s";$("animOpacityValue").textContent=$("animOpacity").value+"%";$("gradientSample").style.background="linear-gradient(90deg,"+$("animStart").value+","+$("animEnd").value+")";refresh()}));
 $("animSpeedValue").textContent=$("animSpeed").value+" px/s";$("animOpacityValue").textContent=$("animOpacity").value+"%";drawFrame(0);
 return{setActive,refresh};
}
