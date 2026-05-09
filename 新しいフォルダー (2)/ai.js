// COM（相手）の思考・行動ロジック専用ファイル

async function startComTurn() {
    if (state.gameMode !== 'vs_com') return;
    state.isComActing = true;
    
    // 相手のターンである限りループし続ける
    while (state.currentTurn === 'opp') {
        await sleep(800); // 少し待つ（人間らしさの演出）
        
        // 効果解決中（手札破棄など）は待機
        if (state.pendingEffect) {
            await sleep(500);
            continue;
        }

        const sn = steps[state.currentStep];

        if (sn === "メイン") {
            let canAct = true;
            let actionCount = 0; // メインステップ専用の無限ループ防止カウンター
            
            while (canAct && !state.pendingEffect && actionCount < 10) {
                actionCount++;
                const mySyms = getSyms('opp');
                const totalCores = getTotalAvailableCores('opp');
                
                // 1. 召喚できるスピリット/ネクサスを探す
                let targetIdx = state.opp.hand.findIndex(c => {
                    if (!c || c.type === 'magic') return false;
                    const minC = (c.lvCosts && typeof c.lvCosts[0] === 'number') ? c.lvCosts[0] : 1;
                    return totalCores >= (Math.max(0, (c.cost || 0) - getReduction(c, mySyms)) + minC);
                });

                // 2. 召喚できなければマジックを探す
                if (targetIdx === -1) {
                    targetIdx = state.opp.hand.findIndex(c => {
                        if (!c || c.type !== 'magic' || !c.effect || c.effect.trigger !== 'main') return false;
                        return totalCores >= Math.max(0, (c.cost || 0) - getReduction(c, mySyms));
                    });
                }

                // 3. 行動実行
                if (targetIdx !== -1) {
                    onCardClick('opp', targetIdx, 'hand');
                    await sleep(800);
                } else {
                    canAct = false; // 出せるカードがなくなったら終了
                }
            }
            nextStep(); // メインステップが終わったら自分で次へ進む
        } 
        else if (sn === "アタック") {
            for (let i = 0; i < state.opp.field.length; i++) {
                const c = state.opp.field[i];
                if (c && c.type === 'spirit' && !c.isExhausted) { 
                    declareAttack('opp', i); 
                    // 戦闘やフラッシュが終わるまで待機
                    while (state.battle.status !== 'idle' || state.pendingEffect) {
                        await sleep(300); 
                    }
                    await sleep(800); 
                }
            }
            nextStep(); // 全員アタックし終えたら自分で次へ進む
        }
        else if (sn === "エンド") {
            nextStep(); // ターン終了、プレイヤーのターンへ交代
            break;
        }
        else {
            // スタート、コア、ドロー、リフレッシュステップはAIは特に何もしないのでスルー
            nextStep();
        }
    }
    state.isComActing = false;
}

// フラッシュタイミングの思考
function checkFlashTurn() {
    if (state.battle.flashTurn === 'opp') {
        setTimeout(() => {
            if (state.pendingEffect) return;

            const mySyms = getSyms('opp');
            const totalCores = getTotalAvailableCores('opp');
            
            const idx = state.opp.hand.findIndex(c => {
                if (!c || c.type !== 'magic' || !c.effect || c.effect.trigger !== 'flash') return false;
                const cost = Math.max(0, (c.cost || 0) - getReduction(c, mySyms));
                if (totalCores < cost) return false;
                
                // 破壊マジックなら対象がいるか確認
                if (c.effect.type === 'destroy_bp_or_nexus' || c.effect.type === 'destroy_bp') {
                    const opp = 'self';
                    return state[opp].field.some(tc => 
                        (tc.type === 'spirit' && getBP(tc, opp) <= c.effect.value) || 
                        (c.effect.type === 'destroy_bp_or_nexus' && tc.type === 'nexus')
                    );
                }
                return true;
            });

            if (idx !== -1) {
                onCardClick('opp', idx, 'hand');
            } else {
                passFlash();
            }
        }, 1200); 
    }
}