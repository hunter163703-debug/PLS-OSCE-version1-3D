// ModelLoader.js
// 模組二：載入 3D 小安（FBX）與所有 FBX 動畫，建立 AnimationMixer 並提供平滑 Crossfade
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';

// 動畫 key -> 檔案對應表
export const ANIM_FILES = {
  model:   '模擬病人：3D 模擬人物小安/小安.fbx',
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

    for(const key in ANIM_FILES){
      if(key === 'model') continue;
      const url = baseUrl + ANIM_FILES[key];
      try{
        const obj = await this.loadFBX(url);
        const clip = obj.animations[0];
        if(!clip){ this.log(`⚠ ${key} 無動畫片段`); continue; }
        clip.name = key;
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
        this.clips.set(key, clip);
        this.actions.set(key, action);
        this.log(`✓ 註冊動畫：${key}`);
      }catch(err){
        this.log(`✗ 載入失敗：${key}｜${err?.message||err}`);
      }
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
