const getInitialState = () => ({
    p1: { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] },
    p2: { life: 5, reserve: 4, trash: 0, hand: [], field: [], cardTrash: [], deck: [] },
    currentTurn: 'p1', 
    currentStep: 0, 
    battle: { isAttacking: false, status: 'idle', attackerIdx: null, blockerIdx: null, flashTurn: null, passCount: 0 },
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
            if (!data.battle) {
                data.battle = { isAttacking: false, status: 'idle', attackerIdx: null, blockerIdx: null, flashTurn: null, passCount: 0 };
            } else if (!data.battle.status) {
                data.battle.status = 'idle';
                data.battle.blockerIdx = null;
                data.battle.flashTurn = null;
                data.battle.passCount = 0;
            }

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
            return { ...randCard, id: Math.random(), cores: 0, isExhausted: false, tempBpBonus: 0, turnBpBonus: 0 };
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

function getCardStats(card, side, currentState) {
    let currentLv = 1;
    let currentBpNum = 0;
    let currentBpDisp = "-";
    
    if (card.lvCosts && card.bp) {
        for (let lvIndex = card.lvCosts.length - 1; lvIndex >= 0; lvIndex--) {
            if (card.cores >= card.lvCosts[lvIndex]) {
                currentLv = lvIndex + 1;
                currentBpDisp = card.bp[lvIndex];
                currentBpNum = currentBpDisp === '-' ? 0 : parseInt(currentBpDisp, 10);
                if (isNaN(currentBpNum)) currentBpNum = 0;
                break;
            }
        }
    }
    
    if (card.tempBpBonus) currentBpNum += card.tempBpBonus;
    if (card.turnBpBonus) currentBpNum += card.turnBpBonus;

    if (currentState && side && currentState[side] && currentState[side].field) {
        if (card.effects) {
            card.effects.forEach(eff => {
                if (eff.timing === 'constant' && eff.type === 'bp_up_if_keyword') {
                    if (steps[currentState.currentStep] === eff.step) {
                        const hasKeyword = currentState[side].field.some(otherCard => {
                            if (otherCard === card) return false;
                            return otherCard.effects && otherCard.effects.some(e => eff.keywords.some(kw => e.text.includes(`【${kw}】`)));
                        });
                        if (hasKeyword) {
                            currentBpNum += eff.value;
                        }
                    }
                }
            });
        }
    }

    currentBpDisp = currentBpNum.toString();
    return { lv: currentLv, bpDisp: currentBpDisp, bpNum: currentBpNum };
}

function cancelEffect() {
    if (state.pendingEffect && state.pendingEffect.player === state.myRole) {
        state.pendingEffect = null;
        if (steps[state.currentStep] === "アタック" && state.battle.flashTurn === state.myRole) {
            state.battle.passCount = 0;
            state.battle.flashTurn = getOppSide();
        }
        syncToFirebase();
    }
}

function destroyCard(side, idx) {
    const destroyed = state[side].field.splice(idx, 1)[0];
    state[side].reserve += destroyed.cores;
    destroyed.cores = 0;
    destroyed.tempBpBonus = 0;
    destroyed.turnBpBonus = 0;
    state[side].cardTrash.push(destroyed);

    if (destroyed.effects) {
        destroyed.effects.forEach(eff => {
            if (eff.timing === 'destroyed') {
                if (eff.type === 'destroy_bp') {
                    state.pendingEffect = {
                        player: side,
                        type: 'destroy_bp',
                        value: eff.value,
                        text: `${destroyed.name}の効果：BP${eff.value}以下の相手スピリットを選んで破壊してください`
                    };
                }
            }
        });
    }
}

function resolveBattle() {
    const attackerSide = state.currentTurn;
    const defenderSide = attackerSide === 'p1' ? 'p2' : 'p1';
    const attackerIdx = state.battle.attackerIdx;
    const blockerIdx = state.battle.blockerIdx;

    const attacker = state[attackerSide].field[attackerIdx];
    const blocker = state[defenderSide].field[blockerIdx];

    const aStats = getCardStats(attacker, attackerSide, state);
    const bStats = getCardStats(blocker, defenderSide, state);

    if (aStats.bpNum > bStats.bpNum) {
        destroyCard(defenderSide, blockerIdx);
    } else if (bStats.bpNum > aStats.bpNum) {
        destroyCard(attackerSide, attackerIdx);
    } else {
        destroyCard(defenderSide, blockerIdx);
        destroyCard(attackerSide, attackerIdx);
    }

    if (state[attackerSide].field[attackerIdx]) {
        state[attackerSide].field[attackerIdx].tempBpBonus = 0;
    }

    state.battle.isAttacking = false;
    state.battle.status = 'idle';
    state.battle.attackerIdx = null;
    state.battle.blockerIdx = null;
    syncToFirebase();
}

function takeLifeDamage() {
    if (state.currentTurn === state.myRole || !state.battle.isAttacking || state.battle.status !== 'block_declare') return;
    const me = state.myRole;
    const attackerSide = state.currentTurn;
    const attackerCard = state[attackerSide].field[state.battle.attackerIdx];
    
    const dmg = attackerCard.symbols || 1;
    state[me].life -= dmg;
    
    attackerCard.tempBpBonus = 0;
    
    state.battle.isAttacking = false;
    state.battle.status = 'idle';
    state.battle.attackerIdx = null;
    state.battle.blockerIdx = null;
    syncToFirebase();
}

function passFlash() {
    if (state.battle.flashTurn !== state.myRole) return;
    
    state.battle.passCount++;
    if (state.battle.passCount >= 2) {
        state.battle.passCount = 0;
        if (state.battle.status === 'flash_attack') {
            state.battle.status = 'block_declare';
        } else if (state.battle.status === 'flash_block') {
            resolveBattle();
        }
    } else {
        state.battle.flashTurn = getOppSide();
    }
    syncToFirebase();
}

function onCardClick(side, idx, type) {
    if (state.pendingEffect) {
        if (state.pendingEffect.player !== state.myRole) {
            alert("相手が効果対象を選択中です。");
            return;
        }
        if (type === 'field') {
            const targetCard = state[side].field[idx];
            if (!targetCard) return;

            if (state.pendingEffect.type === 'destroy_bp') {
                if (side === state.myRole) {
                    alert("相手のスピリットを選択してください！");
                    return;
                }
                const stats = getCardStats(targetCard, side, state);
                if (stats.bpNum > 0 && stats.bpNum <= state.pendingEffect.value) {
                    destroyCard(side, idx);
                    state.pendingEffect = null;
                    syncToFirebase();
                } else {
                    alert(`BP${state.pendingEffect.value}以下ではありません！`);
                }
            } else if (state.pendingEffect.type === 'flash_bp_up') {
                targetCard.turnBpBonus = (targetCard.turnBpBonus || 0) + state.pendingEffect.value;
                state.pendingEffect = null;
                
                if (steps[state.currentStep] === "アタック") {
                    state.battle.passCount = 0;
                    state.battle.flashTurn = getOppSide();
                }
                syncToFirebase();
            }
        }
        return;
    }

    if (side !== state.myRole || !state[side]) return; 
    
    if (type === 'hand') {
        const card = state[side].hand[idx];
        if (!card) return;

        if (card.type === 'magic') {
            const isMainStep = state.currentTurn === state.myRole && steps[state.currentStep] === "メイン";
            const isFlashTiming = steps[state.currentStep] === "アタック" && state.battle.flashTurn === state.myRole;

            let triggerTiming = null;
            if (isMainStep) triggerTiming = 'main';
            else if (isFlashTiming) triggerTiming = 'flash';
            else {
                alert("今はマジックを使用できません！");
                return;
            }
            
            const hasEffect = card.effects && card.effects.some(e => e.timing === triggerTiming);
            if (!hasEffect) {
                if (isMainStep && card.effects && card.effects.some(e => e.timing === 'flash')) {
                    triggerTiming = 'flash';
                } else {
                    alert("このタイミングで発動できる効果がありません！");
                    return;
                }
            }

            const syms = getSyms(side);
            const cost = Math.max(0, (card.cost || 0) - getReduction(card, syms));
            const fieldCores = (state[side].field || []).reduce((sum, c) => sum + (c.cores || 0), 0);
            const totalCores = (state[side].reserve || 0) + fieldCores;

            if (totalCores >= cost) {
                let remains = cost;
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
                            destroyCard(side, i);
                        }
                        if (remains <= 0) break;
                    }
                }
                state[side].trash += cost;

                if (card.effects) {
                    card.effects.forEach(eff => {
                        if (eff.timing === triggerTiming) {
                            if (eff.type === 'draw') {
                                for(let d=0; d<eff.amount; d++) {
                                    if(state[side].deck.length > 0) state[side].hand.push(state[side].deck.pop());
                                }
                            } else if (eff.type === 'flash_bp_up') {
                                state.pendingEffect = {
                                    player: side,
                                    type: 'flash_bp_up',
                                    value: eff.value,
                                    text: `${card.name}の効果：BPを+${eff.value}するスピリットを選んでください`
                                };
                            }
                        }
                    });
                }

                const castMagic = state[side].hand.splice(idx, 1)[0];
                state[side].cardTrash.push(castMagic);
                syncToFirebase();
            } else {
                alert(`コア不足: 必要 ${cost} / 所持 ${totalCores}`);
            }
            return;
        }

        if (state.currentTurn !== state.myRole || steps[state.currentStep] !== "メイン") {
            alert("召喚は自分のメインステップでのみ可能です！");
            return;
        }

        const syms = getSyms(side);
        const cost = Math.max(0, (card.cost || 0) - getReduction(card, syms));
        const minCore = (card.lvCosts && card.lvCosts[0]) || 1;
        
        const fieldCores = (state[side].field || []).reduce((sum, c) => sum + (c.cores || 0), 0);
        const totalCores = (state[side].reserve || 0) + fieldCores;

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
                        destroyCard(side, i);
                    }
                    if (remains <= 0) break;
                }
            }
            state[side].trash += cost;
            const summoned = state[side].hand.splice(idx, 1)[0];
            summoned.cores = minCore;
            summoned.tempBpBonus = 0;
            summoned.turnBpBonus = 0;
            
            if (!state[side].field) state[side].field = [];
            state[side].field.push(summoned);
        } else {
            alert(`コア不足: 必要 ${cost + minCore} / 所持 ${totalCores}`);
        }
    } else if (type === 'field' && state[side].field && state[side].field[idx]) {
        
        if (steps[state.currentStep] === "アタック") {
            if (state.currentTurn === state.myRole && side === state.myRole) {
                if (!state[side].field[idx].isExhausted && !state.battle.isAttacking) {
                    const attackingCard = state[side].field[idx];
                    attackingCard.isExhausted = true;
                    
                    if (attackingCard.effects) {
                        attackingCard.effects.forEach(eff => {
                            if (eff.timing === 'attack' && eff.type === 'self_bp_up') {
                                attackingCard.tempBpBonus = eff.value;
                            }
                        });
                    }
                    
                    state.battle.isAttacking = true;
                    state.battle.status = 'flash_attack';
                    state.battle.attackerIdx = idx;
                    state.battle.flashTurn = getOppSide();
                    state.battle.passCount = 0;
                    syncToFirebase();
                    return;
                }
            }
            if (state.currentTurn !== state.myRole && side === state.myRole && state.battle.isAttacking && state.battle.status === 'block_declare') {
                if (!state[side].field[idx].isExhausted) {
                    state[side].field[idx].isExhausted = true;
                    state.battle.status = 'flash_block';
                    state.battle.blockerIdx = idx;
                    state.battle.flashTurn = state.myRole;
                    state.battle.passCount = 0;
                    syncToFirebase();
                    return;
                }
            }
        }
    }
    syncToFirebase();
}

function changeCore(side, idx, amt) {
    if (state.pendingEffect) return alert("効果処理中です");
    if (side !== state.myRole || !state[side] || !state[side].field || !state[side].field[idx]) return;
    
    if (state.currentTurn !== state.myRole || steps[state.currentStep] !== "メイン") {
        alert("コアの移動は自分のメインステップでのみ可能です！");
        return;
    }

    const c = state[side].field[idx];
    if (amt > 0 && state[side].reserve > 0) {
        c.cores++; state[side].reserve--;
    } else if (amt < 0 && c.cores > 0) {
        c.cores--; state[side].reserve++;
        if (c.cores < (c.lvCosts ? c.lvCosts[0] : 1)) {
            destroyCard(side, idx);
        }
    }
    syncToFirebase();
}

function handleNextStep() {
    if (state.pendingEffect) return alert("効果を解決してください");
    if (state.currentTurn !== state.myRole) return alert("相手のターンです");
    if (state.battle.isAttacking) return alert("バトルを解決してください");
    
    state.currentStep++;
    if (state.currentStep >= steps.length) {
        ['p1', 'p2'].forEach(p => {
            if (state[p].field) {
                state[p].field.forEach(c => {
                    c.turnBpBonus = 0;
                });
            }
        });
        
        state.currentStep = 0;
        state.currentTurn = (state.currentTurn === 'p1' ? 'p2' : 'p1');
        state.turnCount++;
    }
    
    const p = state.currentTurn;
    if (!state[p]) return;

    if (steps[state.currentStep] === "コア") {
        state[p].reserve++;
    }
    if (steps[state.currentStep] === "ドロー" && state[p].deck && state[p].deck.length > 0) {
        state[p].hand.push(state[p].deck.pop());
    }
    if (steps[state.currentStep] === "リフレッシュ") {
        if (state[p].field) {
            state[p].field.forEach(c => {
                c.isExhausted = false;
                c.tempBpBonus = 0;
            });
        }
        state[p].reserve += (state[p].trash || 0);
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
    
    let battleBtn = document.getElementById('battle-btn-container');
    if (!battleBtn) {
        battleBtn = document.createElement('div');
        battleBtn.id = 'battle-btn-container';
        battleBtn.style.position = 'fixed';
        battleBtn.style.top = '50%';
        battleBtn.style.left = '50%';
        battleBtn.style.transform = 'translate(-50%, -50%)';
        battleBtn.style.zIndex = '9999';
        document.body.appendChild(battleBtn);
    }
    
    if (state.pendingEffect) {
        if (state.pendingEffect.player === state.myRole) {
            battleBtn.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:10px; background-color:rgba(155, 89, 182, 0.9); padding:20px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.7);">
                    <div style="font-size:18px; font-weight:bold; color:#fff;">${state.pendingEffect.text}</div>
                    <button onclick="cancelEffect()" style="padding:10px 20px; font-size:14px; background-color:#e74c3c; color:white; border:none; border-radius:5px; cursor:pointer;">対象なし / キャンセル</button>
                </div>
            `;
        } else {
            battleBtn.innerHTML = `<div style="padding:15px 30px; font-size:20px; font-weight:bold; background-color:#7f8c8d; color:white; border-radius:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.5);">相手が効果対象を選択中...</div>`;
        }
    } else if (state.battle.isAttacking) {
        const isDefender = state.currentTurn !== state.myRole;
        
        if (state.battle.status === 'flash_attack' || state.battle.status === 'flash_block') {
            if (state.battle.flashTurn === state.myRole) {
                battleBtn.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:10px; background-color:rgba(41, 128, 185, 0.9); padding:20px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.7);">
                        <div style="font-size:18px; font-weight:bold; color:#fff;">フラッシュタイミング：あなたの優先権</div>
                        <button onclick="passFlash()" style="padding:10px 20px; font-size:14px; background-color:#34495e; color:white; border:none; border-radius:5px; cursor:pointer;">パスする</button>
                    </div>
                `;
            } else {
                battleBtn.innerHTML = `<div style="padding:15px 30px; font-size:20px; font-weight:bold; background-color:#7f8c8d; color:white; border-radius:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.5);">相手のフラッシュ対応を待機中...</div>`;
            }
        } else if (state.battle.status === 'block_declare') {
            if (isDefender) {
                battleBtn.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; gap:10px; background-color:rgba(192, 57, 43, 0.9); padding:20px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.7);">
                        <div style="font-size:18px; font-weight:bold; color:#fff;">ブロック宣言ステップ</div>
                        <button onclick="takeLifeDamage()" style="padding:10px 20px; font-size:14px; background-color:#e74c3c; color:white; border:none; border-radius:5px; cursor:pointer;">ライフで受ける</button>
                        <div style="font-size:12px; color:#ddd;">※スピリットをクリックしてブロックも可能</div>
                    </div>
                `;
            } else {
                battleBtn.innerHTML = `<div style="padding:15px 30px; font-size:20px; font-weight:bold; background-color:#f39c12; color:white; border-radius:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.5);">相手のブロック宣言を待機中...</div>`;
            }
        }
    } else {
        battleBtn.innerHTML = '';
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

    let trashEl = document.getElementById(uiPrefix + '-card-trash');
    if (!trashEl) {
        trashEl = document.createElement('div');
        trashEl.id = uiPrefix + '-card-trash';
        if (isMe) {
            trashEl.style.position = 'fixed';
            trashEl.style.bottom = '20px';
            trashEl.style.left = '20px';
        } else {
            trashEl.style.position = 'fixed';
            trashEl.style.top = '20px';
            trashEl.style.left = '20px';
        }
        trashEl.style.zIndex = '50';
        trashEl.style.border = '2px solid #555';
        trashEl.style.backgroundColor = 'rgba(0,0,0,0.8)';
        trashEl.style.borderRadius = '8px';
        trashEl.style.padding = '5px';
        document.body.appendChild(trashEl);
    }

    const trashList = state[side].cardTrash || [];
    if (trashList.length > 0) {
        const topCard = trashList[trashList.length - 1];
        const bg = topCard.image ? `background-image:url('${topCard.image}')` : '';
        const safeCardJson = JSON.stringify(topCard).replace(/'/g, "&#39;");
        trashEl.innerHTML = `<div style="font-size:10px; color:white; text-align:center; margin-bottom:2px;">トラッシュ(${trashList.length})</div>
        <div class="card ${topCard.color}" style="${bg}; position:relative; margin:0 auto; cursor:pointer;" onmouseenter='showDetail(${safeCardJson})'>
            <div class="cost-badge">${topCard.cost}</div>
            <div style="position:absolute; bottom:5px; width:100%; text-align:center; font-size:10px; font-weight:bold; color:white; text-shadow:1px 1px 2px black; pointer-events:none;">${topCard.name}</div>
        </div>`;
    } else {
        trashEl.innerHTML = `<div style="font-size:10px; color:white; text-align:center; margin-bottom:2px;">トラッシュ(0)</div>
        <div style="width:60px; height:80px; border:1px dashed #7f8c8d; display:flex; align-items:center; justify-content:center; color:#7f8c8d; font-size:10px; margin:0 auto;">空</div>`;
    }

    handEl.innerHTML = (state[side].hand || []).map((c, i) => {
        if (!isMe) return `<div class="card" style="background:#222; border-color:#444;"></div>`;
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        const safeCardJson = JSON.stringify(c).replace(/'/g, "&#39;");
        return `<div class="card ${c.color}" style="${bg}" onclick="onCardClick('${side}', ${i}, 'hand')" onmouseenter='showDetail(${safeCardJson})'>
            <div class="cost-badge">${c.cost}</div>
            <div class="bp-main" style="font-size:9px; top:35px;">${c.name}</div>
        </div>`;
    }).join('');

    fieldEl.innerHTML = (state[side].field || []).map((c, i) => {
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        const stats = getCardStats(c, side, state);
        const safeCardJson = JSON.stringify(c).replace(/'/g, "&#39;");
        
        let borderStyle = "";
        if (state.battle.isAttacking && state.battle.attackerIdx === i && side === state.currentTurn) {
            borderStyle = "box-shadow: 0 0 15px 5px red;";
        }
        
        if (state.pendingEffect && state.pendingEffect.player === state.myRole) {
            borderStyle = "box-shadow: 0 0 15px 5px #9b59b6; cursor: crosshair;";
        }

        return `<div class="card ${c.color} ${c.isExhausted?'exhausted':''}" style="${bg} ${borderStyle}" onclick="onCardClick('${side}', ${i}, 'field')" onmouseenter='showDetail(${safeCardJson})'>
            <div class="cost-badge">${c.cost}</div>
            <div class="core-display">● ${c.cores}</div>
            <div style="position:absolute; top:35%; width:100%; text-align:center; font-size:12px; font-weight:bold; color:white; text-shadow:1px 1px 2px black, 0px 0px 3px black; pointer-events:none;">Lv${stats.lv} ${stats.bpDisp}</div>
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
