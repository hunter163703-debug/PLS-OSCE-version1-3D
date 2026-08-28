// InteractionLogic.js
// 模組三：語音轉文字（Web Speech API）+ 腳本狀態機（Switch / FSM）
// 將辨識文字映射到 3D 小宇的動作、口語回應與圖卡指認

// 圖卡上各項目的 UV 座標（完整圖片座標：左下為 (0,0)，右上為 (1,1)）
// ※ 2026-08-03 經 calibrate.html 實機點擊校準；3D 紋理裁切換算由 SceneSetup 處理
// 圖卡一布局：3×3 網格（上排：蘋果、手套、香蕉；中排：牛奶、杯子；下排：手錶、報紙）
export const CARD_ITEMS = {
  '圖卡一': {
    '蘋果': {uv:[0.226, 0.816]},
    '手套': {uv:[0.502, 0.833]},
    '香蕉': {uv:[0.766, 0.813]},
    '牛奶': {uv:[0.491, 0.488]},
    '報紙': {uv:[0.496, 0.166]},
    '杯子': {uv:[0.755, 0.188]},
    '手錶': {uv:[0.238, 0.188]},
  },
  '圖卡四': {
    '背書包': {uv:[0.663, 0.073]}  // 第4張圖片（小女生背書包準備出門）— 已校準
  }
};

// 故事理解用關鍵詞（依新腳本更新：移除舊動物名稱，加入火車站、爸爸）
const STORY_KEYWORDS = ['動物園','小明','媽媽','火車站','爸爸'];

// 各階段總題數（用於測驗結束判斷）
// 語言理解含第1~15題 + 第28題，共 16 題
const PHASE_TOTALS = {
  '分測驗二練習題': 3,
  '分測驗二語言理解': 16,
  '分測驗二口語表達': 2
};

export class InteractionLogic{
  constructor({models, stage, ui, speech, voice}){
    this.mm = models;
    this.stage = stage;
    this.ui = ui;
    this.speech = speech;
    this.voice = voice;
    this.onPointStart = null;
    this.onExamEnd = null;
    this._busy = false;        // 防止 handleUtterance 重入
    this._currentJob = null;   // 當前正在執行的語音任務描述
    this.bubbleEl = document.getElementById('bubble');
    this.reset();
    this.updateProgressUI();
  }

  speak(text){
    if(this.voice) this.voice.speak(text);
  }

  showBubble(text, durMs=3500){
    if(!this.bubbleEl) return;
    this.bubbleEl.textContent = text;
    this.bubbleEl.style.display = 'block';
    if(this._bubbleTimer) clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(()=>{
      this.bubbleEl.style.display = 'none';
    }, durMs);
  }

  reset(){
    if(this._foodTimer){ clearTimeout(this._foodTimer); this._foodTimer = null; }
    this.state = {
      currentCard: '封面',
      currentPhase: '分測驗二練習題',
      currentQuestion: null,
      completedQuestions: new Set(),
      phaseCompletedQuestions: {},
      storyHeardCount: 0,
      storyListening: false,
      foodProgress: 0,
      askedFoodAll: false,
      yellowAsked: false,
      yellowProgress: 0,
      lastCommand: null,
      idle: true,
      examEnded: false
    };
    this.updateProgressUI();
  }

  setPhase(phase, q=null){
    if(phase) this.state.currentPhase = phase;
    if(q!=null){
      this.state.currentQuestion = q;
      this.state.completedQuestions.add(q);
      if(!this.state.phaseCompletedQuestions[phase]) this.state.phaseCompletedQuestions[phase] = new Set();
      this.state.phaseCompletedQuestions[phase].add(q);
    }
    this.updateProgressUI();
    this._checkExamEnd();
  }

  updateProgressUI(){
    const {progress} = this.ui || {};
    if(!progress) return;
    progress.querySelectorAll('.phase').forEach(ph=>{
      ph.classList.toggle('active', ph.dataset.phase === this.state.currentPhase);
    });
    progress.querySelectorAll('.sub-item').forEach(el=>{
      const q = el.dataset.q;
      el.classList.remove('current','done');
      if(this.state.completedQuestions.has(q)) el.classList.add('done');
      else if(this.state.currentQuestion === q) el.classList.add('current');
    });
  }

  _checkExamEnd(){
    if(this.state.examEnded) return;
    let allDone = true;
    for(const [phase, total] of Object.entries(PHASE_TOTALS)){
      const done = (this.state.phaseCompletedQuestions[phase] || new Set()).size;
      if(done < total){ allDone = false; break; }
    }
    if(allDone){
      this.state.examEnded = true;
      if(this.onExamEnd) this.onExamEnd();
    }
  }

  // 第17題回答完畢即結束（無論進度樹是否全亮）
  _finishExam(){
    if(this.state.examEnded) return;
    this.state.examEnded = true;
    if(this.onExamEnd) this.onExamEnd();
  }

  setCaption(text, durMs=3500){}
  setUser(text){ if(this.ui.userText) this.ui.userText.textContent = text; }
  setPatient(text){}

  setCard(key, url){
    this.state.currentCard = key;
    this.mm.log(`切換圖卡：${key}`);
    return this.stage.setCard(url, key);
  }

  async handleUtterance(text){
    if(this._busy){ console.log('[Interaction] 忙錄中，忽略輸入：', text); return; }
    this._busy = true;
    try{
      const raw = (text||'').trim();
      if(!raw) return;
      this.setUser(raw);
      console.log('[Interaction] 考生：「'+raw+'」');
      const t = raw.replace(/\s+/g,'').toLowerCase();

      // === 最高優先：故事理解問答 ===
      // 考生朗讀過故事至少一次後，即可回答問題
      // ※ 圖卡四（分測驗四 16/17 題）的問句也含「什麼/誰/哪裡」，不可被故事攔截，故排除
      if(this.state.currentCard !== '圖卡四' && this.state.storyHeardCount >= 1 && (t.includes('嗎')||t.includes('呢')||t.includes('誰')||t.includes('什麼')||t.includes('做什麼')||t.includes('在')||t.includes('幹嘛')||t.includes('去哪')||t.includes('哪裡')||t.includes('怎麼')||t.includes('地方')||t.includes('時候'))){
        console.log('[Interaction] 故事已聽過一次，優先以故事理解回答');
        return this._answerStoryQuestion(raw);
      }

      // 1) 故事理解偵測（朗讀故事階段）
      const isStoryCard = this.state.currentCard === '圖卡二' || this.state.currentCard === '圖卡三';
      if(STORY_KEYWORDS.some(k=> t.includes(k)) || (isStoryCard && (t.includes('做什麼')||t.includes('說說')||t.includes('他在')||t.includes('誰')||t.includes('幹嘛')))){
        if(t.includes('再') || t.includes('說') || t.includes('做') || t.includes('看') || t.includes('幹嘛')){
          return this._handleStory(raw);
        }
      }
      // 若考生在圖卡二/三問問題但尚未聽過故事，給予提示
      if(isStoryCard && this.state.storyHeardCount < 1 && (t.includes('嗎')||t.includes('呢')||t.includes('誰')||t.includes('什麼')||t.includes('去哪')||t.includes('哪裡')||t.includes('怎麼'))){
        this.setCaption('【提示】請先朗讀故事，小宇才能回答問題。', 4000);
        this.mm.play('sit',{once:false, loop:true});
        return;
      }

      // 2) 第1題：複合指令（新腳本：只點頭，不閉眼；閉眼動畫已刪除）
      if((t.includes('先')||t.includes('然後')||t.includes('再')) && t.includes('點頭') && (t.includes('閉眼')||t.includes('眼睛閉')||t.includes('閉起來'))){
        this._doNod(); // 新腳本要求只做出「點頭」的動作
        this.setPhase('分測驗二語言理解','語言理解題目一');
        return;
      }

      // 3) 練習題
      if(t.includes('拍拍手')||t.includes('拍手')){
        this._doClap(); this.setPhase('分測驗二練習題','練習題一'); return;
      }
      if(t.includes('摸摸頭')||t.includes('摸頭')){
        this._doTouchHead(); this.setPhase('分測驗二練習題','練習題二'); return;
      }
      if(t.includes('握握手')||t.includes('握手')){
        this._doHandshake(); this.setPhase('分測驗二練習題','練習題三'); return;
      }
      if((t.includes('點點頭')||t.includes('點頭')) && !t.includes('閉眼')){
        this._doNod(); return;
      }
      if(t.includes('打招呼')){
        this._doGreet(); return;
      }

      // 4) 圖卡一：語言理解
      if(this.state.currentCard === '圖卡一'){
        // --- 題目14 追問 ---
        if(this.state.askedFoodAll && (t.includes('還有')||t.includes('再指')||t.includes('其他的')||t.includes('呢')||t.includes('再')||t.includes('還'))){
          if(this._handleFoodFollowUp()) return;
        }
        // --- 題目12 追問 ---
        if(this.state.yellowAsked && (t.includes('還有')||t.includes('再')||t.includes('其他的')||t.includes('呢'))){
          if(this._handleYellowFollowUp()) return;
        }

        // 題目13（置於題目2之前，避免被「手套+指」攔截）
        if(t.includes('手套') && t.includes('報紙') && t.includes('中間')){
          console.log('[Interaction] ✓ 匹配題目13：手套報紙中間');
          await this._pointToItem('手套');
          this.setPhase('分測驗二語言理解','語言理解題目十三');
          return;
        }
        // 題目2
        if(t.includes('手套') && (t.includes('哪')||t.includes('指')||t.includes('出來')||t.includes('看看'))){
          console.log('[Interaction] ✓ 匹配題目2：手套');
          await this._pointToItem('手套');
          this.setPhase('分測驗二語言理解','語言理解題目二');
          return;
        }
        // 題目3
        if(t.includes('飛機') || (t.includes('有沒有') && t.includes('圖'))){
          console.log('[Interaction] ✓ 匹配題目3：飛機');
          this._doSpeakOnly('沒有。');
          this.setPhase('分測驗二語言理解','語言理解題目三');
          return;
        }
        // 題目5（置於題目4之前，避免被「香蕉+指」攔截）
        if(t.includes('手錶') && t.includes('香蕉') && (t.includes('指')||t.includes('出'))){
          console.log('[Interaction] ✓ 匹配題目5：手錶和香蕉');
          await this._pointToItems(['手錶','香蕉','牛奶']);
          this.setPhase('分測驗二語言理解','語言理解題目五');
          return;
        }
        // 題目6（置於題目4之前，避免被「蘋果/牛奶+指」攔截）
        if((t.includes('不要指')||t.includes('不要')) && (t.includes('蘋果')||t.includes('杯子')) && t.includes('牛奶')){
          console.log('[Interaction] ✓ 匹配題目6：不要指蘋果杯子，指牛奶');
          await this._pointToItem('牛奶');
          this.setPhase('分測驗二語言理解','語言理解題目六');
          return;
        }
        // 題目7（置於題目4之前，避免被「杯子+指」攔截）
        if(t.includes('杯子') && t.includes('上面')){
          console.log('[Interaction] ✓ 匹配題目7：杯子上面的東西');
          await this._pointToItem('杯子');
          this.setPhase('分測驗二語言理解','語言理解題目七');
          return;
        }
        // 題目8（置於題目4之前，避免被「蘋果+在/指」攔截）
        if(t.includes('蘋果') && t.includes('下面')){
          console.log('[Interaction] ✓ 匹配題目8：蘋果下面的東西');
          await this._pointToItem('蘋果');
          this.setPhase('分測驗二語言理解','語言理解題目八');
          return;
        }
        // 題目10（置於題目4之前，避免被「香蕉/蘋果+指」攔截）
        if(t.includes('猴子') || (t.includes('沒有') && (t.includes('香蕉')||t.includes('蘋果'))) || t.includes('如果')){
          console.log('[Interaction] ✓ 匹配題目10：猴子/如果');
          await this._pointToItem('蘋果');
          this.setPhase('分測驗二語言理解','語言理解題目十');
          return;
        }
        // 題目4（條件較寬，必須放在 5/6/7/8/10 之後）
        if((t.includes('蘋果')||t.includes('香蕉')||t.includes('牛奶')) && (t.includes('哪')||t.includes('在')||t.includes('指出')||t.includes('指'))){
          console.log('[Interaction] ✓ 匹配題目4：蘋果香蕉牛奶位置');
          await this._pointToItems(['香蕉','牛奶','杯子']);
          this.setPhase('分測驗二語言理解','語言理解題目四');
          return;
        }
        // 題目9
        if(t.includes('水果') && (t.includes('全部')||t.includes('指出')||t.includes('出來')||t.includes('指'))){
          console.log('[Interaction] ✓ 匹配題目9：水果全部指出來');
          await this._pointToItems(['蘋果','香蕉']);
          this.setPhase('分測驗二語言理解','語言理解題目九');
          return;
        }
        // 題目11
        if(t.includes('紅色') || (t.includes('顏色') && t.includes('紅'))){
          console.log('[Interaction] ✓ 匹配題目11：紅色');
          await this._pointToItems(['報紙','蘋果','香蕉']);
          this.setPhase('分測驗二語言理解','語言理解題目十一');
          return;
        }
        // 題目12
        if(t.includes('黃色') || (t.includes('顏色') && t.includes('黃'))){
          console.log('[Interaction] ✓ 匹配題目12：黃色');
          this._handleYellowQuestion();
          this.setPhase('分測驗二語言理解','語言理解題目十二');
          return;
        }
        // 題目14
        if(t.includes('食物') && (t.includes('全部')||t.includes('指出')||t.includes('出來')||t.includes('指'))){
          console.log('[Interaction] ✓ 匹配題目14：食物全部');
          this._handleFoodAll();
          this.setPhase('分測驗二語言理解','語言理解題目十四');
          return;
        }
        // 題目15
        if((t.includes('戴') || t.includes('帶') || t.includes('穿')) && (t.includes('手上')||t.includes('手'))){
          console.log('[Interaction] ✓ 匹配題目15：戴/帶/穿手上');
          await this._pointToItems(['手套','手錶']);
          this.setPhase('分測驗二語言理解','語言理解題目十五');
          return;
        }
      }

      // 4.5) 圖卡二、三：朗讀故事（故事問答已移至 handleUtterance 頂層，優先於所有圖卡）
      if(this.state.currentCard === '圖卡二' || this.state.currentCard === '圖卡三'){
        if(t.includes('動物園')||t.includes('猴子')||t.includes('大象')||t.includes('獅子')||t.includes('長頸鹿')||t.includes('小明')||t.includes('故事')||t.includes('火車站')||t.includes('媽媽')){
          return this._handleStory(raw);
        }
      }

      // 5) 圖卡四：口語表達（分測驗四）
      if(this.state.currentCard === '圖卡四'){
        // 輔助：是否提到「背/揹書包」（含異體字與贅字）
        const hasBackpack = t.includes('揹書包') || t.includes('背書包') || t.includes('背包') ||
                           (t.includes('背') && t.includes('書包')) || (t.includes('揹') && t.includes('書包')) ||
                           (t.includes('背著') && t.includes('書包')) || (t.includes('揹著') && t.includes('書包'));
        // 輔助：是否問「做什麼/幹嘛」（容忍異體字、斷詞差異）
        const hasWhatDo = t.includes('做什麼') || t.includes('做什') || t.includes('做甚') || t.includes('做啥') ||
                          (t.includes('做') && (t.includes('什') || t.includes('麼'))) ||
                          t.includes('幹嘛') || t.includes('幹什') || t.includes('幹嗎');

        // 第17題：從頭到尾複述（必須明確聽到「小美」才觸發，避免第16題追問誤觸終止）
        if(t.includes('小美') && (hasWhatDo||t.includes('說說')||t.includes('說')||t.includes('從頭到尾')||t.includes('再'))){
          console.log('[Interaction] ✓ 匹配第17題（聽到「小美」）');
          this._doSpeakOnly('起床了，妹妹穿衣服，刷牙，揹書包。');
          this.setPhase('分測驗二口語表達','口語表達題目二');
          this._finishExam();
          return;
        }
        // 第16題第一問：只要提到「做什麼/幹嘛/說說/背書包」且不是明確追問（誰/時候/地方/東西/事情）
        if((hasBackpack||hasWhatDo||t.includes('幹嘛')||t.includes('說說')||t.includes('說')) && !t.includes('誰') && !t.includes('什麼時候') && !t.includes('哪裡') && !t.includes('東西') && !t.includes('事情')){
          this._doSpeakOnly('揹書包。');
          // 顯示 finger icon 指向圖卡四第4張圖片（背書包）
          const backpackItem = CARD_ITEMS['圖卡四']?.['背書包'];
          if(backpackItem && this.onPointStart){
            this.onPointStart(backpackItem.uv[0], backpackItem.uv[1]);
          }
          this.setPhase('分測驗二口語表達','口語表達題目一');
          return;
        }
        if(t.includes('誰') && hasBackpack){
          this._doSpeakOnly('妹妹揹。');
          return;
        }
        if(t.includes('什麼時候') || t.includes('時候') || t.includes('時間')){
          this._doSpeakOnly('早上的時候。');
          return;
        }
        if(t.includes('哪裡') || t.includes('地方') || t.includes('在哪') || t.includes('家裡')){
          this._doSpeakOnly('在家裡。');
          return;
        }
        if((t.includes('東西')||t.includes('看到')||t.includes('有什麼')||t.includes('物品')) && !t.includes('事情')){
          this._doSpeakOnly('鞋子。');
          return;
        }
        // 搖頭：必須明確包含「事情」（腳本：「還有做什麼事情？」）
        if(t.includes('事情') && (t.includes('做') || t.includes('幹'))){
          this._doShakeHead();
          return;
        }
      }

      // 未匹配
      console.log('[Interaction] 未匹配任何指令：', t);
      this.setPatient('（小宇坐著，沒有反應，等待考生下一個指令）');
      this.setCaption('未匹配腳本指令：小宇保持坐姿不動', 3200);
      const laterPhases = ['分測驗二語言理解','分測驗二口語表達','測驗四'];
      if(laterPhases.includes(this.state.currentPhase)){
        const unimpl = this._getUnimplementedQuestions();
        if(unimpl.length>0){
          this.setCaption(`【提示】${this.state.currentPhase} 題目 ${unimpl.join('、')} 尚未載入完整腳本，請提供 PDF/DOCX 內容以補齊。`, 6000);
        }
      }
    }finally{
      this._busy = false;
      console.log('[Interaction] 處理完成，釋放鎖');
    }
  }

  // 取得目前階段尚未實作的題目列表（供提示用）
  _getUnimplementedQuestions(){
    const totals = {
      '分測驗二練習題': 3,
      '分測驗二語言理解': 16,
      '分測驗二口語表達': 2
    };
    const total = totals[this.state.currentPhase] || 0;
    const done = (this.state.phaseCompletedQuestions[this.state.currentPhase] || new Set()).size;
    if(done >= total) return [];
    const missing = [];
    for(let i=done+1; i<=total; i++){
      // 簡易命名：語言理解題目四、口語表達題目三等
      let label = '';
      if(this.state.currentPhase==='分測驗二語言理解') label = '語言理解題目'+this._numToZh(i);
      else if(this.state.currentPhase==='分測驗二口語表達') label = '口語表達題目'+this._numToZh(i);
      else if(this.state.currentPhase==='測驗四') label = '測驗四題目'+this._numToZh(i);
      else label = '題目'+this._numToZh(i);
      missing.push(this._numToZh(i));
    }
    return missing.slice(0,3); // 最多提示前 3 題
  }
  _numToZh(n){
    const map = ['','一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五'];
    return map[n]||String(n);
  }

  // ====== 動作回應封裝 ======
  _doClap(){
    console.log('[Interaction] → 執行 _doClap');
    this.setPatient('（小宇拍拍手）');
    this.setCaption('小宇：拍拍手', 3000);
    this.mm.play('clap',{once:true});
  }
  _doTouchHead(){
    console.log('[Interaction] → 執行 _doTouchHead');
    this.setPatient('（小宇摸摸頭）');
    this.setCaption('小宇：摸摸頭', 3000);
    this.mm.play('touchHead',{once:true});
  }
  _doHandshake(){
    console.log('[Interaction] → 執行 _doHandshake');
    this.setPatient('（小宇和你握握手）');
    this.setCaption('小宇：握握手', 3000);
    this.mm.play('handshake',{once:true});
  }
  _doNod(){
    console.log('[Interaction] → 執行 _doNod');
    this.setPatient('（小宇點點頭）');
    this.setCaption('小宇：點點頭', 3000);
    this.mm.play('nod',{once:true});
  }
  _doGreet(){
    console.log('[Interaction] → 執行 _doGreet');
    this.setPatient('（小宇揮手打招呼）');
    this.setCaption('小宇：你好～', 3000);
    this.showBubble('你好！');
    this.speak('你好！');
    this.mm.play('greet',{once:true});
  }
  _doSpeak(line){
    console.log('[Interaction] → 執行 _doSpeak：'+line);
    this.setPatient('小宇：'+line);
    this.setCaption('小宇：'+line, 4000);
    this.showBubble(line, 4000);
    this.speak(line);
    this.mm.play('speak',{once:false, loop:true});
    setTimeout(()=> this.mm.play('sit',{once:false, loop:true}), 2800);
  }
  _doShakeHead(){
    console.log('[Interaction] → 執行 _doShakeHead');
    this.setPatient('（小宇搖頭不語）');
    this.setCaption('小宇：（搖頭，不說話）', 3000);
    if(this.mm.actions.get('shakeHead')){
      this.mm.play('shakeHead',{once:true});
    }else{
      this.mm.play('nod',{once:true});
    }
  }
  _doCompoundNodCloseEyes(){
    // 新腳本已刪除閉眼動作與閉眼動畫；此函式保留僅為向後相容，實際只執行點頭
    console.log('[Interaction] → 執行 _doCompoundNodCloseEyes（已改為只點頭）');
    this.setPatient('（小宇點點頭）');
    this.setCaption('小宇：點點頭', 3500);
    this.mm.play('nod',{once:true});
  }
  _doSpeakOnly(line){
    console.log('[Interaction] → 口頭回答：'+line);
    this.setPatient('小宇：'+line);
    this.setCaption('小宇：'+line, 3000);
    this.showBubble(line, 3000);
    this.speak(line);
    this.mm.play('speak',{once:false, loop:true});
    setTimeout(()=> this.mm.play('sit',{once:false, loop:true}), 2200);
  }

  // ====== 故事理解（第28題）======
  _handleStory(raw){
    this.state.storyHeardCount += 1;
    console.log('[Interaction] 故事聆聽次數：', this.state.storyHeardCount);
    // 故事理解答問即為第28題：考生開始朗讀故事即標記進入本題
    this.setPhase('分測驗二語言理解','語言理解題目二十八');
    if(this.state.storyHeardCount === 1){
      this.setPatient('（小宇靜靜聽你說故事，不回應）');
      this.setCaption('第一次聆聽：小宇保持沉默 3 秒（測驗延遲反應）', 3200);
      this.mm.play('sit',{once:false, loop:true});
      // 新腳本：等待3秒後表現出分心的動作
      setTimeout(()=>{
        this.mm.play('distract',{once:true});
        this.setCaption('小宇表現出分心的動作', 3000);
        this.setPatient('（小宇分心、東看西看）');
      }, 3000);
      return;
    }
    this.setPatient('（小宇點點頭，準備好回答問題）');
    this.setCaption('第二次聆聽完成：小宇可開始作答', 3200);
    this.mm.play('nod', {once:true});
  }
  _answerStoryQuestion(raw){
    const t = (raw||'').replace(/\s+/g,'').toLowerCase();
    let line = '';
    // 判斷順序即腳本題序的逆向具體度：先排除含「火車站」的第4/5題，避免被第1題「誰…去玩」攔截
    // 問題(4)「誰送他們去火車站？」→ 爸爸
    if(t.includes('誰') && (t.includes('火車站') || t.includes('送') || t.includes('開車'))){
      line = '爸爸。';
    // 問題(1)「小明要和誰去玩？」→ 媽媽
    }else if(t.includes('誰') && (t.includes('去玩') || t.includes('玩') || t.includes('一起'))){
      line = '媽媽。';
    // 問題(5)「他們怎麼去火車站？」→ 看大象（依腳本原文）
    }else if(t.includes('怎麼') || (t.includes('去') && t.includes('車站'))){
      line = '看大象。';
    // 問題(2)「他們要去哪裡玩？」→ 看大象
    }else if(t.includes('去哪') || t.includes('哪裡') || t.includes('地方')){
      line = '看大象。';
    // 問題(3)「他們想要坐什麼去玩？」→ 坐車車
    }else if(t.includes('坐') || t.includes('車') || t.includes('交通工具') || (t.includes('什麼') && t.includes('去'))){
      line = '坐車車。';
    }else{
      // fallback：不再說「嗯嗯」，改為靜默點頭，避免干擾測驗
      this.setPatient('（小宇點點頭）');
      this.setCaption('小宇：（點點頭）', 3000);
      this.mm.play('nod',{once:true});
      return;
    }
    this.setPatient('（小宇回答故事問題）'+line);
    this.setCaption('小宇：'+line, 4000);
    this.showBubble(line, 4000);
    this.speak(line);
    this.mm.play('speak',{once:false, loop:true});
    setTimeout(()=> this.mm.play('sit',{once:false, loop:true}), 2800);
  }

  // ====== 圖卡一：語言理解 ======
  // 第12題：只指不說（腳本無口語回應）
  _handleYellowQuestion(){
    this.state.yellowAsked = true;
    this.state.yellowProgress = 1;
    this.setPatient('（小宇先指牛奶）');
    this.setCaption('小宇：（先指牛奶，等追問）', 3500);
    this._pointToItem('牛奶');
  }
  _handleYellowFollowUp(){
    const p = this.state.yellowProgress;
    if(p===1){
      this.state.yellowProgress = 2;
      this._pointToItem('香蕉');
      this.setCaption('小宇：（接著指香蕉）', 3500);
      this.setPatient('（接著指香蕉）');
      return true;
    }
    return false;
  }
  // 第14題：先分心約5秒 → 指蘋果；考生追問「還有呢？」→ 指香蕉和牛奶（全程不說話）
  _handleFoodAll(){
    this.state.askedFoodAll = true;
    this.state.foodProgress = 0;
    this.setPatient('（小宇分心、東看西看）');
    this.setCaption('小宇：（分心東看西看）', 3500);
    this.mm.play('distract',{once:false, loop:true});
    // 分心約 5 秒後指出蘋果
    if(this._foodTimer) clearTimeout(this._foodTimer);
    this._foodTimer = setTimeout(()=>{
      if(!this.state.askedFoodAll || this.state.foodProgress !== 0) return;
      this.state.foodProgress = 1;
      this.setPatient('（小宇指出蘋果）');
      this.setCaption('小宇：（指出蘋果，等考生追問）', 3500);
      this._pointToItem('蘋果');
    }, 5000);
  }
  _handleFoodFollowUp(){
    const p = this.state.foodProgress;
    if(p===1){
      this.state.foodProgress = 2;
      this.setPatient('（小宇接著指出香蕉和牛奶）');
      this.setCaption('小宇：（接著指出香蕉和牛奶）', 4500);
      this._pointToItems(['香蕉','牛奶']);
      return true;
    }
    if(p>=2){
      this.setPatient('（小宇搖頭，沒有了）');
      this.setCaption('小宇：（搖頭，沒有了）', 3000);
      this._doShakeHead();
      return true;
    }
    return false;
  }

  // 指向單一物品（播放「指」動畫後顯示標記）
  _pointToItem(name){
    const card = this.state.currentCard;
    const item = CARD_ITEMS[card]?.[name];
    if(!item){ this.mm.log(`找不到項目：${card}/${name}`); return Promise.resolve(); }
    console.log('[Interaction] → 指向單一', name, 'UV=', item.uv);
    return new Promise(resolve=>{
      this.mm.play('point',{once:true, onDone:()=>{
        console.log('[Interaction] 顯示標記', name, 'UV=', item.uv);
        this.stage.showPointMarker(item.uv[0], item.uv[1]);
        if(this.onPointStart) this.onPointStart(item.uv[0], item.uv[1]);
        resolve();
      }});
    });
  }

  // 依序指向多個物品：只播放一次「指」動畫，動畫期間依序移動 marker 與 finger icon
  async _pointToItems(names, {stayMs=1500, gapMs=400}={}){
    console.log('[Interaction] → 指向多個', names.join('、'));

    // 只播放一次 point 動畫
    await new Promise(resolve=>{
      this.mm.play('point',{once:true, onDone:resolve});
    });

    for(let i=0;i<names.length;i++){
      const name = names[i];
      const card = this.state.currentCard;
      const item = CARD_ITEMS[card]?.[name];
      if(!item){ this.mm.log(`找不到項目：${card}/${name}`); continue; }
      console.log(`[Interaction] 第${i+1}/${names.length}個：${name} UV=${item.uv}`);
      this.stage.showPointMarker(item.uv[0], item.uv[1]);
      if(this.onPointStart) this.onPointStart(item.uv[0], item.uv[1]);
      await new Promise(resolve=> setTimeout(resolve, stayMs));
      if(i < names.length - 1){
        this.stage.hidePointMarker();
        await new Promise(resolve=> setTimeout(resolve, gapMs));
      }
    }
    this.stage.hidePointMarker();
    console.log('[Interaction] → 多個指向完成');
  }
}
