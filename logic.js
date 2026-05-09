let state = {
    p1: { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] },
    p2: { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] },
    currentTurn: 'p1', currentStep: 0, 
    battle: { attackerId: null, defenderId: null, status: 'idle', flashTurn: null, passCount: 0 },
    pendingEffect: null, turnCount: 1, roomId: null, myRole: null 
};

const steps = ["スタート", "コア", "ドロー", "リフレッシュ", "メイン", "アタック", "エンド"];

function syncToFirebase() {
    if (!state.roomId) return;
    const { db, ref, set } = window.fbSync;
    const syncData = JSON.parse(JSON.stringify(state));
    delete syncData.myRole;
    set(ref(db, 'rooms/' + state.roomId), syncData);
}

function joinGame(role) {
    const rid = document.getElementById('room-id-input').value;
    if (!rid) return alert("合言葉を入力してください");
    state.roomId = rid;
    state.myRole = role; 
    const { db, ref, onValue } = window.fbSync;
    onValue(ref(db, 'rooms/' + rid), (snapshot) => {
        const data = snapshot.val();
        if (data && data[role]) { // 自分の役割のデータがちゃんとあるか確認
            const oldRole = state.myRole;
            state = data;
            state.myRole = oldRole;
            updateUI();
        } else if (role === 'p1') {
            initOnlineGame();
        }
    });
    document.getElementById('setup-overlay').style.display = 'none';
}

function initOnlineGame() {
    ['p1', 'p2'].forEach(p => {
        state[p] = { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] };
        const deckSource = Array(40).fill(0).map(() => {
            const randCard = CARD_DB[Math.floor(Math.random() * CARD_DB.length)];
            return { ...randCard, id: Math.random(), cores: 0, isExhausted: false };
        });
        deckSource.sort(() => Math.random() - 0.5);
        for(let i=0; i<4; i++) state[p].hand.push(deckSource.pop());
        state[p].deck = deckSource;
    });
    state.currentTurn = 'p1';
    state.currentStep = 0;
    syncToFirebase();
}

function getMySide() { return state.myRole || 'p1'; }
function getOppSide() { return state.myRole === 'p1' ? 'p2' : 'p1'; }

function getSyms(p) { 
    if (!state[p] || !state[p].field) return {red:0, blue:0};
    return state[p].field.reduce((acc, c) => { 
        if (c && c.color) acc[c.color] = (acc[c.color] || 0) + (c.symbols || 1); 
        return acc; 
    }, {red:0, blue:0}); 
}

function getReduction(card, mySyms) {
    if (!card || !mySyms) return 0;
    const rRed = card.reductionSyms ? (card.reductionSyms.red || 0) : (card.color === 'red' ? (card.reduction || 0) : 0);
    const rBlue = card.reductionSyms ? (card.reductionSyms.blue || 0) : (card.color === 'blue' ? (card.reduction || 0) : 0);
    return Math.min(rRed, mySyms.red) + Math.min(rBlue, mySyms.blue);
}

function onCardClick(side, idx, type) {
    if (side !== state.myRole || !state[side]) return; 
    if (type === 'hand') {
        const card = state[side].hand[idx];
        if (!card || card.type === 'magic') return;

        const syms = getSyms(side);
        const cost = Math.max(0, (card.cost || 0) - getReduction(card, syms));
        const minCore = (card.lvCosts && card.lvCosts[0]) || 1;
        
        // フィールドのコア計算も安全に
        const fieldCores = (state[side].field || []).reduce((sum, c) => sum + (c.cores || 0), 0);
        const totalCores = state[side].reserve + fieldCores;

        if (totalCores >= (cost + minCore)) {
            let remains = cost + minCore;
            const fromRes = Math.min(state[side].reserve, remains);
            state[side].reserve -= fromRes;
            remains -= fromRes;
            if (remains > 0 && state[side].field) {
                for (let i = state[side].field.length - 1; i >= 0; i--) {
                    const fCard = state[side].field[i];
                    const take = Math.min(fCard.cores, remains);
                    fCard.cores -= take;
                    remains -= take;
                    if (fCard.cores < (fCard.lvCosts[0] || 1)) {
                        const gone = state[side].field.splice(i, 1)[0];
                        state[side].cardTrash.push(gone);
                    }
                    if (remains <= 0) break;
                }
            }
            state[side].trash += cost;
            const summoned = state[side].hand.splice(idx, 1)[0];
            summoned.cores = minCore;
            state[side].field.push(summoned);
        } else {
            alert(`コア不足: 必要 ${cost + minCore} / 所持 ${totalCores}`);
        }
    } else if (type === 'field' && state[side].field[idx]) {
        state[side].field[idx].isExhausted = !state[side].field[idx].isExhausted;
    }
    syncToFirebase();
}

function changeCore(side, idx, amt) {
    if (side !== state.myRole || !state[side] || !state[side].field[idx]) return;
    const c = state[side].field[idx];
    if (amt > 0 && state[side].reserve > 0) {
        c.cores++; state[side].reserve--;
    } else if (amt < 0 && c.cores > 0) {
        c.cores--; state[side].reserve++;
        if (c.cores < (c.lvCosts ? c.lvCosts[0] : 1)) {
            const trashed = state[side].field.splice(idx, 1)[0];
            state[side].cardTrash.push(trashed);
        }
    }
    syncToFirebase();
}

function handleNextStep() {
    if (state.currentTurn !== state.myRole) return alert("相手のターンです");
    state.currentStep++;
    if (state.currentStep >= steps.length) {
        state.currentStep = 0;
        state.currentTurn = (state.currentTurn === 'p1' ? 'p2' : 'p1');
        state.turnCount++;
    }
    const p = state.currentTurn;
    if (steps[state.currentStep] === "コア") state[p].reserve++;
    if (steps[state.currentStep] === "ドロー" && state[p].deck.length > 0) state[p].hand.push(state[p].deck.pop());
    if (steps[state.currentStep] === "リフレッシュ") {
        state[p].field.forEach(c => c.isExhausted = false);
        state[p].reserve += state[p].trash;
        state[p].trash = 0;
    }
    syncToFirebase();
}

function updateUI() {
    const me = getMySide();
    const opp = getOppSide();
    if(!state[me] || !state[opp]) return;
    safeSetText('self-life', state[me].life);
    safeSetText('self-res', "R:" + state[me].reserve);
    safeSetText('opp-life', state[opp].life);
    safeSetText('opp-res', "R:" + state[opp].reserve);
    const symsMe = getSyms(me);
    const symsOpp = getSyms(opp);
    safeSetText('self-rsym', 'R' + symsMe.red);
    safeSetText('self-bsym', 'B' + symsMe.blue);
    safeSetText('opp-rsym', 'R' + symsOpp.red);
    safeSetText('opp-bsym', 'B' + symsOpp.blue);
    const isMyTurn = (state.currentTurn === state.myRole);
    const tTxt = document.getElementById('turn-txt');
    if(tTxt) {
        tTxt.innerText = isMyTurn ? "YOUR TURN" : "OPPONENT'S TURN";
        tTxt.style.color = isMyTurn ? "#2ecc71" : "#e74c3c";
    }
    renderCards(me, 'self');
    renderCards(opp, 'opp');
    updateStepUI();
}

function renderCards(side, uiPrefix) {
    const handEl = document.getElementById(uiPrefix + '-hand');
    const fieldEl = document.getElementById(uiPrefix + '-field');
    const isMe = (uiPrefix === 'self');
    if(!handEl || !fieldEl || !state[side]) return;
    handEl.innerHTML = (state[side].hand || []).map((c, i) => {
        if (!isMe) return `<div class="card" style="background:#222; border-color:#444;"></div>`;
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        return `<div class="card ${c.color}" style="${bg}" onclick="onCardClick('${side}', ${i}, 'hand')" onmouseenter='showDetail(${JSON.stringify(c)})'>
            <div class="cost-badge">${c.cost}</div>
            <div class="bp-main" style="font-size:9px; top:35px;">${c.name}</div>
        </div>`;
    }).join('');
    fieldEl.innerHTML = (state[side].field || []).map((c, i) => {
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        return `<div class="card ${c.color} ${c.isExhausted?'exhausted':''}" style="${bg}" onclick="onCardClick('${side}', ${i}, 'field')" onmouseenter='showDetail(${JSON.stringify(c)})'>
            <div class="core-display">● ${c.cores}</div>
            <div class="card-btns" style="display:${isMe?'flex':'none'}">
                <button onclick="event.stopPropagation(); changeCore('${side}',${i},1)">+</button>
                <button onclick="event.stopPropagation(); changeCore('${side}',${i},-1)">-</button>
            </div>
        </div>`;
    }).join('');
}

function showDetail(card) {
    if(!card) return;
    safeSetText('d-name', card.name);
    safeSetText('d-effect', card.effect ? card.effect.text : (card.effects ? card.effects.map(e=>e.text).join('\n') : "効果なし"));
    safeSetText('d-type-attr', card.type);
    safeSetText('d-family-attr', card.family || '-');
    safeSetText('d-color-attr', card.color || '-');
    safeSetText('d-cost-attr', card.cost || 0);
    let redStr = "-";
    if(card.reductionSyms) redStr = `赤${card.reductionSyms.red||0} 青${card.reductionSyms.blue||0}`;
    else if(card.reduction) redStr = card.reduction;
    safeSetText('d-red-attr', redStr);
    safeSetText('d-sym-attr', card.symbols || (card.type === 'magic' ? 'なし' : 1));
    const img = document.getElementById('detail-img-container');
    if(img && card.image) img.style.backgroundImage = `url('${card.image}')`;
    const lvBody = document.getElementById('d-lv-body');
    if(lvBody) {
        if(card.lvCosts) lvBody.innerHTML = card.lvCosts.map((cost, i) => `<tr><td>Lv${i+1}</td><td>${cost}</td><td>${card.bp ? card.bp[i] : '-'}</td></tr>`).join('');
        else lvBody.innerHTML = "<tr><td colspan='3'>なし</td></tr>";
    }
}

function updateStepUI() {
    const s = document.getElementById('step-display');
    if (s) s.innerHTML = steps.map((st, i) => `<div class="step-tag ${i === state.currentStep ? 'active' : ''}">${st}</div>`).join('');
}

function safeSetText(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; }
function showRoomSelect() { document.getElementById('main-menu').style.display = 'none'; document.getElementById('room-select-container').style.display = 'block'; }
function backToMenu() { document.getElementById('setup-overlay').style.display = 'flex'; document.getElementById('main-menu').style.display = 'flex'; document.getElementById('room-select-container').style.display = 'none'; }