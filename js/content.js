// 写死的内容：形象路线图、气质方向、经文、主祷文、祷告引导、ChatGPT 提示词。
// 都是通用知识，不含个人信息（用的什么产品、祷告事项在私有仓库里）。
// 经文用新标点和合本（神版），已对照 Bible App 核对过。

// ---------- 形象路线图 ----------
// track：skin 护肤 / makeup 化妆 / grace 气质。按顺序学，一次只加一样。
// routine：开始以后加进每天打卡的项（when: am 早上 / pm 晚上 / shower 洗澡后 / week 每周 times 次；optional 不算进完成度）
// periodic：开始以后加的定期提醒（every 天一次）

export const TRACKS = { skin: '护肤', makeup: '化妆', grace: '气质' };

export const STEPS = [
  {
    id: 's-cleanse', track: 'skin', name: '温和洗脸',
    why: '偏油的皮肤也别用强力去油的洗面奶：洗得太干净，皮肤反而出更多油。温和的氨基酸洗面奶就够了。',
    how: ['温水打湿脸，洗面奶挤黄豆大小，在手心揉出泡沫。', '泡沫在脸上轻轻打圈 30 秒，T 区（额头、鼻子）多揉几下。', '冲干净，发际线和下巴边上别留泡沫；用干净毛巾按干，别来回搓。', '早上不怎么出油的话，用清水洗也可以。'],
    buy: '氨基酸洗面奶，¥40–100，一支用两三个月',
    routine: [{ name: '洗脸', when: 'am' }, { name: '洗脸', when: 'pm' }],
  },
  {
    id: 's-moist', track: 'skin', name: '保湿',
    why: '洗完脸皮肤会缺水，缺水了又会多出油。擦一层保湿，出油和起皮都会少。',
    how: ['洗完脸 3 分钟内擦，趁脸还有一点湿。', '偏油的选清爽的乳液、凝露；平价的也可以，薄薄一层，别擦太厚。', '脖子也带一下。'],
    buy: '清爽型乳液或凝露，¥30–80',
    routine: [{ name: '保湿', when: 'am' }, { name: '保湿', when: 'pm' }],
  },
  {
    id: 's-lip', track: 'skin', name: '润唇',
    why: '嘴唇干裂起皮很显得不精致，睡前涂一层第二天就好很多。',
    how: ['睡前涂厚一点；白天干了随时补。', '有死皮别撕，涂厚一点等它自己软化。'],
    buy: '润唇膏，¥10–30',
    routine: [{ name: '润唇', when: 'pm' }],
  },
  {
    id: 's-body', track: 'skin', name: '洗澡后擦身体乳',
    why: '洗完澡皮肤最容易干；擦了身体乳皮肤摸起来软、不起皮，精致感在细节上。',
    how: ['擦干身体后 3 分钟内擦，胳膊、腿、后背能够到的地方。', '手肘、膝盖、脚后跟多擦一点。', '选无香或淡香的，免得和香水味混在一起。'],
    buy: '身体乳，¥30–80，一瓶用很久',
    routine: [{ name: '身体乳', when: 'shower' }],
  },
  {
    id: 's-sun', track: 'skin', name: '防晒',
    why: '肤色蜡黄、痘印消得慢、皮肤变老，最大的原因都是晒。这是护肤里最值的一步，比任何精华都重要。',
    how: ['早上护肤最后一步，一元硬币大小，脸和脖子都涂到。', '出门前 15 分钟涂；阴天也要涂（紫外线照样有）。', '在外面待很久（爬山、跑步）每 2–3 小时补一次。', '晚上正常用洗面奶洗掉就行，一般不用另外卸。'],
    buy: '清爽型防晒，SPF30–50、PA+++，¥60–120（找写着「清爽」「控油」的）',
    routine: [{ name: '防晒', when: 'am' }],
  },
  {
    id: 's-nia', track: 'skin', name: '烟酰胺（提亮、控油）',
    why: '烟酰胺能让肤色慢慢变匀变亮、出油少一点，对蜡黄有用。见效要 4–8 周，别急。',
    how: ['先在耳朵后面试两天，不红不痒再上脸。', '浓度选 5% 以下的；第一周隔一天用一次，适应了再每天用。', '晚上洗完脸、保湿之前用，两三滴就够。', '刺痛、泛红就停几天。'],
    buy: '烟酰胺精华，¥60–120',
    routine: [{ name: '烟酰胺', when: 'pm' }],
  },
  {
    id: 's-bha', track: 'skin', name: '水杨酸（黑头、闭口、痘痘）',
    why: '水杨酸能钻进毛孔里清油，黑头、闭口、小痘痘都会少。',
    how: ['先把防晒用稳了再开始（用了水杨酸更怕晒）。', '只在晚上用，每周 2–3 次，别天天用。', '和烟酰胺可以分开晚上用：今天水杨酸，明天烟酰胺。', '干、刺痛就减少次数。'],
    buy: '2% 水杨酸精华或棉片，¥60–150',
    routine: [{ name: '水杨酸', when: 'week', times: 2 }],
  },
  {
    id: 's-mask', track: 'skin', name: '面膜',
    why: '补水用的，一周一两次就够，不用天天敷。',
    how: ['洗完脸敷 10–15 分钟，别超过说明书写的时间（敷太久反而吸走水分）。', '揭下来以后轻拍，再擦保湿。'],
    buy: '补水面膜，¥3–8 一片',
    routine: [{ name: '面膜', when: 'week', times: 1 }],
  },

  {
    id: 'm-brow', track: 'makeup', name: '修眉',
    why: '花钱最少、效果最明显的一步。眉毛干净了，整个人马上显得精神、利落。',
    how: ['先用眉笔轻轻画出想要的形状：自然、平一点，别修得太细太挑（温柔书卷气适合平缓的眉形）。', '只刮形状外面的杂毛：先修眉毛下面和两眉之间，眉毛上面尽量不动。', '眉头别修太多。宁可少修，长回来要好几周。', '修完擦点保湿。'],
    buy: '修眉刀，¥10 左右',
    periodic: [{ name: '修眉', every: 14 }],
  },
  {
    id: 'm-conceal', track: 'makeup', name: '遮瑕',
    why: '只盖住痘印、黑眼圈这几个点，别人看不出化了妆，但皮肤看着干净。',
    how: ['颜色选和肤色接近的，在下巴边上试色，自然光下看。', '用无名指指腹点在痘印上，轻轻拍开边缘，别抹。', '量越少越自然。', '化了的那天晚上一定把脸洗干净。'],
    buy: '遮瑕膏，¥50–100，一支用很久',
  },
  {
    id: 'm-tint', track: 'makeup', name: '带色防晒 / 素颜霜',
    why: '把肤色调匀一点、气色好一点，同时就把防晒做了。',
    how: ['早上替代普通防晒，薄薄一层，脖子也带一下，免得脸和脖子两个颜色。', '选比肤色稍亮一点点的就够，太白会假。', '晚上洗脸洗两遍。'],
    buy: '带色防晒或男士素颜霜，¥80–150',
  },
  {
    id: 'm-pencil', track: 'makeup', name: '眉笔',
    why: '眉毛稀的地方补一补，眉形更完整，看着更精神。',
    how: ['颜色选比头发浅一号的灰棕色，别用黑色。', '顺着眉毛长的方向，一根一根地画短线，别画成一整块。', '画完用眉刷刷两下，晕开会更自然。'],
    buy: '眉笔，¥20–50',
  },
  {
    id: 'm-lip', track: 'makeup', name: '有色润唇',
    why: '嘴唇有一点血色，整个人气色就好，又看不出来涂了东西。',
    how: ['选和自己唇色接近、稍微红润一点的。', '涂一层，抿一下就好。'],
    buy: '有色润唇膏，¥30–80',
  },

  {
    id: 'g-nails', track: 'grace', name: '指甲和手',
    why: '精致讲究最容易被看到的细节：递东西、打字的时候，别人第一眼看的就是手。',
    how: ['每周剪一次，剪完用锉刀磨圆，别留尖角。', '指甲缝保持干净。', '冬天手干就擦护手霜。'],
    buy: '指甲刀 + 锉刀，¥15–30；护手霜 ¥15–40',
  },
  {
    id: 'g-clothes', track: 'grace', name: '衣服整洁、颜色柔和',
    why: '衣服平整、没有球、鞋干净，比衣服贵不贵重要得多。温柔书卷气的颜色是米白、燕麦色、浅灰、雾紫、藏青；料子是棉麻、针织、衬衫。',
    how: ['衣服洗完挂起来晾，皱了用挂烫机或蒸汽熨斗过一下。', '起球了用去球器打一打。', '鞋两周擦一次，白鞋脏了马上擦。', '买新衣服时先想：和这几种颜色搭不搭。'],
    buy: '去球器 ¥20–40；挂烫机 ¥80–200（可以以后再买）',
    periodic: [{ name: '擦鞋', every: 14 }],
  },
  {
    id: 'g-scent', track: 'grace', name: '淡淡的香味',
    why: '经过身边时有一点干净的香味，会让人觉得这个人很讲究。书卷气适合皂感、木质、茶香这类安静的味道。',
    how: ['出门前喷 1–2 下，手腕或者脖子后面，宁少勿多：别人靠近才闻到最好。', '口气也算：刷牙时刷一下舌头，饭后漱口。'],
    buy: '香水小样先试，喜欢再买正装',
    routine: [{ name: '出门前喷香水', when: 'am', optional: true }],
  },
  {
    id: 'g-hair', track: 'grace', name: '柔和的发型',
    why: '发型是气质的一大半。温柔书卷气适合柔软、自然、有一点长度和纹理的发型，不适合推得很短很硬。',
    how: ['跟理发师说：「自然一点，别推太短，两边别铲青，留一点刘海和纹理。」', '每 4–6 周修一次，长了显得乱。', '可以在小红书找 2–3 张喜欢的发型照片给理发师看。'],
    buy: '理发，看店',
  },
  {
    id: 'g-posture', track: 'grace', name: '体态',
    why: '站得直、肩放松，比任何衣服都显气质。含胸驼背会让人看起来没精神。',
    how: ['靠墙站 2 分钟：后脑勺、肩胛骨、屁股、脚后跟贴墙，下巴微收。', '坐的时候屁股坐满椅子，电脑屏幕抬到眼睛高度。', '走路时想着头顶有根线往上提。'],
    buy: '不用花钱',
    routine: [{ name: '靠墙站 2 分钟', when: 'pm', optional: true }],
  },
  {
    id: 'g-speech', track: 'grace', name: '说话和神态',
    why: '温柔书卷气很大一部分在说话：不急、句子说完整、听人说话时专注。',
    how: ['说话比平时慢一点，想好了再说。', '别人说话时看着对方，微微点头，别急着接话。', '笑的时候放松，不用憋着。'],
    buy: '不用花钱',
  },
  {
    id: 'g-read', track: 'grace', name: '读书',
    why: '书卷气的根是真的读书。专业书以外，每天读几页文学、历史、随笔，说话和想法会慢慢变得不一样。',
    how: ['睡前读 10 分钟，不用多。', '可以借图书馆的书（物品档案里记着借阅）。'],
    buy: '图书馆免费',
    routine: [{ name: '读几页书', when: 'pm', optional: true }],
  },
];
export const stepById = (id) => STEPS.find((s) => s.id === id);

// 气质方向
export const DIRECTIONS = {
  refined: {
    name: '精致讲究',
    points: ['指甲每周修，手不干不糙', '衣服平整、不起球，鞋干净', '身上有淡淡的、干净的香味', '眼镜擦得亮，口气清新', '用的东西整齐、成套'],
  },
  bookish: {
    name: '温柔书卷气',
    points: ['颜色柔和：米白、燕麦、浅灰、雾紫、藏青', '料子：棉麻、针织、衬衫', '发型柔软自然，不推得很短很硬', '眉形自然平缓', '站直但不僵，说话慢一点'],
  },
  clean: {
    name: '干净清爽',
    points: ['素色、整洁、舒服', '皮肤干净，头发清爽', '东西少而好'],
  },
  crisp: {
    name: '利落挺拔',
    points: ['线条干净、衣服合身', '站得直，走路有精神', '做事干脆'],
  },
};

export const SKIN_TAGS = ['出油多', '长痘', '黑头', '暗黄', '干', '敏感发红'];

// ---------- 经文（新标点和合本） ----------

export const VERSES = [
  { ref: '诗篇 46:10', text: '你们要休息，要知道我是神！' },
  { ref: '马太福音 11:28', text: '凡劳苦担重担的人可以到我这里来，我就使你们得安息。' },
  { ref: '诗篇 23:1', text: '耶和华是我的牧者，我必不致缺乏。' },
  { ref: '腓立比书 4:6–7', text: '应当一无挂虑，只要凡事藉着祷告、祈求，和感谢，将你们所要的告诉神。神所赐、出人意外的平安必在基督耶稣里保守你们的心怀意念。' },
  { ref: '彼得前书 5:7', text: '你们要将一切的忧虑卸给神，因为他顾念你们。' },
  { ref: '耶利米哀歌 3:22–23', text: '我们不致消灭，是出于耶和华诸般的慈爱；是因他的怜悯不致断绝。每早晨，这都是新的；你的诚实极其广大！' },
  { ref: '以赛亚书 40:31', text: '但那等候耶和华的必重新得力。他们必如鹰展翅上腾；他们奔跑却不困倦，行走却不疲乏。' },
  { ref: '诗篇 121:1–2', text: '我要向山举目；我的帮助从何而来？我的帮助从造天地的耶和华而来。' },
  { ref: '约翰福音 14:27', text: '我留下平安给你们；我将我的平安赐给你们。我所赐的，不像世人所赐的。你们心里不要忧愁，也不要胆怯。' },
  { ref: '诗篇 4:8', text: '我必安然躺下睡觉，因为独有你—耶和华使我安然居住。' },
  { ref: '诗篇 103:2', text: '我的心哪，你要称颂耶和华！不可忘记他的一切恩惠！' },
  { ref: '帖撒罗尼迦前书 5:16–18', text: '要常常喜乐，不住地祷告，凡事谢恩；因为这是神在基督耶稣里向你们所定的旨意。' },
  { ref: '诗篇 62:8', text: '你们众民当时时倚靠他，在他面前倾心吐意；神是我们的避难所。' },
  { ref: '诗篇 19:14', text: '耶和华—我的磐石，我的救赎主啊，愿我口中的言语、心里的意念在你面前蒙悦纳。' },
  { ref: '罗马书 8:38–39', text: '因为我深信无论是死，是生，是天使，是掌权的，是有能的，是现在的事，是将来的事，是高处的，是低处的，是别的受造之物，都不能叫我们与神的爱隔绝；这爱是在我们的主基督耶稣里的。' },
  { ref: '诗篇 16:11', text: '你必将生命的道路指示我。在你面前有满足的喜乐；在你右手中有永远的福乐。' },
];
export const MORNING_VERSES = [
  { ref: '诗篇 5:3', text: '耶和华啊，早晨你必听我的声音；早晨我必向你陈明我的心意，并要警醒！' },
  { ref: '诗篇 143:8', text: '求你使我清晨得听你慈爱之言，因我倚靠你；求你使我知道当行的路，因我的心仰望你。' },
  { ref: '耶利米哀歌 3:22–23', text: '我们不致消灭，是出于耶和华诸般的慈爱；是因他的怜悯不致断绝。每早晨，这都是新的；你的诚实极其广大！' },
];
export const CONFESS_VERSE = { ref: '约翰一书 1:9', text: '我们若认自己的罪，神是信实的，是公义的，必要赦免我们的罪，洗净我们一切的不义。' };

// 按日期轮换，同一天打开几次看到的是同一节
export function verseFor(day, list = VERSES) {
  const n = [...day].reduce((a, c) => a + c.charCodeAt(0), 0);
  return list[n % list.length];
}

export const LORDS_PRAYER = {
  ref: '马太福音 6:9–13',
  lines: [
    '我们在天上的父：',
    '愿人都尊你的名为圣。',
    '愿你的国降临；',
    '愿你的旨意行在地上，如同行在天上。',
    '我们日用的饮食，今日赐给我们。',
    '免我们的债，如同我们免了人的债。',
    '不叫我们遇见试探；救我们脱离凶恶。',
    '因为国度、权柄、荣耀，全是你的，直到永远。阿们！',
  ],
};

// ---------- 祷告 ----------

export const STAGES = {
  1: { name: '扎根', text: '每晚睡前 2 分钟：安静一下、说一句感谢、念主祷文。' },
  2: { name: '早晚', text: '睡前照旧；早上起来加一句，把今天交给神。' },
  3: { name: '回顾一天', text: '睡前 5–10 分钟：安静、赞美、感谢、回看今天、祈求、交托明天、主祷文。' },
};

export const PRAISE_HINTS = ['主，你是信实的，你从不改变。', '主，你是慈爱的，你顾念我。', '主，你是我的牧者，我必不致缺乏。', '主，你创造了天地，也看见了我。'];
export const THANKS_HINTS = ['谢谢你今天保守我平安。', '谢谢你今天给我的饮食和力气。', '谢谢你今天身边的人。', '谢谢你今天让我学到的东西。'];
export const CONFESS_HINT = '主，今天我在＿＿上没有做好，求你赦免我，帮助我明天改变。';
export const ASK_HINT = '主，我把＿＿交在你手里，求你按你的心意带领。';
export const ENTRUST_HINT = '主，明天的事我交给你，求你给我智慧和平安。';
export const NEAR = { near: '近了', same: '平常', far: '远了' };

export const PRAYER_ABOUT = '我想和神更亲近，正在养成每天睡前祷告的习惯。';
export function prayerPrompt({ verse, items, plan, about = PRAYER_ABOUT }) {
  return `请你陪我祷告。${about}我们用语音交流。

你的角色：你是陪我祷告的同伴和引导者，不是牧师。不要替神说话（不要说「神想告诉你……」），也不要讲道。语气温和，语速慢，每次只说一两句，然后停下来等我。

请按这个顺序带我，每一步等我说完再往下：
1. 安静：带我深呼吸几次，用和合本读这节经文：${verse.ref}「${verse.text}」
2. 赞美：问我从这节经文里看到神是怎样的，带我用一句话赞美他。
3. 感谢：问我今天有什么值得感谢的。
4. 回看：问我今天什么时候觉得离神近、什么时候觉得远。如果我想认罪，陪我说出来，再用约翰一书 1:9 提醒我神的赦免。
5. 祈求：${items.length ? `我心里挂着这些事：${items.join('；')}。问我今晚想为哪件祷告，帮我把它说成祷告。` : '问我心里挂着什么事，帮我把它说成祷告。'}
6. 交托明天：${plan ? `我明天要做：${plan}。带我把它交给神。` : '问我明天要做什么，带我把它交给神。'}
7. 主祷文：用和合本一句一句带我念，以「阿们」结束。

如果我说不出来，就给我一句可以跟着说的话。

结束后，请用文字写一个小结，格式固定：
感谢：……
祈求：……
经文：……`;
}

// ---------- 英语陪练 ----------

export const EN_MODES = {
  chat: { name: '聊天', en: 'Chat' },
  us: { name: '美国生活', en: 'Life in the US' },
  conf: { name: '会议', en: 'Conference' },
};
// 5 次里 2 次聊天、2 次美国生活、1 次会议
export const EN_CYCLE = ['chat', 'us', 'chat', 'us', 'conf'];

export const EN_TOPICS = {
  chat: [
    'How was your day? Tell me one thing that made you happy and one thing that was hard.',
    'Tell me about your skincare routine and why you started it.',
    'Describe your dorm room and what you would change about it.',
    'What did you eat today? Describe your favorite local dish.',
    'Tell me about a place in your city you love, or want to visit.',
    'What kind of person do you want to become in five years?',
    'Tell me about a book, movie, or show you enjoyed recently.',
    'How do you usually relax after a long day?',
    'Describe your perfect weekend.',
    'What are you grateful for this week?',
    'Tell me about your hometown and your family.',
    'What does your style look like, and how do you want it to change?',
  ],
  us: [
    'Ordering coffee and a pastry at a busy café.',
    'Seeing a doctor for a cold: describe your symptoms.',
    'Calling a landlord to ask about renting an apartment.',
    'Opening a bank account.',
    'Small talk with a neighbor in the elevator.',
    'Getting a haircut: explain the style you want.',
    'Returning something at a store.',
    'Asking for directions and taking the bus.',
    'Chatting with a coworker at lunch about the weekend.',
    'Grocery shopping and asking where to find things.',
    'Calling customer service about a wrong charge on your bill.',
    'Making a reservation at a restaurant and ordering.',
  ],
  conf: [
    'Coffee break: introduce yourself and your research in one minute.',
    'After your talk: answer questions from a professor in the audience.',
    'Dinner with other PhD students: small talk about life and research.',
    'Poster session: explain your main result to someone from another field.',
    'Asking a famous professor a question after their talk.',
  ],
};

export function englishPrompt(mode, topic) {
  return `You are my English speaking partner. I'm a Chinese PhD student (you know about my research from our past chats). My goals: live and work in the US someday, and talk comfortably with people at international conferences. I read English well, but my speaking and listening are weak. This is a voice conversation.

Today's mode: ${EN_MODES[mode].en}
Today's topic: ${topic}

Modes:
- Chat: talk with me like a friend about my day, my life, my feelings and opinions. Ask me to tell stories and describe things in detail.
- Life in the US: role-play a real situation (ordering at a café, seeing a doctor, renting an apartment, opening a bank account, small talk with a neighbor or coworker). You play the other person.
- Conference: be a researcher I meet at a coffee break or after my talk. Mix small talk with questions about my work.

Rules:
- Use natural, casual American English, slightly slower than normal. Teach me common everyday phrases and idioms when they fit.
- Keep your turns short (2–3 sentences) and usually end with a question. I should talk more than you.
- Don't correct me during the conversation unless you can't understand me. If I say a Chinese word, give me the English and keep going.

When I type "wrap up", give me a written summary in exactly this format:

=== SUMMARY ===
MISTAKES
- I said: ... | Better: ... | Type: tense / article / preposition / word choice / grammar
EXPRESSIONS
- expression | 中文意思 | example sentence
NEXT TIME
- one thing to focus on
=== END ===`;
}
