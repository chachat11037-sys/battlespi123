const getInitialState = () => ({
    p1: { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] },
    p2: { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] },
    currentTurn: 'p1', 
    currentStep: 0, 
    battle: { isAttacking: false, status: 'idle', attackerIdx: null, blockerIdx: null, flashTurn: null, passCount: 0, uTrigger: null, uTriggerHit: false },
    pendingEffect: null, 
    turnCount: 1, 
    roomId: null, 
    myRole: null 
});

let state = getInitialState();
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
        if (data) {
            ['p1', 'p2'].forEach(p => {
                if (!data[p]) data[p] = getInitialState()[p];
                data[p].field = data[p].field || [];
                data[p].hand = data[p].hand || [];
                data[p].deck = data[p].deck || [];
                data[p].cardTrash = data[p].cardTrash || [];
            });
            if (!data.battle) data.battle = getInitialState().battle;
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
    const currentRole = state.myRole;
    const currentRoomId = state.roomId;
    state = getInitialState();
    state.myRole = currentRole;
    state.roomId = currentRoomId;
    ['p1', 'p2'].forEach(p => {
        const deckSource = Array(40).fill(0).map(() => {
            const randCard = CARD_DB[Math.floor(Math.random() * CARD_DB.length)];
            return { ...randCard, instanceId: Math.random(), cores: 0, isExhausted: false, tempBpBonus: 0, turnBpBonus: 0 };
        });
        deckSource.sort(() => Math.random() - 0.5);
        for(let i=0; i<4; i++) state[p].hand.push(deckSource.pop());
        state[p].deck = deckSource;
    });
    syncToFirebase();
}

function getMySide() { return state.myRole || 'p1'; }
function getOppSide() { return state.myRole === 'p1' ? 'p2' : 'p1'; }

function getSyms(p) { 
    const base = {red:0, blue:0, green:0, yellow:0, purple:0, white:0};
    if (!state[p] || !state[p].field) return base;
    return state[p].field.reduce((acc, c) => { 
        if (c && c.color) acc[c.color] = (acc[c.color] || 0) + (c.symbols || 1); 
        return acc; 
    }, base); 
}

function getReduction(card, mySyms) {
    if (!card || !mySyms) return 0;
    let total = 0;
    const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'white'];
    colors.forEach(col => {
        const r = card.reductionSyms ? (card.reductionSyms[col] || 0) : (card.color === col ? (card.reduction || 0) : 0);
        total += Math.min(r, mySyms[col] || 0);
    });
    return total;
}

function getCardStats(card, side, currentState) {
    let currentLvIdx = 0; let currentLvDisp = 1; let currentBpNum = 0; let currentBpDisp = "-";
    if (card.lvCosts) {
        for (let lvIndex = card.lvCosts.length - 1; lvIndex >= 0; lvIndex--) {
            if (card.cores >= card.lvCosts[lvIndex]) {
                currentLvIdx = lvIndex;
                currentLvDisp = card.lvNames ? card.lvNames[lvIndex] : lvIndex + 1;
                if (card.bp) currentBpNum = parseInt(card.bp[lvIndex]) || 0;
                break;
            }
        }
    }
    if (card.tempBpBonus) currentBpNum += card.tempBpBonus;
    if (card.turnBpBonus) currentBpNum += card.turnBpBonus;
    if (currentState && side && currentState[side] && currentState[side].field && card.type === 'spirit' && card.color === 'red') {
        currentState[side].field.forEach(otherCard => {
            if (otherCard.id === 'nexus_hunting_village') {
                if (steps[currentState.currentStep] === "アタック" && currentState.currentTurn === side) currentBpNum += 2000;
            }
        });
    }
    if (card.type !== 'nexus') currentBpDisp = currentBpNum.toString();
    return { lv: currentLvDisp, lvIdx: currentLvIdx, bpDisp: currentBpDisp, bpNum: currentBpNum };
}

function destroyCard(side, idx) {
    const destroyed = state[side].field.splice(idx, 1)[0];
    state[side].reserve += destroyed.cores;
    const trashCard = JSON.parse(JSON.stringify(destroyed));
    trashCard.cores = 0; trashCard.isExhausted = false;
    if (!state[side].cardTrash) state[side].cardTrash = [];
    state[side].cardTrash.push(trashCard);
    if (destroyed.effects) {
        destroyed.effects.forEach(eff => {
            if (eff.timing === 'destroyed' && eff.type === 'destroy_bp') {
                state.pendingEffect = { player: side, type: 'destroy_bp', value: eff.value, text: `${destroyed.name}の破壊時効果：相手のBP${eff.value}以下を選択` };
            }
        });
    }
}

function takeLifeDamage() {
    const me = state.myRole; const opp = getOppSide();
    if (state.currentTurn === me || !state.battle.isAttacking || state.battle.status !== 'block_declare') return;
    const attackerCard = state[opp].field[state.battle.attackerIdx];
    if (state.battle.uTriggerHit && attackerCard && attackerCard.id === 'ultimate_goradon') {
        if (state[me].field.some(c => c.type === 'spirit' && !c.isExhausted)) return alert("Uトリガーヒット！回復スピリットでブロックしてください！");
    }
    state[me].life -= (attackerCard.symbols || 1);
    if (state[me].field) {
        state[me].field.forEach(c => {
            if (c.id === 'nexus_hunting_village' && c.cores >= 2) state.pendingEffect = { player: me, type: 'destroy_bp', value: 4000, text: `集落の効果：相手のBP4000以下を1体破壊` };
        });
    }
    state.battle = getInitialState().battle;
    syncToFirebase();
}

function passFlash() {
    if (state.battle.flashTurn !== state.myRole) return;
    state.battle.passCount++;
    if (state.battle.passCount >= 2) {
        state.battle.passCount = 0;
        if (state.battle.status === 'flash_attack') state.battle.status = 'block_declare';
        else if (state.battle.status === 'flash_block') resolveBattle();
    } else {
        state.battle.flashTurn = getOppSide();
    }
    syncToFirebase();
}

function resolveBattle() {
    const attackerSide = state.currentTurn; const defenderSide = getOppSide();
    const attacker = state[attackerSide].field[state.battle.attackerIdx];
    const blocker = state[defenderSide].field[state.battle.blockerIdx];
    if (state.battle.uTriggerHit && attacker && attacker.id === 'ultimate_goradon') {
        if (blocker && blocker.type === 'spirit' && state[defenderSide].life > 0) {
            state[defenderSide].life--; state[defenderSide].reserve++;
            alert("ゴラドンの効果：ライフを1点削りました！");
        }
    }
    const aStats = getCardStats(attacker, attackerSide, state);
    const bStats = getCardStats(blocker, defenderSide, state);
    if (aStats.bpNum > bStats.bpNum) destroyCard(defenderSide, state.battle.blockerIdx);
    else if (bStats.bpNum > aStats.bpNum) destroyCard(attackerSide, state.battle.attackerIdx);
    else { destroyCard(defenderSide, state.battle.blockerIdx); destroyCard(attackerSide, state.battle.attackerIdx); }
    state.battle = getInitialState().battle;
    syncToFirebase();
}

function onCardClick(side, idx, type) {
    if (state.pendingEffect) {
        if (state.pendingEffect.player !== state.myRole) return;
        if (type === 'field' && side !== state.myRole && state.pendingEffect.type === 'destroy_bp') {
            if (getCardStats(state[side].field[idx], side, state).bpNum <= state.pendingEffect.value) {
                destroyCard(side, idx); state.pendingEffect = null; syncToFirebase();
            }
        }
        return;
    }
    if (side !== state.myRole) return;
    if (type === 'hand') {
        const card = state[side].hand[idx];
        if (card.type === 'magic') {
            const isMain = state.currentTurn === side && steps[state.currentStep] === "メイン";
            const isFlash = steps[state.currentStep] === "アタック" && state.battle.flashTurn === side;
            if (!isMain && !isFlash) return alert("今はマジックを使用できません");
            const syms = getSyms(side);
            const cost = Math.max(0, (card.cost || 0) - getReduction(card, syms));
            if (state[side].reserve < cost) return alert("コア不足です");
            state[side].reserve -= cost; state[side].trash += cost;
            if (card.id === 'magic_doubledraw') {
                if (isMain) for(let i=0; i<2; i++) if(state[side].deck.length) state[side].hand.push(state[side].deck.pop());
                if (isFlash) state.pendingEffect = { player: side, type: 'flash_bp_up', value: 2000, text: "BP+2000するスピリットを選択" };
            }
            if (state.pendingEffect?.type !== 'flash_bp_up') {
                state[side].cardTrash.push(state[side].hand.splice(idx, 1)[0]);
            } else {
                state.pendingEffect.magicIdx = idx;
            }
            syncToFirebase();
        } else {
            if (steps[state.currentStep] !== "メイン") return alert("召喚はメインステップのみです");
            if (card.type === 'ultimate' && !state[side].field.some(c => c.type === 'spirit' && c.color === 'red')) return alert("召喚条件：赤スピリット1体以上");
            const syms = getSyms(side); const cost = Math.max(0, (card.cost || 0) - getReduction(card, syms));
            const minCore = card.lvCosts ? card.lvCosts[0] : 1;
            if (state[side].reserve < (cost + minCore)) return alert("コア不足です");
            state[side].reserve -= (cost + minCore); state[side].trash += cost;
            const s = state[side].hand.splice(idx, 1)[0]; s.cores = minCore;
            state[side].field.push(s); syncToFirebase();
        }
    } else if (type === 'field') {
        const card = state[side].field[idx];
        if (state.pendingEffect?.type === 'flash_bp_up') {
            card.turnBpBonus = (card.turnBpBonus || 0) + 2000;
            state[side].cardTrash.push(state[side].hand.splice(state.pendingEffect.magicIdx, 1)[0]);
            state.pendingEffect = null; state.battle.flashTurn = getOppSide(); state.battle.passCount = 0; syncToFirebase();
        } else if (steps[state.currentStep] === "アタック" && state.currentTurn === side && !card.isExhausted && !state.battle.isAttacking && card.type !== 'nexus') {
            card.isExhausted = true; let uHit = false; let uData = null;
            const stats = getCardStats(card, side, state);
            if (card.type === 'ultimate' && stats.lv >= 4) {
                const opp = getOppSide();
                if (state[opp].deck.length) {
                    const top = state[opp].deck.pop(); state[opp].cardTrash.push(top);
                    uHit = top.cost < card.cost;
                    uData = { cardName: top.name, cardCost: top.cost, myCost: card.cost, isHit: uHit };
                }
            }
            state.battle = { isAttacking: true, status: 'flash_attack', attackerIdx: idx, blockerIdx: null, flashTurn: getOppSide(), passCount: 0, uTrigger: uData, uTriggerHit: uHit };
            syncToFirebase();
        } else if (state.battle.status === 'block_declare' && state.currentTurn !== side && !card.isExhausted && card.type !== 'nexus') {
            card.isExhausted = true; state.battle.status = 'flash_block'; state.battle.blockerIdx = idx; state.battle.flashTurn = side; state.battle.passCount = 0; syncToFirebase();
        }
    }
}

function changeCore(side, idx, amt) {
    if (steps[state.currentStep] !== "メイン" || side !== state.myRole) return;
    const c = state[side].field[idx];
    if (amt > 0 && state[side].reserve > 0) { c.cores++; state[side].reserve--; }
    else if (amt < 0 && c.cores > 0) {
        c.cores--; state[side].reserve++;
        if (c.cores < (c.lvCosts ? c.lvCosts[0] : 1)) destroyCard(side, idx);
    }
    syncToFirebase();
}

function handleNextStep() {
    if (state.currentTurn !== state.myRole || state.battle.isAttacking) return;
    state.currentStep++;
    if (state.turnCount === 1 && (steps[state.currentStep] === "コア" || steps[state.currentStep] === "アタック")) state.currentStep++;
    if (state.currentStep >= steps.length) {
        state.currentStep = 0; state.currentTurn = getOppSide(); state.turnCount++;
        ['p1', 'p2'].forEach(p => state[p].field.forEach(c => c.turnBpBonus = 0));
    }
    const p = state.currentTurn;
    if (steps[state.currentStep] === "コア") state[p].reserve++;
    if (steps[state.currentStep] === "ドロー") state[p].hand.push(state[p].deck.pop());
    if (steps[state.currentStep] === "リフレッシュ") {
        state[p].field.forEach(c => c.isExhausted = false);
        state[p].reserve += state[p].trash; state[p].trash = 0;
    }
    syncToFirebase();
}

function openTrashModal(side) {
    let m = document.getElementById('trash-modal') || document.createElement('div');
    m.id = 'trash-modal'; m.style = "position:fixed;top:10%;left:10%;width:80%;height:80%;background:rgba(0,0,0,0.9);z-index:10000;border-radius:10px;padding:20px;overflow-y:auto;display:block;";
    m.innerHTML = `<button onclick="this.parentElement.style.display='none'" style="float:right;background:#e74c3c;color:white;border:none;padding:10px;">閉じる</button><h2 style="color:white;">トラッシュ一覧</h2><div id="tm-cont" style="display:flex;flex-wrap:wrap;gap:10px;"></div>`;
    document.body.appendChild(m);
    const cont = document.getElementById('tm-cont');
    state[side].cardTrash.forEach(c => {
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        cont.innerHTML += `<div class="card ${c.color}" style="${bg};position:relative;" onmouseenter='showDetail(${JSON.stringify(c).replace(/'/g, "&#39;")})'><div class="cost-badge">${c.cost}</div></div>`;
    });
}

function updateUI() {
    const me = getMySide(); const opp = getOppSide();
    safeSetText('self-life', state[me].life); safeSetText('self-res', `ﾘｻﾞｰﾌﾞ:${state[me].reserve} / ﾄﾗｯｼｭ:${state[me].trash}`);
    safeSetText('opp-life', state[opp].life); safeSetText('opp-res', `ﾘｻﾞｰﾌﾞ:${state[opp].reserve} / ﾄﾗｯｼｭ:${state[opp].trash}`);
    const tTxt = document.getElementById('turn-txt');
    tTxt.innerText = (state.currentTurn === state.myRole) ? "YOUR TURN" : "OPPONENT'S TURN";
    tTxt.style.color = (state.currentTurn === state.myRole) ? "#2ecc71" : "#e74c3c";
    let bBtn = document.getElementById('battle-btn-container') || document.createElement('div');
    bBtn.id = 'battle-btn-container'; bBtn.style = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;";
    document.body.appendChild(bBtn); bBtn.innerHTML = '';
    if (state.battle.isAttacking) {
        const t = state.battle.uTrigger;
        let uMsg = t ? `<div style="background:${t.isHit?'#e74c3c':'#3498db'};color:white;padding:10px;border-radius:5px;margin-bottom:5px;">【Uトリガー ${t.isHit?'HIT!!':'GUARD'}】<br>${t.cardName}(コスト${t.cardCost})</div>` : '';
        if (state.battle.status.includes('flash')) {
            if (state.battle.flashTurn === state.myRole) bBtn.innerHTML = `${uMsg}<button onclick="passFlash()" style="padding:15px;background:#34495e;color:white;border-radius:10px;">パスする</button>`;
            else bBtn.innerHTML = `${uMsg}<div style="padding:15px;background:#7f8c8d;color:white;border-radius:10px;">相手の待機中...</div>`;
        } else if (state.battle.status === 'block_declare') {
            if (state.currentTurn !== state.myRole) {
                const canLife = !(state.battle.uTriggerHit && state[me].field.some(c => c.type === 'spirit' && !c.isExhausted));
                const msg = canLife ? "" : "<div style='color:#f1c40f;font-weight:bold;'>Uトリガーヒット！強制ブロック！</div>";
                bBtn.innerHTML = `${uMsg}${msg}<button onclick="takeLifeDamage()" ${canLife?'':'disabled'} style="padding:15px;background:${canLife?'#e74c3c':'#7f8c8d'};color:white;border-radius:10px;">ライフで受ける</button>`;
            } else bBtn.innerHTML = `${uMsg}<div style="padding:15px;background:#f39c12;color:white;border-radius:10px;">相手のブロック待機中...</div>`;
        }
    }
    renderCards(me, 'self'); renderCards(opp, 'opp');
    document.getElementById('step-display').innerHTML = steps.map((st, i) => `<div class="step-tag ${i === state.currentStep ? 'active' : ''}">${st}</div>`).join('');
}

function renderCards(side, uiPrefix) {
    const isMe = (uiPrefix === 'self'); const hEl = document.getElementById(uiPrefix + '-hand'); const fEl = document.getElementById(uiPrefix + '-field');
    let tr = document.getElementById(uiPrefix + '-tr') || document.createElement('div');
    tr.id = uiPrefix + '-tr'; tr.style = `position:fixed;${isMe?'bottom':'top'}:20px;right:20px;background:rgba(0,0,0,0.8);padding:5px;border:2px solid #555;cursor:pointer;`;
    tr.onclick = () => openTrashModal(side); document.body.appendChild(tr);
    const trL = state[side].cardTrash;
    tr.innerHTML = trL.length ? `<div style="font-size:10px;color:white;text-align:center;">トラッシュ(${trL.length})</div><div class="card ${trL[trL.length-1].color}" style="background-image:url('${trL[trL.length-1].image}')"></div>` : `<div style="color:#7f8c8d;font-size:10px;">トラッシュ(0)</div>`;
    hEl.innerHTML = state[side].hand.map((c, i) => isMe ? `<div class="card ${c.color}" style="background-image:url('${c.image}')" onclick="onCardClick('${side}',${i},'hand')" onmouseenter='showDetail(${JSON.stringify(c).replace(/'/g, "&#39;")})'><div class="cost-badge">${c.cost}</div><div class="bp-main" style="font-size:9px;top:35px;">${c.name}</div></div>` : `<div class="card" style="background:#222;"></div>`).join('');
    fEl.innerHTML = state[side].field.map((c, i) => {
        const stats = getCardStats(c, side, state);
        const brd = (state.battle.isAttacking && state.battle.attackerIdx === i && state.currentTurn === side) ? "box-shadow: 0 0 15px 5px red;" : "";
        return `<div class="card ${c.color} ${c.isExhausted?'exhausted':''}" style="background-image:url('${c.image}');${brd}" onclick="onCardClick('${side}',${i},'field')" onmouseenter='showDetail(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
            <div class="cost-badge">${c.cost}</div><div class="core-display">● ${c.cores}</div>
            <div style="position:absolute;top:35%;width:100%;text-align:center;font-size:12px;font-weight:bold;color:white;text-shadow:1px 1px 2px black;">Lv${stats.lv} ${stats.bpDisp}</div>
            <div class="card-btns" style="display:${isMe?'flex':'none'}"><button onclick="event.stopPropagation(); changeCore('${side}',${i},1)">+</button><button onclick="event.stopPropagation(); changeCore('${side}',${i},-1)">-</button></div>
        </div>`;
    }).join('');
}

function showDetail(card) {
    if(!card) return;
    safeSetText('d-name', card.name); safeSetText('d-effect', card.effect ? card.effect.text : (card.effects ? card.effects.map(e=>e.text).join('\n') : "効果なし"));
    safeSetText('d-type-attr', card.type); safeSetText('d-family-attr', card.family || '-'); safeSetText('d-color-attr', card.color || '-'); safeSetText('d-cost-attr', card.cost || 0);
    const img = document.getElementById('detail-img-container'); if(img && card.image) img.style.backgroundImage = `url('${card.image}')`;
    const lb = document.getElementById('d-lv-body'); if(lb && card.lvCosts) lb.innerHTML = card.lvCosts.map((cost, i) => `<tr><td>Lv${card.lvNames?card.lvNames[i]:i+1}</td><td>${cost}</td><td>${card.bp?card.bp[i]:'-'}</td></tr>`).join('');
}

function safeSetText(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; }
function showRoomSelect() { document.getElementById('main-menu').style.display = 'none'; document.getElementById('room-select-container').style.display = 'block'; }
function backToMenu() { document.getElementById('setup-overlay').style.display = 'flex'; document.getElementById('main-menu').style.display = 'flex'; document.getElementById('room-select-container').style.display = 'none'; }
