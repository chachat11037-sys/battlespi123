const CARD_DB = [
    {
        id: "spirit_volgames",
        name: "ボルガメス",
        type: "spirit",
        color: "red",
        family: "星竜",
        cost: 1,
        reduction: 0,
        symbols: 1,
        lvCosts: [1, 3],
        bp: [1000, 3000],
        image: "images/volgames.jpg",
        effects: [
            {
                timing: "destroyed",
                type: "destroy_bp",
                value: 4000,
                text: "Lv1・Lv2『このスピリットの破壊時』\nBP4000以下の相手のスピリット1体を破壊する。"
            }
        ]
    },
    {
        id: "spirit_rocceratops",
        name: "ロクケラトプス",
        type: "spirit",
        color: "red",
        family: "地竜",
        cost: 1,
        reduction: 1,
        symbols: 1,
        lvCosts: [1, 2, 3],
        bp: [1000, 3000, 4000],
        image: "images/rocceratops.jpg",
        effects: []
    },
    {
        id: "spirit_dragno_scout",
        name: "ドラグノ偵察兵",
        type: "spirit",
        color: "red",
        family: "竜人",
        cost: 2,
        reduction: 1,
        symbols: 1,
        lvCosts: [1, 2],
        bp: [2000, 3000],
        image: "images/dragno.jpg",
        effects: [
            {
                timing: "attack",
                type: "self_bp_up",
                value: 2000,
                text: "Lv1・Lv2『このスピリットのアタック時』\nこのスピリットをBP+2000する。"
            }
        ]
    },
    {
        id: "spirit_ivern",
        name: "アイバーン",
        type: "spirit",
        color: "red",
        family: "翼竜",
        cost: 2,
        reduction: 1,
        symbols: 1,
        lvCosts: [1, 4],
        bp: [2000, 6000],
        image: "images/ivern.jpg",
        effects: []
    },
    {
        id: "spirit_katanakasago",
        name: "カタナカサゴ",
        type: "spirit",
        color: "red",
        family: "溶魚",
        cost: 1,
        reduction: 1,
        symbols: 1,
        lvCosts: [1, 3],
        bp: [2000, 4000],
        image: "images/katanakasago.jpg",
        effects: []
    },
    {
        id: "spirit_ankillersaurus",
        name: "アンキラーザウルス",
        type: "spirit",
        color: "red",
        family: "地竜",
        cost: 2,
        reduction: 1,
        symbols: 1,
        lvCosts: [1, 2, 3],
        bp: [2000, 3000, 4000],
        image: "images/ankillersaurus.jpg",
        effects: [
            {
                timing: "constant",
                type: "bp_up_if_keyword",
                keywords: ["覚醒", "激突"],
                step: "アタック",
                value: 1000,
                text: "Lv1・Lv2・Lv3『お互いのアタックステップ』\n自分のフィールドに【覚醒】/【激突】を持つスピリットがいる間、このスピリットをBP+1000する。"
            }
        ]
    },
    {
        id: "spirit_dragron",
        name: "雑兵ドラグロン",
        type: "spirit",
        color: "red",
        family: "竜人",
        cost: 2,
        reduction: 2,
        symbols: 1,
        lvCosts: [1, 2],
        bp: [1000, 3000],
        image: "images/dragron.jpg",
        effects: [
            {
                timing: "attack",
                type: "self_bp_up",
                value: 2000,
                text: "Lv1・Lv2『このスピリットのアタック時』\nこのスピリットをBP+2000する。"
            }
        ]
    },
    {
        id: "magic_doubledraw",
        name: "ダブルドロー",
        type: "magic",
        color: "red",
        cost: 4,
        reduction: 2,
        symbols: 0,
        image: "images/doubledraw.jpg",
        effects: [
            {
                timing: "main",
                type: "draw",
                amount: 2,
                text: "【メイン】自分はデッキから2枚ドローする。"
            }
        ]
    }
];
