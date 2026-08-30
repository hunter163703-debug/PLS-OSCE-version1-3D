// WaveWallBackground.js
// 純 3D Three.js 程式化波浪軟墊護板背景模組 (Procedural 3D Wave Cushion Background)
import * as THREE from 'three';

/**
 * 建立微皮革顆粒法線/凹凸貼圖 (Procedural Leather/Fabric Bump Texture)
 * 純 Canvas 程式化生成，不需額外載入外部圖檔，秒開且無載入延遲
 */
function createProceduralLeatherTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // 生成微細蜂巢/皮革顆粒凹凸
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const noise = (Math.random() - 0.5) * 28;
      const cell = Math.sin(x * 0.45) * Math.cos(y * 0.45) * 15;
      const val = Math.min(255, Math.max(0, 128 + noise + cell));
      data[idx] = val;     // R
      data[idx + 1] = val; // G
      data[idx + 2] = val; // B
      data[idx + 3] = 255; // A
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

/**
 * 建立語言治療教室「純 3D 波浪軟墊護板背景」群組
 * @param {Object} options 客製化參數
 * @returns {THREE.Group} 包含立體牆面、單層波浪軟墊陣列、原木踢腳線的 3D 群組
 */
export function createWaveWallBackground(options = {}) {
  const {
    wallWidth = 10.0,         // 背景牆總寬度 (公尺)
    wallHeight = 4.2,         // 背景牆總高度 (公尺)
    cushionBaseHeight = 1.35, // 軟墊主體高度 (公尺)
    waveAmplitude = 0.18,     // 波浪頂部起伏幅度 (公尺)
    panelWidth = 0.52,        // 單片軟墊寬度 (公尺)
    cushionDepth = 0.045,     // 軟墊厚度 (公尺)
    cushionBevel = 0.022,     // 軟墊邊緣圓角倒角大小 (公尺，營造澎潤感)
    wallColor = 0xfcf9f4,     // 上方主牆面顏色 (溫潤米白/奶油色)
    panelColors = [           // 軟墊柔和交替配色陣列 (語言治療室粉彩大地色系)
      0xf6f1e7, // 奶油米白
      0xeee5d6, // 柔和淺卡其
      0xe4dac8, // 溫暖燕麥灰
      0xf2ece0, // 柔白象牙
      0xded2be, // 淺沙色
      0xede3d2  // 暖亞麻
    ],
    showBaseboard = true,     // 是否顯示底部原木踢腳線
    baseboardHeight = 0.06,   // 踢腳線高度
    baseboardDepth = 0.06     // 踢腳線厚度
  } = options;

  const group = new THREE.Group();
  group.name = 'SpeechTherapyRoom_WaveWallBackground';

  // 1. ---- 後方平整主牆面 ----
  const wallGeo = new THREE.PlaneGeometry(wallWidth, wallHeight);
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.95,
    metalness: 0.02,
    side: THREE.FrontSide
  });
  const backWall = new THREE.Mesh(wallGeo, wallMat);
  backWall.position.set(0, wallHeight / 2, -0.01);
  backWall.receiveShadow = true;
  group.add(backWall);

  // 2. ---- 程式化皮革微紋理 ----
  const leatherBump = createProceduralLeatherTexture();

  // 3. ---- 單層一體成型波浪軟墊陣列 (Single-tier Continuous Wave Panels) ----
  const count = Math.ceil(wallWidth / panelWidth) + 2;
  const startX = -((count * panelWidth) / 2) + panelWidth / 2;

  // 建立材質快取以共享 GPU 資源
  const materials = panelColors.map(col => {
    return new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.72,
      metalness: 0.01,
      bumpMap: leatherBump,
      bumpScale: 0.0035
    });
  });

  const extrudeSettings = {
    steps: 1,
    depth: cushionDepth,
    bevelEnabled: true,
    bevelThickness: cushionBevel,
    bevelSize: cushionBevel,
    bevelOffset: 0,
    bevelSegments: 8 // 高細分度圓弧倒角，呈現沙發軟包澎潤質感
  };

  const panelsGroup = new THREE.Group();
  panelsGroup.name = 'WaveCushionPanels';

  for (let i = 0; i < count; i++) {
    const xPos = startX + i * panelWidth;
    
    // 計算波浪頂端高度：利用連續正弦波與相鄰微變化，創造自然起伏的波浪頂部
    const wavePhase = (i / count) * Math.PI * 5.0;
    const waveOffset = Math.sin(wavePhase) * waveAmplitude;
    const currentHeight = cushionBaseHeight + waveOffset;

    // 建立單片軟墊的 2D 輪廓 Shape (頂部帶平滑弧形)
    const shape = new THREE.Shape();
    const halfW = panelWidth * 0.485; // 左右保留約 1.5% 微縫，突顯立體分割層次

    const bottomY = showBaseboard ? baseboardHeight * 0.9 : 0;
    const shoulderY = currentHeight - 0.12; // 頂部拱弧起點
    const peakY = currentHeight;           // 頂部波峰

    // 順時針繪製：底左 -> 底右 -> 右肩 -> 頂部拱形曲線 -> 左肩 -> 閉合
    shape.moveTo(-halfW, bottomY);
    shape.lineTo(halfW, bottomY);
    shape.lineTo(halfW, shoulderY);

    // 頂部柔和波浪弧線 (使用二次貝茲曲線)
    shape.quadraticCurveTo(0, peakY + 0.05, -halfW, shoulderY);
    shape.lineTo(-halfW, bottomY);

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.computeVertexNormals();

    const mat = materials[i % materials.length];
    const panelMesh = new THREE.Mesh(geo, mat);

    panelMesh.position.set(xPos, 0, 0);
    panelMesh.castShadow = true;
    panelMesh.receiveShadow = true;

    panelsGroup.add(panelMesh);
  }
  group.add(panelsGroup);

  // 4. ---- 底部自然原木踢腳線 (Baseboard Skirting) ----
  if (showBaseboard) {
    const baseGeo = new THREE.BoxGeometry(wallWidth + 0.5, baseboardHeight, baseboardDepth);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xdfd1bb, // 溫暖淺橡木色
      roughness: 0.65,
      metalness: 0.02
    });
    const baseboard = new THREE.Mesh(baseGeo, baseMat);
    baseboard.position.set(0, baseboardHeight / 2, cushionDepth * 0.5);
    baseboard.receiveShadow = true;
    baseboard.castShadow = true;
    group.add(baseboard);
  }

  // 5. ---- 治療室頂部柔和漫射洗牆光 (Soft Top Ambient Rim/Wash Light) ----
  const wallWashLight = new THREE.PointLight(0xfff8ee, 0.45, 8.0, 1.2);
  wallWashLight.position.set(0, wallHeight * 0.9, 1.2);
  group.add(wallWashLight);

  return group;
}
