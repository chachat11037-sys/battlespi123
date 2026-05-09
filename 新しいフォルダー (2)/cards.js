// カードのマスターデータ
const CARD_DB = [
    { 
        name: "ボルガメス", color: "red", type: "spirit", family: "古竜", cost: 1, reduction: 0, 
        lvCosts: [1, 3], bp: [1000, 3000], symbols: 1, image: "images/volgames.jpg",
        effect: { trigger: "on_destroy", type: "destroy_bp", value: 4000, text: "【破壊時】相手のBP4000以下のスピリット1体を破壊する。" } 
    },
    { 
        name: "火トカゲ", color: "red", type: "spirit", family: "爬獣", cost: 3, reduction: 1, 
        lvCosts: [1, 2, 4], bp: [2000, 4000, 6000], symbols: 1, image: "images/hitokage.jpg"
    },
    { 
        name: "戦龍騎", color: "red", type: "spirit", family: "竜騎士", cost: 5, reduction: 2, 
        lvCosts: [1, 3, 5], bp: [4000, 7000, 10000], symbols: 1, image: "images/senryuki.jpg"
    },
    { 
        name: "マーマン", color: "blue", type: "spirit", family: "獣頭", cost: 2, reduction: 1, 
        lvCosts: [1, 3], bp: [2000, 4000], symbols: 1, image: "images/merman.jpg"
    },
    { 
        name: "海帝兵", color: "blue", type: "spirit", family: "闘神", cost: 4, reduction: 2, 
        lvCosts: [1, 4, 6], bp: [3000, 6000, 9000], symbols: 1, image: "images/kaitei.jpg"
    },
    {
        name: "エリマキリザード", color: "red", type: "spirit", family: "爬獣", cost: 0, reduction: 0,
        lvCosts: [1, 2, 3], bp: [1000, 2000, 3000], symbols: 1, image: "images/erimaki.jpg"
    },
    { 
        name: "ダブルドロー", color: "red", type: "magic", cost: 4, reduction: 2, 
        symbols: 0, image: "images/doubledraw.jpg",
        effect: { trigger: "main", type: "draw", value: 2, text: "【メイン】自分はデッキからカードを2枚ドローする。" } 
    },
    {
        name: "灼熱の谷", color: "red", type: "nexus", cost: 3, reduction: 1,
        lvCosts: [0, 1], bp: [0, 0], symbols: 1, image: "images/tani.jpg",
        effects: [
            { lv: [1, 2], trigger: "on_draw_step", type: "draw_and_discard", value: 1, text: "【Lv1-Lv2】自分のドローステップ\nドロー枚数を+1枚する。その後、手札1枚を破棄する。" },
            { lv: [2], trigger: "on_attack_step", type: "bp_up_all", value: 1000, target: "spirit", text: "【Lv2】自分のアタックステップ\n自分のスピリットすべてをBP+1000する。" }
        ]
    },
    { 
        name: "サジッタフレイム", color: "red", type: "magic", cost: 5, reductionSyms: {red: 2, blue: 1}, 
        symbols: 0, image: "images/sagitta.jpg",
        effect: { trigger: "flash", type: "destroy_bp_or_nexus", value: 7000, text: "【フラッシュ】相手のBP7000以下のスピリット1体か、相手のネクサス1つを破壊する。" } 
    }
];