// SceneSetup.js
// 模組一：場景 / 相機 / 燈光 / 桌子 / 圖卡平面 / 指認標記
import * as THREE from 'three';
import { createWaveWallBackground } from './WaveWallBackground.js';

export function createSceneSetup(canvas){
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 1.35, 0.85);
  camera.lookAt(0, 1.15, -0.55);

  function resize(){
    let w = canvas.clientWidth || canvas.parentElement.clientWidth || window.innerWidth;
    let h = canvas.clientHeight || canvas.parentElement.clientHeight || window.innerHeight;
    if(!w || !h){ w=800; h=600; }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  setTimeout(resize, 100);

  // ---- 燈光（臨床考試需求：清晰、低眩光） ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2.5, 4.2, 3.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 25;
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45);
  fill.position.set(-3, 3, 2);
  scene.add(fill);

  // ---- 地面（淺色地板，配合白色背景，柔和陰影） ----
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({color:0xf2f2f2, roughness:0.9, metalness:0.0})
  );
  floor.rotation.x = -Math.PI/2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- 治療室背景牆（純 3D 程式化波浪軟墊護板）----
  // 純裝飾：立體呈現於小宇後方，具備真實澎潤倒角與陰影，不影響互動邏輯
  try{
    const waveWall = createWaveWallBackground({
      wallWidth: 10.0,
      wallHeight: 4.2,
      cushionBaseHeight: 1.45,
      waveAmplitude: 0.16,
      panelWidth: 0.52,
      cushionDepth: 0.05,
      cushionBevel: 0.025
    });
    waveWall.position.set(0, 0, -3.2); // 立於小宇後方
    scene.add(waveWall);
    console.log('[Scene] 純 3D 治療室波浪軟墊背景已載入');
  }catch(e){ console.warn('[Scene] 3D 背景牆初始化例外：', e); }

  // ---- 圖卡：置於場景中央，確保在相機視野內 ----
  const cardGeo = new THREE.PlaneGeometry(1.3, 0.85);
  const cardMat = new THREE.MeshBasicMaterial({color:0x222222, side:THREE.DoubleSide});
  const cardMesh = new THREE.Mesh(cardGeo, cardMat);
  cardMesh.position.set(0, 0.0, 0.0);
  cardMesh.rotation.x = -Math.PI/2 + 0.32; // 約 18 度傾斜
  cardMesh.receiveShadow = false;
  cardMesh.visible = false; // 圖卡改由 HTML overlay 顯示，3D 平面隱藏
  scene.add(cardMesh);

  // ---- 指認標記（紅色小圓點，置於圖卡 UV 座標上） ----
  // 為了讓 cardMesh 維持隱藏（不渲染 3D 圖卡平面），marker 必須獨立於 scene
  // 由 cardMesh.localToWorld 計算世界座標後再設定
  const markerGeo = new THREE.CircleGeometry(0.045, 24);
  const markerMat = new THREE.MeshBasicMaterial({color:0xff3030, side:THREE.DoubleSide});
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.visible = false;
  scene.add(marker);

  // 載入紋理並切換圖卡
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.setWithCredentials(false);
  let currentCardKey = null;
  function setCard(url, key){
    const enc = encodeURI(url);  // 含中文檔名/路徑需編碼
    return new Promise((resolve)=>{
      loader.load(enc, (tex)=>{
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // 裁切圖卡最下方約 12% 的說明欄：只保留上方 88% 的內容
        tex.repeat.set(1, 0.88);
        tex.offset.set(0, 0.12);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        cardMat.map = tex;
        cardMat.color.set(0xffffff);
        cardMat.needsUpdate = true;
        currentCardKey = key;
        marker.visible = false;
        resolve(key);
      }, undefined, (err)=>{
        console.warn('圖卡載入失敗：', enc, err);
        // 失敗時顯示灰底佔位
        cardMat.map = null; cardMat.color.set(0x333333); cardMat.needsUpdate=true;
        currentCardKey = key; marker.visible=false; resolve(key);
      });
    });
  }

  // 將 UV(0~1，左下原點，完整圖片座標) -> cardMesh 局部座標（平面半寬=0.65 半高=0.425）
  // 紋理已裁切（offset.y=0.12, repeat.y=0.88），需先把完整圖片 v 轉為平面 v
  function showPointMarker(uvx, uvy){
    const vPlane = (uvy - 0.12) / 0.88;  // 完整圖片 v → 裁切平面 v
    const x = (uvx - 0.5) * cardGeo.parameters.width;
    const y = (vPlane - 0.5) * cardGeo.parameters.height;
    // 計算世界座標：將局部座標經過 cardMesh 的 rotation + position 轉換
    const localPos = new THREE.Vector3(x, y, 0.001);
    cardMesh.updateMatrixWorld(); // 確保 matrixWorld 最新
    cardMesh.localToWorld(localPos);
    marker.position.copy(localPos);
    // 讓 marker 面對相機（ billboard 效果），避免被平面旋轉影響而側躺
    marker.lookAt(camera.position);
    marker.scale.setScalar(1.4);
    marker.visible = true;
    console.log('[SceneSetup] showPointMarker UV=',uvx,uvy,'→ world pos=',marker.position.x.toFixed(3),marker.position.y.toFixed(3),marker.position.z.toFixed(3));
    // 閃爍一次
    blinkMarker();
  }
  let blinkTimer=null;
  function blinkMarker(){
    if(blinkTimer) clearInterval(blinkTimer);
    let on=true, n=0;
    blinkTimer=setInterval(()=>{
      if(n>=6){ marker.scale.setScalar(1.0); clearInterval(blinkTimer); blinkTimer=null; return; }
      on=!on; marker.scale.setScalar(on?1.6:1.0); n++;
    }, 220);
  }
  function hidePointMarker(){ marker.visible=false; if(blinkTimer){clearInterval(blinkTimer);blinkTimer=null;} }

  // ---- 給小宇的「指向目標」空間錨點：圖卡正上方中央 ----
  // 小宇 playAnimation('point') 時，可讓整體 model 朝向此錨點
  const pointAnchor = new THREE.Object3D();
  pointAnchor.position.set(0, 1.06, 0.78); // 圖卡中心稍前
  scene.add(pointAnchor);

  resize();
  return {
    renderer, scene, camera,
    cardMesh, marker,
    setCard, showPointMarker, hidePointMarker,
    currentCardKey: ()=>currentCardKey,
    pointAnchor
  };
}