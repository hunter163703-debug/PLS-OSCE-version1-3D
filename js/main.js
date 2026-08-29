// main.js
// 主程式：組合三大模組、UI 事件、語音引擎（Web Speech API）、渲染迴圈
import * as THREE from 'three';
import {createSceneSetup} from './SceneSetup.js?v=20260830c';
import {ModelManager} from './ModelLoader.js?v=20260830c';
import {InteractionLogic} from './InteractionLogic.js?v=20260830c';
import {VoicePlayer} from './VoicePlayer.js?v=20260830c';

console.log('[Main] 版本：20260803i');

const BASE = ''; // 以本機 HTTP 伺服器根目錄為基底

// 圖卡實際檔名（副檔名不一，需精確對應）
const CARD_FILES = {
  '封面':   '測驗題本圖片檔/封面.JPG',
  '圖卡一': '測驗題本圖片檔/圖卡一.png',
  '圖卡二': '測驗題本圖片檔/圖卡二.png',
  '圖卡三': '測驗題本圖片檔/圖卡三.png',
  '圖卡四': '測驗題本圖片檔/圖卡四.JPG',
  '圖卡五': '測驗題本圖片檔/圖卡五.JPG'
};

const canvas = document.getElementById('webgl');
const stage = createSceneSetup(canvas);
const ui = {
  caption: document.getElementById('caption'),
  userText: document.getElementById('userText'),
  micStatus: document.getElementById('micStatus'),
  progress: document.getElementById('progress'),
  setStatusBadge: (s)=> document.getElementById('statusBadge').textContent = s
};

// 手指頭圖示控制（接受 UV 座標，動態定位到圖卡對應物品位置）
const fingerIcon = document.getElementById('fingerIcon');
function showFingerTap(uvx, uvy){
  if(!fingerIcon) return;
  const img = document.getElementById('cardImg');
  if(!img) return;

  const imgRect = img.getBoundingClientRect();
  const overlayRect = document.getElementById('cardOverlay').getBoundingClientRect();

  // 圖片在 overlay 內的相對位置和尺寸
  const imgLeft  = imgRect.left - overlayRect.left;
  const imgTop   = imgRect.top  - overlayRect.top;
  const imgW     = imgRect.width;
  const imgH     = imgRect.height;

  // CARD_ITEMS UV 為完整圖片座標（左下原點），overlay 的 <img> 顯示完整未裁切圖片，
  // 直接映射即可；3D 端的紋理裁切換算由 SceneSetup.showPointMarker 處理
  const x = imgLeft + uvx * imgW;
  const y = imgTop  + (1 - uvy) * imgH;

  fingerIcon.style.left = x + 'px';
  fingerIcon.style.top  = y + 'px';
  fingerIcon.style.bottom = 'auto';
  fingerIcon.classList.add('show');
  setTimeout(()=> fingerIcon.classList.remove('show'), 1500);
}

// 測驗結束提示（等小宇把最後一句口語回應播完，再停頓 2 秒讓考生記錄後才顯示）
const examEndOverlay = document.getElementById('examEndOverlay');
let examEndScheduled = false;
function showExamEnd(){
  if(!examEndOverlay || examEndScheduled) return;
  if(voice.busy){ setTimeout(showExamEnd, 500); return; }
  examEndScheduled = true;
  setTimeout(()=>{ examEndOverlay.style.display = 'flex'; }, 2000);
}
function hideExamEnd(){
  if(examEndOverlay) examEndOverlay.style.display = 'none';
}
document.getElementById('examEndClose')?.addEventListener('click', hideExamEnd);

// 載入 3D 小宇與動畫
const mm = new ModelManager(stage.scene, stage.renderer);
mm.onLog = (msg)=>{ console.log('[Model]', msg); };

// 小宇合成語音：使用專案提供的「小安.MP3」
const voice = new VoicePlayer(BASE + '小安.MP3');
voice.onLog = (msg)=> console.log('[Voice]', msg);

// 播放小宇語音時暫停麥克風，避免喇叭輸出被麥克風收音造成回音 Loop
// 小宇說完後由 Speech.resumeAuto() 保證恢復（只要考生沒手動關閉）
voice.onSpeakStart = ()=>{ Speech.pauseAuto(); };
voice.onSpeakEnd   = ()=>{ Speech.resumeAuto(); };

// 互動邏輯（先建立，稍後注入語音與 UI 回呼）
let logic = new InteractionLogic({models:mm, stage, ui, speech:null, voice});
logic.onPointStart = showFingerTap;
logic.onExamEnd = showExamEnd;
logic.setCaption('載入中…請稍候', 0);

// ---------- 語音引擎（繁中） ----------
// 設計原則：
//   1. 麥克風開關由考生手動控制（desiredOn 記住考生意圖）
//   2. 小宇說話時系統僅「暫停」收音（paused），不改變考生意圖
//   3. 小宇說完後，只要考生沒手動關閉，保證自動恢復收音
const Speech = (()=>{
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;
  let rec=null, onResultCb=null;
  let desiredOn=false;   // 考生希望麥克風保持開啟
  let paused=false;      // 小宇說話中的暫停狀態
  let active=false;      // 辨識引擎實際運行中
  function ensure(){
    if(!supported) return null;
    rec = new SR();
    rec.lang = 'zh-TW';
    rec.continuous = true;       // 連續辨識
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let lastFinal='';
    rec.onresult = (e)=>{
      let interimText='';
      let finalText='';
      // 只取本次事件中新產生的 final results，避免累積舊文本
      for(let i=e.resultIndex;i<e.results.length;i++){
        const r=e.results[i];
        if(r.isFinal){ finalText += r[0].transcript; }
        else { interimText += r[0].transcript; }
      }
      // 即時顯示考生語音（ interim + 最近的 final ）
      const display = (finalText + interimText).trim();
      if(display){
        const el = document.getElementById('userText');
        if(el) el.textContent = display;
      }
      const trimmed = finalText.trim();
      // 避免重複觸發：同一句 final text 只傳一次
      if(trimmed && trimmed !== lastFinal && onResultCb){
        lastFinal = trimmed;
        onResultCb(trimmed);
      }
    };
    rec.onerror = (e)=>{
      const err = (e && e.error) || '';
      console.log('[Speech] 辨識錯誤事件：', err);
      // 只有嚴重錯誤（權限/裝置）才真正關閉麥克風
      if(err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture'){
        ui.micStatus.textContent='麥克風錯誤：'+err;
        desiredOn=false; active=false; setBtn(false);
      }
      // 其餘（no-speech 靜音逾時、aborted 等）皆視為暫時性，交由 onend 自動重啟
    };
    // 引擎自然結束時：只要考生沒關、也不是小宇說話暫停中，就立刻自動重啟
    // （加 150ms 延遲提高重啟成功率，避免部分 Chrome 版本同步 start 拋錯）
    rec.onend   = ()=>{
      active=false;
      if(desiredOn && !paused){
        setTimeout(()=>{
          if(desiredOn && !paused && !active){ try{ rec.start(); active=true; }catch(_){ } }
        }, 150);
      }
    };
    return rec;
  }
  function setBtn(on){
    const b=document.getElementById('micBtn');
    b.classList.toggle('recording', on);
    b.textContent = on?'停止麥克風':'啟動麥克風';
    ui.micStatus.textContent = on?'麥克風：聆聽中…（zh-TW）':'麥克風：已停止';
  }
  function tryStart(){
    if(!rec) ensure();
    if(!rec || active) return;
    try{ rec.start(); active=true; }catch(_){ }
  }
  return {
    supported,
    // 對外呈现的是「考生意圖」：只要考生沒手動關閉就視為開啟中
    get listening(){ return desiredOn; },
    onResult(cb){ onResultCb=cb; },
    start(){
      if(!supported){ ui.micStatus.textContent='此瀏覽器不支援 Web Speech API'; return; }
      desiredOn=true; setBtn(true);
      if(!paused) tryStart();
    },
    stop(){
      desiredOn=false; paused=false; setBtn(false);
      if(rec && active){ try{ rec.stop(); }catch(_){ } }
    },
    // 小宇說話：暫停收音（保留考生意圖與按鈕狀態）
    pauseAuto(){
      if(!desiredOn || paused) return;
      paused=true;
      if(rec && active){ try{ rec.stop(); }catch(_){ } }
      ui.micStatus.textContent='麥克風：小宇說話中（暫停收音）';
      console.log('[Speech] 小宇說話 → 暫停收音');
    },
    // 小宇說完：只要考生沒手動關閉，保證恢復收音
    resumeAuto(){
      if(!paused) return;
      paused=false;
      if(desiredOn){
        tryStart();
        setBtn(true);
        console.log('[Speech] 小宇說完 → 自動恢復收音');
      }
    }
  };
})();

logic.speech = Speech;
// 語音結果回呼：直接傳給 InteractionLogic，內部已有 _busy 鎖防止重入
// 考生第一次口語輸入時啟動測驗計時器
Speech.onResult((text)=>{ examTimer.start(); logic.handleUtterance(text); });

// ---------- 測驗計時器（10 分鐘） ----------
const examTimer = (()=>{
  const TOTAL_SEC = 10*60;   // 總時數 10 分鐘
  const WARN_SEC  = 8*60;    // 8 分鐘提醒
  let startTs = null, tickInt = null;
  const el     = ()=> document.getElementById('examTimer');
  const warnEl = ()=> document.getElementById('timerWarn');
  const endEl  = ()=> document.getElementById('timerEnd');
  function fmt(s){ return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }
  function tick(){
    const elapsed = Math.floor((Date.now()-startTs)/1000);
    if(el()) el().textContent = fmt(Math.min(elapsed, TOTAL_SEC)) + ' / 10:00';
    if(elapsed >= WARN_SEC && warnEl()) warnEl().style.display = 'inline';
    if(elapsed >= TOTAL_SEC){
      if(endEl()) endEl().style.display = 'inline';
      if(tickInt){ clearInterval(tickInt); tickInt = null; }
      console.log('[Timer] 施測時間已到');
    }
  }
  return {
    start(){
      if(startTs) return;   // 只啟動一次
      startTs = Date.now();
      tickInt = setInterval(tick, 1000);
      tick();
      console.log('[Timer] 考生第一次口語輸入，開始計時');
    },
    reset(){
      startTs = null;
      if(tickInt){ clearInterval(tickInt); tickInt = null; }
      if(el()) el().textContent = '00:00 / 10:00';
      if(warnEl()) warnEl().style.display = 'none';
      if(endEl()) endEl().style.display = 'none';
    }
  };
})();

// ---------- UI 事件 ----------
document.getElementById('micBtn').addEventListener('click', ()=>{
  Speech.listening ? Speech.stop() : Speech.start();
});

document.getElementById('resetBtn').addEventListener('click', async ()=>{
  logic.reset();
  examTimer.reset();
  examEndScheduled = false;
  if(examEndOverlay) examEndOverlay.style.display = 'none';
  ui.setStatusBadge('標準病人：3D 小宇　狀態：坐姿待命');
  logic.setUser('—');
  logic.setCaption('腳本狀態已重置', 2500);
  logic.updateProgressUI();
  // 圖卡回到封面
  await logic.setCard('封面', BASE + CARD_FILES['封面']);
  if(cardImg) cardImg.src = CARD_FILES['封面'];
  // 回坐姿
  if(mm.actions && mm.actions.get('sit')) mm.play('sit',{once:false, loop:true});
});

// 圖卡按鈕：切換圖卡並顯示（HTML overlay + 3D 狀態同步）
document.querySelectorAll('.btn.card').forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const key = btn.dataset.card;
    const url = BASE + CARD_FILES[key];
    await logic.setCard(key, url);
    if(cardImg) cardImg.src = CARD_FILES[key];
    logic.setCaption(`已切換到 ${key}`, 2500);
    // 顯示圖卡時小宇維持坐姿（不主動動作）
    mm.play('sit',{once:false, loop:true});
  });
});

// 初始顯示封面（HTML overlay + 3D 圖卡平面）；考生於第2題自行切換圖卡一、分測驗四自行切換圖卡四
const cardImg = document.getElementById('cardImg');
if(cardImg) cardImg.src = CARD_FILES['封面'];
logic.setCard('封面', BASE + CARD_FILES['封面']);

// ---------- 載入模型 ----------
(async ()=>{
  try{
    await mm.loadAll(BASE);
    // 模型載入後，依據 bounding box 自動調整相機，確保人物在畫面中央
    if(mm.model){
      const box = new THREE.Box3().setFromObject(mm.model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      console.log('[Main] 模型尺寸', size.toArray(), '中心', center.toArray());
      // 半身構圖：胸口以上清晰入鏡（臨床考試需看臉部表情與上半身動作）
      // canvas 現只占 stage 上 60%，相機從斜上方俯視，聚焦上半身
      const targetLookY = center.y + size.y * 0.15; // 對準胸口上方，讓臉部位於畫面上半
      const cameraY     = center.y + size.y * 0.50; // 相機在頭頂上方，形成適度俯角
      // 依 FOV 計算所需距離：讓畫面高度覆蓋 55% 身高（上半身）
      const fovRad = stage.camera.fov * (Math.PI / 180);
      const targetHeight = size.y * 0.55;
      const distance = (targetHeight / 2) / Math.tan(fovRad / 2);
      stage.camera.position.set(center.x, cameraY, center.z + distance * 1.15);
      stage.camera.lookAt(center.x, targetLookY, center.z);
      console.log('[Main] 模型高度', size.y.toFixed(2), '相機位置', stage.camera.position.toArray(), '視線', targetLookY.toFixed(2), '距離', distance.toFixed(2));
      // 讓小宇持續注視考生（攝影機方向）
      mm.setGazeTarget(stage.camera.position);
    }
    ui.setStatusBadge('標準病人：3D 小宇　狀態：坐姿待命');
    logic.setCaption('3D 小宇已就位（坐姿）。請啟動麥克風開始測驗。', 3500);
  }catch(err){
    console.error(err);
    logic.setCaption('模型載入失敗：'+(err?.message||err), 0);
  }
})();

// ---------- 渲染迴圈 ----------
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  mm.update(dt);
  stage.renderer.render(stage.scene, stage.camera);

}
animate();