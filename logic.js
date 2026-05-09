function renderCards(side, uiPrefix) {
    const handEl = document.getElementById(uiPrefix + '-hand');
    const fieldEl = document.getElementById(uiPrefix + '-field');
    const isMe = (uiPrefix === 'self');
    if(!handEl || !fieldEl || !state[side]) return;

    handEl.innerHTML = (state[side].hand || []).map((c, i) => {
        if (!isMe) return `<div class="card" style="background:#222; border-color:#444;"></div>`;
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        // 文字列内のシングルクォーテーションでエラーが起きないようエスケープ処理を追加
        const safeCardJson = JSON.stringify(c).replace(/'/g, "&#39;");
        return `<div class="card ${c.color}" style="${bg}" onclick="onCardClick('${side}', ${i}, 'hand')" onmouseenter='showDetail(${safeCardJson})'>
            <div class="cost-badge">${c.cost}</div>
            <div class="bp-main" style="font-size:9px; top:35px;">${c.name}</div>
        </div>`;
    }).join('');

    fieldEl.innerHTML = (state[side].field || []).map((c, i) => {
        const bg = c.image ? `background-image:url('${c.image}')` : '';
        
        // コア数から現在のLvとBPを計算する処理
        let currentLv = 1;
        let currentBp = "-";
        if (c.lvCosts && c.bp) {
            // 高いレベルの条件から順番に満たしているかチェックする
            for (let lvIndex = c.lvCosts.length - 1; lvIndex >= 0; lvIndex--) {
                if (c.cores >= c.lvCosts[lvIndex]) {
                    currentLv = lvIndex + 1;
                    currentBp = c.bp[lvIndex];
                    break;
                }
            }
        }

        const safeCardJson = JSON.stringify(c).replace(/'/g, "&#39;");
        return `<div class="card ${c.color} ${c.isExhausted?'exhausted':''}" style="${bg}" onclick="onCardClick('${side}', ${i}, 'field')" onmouseenter='showDetail(${safeCardJson})'>
            <div class="core-display">● ${c.cores}</div>
            <div style="position:absolute; bottom:5px; width:100%; text-align:center; font-size:11px; font-weight:bold; color:white; text-shadow:1px 1px 2px black; pointer-events:none;">Lv${currentLv} ${currentBp}</div>
            <div class="card-btns" style="display:${isMe?'flex':'none'}">
                <button onclick="event.stopPropagation(); changeCore('${side}',${i},1)">+</button>
                <button onclick="event.stopPropagation(); changeCore('${side}',${i},-1)">-</button>
            </div>
        </div>`;
    }).join('');
}
