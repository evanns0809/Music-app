/* ============================================
   Compose Piano — Main Application
   No time limit, soundfont, clean UI
   ============================================ */
(function(){
'use strict';

const state={
  mode:'tap',
  bpm:120,
  timeSig:4,
  metronomeOn:false,
  metronomeTimer:null,
  metronomeBeat:0,

  // Tap — NO time limit
  tapStartTime:null,
  taps:[],

  // Assign
  selTap:-1,
  noteAssigns:[],

  // Themes
  themes:[],
  nextId:1,

  // Arrange
  arrangement:[],
  pickedTheme:null,
  looping:false,
  playing:false,
  playTimers:null,
};

const audio=new PianoAudioEngine();
let audioReady=false;

const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);

const el={
  overlay:$('#loading-overlay'),
  loaderFill:$('#loader-fill'),
  loaderStatus:$('#loader-status'),
  navTabs:$$('.nav-tab'),
  panels:$$('.mode-panel'),
  tapPad:$('#tap-pad'),
  tapPrompt:$('#tap-prompt'),
  tapCounter:$('#tap-counter'),
  tlBeats:$('#tl-beats'),
  tlTaps:$('#tl-taps'),
  tlCursor:$('#tl-cursor'),
  rhythmTL:$('#rhythm-timeline'),
  rtWrap:$('.rhythm-timeline-wrap'),
  tempoDisp:$('#tempo-display'),
  tempoUp:$('#tempo-up'),
  tempoDown:$('#tempo-down'),
  timeSig:$('#time-signature'),
  btnMet:$('#btn-metronome'),
  quantize:$('#quantize-value'),
  btnClear:$('#btn-clear-rhythm'),
  btnPlayR:$('#btn-play-rhythm'),
  btnConfirm:$('#btn-confirm-rhythm'),
  noteTLInner:$('#note-tl-inner'),
  piano:$('#piano-keyboard'),
  btnReplayR:$('#btn-replay-rhythm'),
  btnPlayM:$('#btn-play-melody'),
  btnAuto:$('#btn-auto-assign'),
  btnSave:$('#btn-save-theme'),
  themeList:$('#theme-list'),
  arrDrop:$('#arr-drop'),
  btnNew:$('#btn-new-theme'),
  btnPlayA:$('#btn-play-arrangement'),
  btnStopA:$('#btn-stop-arrangement'),
  btnLoop:$('#btn-loop-arrangement'),
  btnMidi:$('#btn-export-midi'),
  btnWav:$('#btn-export-wav'),
  btnSettings:$('#btn-settings'),
  settingsModal:$('#settings-modal'),
  closeSettings:$('#close-settings'),
  volSlider:$('#master-volume'),
  revSlider:$('#reverb-amount'),
  themeModal:$('#theme-name-modal'),
  themeInput:$('#theme-name-input'),
  closeTheme:$('#close-theme-modal'),
  colorDots:$$('.cdot'),
  btnConfirmTheme:$('#btn-confirm-theme-name'),
};

/* ---- INIT ---- */
function init(){
  buildPiano();
  bind();
  loadStorage();
  renderThemes();
  renderArrangement();

  // Loading overlay — tap to start
  const startAudio=async()=>{
    el.overlay.removeEventListener('click',startAudio);
    el.overlay.removeEventListener('touchstart',startAudio);
    el.loaderStatus.textContent='Loading samples...';
    await audio.init(p=>{
      el.loaderFill.style.width=Math.round(p*100)+'%';
    });
    audioReady=true;
    el.loaderFill.style.width='100%';
    el.loaderStatus.textContent='Ready';
    setTimeout(()=>el.overlay.classList.add('hidden'),400);
  };
  el.overlay.addEventListener('click',startAudio);
  el.overlay.addEventListener('touchstart',startAudio,{passive:true});
}

async function ensureAudio(){
  if(!audioReady){
    el.loaderStatus.textContent='Loading samples...';
    await audio.init(p=>{el.loaderFill.style.width=Math.round(p*100)+'%'});
    audioReady=true;
    el.loaderFill.style.width='100%';
    setTimeout(()=>el.overlay.classList.add('hidden'),300);
  } else {
    audio.resume();
  }
}

/* ---- MODE SWITCH ---- */
function setMode(m){
  state.mode=m;
  el.navTabs.forEach(t=>t.classList.toggle('active',t.dataset.mode===m));
  el.panels.forEach(p=>p.classList.toggle('active',p.id==='mode-'+m));
  if(m==='assign') renderNoteTimeline();
  if(m==='arrange'){renderThemes();renderArrangement();}
}

/* ============================================
   TAP RHYTHM — NO TIME LIMIT
   ============================================ */

function getTimelineDuration(){
  if(state.taps.length===0) return 4; // default 4s visible
  return Math.max(state.taps[state.taps.length-1].time+2, 4);
}

function handleTap(e){
  e.preventDefault();
  ensureAudio();

  const now=performance.now();
  if(state.taps.length===0){
    state.tapStartTime=now;
    el.tapPrompt.classList.add('dim');
  }

  let time=(now-state.tapStartTime)/1000;

  // Quantize
  const q=parseInt(el.quantize.value);
  if(q>0){
    const bd=60/state.bpm;
    const sd=bd/(q/4);
    time=Math.round(time/sd)*sd;
  }

  state.taps.push({time});
  audio.playTapSound();
  ripple(e);
  renderTapMarkers();
  renderBeatLines();
  el.tapCounter.textContent=state.taps.length+' tap'+(state.taps.length!==1?'s':'');

  // Auto-scroll timeline to show latest tap
  const dur=getTimelineDuration();
  const pct=time/dur;
  if(pct>.85){
    el.rtWrap.scrollLeft=el.rtWrap.scrollWidth;
  }
}

function ripple(e){
  const r=el.tapPad.getBoundingClientRect();
  let x,y;
  if(e.touches){x=e.touches[0].clientX-r.left;y=e.touches[0].clientY-r.top}
  else{x=e.clientX-r.left;y=e.clientY-r.top}
  const d=document.createElement('div');
  d.className='tap-ripple';d.style.left=x+'px';d.style.top=y+'px';
  el.tapPad.querySelector('.tap-ripple-container').appendChild(d);
  d.addEventListener('animationend',()=>d.remove());
}

function renderBeatLines(){
  el.tlBeats.innerHTML='';
  const dur=getTimelineDuration();
  const beatDur=60/state.bpm;
  const totalBeats=Math.ceil(dur/beatDur);
  // Make timeline wider if needed
  const minW=el.rhythmTL.parentElement.offsetWidth;
  const pxPerSec=Math.max(minW/dur, 80);
  el.rhythmTL.style.width=Math.max(dur*pxPerSec, minW)+'px';

  for(let i=0;i<=totalBeats;i++){
    const t=i*beatDur;
    const pct=(t/dur)*100;
    if(pct>100) break;
    const line=document.createElement('div');
    line.className='beat-line'+(i%state.timeSig===0?' strong':'');
    line.style.left=pct+'%';
    el.tlBeats.appendChild(line);
    if(i%state.timeSig===0){
      const lbl=document.createElement('div');
      lbl.className='beat-num';
      lbl.textContent=Math.floor(i/state.timeSig)+1;
      lbl.style.left=pct+'%';
      el.tlBeats.appendChild(lbl);
    }
  }
}

function renderTapMarkers(){
  el.tlTaps.innerHTML='';
  if(state.taps.length===0) return;
  const dur=getTimelineDuration();
  state.taps.forEach((tap,i)=>{
    const pct=(tap.time/dur)*100;
    const dot=document.createElement('div');
    dot.className='tap-dot'+(i===state.selTap?' sel':'');
    dot.style.left=Math.min(pct,99.5)+'%';
    dot.addEventListener('click',e=>{e.stopPropagation();state.selTap=i;renderTapMarkers()});
    el.tlTaps.appendChild(dot);
  });
}

function clearRhythm(){
  state.taps=[];state.tapStartTime=null;state.noteAssigns=[];state.selTap=-1;
  el.tapPrompt.classList.remove('dim');
  el.tapCounter.textContent='0 taps';
  renderTapMarkers();renderBeatLines();
}

function previewRhythm(){
  if(!state.taps.length)return;
  ensureAudio();
  state.taps.forEach(t=>setTimeout(()=>audio.playTapSound(),t.time*1000));
}

/* ---- Metronome ---- */
function toggleMet(){
  state.metronomeOn=!state.metronomeOn;
  el.btnMet.classList.toggle('on',state.metronomeOn);
  if(state.metronomeOn) startMet(); else stopMet();
}
function startMet(){
  ensureAudio();
  state.metronomeBeat=0;
  const iv=(60/state.bpm)*1000;
  tick();
  state.metronomeTimer=setInterval(tick,iv);
  function tick(){audio.playMetronomeClick(state.metronomeBeat%state.timeSig===0);state.metronomeBeat++}
}
function stopMet(){if(state.metronomeTimer){clearInterval(state.metronomeTimer);state.metronomeTimer=null}}

/* ============================================
   PIANO KEYBOARD
   ============================================ */
function buildPiano(){
  el.piano.innerHTML='';
  const s=36,e=96; // C2 to C7 — 5 octaves
  const whites=[];
  let wi=0;
  for(let m=s;m<e;m++) if(!isBlackKey(m)){whites.push({midi:m,idx:wi});wi++}
  const kw=54;
  el.piano.style.width=(whites.length*kw)+'px';

  whites.forEach(wk=>{
    const k=document.createElement('button');
    k.className='pkey w';k.dataset.midi=wk.midi;
    k.style.left=(wk.idx*kw)+'px';
    const l=document.createElement('span');l.className='klbl';l.textContent=midiToName(wk.midi);
    k.appendChild(l);el.piano.appendChild(k);
  });

  wi=0;
  for(let m=s;m<e;m++){
    if(!isBlackKey(m)){wi++;continue}
    const lp=(wi-1)*kw+kw*.65;
    const k=document.createElement('button');
    k.className='pkey b';k.dataset.midi=m;
    k.style.left=lp+'px';
    const l=document.createElement('span');l.className='klbl';
    l.textContent=noteDisplayName(m).replace(/\d/,'');
    k.appendChild(l);el.piano.appendChild(k);
  }

  setTimeout(()=>{
    const ps=el.piano.parentElement;
    ps.scrollLeft=(parseInt(el.piano.style.width)-ps.offsetWidth)/2;
  },120);
}

function hitKey(midi){
  ensureAudio();
  const nid=midiToName(midi),freq=midiToFreq(midi);
  audio.playNote(nid,freq,.75,1.8);
  const ke=el.piano.querySelector(`[data-midi="${midi}"]`);
  if(ke){ke.classList.add('act');setTimeout(()=>ke.classList.remove('act'),180)}
  if(state.mode==='assign'&&state.selTap>=0) assignNote(state.selTap,midi);
}

/* ============================================
   NOTE ASSIGNMENT
   ============================================ */
function renderNoteTimeline(){
  el.noteTLInner.innerHTML='';
  if(!state.taps.length){
    el.noteTLInner.innerHTML='<p class="empty-note-msg">No rhythm yet. Go to Tap first.</p>';
    return;
  }
  state.taps.forEach((tap,i)=>{
    const a=state.noteAssigns.find(n=>n.tapIndex===i);
    const sel=state.selTap===i;
    const blk=document.createElement('div');
    blk.className='n-block'+(sel?' sel':'')+(a?' done':' empty');
    if(a){
      const nm=noteDisplayName(a.midi);
      blk.innerHTML=`<span class="nidx">${i+1}</span><span class="nlbl">${nm.replace(/\d/,'')}</span><span class="noct">${nm.match(/\d/)?.[0]||''}</span>`;
    }else{
      blk.innerHTML=`<span class="nidx">${i+1}</span><span class="nlbl">?</span><span class="noct">tap</span>`;
    }
    blk.addEventListener('click',()=>{
      state.selTap=i;renderNoteTimeline();
      highlightKey(a?a.midi:null);
    });
    el.noteTLInner.appendChild(blk);
  });
  // Auto-scroll to selected tap
  if(state.selTap>=0){
    const selBlock=el.noteTLInner.children[state.selTap];
    if(selBlock) selBlock.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  }
}

function assignNote(ti,midi){
  state.noteAssigns=state.noteAssigns.filter(a=>a.tapIndex!==ti);
  state.noteAssigns.push({tapIndex:ti,midi,time:state.taps[ti].time});
  const next=state.taps.findIndex((_,i)=>i>ti&&!state.noteAssigns.find(a=>a.tapIndex===i));
  state.selTap=next>=0?next:-1;
  renderNoteTimeline();highlightKey(null);
}

function highlightKey(midi){
  el.piano.querySelectorAll('.pkey').forEach(k=>k.classList.remove('glow'));
  if(midi!=null){const k=el.piano.querySelector(`[data-midi="${midi}"]`);if(k)k.classList.add('glow')}
}

function autoFill(){
  ensureAudio();
  const penta=[60,62,64,67,69,72,74,76,79,81];
  state.taps.forEach((_,i)=>{
    if(!state.noteAssigns.find(a=>a.tapIndex===i)){
      const midi=penta[i%penta.length];
      state.noteAssigns.push({tapIndex:i,midi,time:state.taps[i].time});
    }
  });
  state.selTap=-1;renderNoteTimeline();
}

function replayRhythm(){
  if(!state.taps.length)return;
  ensureAudio();
  state.taps.forEach(t=>setTimeout(()=>audio.playTapSound(),t.time*1000));
}

function playMelody(){
  if(!state.noteAssigns.length)return;
  ensureAudio();stopPlay();
  const sorted=[...state.noteAssigns].sort((a,b)=>a.time-b.time);
  sorted.forEach(n=>{
    setTimeout(()=>{
      audio.playNote(midiToName(n.midi),midiToFreq(n.midi),.75,1.4);
      const ke=el.piano.querySelector(`[data-midi="${n.midi}"]`);
      if(ke){ke.classList.add('act');setTimeout(()=>ke.classList.remove('act'),220)}
    },n.time*1000);
  });
}

/* ============================================
   THEMES
   ============================================ */
let themeColor='#8B5CF6';

function openThemeModal(){
  if(!state.taps.length){alert('Tap a rhythm first!');return}
  if(!state.noteAssigns.length){alert('Assign some notes first!');return}
  el.themeInput.value='Theme '+state.nextId;
  themeColor='#8B5CF6';
  el.colorDots.forEach(c=>c.classList.toggle('active',c.dataset.color===themeColor));
  el.themeModal.classList.add('show');
  setTimeout(()=>el.themeInput.focus(),80);
}

function saveTheme(){
  const name=el.themeInput.value.trim()||('Theme '+state.nextId);
  state.themes.push({
    id:state.nextId++,name,color:themeColor,
    taps:[...state.taps],notes:[...state.noteAssigns],
    bpm:state.bpm,timeSig:state.timeSig
  });
  el.themeModal.classList.remove('show');
  persist();renderThemes();clearRhythm();setMode('arrange');
}

function renderThemes(){
  if(!state.themes.length){
    el.themeList.innerHTML='<div class="empty-shelf"><p>No themes yet</p></div>';return;
  }
  el.themeList.innerHTML='';
  state.themes.forEach(th=>{
    const c=document.createElement('div');
    c.className='t-card'+(state.pickedTheme===th.id?' picked':'');
    c.innerHTML=`
      <div class="tc-bar" style="background:${th.color}"></div>
      <div class="tc-name">${esc(th.name)}</div>
      <div class="tc-info">${th.notes.length} notes &bull; ${th.bpm} BPM</div>
      <div class="tc-btns">
        <button class="tc-btn tp" data-id="${th.id}">Play</button>
        <button class="tc-btn te" data-id="${th.id}">Edit</button>
        <button class="tc-btn del td" data-id="${th.id}">Del</button>
      </div>`;
    c.addEventListener('click',e=>{
      if(e.target.closest('.tc-btn'))return;
      state.pickedTheme=state.pickedTheme===th.id?null:th.id;
      renderThemes();
    });
    el.themeList.appendChild(c);
  });
  el.themeList.querySelectorAll('.tp').forEach(b=>b.addEventListener('click',()=>playTheme(+b.dataset.id)));
  el.themeList.querySelectorAll('.te').forEach(b=>b.addEventListener('click',()=>editTheme(+b.dataset.id)));
  el.themeList.querySelectorAll('.td').forEach(b=>b.addEventListener('click',()=>delTheme(+b.dataset.id)));
}

function playTheme(id){
  ensureAudio();
  const th=state.themes.find(t=>t.id===id);if(!th)return;stopPlay();
  const sorted=[...th.notes].sort((a,b)=>a.time-b.time);
  sorted.forEach(n=>setTimeout(()=>audio.playNote(midiToName(n.midi),midiToFreq(n.midi),.75,1.4),n.time*1000));
}

function editTheme(id){
  const th=state.themes.find(t=>t.id===id);if(!th)return;
  state.taps=[...th.taps];state.noteAssigns=[...th.notes];
  state.bpm=th.bpm;state.timeSig=th.timeSig;state.selTap=-1;
  el.tempoDisp.textContent=state.bpm;el.timeSig.value=state.timeSig;
  el.tapCounter.textContent=state.taps.length+' taps';
  el.tapPrompt.classList.add('dim');
  renderBeatLines();renderTapMarkers();
  state.themes=state.themes.filter(t=>t.id!==id);
  state.arrangement=state.arrangement.filter(a=>a.themeId!==id);
  persist();setMode('assign');renderNoteTimeline();
}

function delTheme(id){
  state.themes=state.themes.filter(t=>t.id!==id);
  state.arrangement=state.arrangement.filter(a=>a.themeId!==id);
  if(state.pickedTheme===id)state.pickedTheme=null;
  persist();renderThemes();renderArrangement();
}

/* ============================================
   ARRANGEMENT
   ============================================ */
function addToArr(){
  if(state.pickedTheme==null)return;
  state.arrangement.push({themeId:state.pickedTheme,index:state.arrangement.length});
  persist();renderArrangement();
}

function rmFromArr(i){
  state.arrangement.splice(i,1);
  state.arrangement.forEach((a,j)=>a.index=j);
  persist();renderArrangement();
}

function renderArrangement(){
  el.arrDrop.innerHTML='';
  if(!state.arrangement.length){
    el.arrDrop.innerHTML='<p class="arr-hint">Select a theme above, then tap here to add</p>';return;
  }
  state.arrangement.forEach((item,idx)=>{
    const th=state.themes.find(t=>t.id===item.themeId);if(!th)return;
    const b=document.createElement('div');
    b.className='arr-block';b.style.background=th.color;
    b.innerHTML=`<span class="ab-name">${esc(th.name)}</span><span class="ab-info">${th.notes.length} notes</span><button class="ab-x">&times;</button>`;
    b.querySelector('.ab-x').addEventListener('click',e=>{e.stopPropagation();rmFromArr(idx)});
    el.arrDrop.appendChild(b);
  });
}

function playArrangement(){
  if(!state.arrangement.length)return;
  ensureAudio();stopPlay();state.playing=true;
  let ct=0;const allNotes=[];
  state.arrangement.forEach(item=>{
    const th=state.themes.find(t=>t.id===item.themeId);
    if(!th||!th.notes.length)return;
    const mx=Math.max(...th.taps.map(t=>t.time));
    th.notes.forEach(n=>allNotes.push({time:ct+n.time,midi:n.midi,ai:item.index}));
    ct+=mx+1;
  });
  const dur=ct;
  allNotes.sort((a,b)=>a.time-b.time);
  const blocks=el.arrDrop.querySelectorAll('.arr-block');
  const timers=[];
  allNotes.forEach(n=>{
    timers.push(setTimeout(()=>{
      if(!state.playing)return;
      audio.playNote(midiToName(n.midi),midiToFreq(n.midi),.75,1.4);
      blocks.forEach(b=>b.classList.remove('playing'));
      if(blocks[n.ai])blocks[n.ai].classList.add('playing');
    },n.time*1000));
  });
  timers.push(setTimeout(()=>{
    blocks.forEach(b=>b.classList.remove('playing'));
    state.playing=false;
    if(state.looping)playArrangement();
  },dur*1000));
  state.playTimers=timers;
}

function stopPlay(){
  state.playing=false;
  if(state.playTimers){state.playTimers.forEach(t=>clearTimeout(t));state.playTimers=null}
  el.arrDrop.querySelectorAll('.arr-block').forEach(b=>b.classList.remove('playing'));
}

/* ============================================
   EXPORT
   ============================================ */
function exportMidi(){
  if(!state.arrangement.length){alert('Add themes to the timeline first!');return}
  const evts=[];let ct=0;
  const tpb=480,bpm=state.themes[0]?.bpm||120,uspb=Math.round(6e7/bpm);
  state.arrangement.forEach(item=>{
    const th=state.themes.find(t=>t.id===item.themeId);if(!th)return;
    const mx=Math.max(...th.taps.map(t=>t.time));
    [...th.notes].sort((a,b)=>a.time-b.time).forEach(n=>{
      const at=ct+n.time,tk=Math.round(at*(tpb*bpm/60));
      evts.push({tk,type:'on',midi:n.midi,vel:90});
      evts.push({tk:tk+tpb,type:'off',midi:n.midi,vel:0});
    });
    ct+=mx+1;
  });
  evts.sort((a,b)=>a.tk-b.tk);
  const mb=[];
  mb.push(0x4D,0x54,0x68,0x64,0,0,0,6,0,0,0,1,(tpb>>8)&0xFF,tpb&0xFF);
  const td=[];
  vl(td,0);td.push(0xFF,0x51,0x03,(uspb>>16)&0xFF,(uspb>>8)&0xFF,uspb&0xFF);
  let lt=0;
  evts.forEach(e=>{
    vl(td,e.tk-lt);
    td.push(e.type==='on'?0x90:0x80,e.midi,e.vel);
    lt=e.tk;
  });
  vl(td,0);td.push(0xFF,0x2F,0x00);
  mb.push(0x4D,0x54,0x72,0x6B,(td.length>>24)&0xFF,(td.length>>16)&0xFF,(td.length>>8)&0xFF,td.length&0xFF,...td);
  dl(new Blob([new Uint8Array(mb)],{type:'audio/midi'}),'composition.mid');
}
function vl(a,v){if(v<0)v=0;const b=[];b.push(v&0x7F);v>>=7;while(v>0){b.push((v&0x7F)|0x80);v>>=7}b.reverse();a.push(...b)}

function exportWav(){
  if(!state.arrangement.length){alert('Add themes first!');return}
  let dur=0;
  state.arrangement.forEach(item=>{
    const th=state.themes.find(t=>t.id===item.themeId);if(!th)return;
    dur+=Math.max(...th.taps.map(t=>t.time))+1;
  });
  dur+=2;
  const sr=44100,oc=new OfflineAudioContext(2,sr*dur,sr);
  let ct=0;
  state.arrangement.forEach(item=>{
    const th=state.themes.find(t=>t.id===item.themeId);if(!th)return;
    const mx=Math.max(...th.taps.map(t=>t.time));
    th.notes.forEach(n=>{
      const t=ct+n.time,f=midiToFreq(n.midi);
      // Richer offline synth
      [1,2,3].forEach((r,idx)=>{
        const o=oc.createOscillator();o.type='sine';o.frequency.value=f*r;
        const g=oc.createGain();const amp=[.32,.12,.05][idx];
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amp,t+.008);
        g.gain.exponentialRampToValueAtTime(.001,t+1.8);
        o.connect(g);g.connect(oc.destination);o.start(t);o.stop(t+1.8);
      });
    });
    ct+=mx+1;
  });
  oc.startRendering().then(buf=>{
    const nc=buf.numberOfChannels,bl=nc*2,dl2=buf.length*bl,tl=44+dl2;
    const ab=new ArrayBuffer(tl),v=new DataView(ab);
    ws(v,0,'RIFF');v.setUint32(4,tl-8,true);ws(v,8,'WAVE');ws(v,12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,nc,true);
    v.setUint32(24,sr,true);v.setUint32(28,sr*bl,true);v.setUint16(32,bl,true);
    v.setUint16(34,16,true);ws(v,36,'data');v.setUint32(40,dl2,true);
    const chs=[];for(let i=0;i<nc;i++)chs.push(buf.getChannelData(i));
    let off=44;
    for(let i=0;i<buf.length;i++){
      for(let ch=0;ch<nc;ch++){
        const s=Math.max(-1,Math.min(1,chs[ch][i]));
        v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;
      }
    }
    dl(new Blob([ab],{type:'audio/wav'}),'composition.wav');
  });
}
function ws(v,o,s){for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))}
function dl(blob,fn){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=fn;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u)}

/* ============================================
   PERSISTENCE
   ============================================ */
function persist(){
  try{localStorage.setItem('pianoComposer',JSON.stringify({
    themes:state.themes,arrangement:state.arrangement,
    nextId:state.nextId,bpm:state.bpm,timeSig:state.timeSig
  }))}catch(e){}
}
function loadStorage(){
  try{
    const d=JSON.parse(localStorage.getItem('pianoComposer'));
    if(d){
      state.themes=d.themes||[];state.arrangement=d.arrangement||[];
      state.nextId=d.nextId||1;state.bpm=d.bpm||120;state.timeSig=d.timeSig||4;
      el.tempoDisp.textContent=state.bpm;el.timeSig.value=state.timeSig;
    }
  }catch(e){}
}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

/* ============================================
   EVENT BINDINGS
   ============================================ */
function bind(){
  el.navTabs.forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.mode)));
  el.tapPad.addEventListener('touchstart',handleTap,{passive:false});
  el.tapPad.addEventListener('mousedown',handleTap);
  el.tempoUp.addEventListener('click',()=>{state.bpm=Math.min(300,state.bpm+5);el.tempoDisp.textContent=state.bpm;renderBeatLines();if(state.metronomeOn){stopMet();startMet()}});
  el.tempoDown.addEventListener('click',()=>{state.bpm=Math.max(40,state.bpm-5);el.tempoDisp.textContent=state.bpm;renderBeatLines();if(state.metronomeOn){stopMet();startMet()}});
  el.timeSig.addEventListener('change',()=>{state.timeSig=parseInt(el.timeSig.value);renderBeatLines()});
  el.btnMet.addEventListener('click',toggleMet);
  el.btnClear.addEventListener('click',clearRhythm);
  el.btnPlayR.addEventListener('click',previewRhythm);
  el.btnConfirm.addEventListener('click',()=>{if(!state.taps.length){alert('Tap a rhythm first!');return}setMode('assign')});

  el.piano.addEventListener('touchstart',e=>{e.preventDefault();const k=e.target.closest('.pkey');if(k)hitKey(+k.dataset.midi)},{passive:false});
  el.piano.addEventListener('mousedown',e=>{const k=e.target.closest('.pkey');if(k)hitKey(+k.dataset.midi)});

  el.btnReplayR.addEventListener('click',replayRhythm);
  el.btnPlayM.addEventListener('click',playMelody);
  el.btnAuto.addEventListener('click',autoFill);
  el.btnSave.addEventListener('click',openThemeModal);

  el.colorDots.forEach(d=>d.addEventListener('click',()=>{themeColor=d.dataset.color;el.colorDots.forEach(c=>c.classList.toggle('active',c===d))}));
  el.btnConfirmTheme.addEventListener('click',saveTheme);
  el.closeTheme.addEventListener('click',()=>el.themeModal.classList.remove('show'));
  el.themeInput.addEventListener('keydown',e=>{if(e.key==='Enter')saveTheme()});
  el.themeModal.addEventListener('click',e=>{if(e.target===el.themeModal)el.themeModal.classList.remove('show')});

  el.btnNew.addEventListener('click',()=>{clearRhythm();setMode('tap')});
  el.arrDrop.addEventListener('click',e=>{if(!e.target.closest('.arr-block'))addToArr()});
  el.btnPlayA.addEventListener('click',playArrangement);
  el.btnStopA.addEventListener('click',stopPlay);
  el.btnLoop.addEventListener('click',()=>{state.looping=!state.looping;el.btnLoop.classList.toggle('on',state.looping)});
  el.btnMidi.addEventListener('click',exportMidi);
  el.btnWav.addEventListener('click',exportWav);

  el.btnSettings.addEventListener('click',()=>el.settingsModal.classList.add('show'));
  el.closeSettings.addEventListener('click',()=>el.settingsModal.classList.remove('show'));
  el.settingsModal.addEventListener('click',e=>{if(e.target===el.settingsModal)el.settingsModal.classList.remove('show')});
  el.volSlider.addEventListener('input',()=>audio.setVolume(el.volSlider.value/100));
  el.revSlider.addEventListener('input',()=>audio.setReverb(el.revSlider.value/100));

  document.addEventListener('keydown',e=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
    if(e.code==='Space'){
      e.preventDefault();
      if(state.mode==='tap')handleTap(e);
      else if(state.mode==='arrange'){if(state.playing)stopPlay();else playArrangement()}
    }
  });

  window.addEventListener('resize',()=>renderBeatLines());
}

document.addEventListener('DOMContentLoaded',init);
if(document.readyState!=='loading') init();
})();
