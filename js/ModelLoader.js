// ModelLoader.js
// 模組二：載入 3D 小宇（FBX）與所有 FBX 動畫，建立 AnimationMixer 並提供平滑 Crossfade
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';

// 動畫 key -> 檔案對應表
export const ANIM_FILES = {
  model:   '小宇人物模型/rig.fbx',
  sit:     '模擬病人：3D 模擬人物小安/坐著.fbx',
  clap:    '模擬病人：3D 模擬人物小安/拍拍手.fbx',
  nod:     '模擬病人：3D 模擬人物小安/點點頭.fbx',
  yes:     '模擬病人：3D 模擬人物小安/是.fbx',
  handshake:'模擬病人：3D 模擬人物小安/握手.fbx',
  touchHead:'模擬病人：3D 模擬人物小安/摸頭.fbx',
  point:   '模擬病人：3D 模擬人物小安/指.fbx',
  speak:   '模擬病人：3D 模擬人物小安/說話.fbx',
  distract:'模擬病人：3D 模擬人物小安/分心-站.fbx',
  greet:   '模擬病人：3D 模擬人物小安/打招呼.fbx',
  shakeHead:'模擬病人：3D 模擬人物小安/搖頭.fbx'
};

export class ModelManager{
  constructor(scene, renderer){
    this.scene = scene;
    this.loader = new FBXLoader();
    if(renderer) this.loader.setCrossOrigin('anonymous');
    this.mixer = null;
    this.model = null;
    this.clips = new Map();
    this.actions = new Map();
    this.currentKey = null;
    this.onLog = ()=>{};
    this._queue = [];
    this._busy = false;
  }

  log(msg){ this.onLog(msg); }

  loadFBX(url){
    const enc = encodeURI(url);
    this.log(`載入 ${enc.split('/').pop()}`);
    return new Promise((resolve, reject)=>{
      this.loader.load(enc, resolve, (e)=>{
        if(e.lengthComputable) this.log(`載入中 ${Math.round(e.loaded/e.total*100)}%｜${enc.split('/').pop()}`);
      }, (err)=>{ this.log(`✗ 載入失敗 ${enc.split('/').pop()}：${err?.message||err}`); reject(err); });
    });
  }

  async loadAll(baseUrl=''){
    const baseObj = await this.loadFBX(baseUrl + ANIM_FILES.model);
    baseObj.traverse(o=>{
      if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true;
        if(o.material){
          (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
            m.side = THREE.FrontSide;
            if('metalness' in m) m.metalness = Math.min(m.metalness, 0.2);
          });
        }
      }
    });
    const box = new THREE.Box3().setFromObject(baseObj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    this.log(`模型尺寸 W${size.x.toFixed(2)} H${size.y.toFixed(2)} D${size.z.toFixed(2)}｜中心 ${center.x.toFixed(2)},${center.y.toFixed(2)},${center.z.toFixed(2)}`);
    if(size.x===0 && size.y===0 && size.z===0){
      this.log('⚠ 模型 bounding box 為零，可能是空節點');
    }
    const targetH = 1.55;
    const scale = targetH / Math.max(0.001, size.y);
    baseObj.scale.setScalar(scale);
    const box2 = new THREE.Box3().setFromObject(baseObj);
    const c2 = box2.getCenter(new THREE.Vector3());
    const floorY = box2.min.y;
    baseObj.position.x += -c2.x;
    baseObj.position.y += -floorY + 0.15;
    baseObj.position.z += -c2.z + (-0.55);
    baseObj.rotation.y = 0;
    let meshCount=0;
    baseObj.traverse(o=>{
      if(o.isMesh){ meshCount++;
        const mats = Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=>{
          if(m && m.color && m.color.r===0 && m.color.g===0 && m.color.b===0){ m.color.setHex(0x888888); }
        });
      }
    });
    this.log(`模型含 ${meshCount} 個 mesh`);
    this.model = baseObj;
    this.scene.add(baseObj);

    this.mixer = new THREE.AnimationMixer(baseObj);

    // 第一階段：載入所有 clip（先不建立 action —— AnimationAction 建構子會立即從
    // clip.tracks 生成 interpolants，若先建 action 再改軌道，播放時仍用舊資料）
    for(const key in ANIM_FILES){
      if(key === 'model') continue;
      const url = baseUrl + ANIM_FILES[key];
      try{
        const obj = await this.loadFBX(url);
        const clip = obj.animations[0];
        if(!clip){ this.log(`⚠ ${key} 無動畫片段`); continue; }
        clip.name = key;
        this.clips.set(key, clip);
        this.log(`✓ 載入動畫：${key}`);
      }catch(err){
        this.log(`✗ 載入失敗：${key}｜${err?.message||err}`);
      }
    }

    // 第二階段：坐姿鎖定（必須在建立 action 之前改寫軌道）
    this._applySittingBase();

    // 第三階段：以修正後的軌道建立 AnimationAction
    for(const key in ANIM_FILES){
      const clip = this.clips.get(key);
      if(!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.clampWhenFinished = true;
      if(key === 'sit'){
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        this.currentKey = key;
      }else{
        action.setLoop(THREE.LoopOnce, 1);
        action.stop();
      }
      this.actions.set(key, action);
      this.log(`✓ 註冊動畫：${key}`);
    }

    this.mixer.addEventListener('finished', (e)=>{
      const finishedAction = e.action;
      const key = this._actionKey(finishedAction);
      if(key && key !== 'sit'){
        this.log(`動作完成：${key}，回到坐姿`);
        this._crossfadeTo('sit', 0.45, true);
        this.currentKey = 'sit';
        this._executeQueueNext();
      }
    });

    return this;
  }

  // 取樣「坐著」clip 的坐姿基準（Hips 位置 + 腿部旋轉），並把所有其他動作的
  // Hips position 軌道與腿部 quaternion 軌道替換為坐姿常數，避免 Mixamo 動作把角色拉站起來
  _applySittingBase(){
    const sitClip = this.clips.get('sit');
    if(!sitClip || !this.model){ return; }

    const LEG_BONES = ['LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot',
                       'LeftToeBase','RightToeBase','LeftToe_End','RightToe_End','LFootTongue','RFootTongue'];
    const getBone = (n)=> this.model.getObjectByName('mixamorig' + n);

    // 1) 取樣坐姿基準：掃多個時間點取 Hips 最低（坐最深）者
    const sitAction = this.mixer.clipAction(sitClip);
    sitAction.setLoop(THREE.LoopRepeat, Infinity);
    sitAction.play();
    let best = null;
    for(const frac of [0.5, 0.65, 0.8, 0.9, 0.97]){
      this.mixer.setTime(sitClip.duration * frac);
      const hips = getBone('Hips');
      if(!hips) break;
      const y = hips.position.y;
      if(!best || y < best.y){
        const legs = {};
        for(const n of LEG_BONES){
          const b = getBone(n);
          if(b) legs[n] = b.quaternion.toArray();
        }
        best = { y, hipsPos: hips.position.toArray(), legs };
      }
    }
    this.mixer.setTime(0);
    if(!best){ this.log('⚠ 坐姿取樣失敗，跳過坐姿鎖定'); return; }
    this.log(`✓ 坐姿基準取樣完成（Hips Y=${best.y.toFixed(2)}）`);

    // 2) 改寫所有非 sit clip 的軌道
    let fixed = 0;
    for(const [key, clip] of this.clips){
      if(key === 'sit') continue;
      const newTracks = [];
      let changed = false;
      for(const t of clip.tracks){
        const dot = t.name.lastIndexOf('.');
        const bone = t.name.slice(0, dot);
        const prop = t.name.slice(dot + 1);
        if(bone === 'mixamorigHips' && prop === 'position'){
          newTracks.push(new THREE.VectorKeyframeTrack(t.name, [0], best.hipsPos));
          changed = true; continue;
        }
        const short = bone.replace('mixamorig', '');
        if(prop === 'quaternion' && LEG_BONES.includes(short) && best.legs[short]){
          newTracks.push(new THREE.QuaternionKeyframeTrack(t.name, [0], best.legs[short]));
          changed = true; continue;
        }
        newTracks.push(t);
      }
      if(changed){
        clip.tracks = newTracks;
        fixed++;
        this.log(`✓ ${key} 已鎖定坐姿`);
      }
    }
    this.log(`坐姿鎖定完成：${fixed} 個動作`);
  }

  _actionKey(action){
    for(const [k,a] of this.actions) if(a===action) return k;
    return null;
  }

  play(name, {fade=0.35, once=true, onDone=null, loop=false}={}){
    const next = this.actions.get(name);
    if(!next){ this.log(`✗ 找不到動畫：${name}`); return false; }

    if(this._busy && this.currentKey !== 'sit' && this.currentKey !== name){
      this._queue.push({name, fade, once, onDone, loop});
      this.log(`↻ 佇列加入：${name}（待前動作完成）`);
      return true;
    }

    this._crossfadeTo(name, fade, loop);

    if(once && !loop){
      this._busy = true;
      if(onDone){
        const finish = (e)=>{
          if(e.action !== next) return;
          onDone();
        };
        this.mixer.addEventListener('finished', finish, {once:true});
      }
    }else{
      this._busy = false;
      if(onDone) onDone();
    }
    return true;
  }

  _crossfadeTo(name, fade, loop){
    const next = this.actions.get(name);
    if(!next) return;
    const prevKey = this.currentKey;
    if(prevKey === name) return;

    next.reset();
    next.setLoop(loop? THREE.LoopRepeat: THREE.LoopOnce, loop? Infinity:1);
    next.clampWhenFinished = !loop;
    next.play();

    if(prevKey){
      const prev = this.actions.get(prevKey);
      if(prev) prev.fadeOut(fade);
    }
    next.fadeIn(fade);
    this.currentKey = name;
  }

  _executeQueueNext(){
    if(this._queue.length===0){ this._busy=false; return; }
    const job = this._queue.shift();
    this.log(`▶ 執行佇列動作：${job.name}`);
    this.play(job.name, {fade:job.fade, once:job.once, onDone:job.onDone, loop:job.loop});
  }

  sequence(steps){
    let i=0;
    const run = ()=>{
      if(i>=steps.length) return;
      const s = steps[i++];
      this.play(s.name, {once:true, onDone:()=>{
        if(s.delay) setTimeout(run, s.delay*1000); else run();
      }});
    };
    run();
  }

  update(dt){
    if(this.mixer) this.mixer.update(dt);
  }
}
