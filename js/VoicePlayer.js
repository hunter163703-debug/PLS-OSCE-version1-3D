// VoicePlayer.js
// 模組四：小安語音輸出
// 優先：播放專案提供的「小安腳本語音」MP3（真實錄音）
// 次要：Web Speech API SpeechSynthesis（zh-TW 內建語音）
// 備援：若皆無，退回播放「小安.MP3」音檔

const SCRIPT_VOICES = {
  '媽媽': '小安腳本語音(口語回應使用)/媽媽.mp3',
  '看大象': '小安腳本語音(口語回應使用)/看大象.mp3',
  '坐車車': '小安腳本語音(口語回應使用)/坐車車.mp3',
  '爸爸': '小安腳本語音(口語回應使用)/爸爸.mp3',
  '揹書包': '小安腳本語音(口語回應使用)/揹書包.mp3',
  '妹妹揹': '小安腳本語音(口語回應使用)/妹妹揹.mp3',
  '早上的時候': '小安腳本語音(口語回應使用)/早上的時候.mp3',
  '在家裡': '小安腳本語音(口語回應使用)/在家裡.mp3',
  '鞋子': '小安腳本語音(口語回應使用)/鞋子.mp3',
  '沒有': '小安腳本語音(口語回應使用)/沒有.mp3',
  '起床了妹妹穿衣服刷牙揹書包': '小安腳本語音(口語回應使用)/起床了妹妹穿衣服刷牙揹書包.mp3',
  '看大象2': '小安腳本語音(口語回應使用)/看大象2.mp3'
};

export class VoicePlayer{
  constructor(fallbackSrc){
    this.fallbackSrc = fallbackSrc;
    this.fallbackAudio = fallbackSrc ? new Audio(fallbackSrc) : null;
    if(this.fallbackAudio){ this.fallbackAudio.preload=true; this.fallbackAudio.volume=1.0; }

    this.synth = ('speechSynthesis' in window) ? window.speechSynthesis : null;
    this.voice = null;
    this.rate = 1.02;
    this.pitch = 1.06;
    this.volume = 1.0;
    this.enabled = true;
    this.onLog = ()=>{};
    this.onSpeakStart = ()=>{};  // 語音開始播放時回呼（用於暫停麥克風，避免喇叭回音被收音）
    this.onSpeakEnd = ()=>{};    // 語音播放結束時回呼（用於恢復麥克風）
    this._queue = [];
    this._playing = false;
    this._current = null;
    this._scriptAudioCache = {};
    this._seenElephant = 0;
    this._pickVoice();
    if(this.synth){
      this.synth.onvoiceschanged = ()=> this._pickVoice();
    }
    this._preloadScriptVoices();
  }

  _pickVoice(){
    if(!this.synth) return;
    const all = this.synth.getVoices() || [];
    this.voice =
      all.find(v=>/zh(-|_)?TW/i.test(v.lang)) ||
      all.find(v=>/^zh/i.test(v.lang)) ||
      all.find(v=>/Chinese/i.test(v.name)) ||
      all[0] ||
      null;
    this.onLog(this.voice ? `已選 TTS 語音：${this.voice.name} (${this.voice.lang})`
                          : `未找到語音，使用瀏覽器預設`);
  }

  setVoiceOptions({rate,pitch,volume}={}){
    if(rate!=null)   this.rate = rate;
    if(pitch!=null)  this.pitch = pitch;
    if(volume!=null) this.volume = volume;
  }

  // 是否仍有語音在播放或排隊中（供結束提示等待使用）
  get busy(){ return this._playing || this._queue.length > 0; }

  enabled_t(b){ this.enabled = !!b; }

  _preloadScriptVoices(){
    Object.entries(SCRIPT_VOICES).forEach(([key, src]) => {
      const a = new Audio(src);
      a.preload = 'auto';
      a.oncanplaythrough = ()=> this.onLog(`[Voice] 預載完成：${src}`);
      a.onerror = ()=> this.onLog(`[Voice] ⚠ 預載失敗：${src}`);
      this._scriptAudioCache[src] = a;
    });
  }

  _matchScriptVoice(text){
    if(!text) return null;
    const clean = text.replace(/[。，！？、；：「」『』\"'\(\)\s]/g,'');
    this.onLog(`[Voice] 匹配嘗試：「${text}」→ 正規化「${clean}」`);
    if(clean === '看大象'){
      this._seenElephant++;
      if(this._seenElephant >= 2){
        this.onLog('[Voice] 看大象第二次，切換為看大象2');
        return SCRIPT_VOICES['看大象2'];
      }
    }
    const result = SCRIPT_VOICES[clean] || null;
    if(result) this.onLog(`[Voice] ✓ 匹配成功：${clean} → ${result}`);
    else this.onLog(`[Voice] ✗ 無匹配：${clean}，將使用 TTS`);
    return result;
  }

  speak(text){
    if(!this.enabled){ this.onLog('語音已停用'); return; }
    if(!text){ return; }

    this._queue.push(text);
    this.onLog('↻ 加入佇列：'+text);
    this._playNext();
  }

  _playNext(){
    if(this._playing || this._queue.length===0) return;
    const text = this._queue.shift();
    this._playing = true;

    const scriptSrc = this._matchScriptVoice(text);
    if(scriptSrc){
      this._playScriptMp3(scriptSrc, text);
      return;
    }

    this._playTTS(text);
  }

  _playScriptMp3(src, text){
    const audio = this._scriptAudioCache[src];
    if(!audio){
      this.onLog('[Voice] 腳本語音未預載：'+src+'，改以 TTS');
      this._playTTS(text);
      return;
    }
    audio.currentTime = 0;
    this.onLog('▶ 播放腳本語音：'+text+' ('+src+')');
    this.onSpeakStart();
    const onEnd = ()=>{
      this._playing = false;
      this.onSpeakEnd();
      this._playNext();
    };
    audio.onended = onEnd;
    audio.onerror = (e)=>{
      this.onLog('[Voice] 腳本語音播放失敗：'+text+'，改以 TTS');
      this.onSpeakEnd();
      this._playTTS(text);
    };
    try{
      const p = audio.play();
      if(p && p.then) p.catch((err)=>{
        this.onLog('[Voice] play() 被拒：'+err.message+'，改以 TTS');
        this.onSpeakEnd();
        this._playTTS(text);
      });
    }catch(e){
      this.onLog('[Voice] play() 例外：'+e.message+'，改以 TTS');
      this.onSpeakEnd();
      this._playTTS(text);
    }
  }

  _playTTS(text){
    if(!this.synth){
      this.onLog('無 SpeechSynthesis，退回播放 小安.MP3');
      this._playFallback();
      return;
    }
    if(!this.voice) this._pickVoice();
    if(!this.voice){
      this.onLog('未找到 TTS 語音，改用 MP3 備援');
      this._playFallback();
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    if(this.voice) u.voice = this.voice;
    u.rate   = this.rate;
    u.pitch  = this.pitch;
    u.volume = this.volume;
    u.onstart = ()=>{
      this.onLog('▶ TTS 開始播放：'+text);
      this.onSpeakStart();
    };
    u.onend   = ()=>{
      this.onLog('✓ 語音播出完成：'+text.slice(0,18)+'…');
      this._playing = false;
      this.onSpeakEnd();
      this._playNext();
    };
    u.onerror = (e)=> {
      this.onLog('語音錯誤：'+e.error+'，嘗試 MP3');
      this._playing = false;
      this.onSpeakEnd();
      this._playFallback();
    };

    try{
      if(this.synth.paused) this.synth.resume();
      this.synth.speak(u);
      this._current = u;
      this.onLog('▶ 朗讀：'+text);
    }catch(e){
      this.onLog('speak 例外：'+e.message+'，退回 MP3');
      this._playing = false;
      this.onSpeakEnd();
      this._playFallback();
    }
  }

  stop(){
    if(this.synth){ try{ this.synth.cancel(); }catch(_){} }
    if(this.fallbackAudio){ try{ this.fallbackAudio.pause(); this.fallbackAudio.currentTime=0; }catch(_){} }
    Object.values(this._scriptAudioCache).forEach(a=>{
      try{ a.pause(); a.currentTime=0; }catch(_){}
    });
  }

  _playFallback(){
    if(!this.fallbackAudio){ this._playing = false; this._playNext(); return; }
    try{
      this.fallbackAudio.currentTime = 0;
      const p=this.fallbackAudio.play();
      if(p && p.then){
        p.then(()=>{
          this.fallbackAudio.onended = ()=>{ this._playing = false; this._playNext(); };
        }).catch(err=>{
          this.onLog('MP3 播放失敗：'+err.message);
          this._playing = false; this._playNext();
        });
      }else{
        this.fallbackAudio.onended = ()=>{ this._playing = false; this._playNext(); };
      }
    }catch(e){ this.onLog('MP3 例外：'+e.message); this._playing = false; this._playNext(); }
  }
}
