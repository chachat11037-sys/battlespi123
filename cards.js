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
