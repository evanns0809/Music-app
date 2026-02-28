/* ============================================
   Audio Engine with Real Piano Soundfont
   Uses Tone.js Sampler + Salamander Grand Piano
   ============================================ */

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const BLACK_KEYS = new Set([1,3,6,8,10]);

function midiToFreq(m){return 440*Math.pow(2,(m-69)/12)}
function midiToName(m){return NOTE_NAMES[m%12]+(Math.floor(m/12)-1)}
function isBlackKey(m){return BLACK_KEYS.has(m%12)}
function noteDisplayName(m){
  const flat=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  return flat[m%12]+(Math.floor(m/12)-1);
}

class PianoAudioEngine {
  constructor(){
    this.ctx=null;
    this.masterGain=null;
    this.reverbNode=null;
    this.reverbGain=null;
    this.dryGain=null;
    this.compressor=null;
    this.initialized=false;
    this.samplesLoaded=false;
    this.sampleBuffers={};
    this.reverbAmount=0.35;
    this.masterVolume=0.8;
    this.activeNotes=new Map();
    this._onProgress=null;
  }

  async init(onProgress){
    if(this.initialized) return;
    this._onProgress=onProgress||null;
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();

    this.compressor=this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value=-18;
    this.compressor.knee.value=18;
    this.compressor.ratio.value=4;
    this.compressor.attack.value=0.003;
    this.compressor.release.value=0.15;

    this.masterGain=this.ctx.createGain();
    this.masterGain.gain.value=this.masterVolume;

    this.dryGain=this.ctx.createGain();
    this.dryGain.gain.value=1-this.reverbAmount;
    this.reverbGain=this.ctx.createGain();
    this.reverbGain.gain.value=this.reverbAmount;

    this.reverbNode=this.ctx.createConvolver();
    this.reverbNode.buffer=this._makeReverb(2.8,3.2);

    this.compressor.connect(this.dryGain);
    this.compressor.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.dryGain.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.initialized=true;
    await this._loadSamples();
  }

  /* ---- Reverb impulse ---- */
  _makeReverb(dur,decay){
    const r=this.ctx.sampleRate,len=r*dur;
    const buf=this.ctx.createBuffer(2,len,r);
    for(let ch=0;ch<2;ch++){
      const d=buf.getChannelData(ch);
      for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);
    }
    return buf;
  }

  /* ---- Load Salamander Grand Piano samples ---- */
  async _loadSamples(){
    // We load one sample per ~3 semitones across the full range.
    // The Salamander Grand Piano is CC-BY, hosted by multiple CDNs.
    const baseUrl='https://tonejs.github.io/audio/salamander/';
    const sampleMap={
      'A0':'A0.mp3','C1':'C1.mp3','Ds1':'Ds1.mp3','Fs1':'Fs1.mp3',
      'A1':'A1.mp3','C2':'C2.mp3','Ds2':'Ds2.mp3','Fs2':'Fs2.mp3',
      'A2':'A2.mp3','C3':'C3.mp3','Ds3':'Ds3.mp3','Fs3':'Fs3.mp3',
      'A3':'A3.mp3','C4':'C4.mp3','Ds4':'Ds4.mp3','Fs4':'Fs4.mp3',
      'A4':'A4.mp3','C5':'C5.mp3','Ds5':'Ds5.mp3','Fs5':'Fs5.mp3',
      'A5':'A5.mp3','C6':'C6.mp3','Ds6':'Ds6.mp3','Fs6':'Fs6.mp3',
      'A6':'A6.mp3','C7':'C7.mp3','Ds7':'Ds7.mp3','Fs7':'Fs7.mp3',
      'A7':'A7.mp3','C8':'C8.mp3'
    };

    const keys=Object.keys(sampleMap);
    let loaded=0;
    const total=keys.length;

    const fetchOne=async(noteName,file)=>{
      try{
        const resp=await fetch(baseUrl+file);
        const ab=await resp.arrayBuffer();
        const audioBuf=await this.ctx.decodeAudioData(ab);
        // Convert note name to MIDI for lookup
        const midi=this._nameToMidi(noteName);
        this.sampleBuffers[midi]=audioBuf;
      }catch(e){
        // Silently skip failed samples
      }
      loaded++;
      if(this._onProgress) this._onProgress(loaded/total);
    };

    // Load in parallel batches of 6 to not overwhelm the browser
    const entries=keys.map(k=>[k,sampleMap[k]]);
    for(let i=0;i<entries.length;i+=6){
      const batch=entries.slice(i,i+6);
      await Promise.all(batch.map(([n,f])=>fetchOne(n,f)));
    }

    this.samplesLoaded=true;
  }

  /* Convert note name like "Ds4" to MIDI number */
  _nameToMidi(name){
    const map={'C':0,'Cs':1,'D':2,'Ds':3,'E':4,'F':5,'Fs':6,'G':7,'Gs':8,'A':9,'As':10,'B':11};
    const match=name.match(/^([A-G]s?)(\d)$/);
    if(!match) return 60;
    return (parseInt(match[2])+1)*12+map[match[1]];
  }

  /* Find closest loaded sample to a given MIDI note */
  _closestSample(midi){
    const loaded=Object.keys(this.sampleBuffers).map(Number);
    if(loaded.length===0) return null;
    let best=loaded[0];
    for(const m of loaded){
      if(Math.abs(m-midi)<Math.abs(best-midi)) best=m;
    }
    return{midi:best,buffer:this.sampleBuffers[best],detune:(midi-best)*100};
  }

  /* ---- Play note ---- */
  playNote(noteId,frequency,velocity=0.7,duration=0){
    if(!this.initialized) return;
    const midi=this._noteIdToMidi(noteId);
    const now=this.ctx.currentTime;

    if(this.samplesLoaded){
      return this._playSample(midi,velocity,duration,now);
    }
    // Fallback: synth if samples not loaded yet
    return this._playSynth(frequency,velocity,duration,now,noteId);
  }

  _noteIdToMidi(noteId){
    const map={'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
    const m=noteId.match(/^([A-G]#?)(-?\d)$/);
    if(!m) return 60;
    return(parseInt(m[2])+1)*12+map[m[1]];
  }

  _playSample(midi,velocity,duration,now){
    const s=this._closestSample(midi);
    if(!s) return;

    const src=this.ctx.createBufferSource();
    src.buffer=s.buffer;
    src.detune.value=s.detune;
    // Slight random detune for natural feel
    src.detune.value+=((Math.random()-0.5)*4);

    const gain=this.ctx.createGain();
    gain.gain.value=velocity*0.85;

    src.connect(gain);
    gain.connect(this.compressor);
    src.start(now);

    if(duration>0){
      gain.gain.setTargetAtTime(0,now+duration,0.18);
      src.stop(now+duration+2);
    }

    const data={src,gain,startTime:now};
    if(duration===0){
      const id='s'+midi+'-'+now;
      this.activeNotes.set(id,data);
      return id;
    }
    return data;
  }

  _playSynth(freq,velocity,duration,now,noteId){
    const noteGain=this.ctx.createGain();
    noteGain.gain.value=0;
    noteGain.connect(this.compressor);
    const harmonics=[
      {r:1,a:1,d:2.5},{r:2,a:.4,d:2},{r:3,a:.2,d:1.5},{r:4,a:.1,d:1},{r:5,a:.05,d:.8}
    ];
    const oscs=[];
    const oct=parseInt(noteId.slice(-1))||4;
    const dm=Math.max(.3,1-(oct-3)*.12);
    harmonics.forEach(h=>{
      const f=freq*h.r;if(f>15000)return;
      const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=f;
      if(h.r>1)o.detune.value=(Math.random()-.5)*3;
      const pg=this.ctx.createGain();pg.gain.value=h.a*velocity;
      const dt=h.d*dm;
      pg.gain.setTargetAtTime(h.a*velocity*.6,now+.01,dt*.3);
      pg.gain.setTargetAtTime(0,now+dt*.5,dt*.6);
      o.connect(pg);pg.connect(noteGain);o.start(now);
      if(duration>0)o.stop(now+duration+.5);
      oscs.push({osc:o,gain:pg});
    });
    noteGain.gain.setTargetAtTime(velocity*.35,now,.004);
    if(duration>0){
      noteGain.gain.setTargetAtTime(0,now+duration,.15);
      setTimeout(()=>{oscs.forEach(o=>{try{o.osc.stop()}catch(e){}});try{noteGain.disconnect()}catch(e){}},
        (duration+1)*1000);
    }
  }

  noteOff(id){
    const d=this.activeNotes.get(id);
    if(!d)return;
    const now=this.ctx.currentTime;
    d.gain.gain.setTargetAtTime(0,now,.18);
    setTimeout(()=>{try{d.src.stop()}catch(e){}try{d.gain.disconnect()}catch(e){}},1200);
    this.activeNotes.delete(id);
  }

  setVolume(v){
    this.masterVolume=v;
    if(this.masterGain)this.masterGain.gain.setTargetAtTime(v,this.ctx.currentTime,.05);
  }

  setReverb(v){
    this.reverbAmount=v;
    if(this.dryGain){
      this.dryGain.gain.setTargetAtTime(1-v,this.ctx.currentTime,.05);
      this.reverbGain.gain.setTargetAtTime(v,this.ctx.currentTime,.05);
    }
  }

  playMetronomeClick(accent){
    if(!this.initialized)return;
    const now=this.ctx.currentTime;
    const o=this.ctx.createOscillator();o.type='sine';
    o.frequency.value=accent?1200:800;
    const g=this.ctx.createGain();g.gain.value=accent?.22:.13;
    g.gain.setTargetAtTime(0,now+.02,.015);
    o.connect(g);g.connect(this.masterGain);o.start(now);o.stop(now+.08);
  }

  playTapSound(){
    if(!this.initialized)return;
    const now=this.ctx.currentTime;
    const o=this.ctx.createOscillator();o.type='triangle';
    o.frequency.value=700;o.frequency.setTargetAtTime(500,now,.02);
    const g=this.ctx.createGain();g.gain.value=.1;
    g.gain.setTargetAtTime(0,now+.01,.025);
    o.connect(g);g.connect(this.masterGain);o.start(now);o.stop(now+.1);
  }

  async resume(){
    if(this.ctx&&this.ctx.state==='suspended') await this.ctx.resume();
  }
}
