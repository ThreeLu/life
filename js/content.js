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
    id: 'g-scent', track: 'makeup', name: '喷香水',
    why: '香味是看不见的妆：经过身边时有一点干净的香味，会让人觉得这个人很讲究。书卷气适合皂感、木质、茶香这类安静的味道。',
    how: ['先去柜台或买小样试：喷在手腕上，过半小时再闻（前调和后面的味道不一样）。', '出门前最后一步，喷 1–2 下，手腕或者脖子后面，宁少勿多：别人靠近才闻到最好。', '口气也算：刷牙时刷一下舌头，饭后漱口。'],
    buy: '香水小样先试，喜欢再买正装',
    routine: [{ name: '出门前喷香水', when: 'am', optional: true }],
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
    how: ['衣服洗完挂起来晾，皱了用挂烫机或蒸汽熨斗过一下。', '起球了用去球器打一打。', '出门前擦一下鞋，白鞋脏了马上擦。', '买新衣服时先想：和这几种颜色搭不搭。'],
    buy: '去球器 ¥20–40；挂烫机 ¥80–200（可以以后再买）',
    routine: [{ name: '擦鞋', when: 'am' }],
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

export function englishPrompt(mode, topic, lastTime = '') {
  return `You are my English speaking partner. I'm a Chinese PhD student (you know about my research from our past chats). My goals: live and work in the US someday, and talk comfortably with people at international conferences. I read English well, but my speaking and listening are weak. This is a voice conversation.

Today's mode: ${EN_MODES[mode].en}
Today's topic: ${topic}${lastTime ? `\nLast time you told me to focus on: ${lastTime} Notice whether I do better, and tell me in the summary.` : ''}

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

// ---------- 鼓励的话 ----------
// 首页每天一句（按日期轮换）。温和、具体，不喊口号。

export const CHEERS = [
  '你不用一下子变得完美，每天好一点点就够了。',
  '精致不是花很多钱，是对自己认真。',
  '你正在一点点成为自己想成为的那个人。',
  '慢慢来，比较快。',
  '你值得被好好对待，先从你自己开始。',
  '认真生活的样子，本身就很好看。',
  '你做的每一件小事都算数。',
  '温柔不是软弱，是一种很强的力量。',
  '不用和别人比，和昨天的自己比就好。',
  '你身上的细腻和温柔，是很珍贵的东西。',
  '你不需要变成别人喜欢的样子，做舒服的自己就很好。',
  '研究会卡住，卡住不代表你不行，只说明你在做难的事。',
  '休息不是偷懒，是为了走得更远。',
  '回头看看，你已经走了很远了。',
  '允许自己有不在状态的日子。',
  '好习惯会悄悄改变你，有一天别人会先看出来。',
  '你今天的用心，将来的你会感谢。',
  '能照顾好自己的人，也能照顾好身边的人。',
  '小小的坚持，叠起来就是很大的改变。',
  '今天也对自己说一声：辛苦了，做得不错。',
  '你比你以为的更有能力。',
  '难的事情，一步一步拆开来做。',
  '自信不是觉得自己什么都行，是相信自己能慢慢学会。',
  '你在用心生活，这已经很了不起。',
  '把背挺直，带上一点笑，今天会是好的一天。',
  '你的价值不取决于今天的效率。',
  '一个人也可以把日子过得很好看。',
  '每一次开口说英语，都是在为将来的自己铺路。',
  '读书、护肤、祷告，你在同时打理自己的里面和外面。',
  '你走的每一步，神都看见了。',
  '不完美也没关系，真实的你就很好。',
  '今天比昨天多做到一点点，就是胜利。',
];
export const CHEER_VERSES = [
  { ref: '诗篇 139:14', text: '我要称谢你，因我受造，奇妙可畏；你的作为奇妙，这是我心深知道的。' },
  { ref: '以赛亚书 43:4（节选）', text: '因我看你为宝为尊；又因我爱你。' },
  { ref: '腓立比书 4:13', text: '我靠着那加给我力量的，凡事都能做。' },
  { ref: '约书亚记 1:9（节选）', text: '你当刚强壮胆！不要惧怕，也不要惊惶；因为你无论往哪里去，耶和华你的神必与你同在。' },
  { ref: '西番雅书 3:17', text: '耶和华你的神是施行拯救、大有能力的主。他在你中间必因你欢欣喜乐，默然爱你，且因你喜乐而欢呼。' },
  { ref: '哥林多后书 12:9（节选）', text: '我的恩典够你用的，因为我的能力是在人的软弱上显得完全。' },
  { ref: '以弗所书 2:10（节选）', text: '我们原是他的工作，在基督耶稣里造成的。' },
  { ref: '耶利米书 29:11', text: '耶和华说：我知道我向你们所怀的意念是赐平安的意念，不是降灾祸的意念，要叫你们末后有指望。' },
  { ref: '彼得前书 3:4', text: '只要以里面存着长久温柔、安静的心为妆饰；这在神面前是极宝贵的。' },
];

// 做完一件事时的一句话
export const CHEER_ON = {
  am: '早上的护肤好了。',
  pm: '晚上的护肤好了。晚安。',
  shower: '洗好了，舒舒服服。',
  sport: '动了一下，身体会记得。',
  planYes: '做到了。',
  planPart: '做了一些，也很好。',
  planNo: '没关系，明天还在。',
  stepStart: '开始了。慢慢来。',
  stepHabit: '这一步，已经是你的习惯了。',
  english: '又说了一次。',
  englishCards: '复习好了。',
  prayer: '晚安，你被爱着。',
  morning: '今天交给神了。',
  read: '读了。',
  sleepGood: '睡得好，真好。',
  periodic: '打理好了。',
};
export function cheerNight(mood) {
  if (!mood) return '记下了。今天也辛苦了。';
  if (mood >= 8) return '好的一天。';
  if (mood >= 5) return '平平常常，也是好日子。';
  return '今天不容易。早点睡吧。';
}

// 里程碑：第一次 / 累计到一些数。安静的一句
export const MILESTONE_TEXT = {
  'care-1': '第一次把一天的护肤都做好了',
  'care-7': '护肤 7 天了',
  'care-30': '护肤 30 天了',
  'care-100': '护肤 100 天了',
  'pray-1': '第一次在这里祷告',
  'pray-10': '祷告 10 个晚上了',
  'pray-30': '祷告 30 个晚上了',
  'pray-100': '祷告 100 个晚上了',
  'sport-10': '运动 10 次了',
  'sport-50': '运动 50 次了',
  'english-10': '英语练了 10 次了',
  'english-50': '英语练了 50 次了',
  'habit-1': '养成了第一个习惯',
  'habit-5': '养成 5 个习惯了',
  'night-30': '写了 30 天的一句话',
};

// ---------- 生病 ----------
// 通用常识，不是医嘱。用户自己的做法（预案）存在 life.json 的 sick.plans，可以改。

export const SICK_KINDS = {
  cold: { name: '感冒', icon: '🤧' },
  fever: { name: '发烧', icon: '🌡️' },
  gut: { name: '肠胃不舒服', icon: '🫄' },
  other: { name: '其他不舒服', icon: '🩹' },
};
export const DEFAULT_PLANS = {
  cold: ['泡脚（温水，15 分钟）', '多喝水', '早点睡、多休息', '早晚量一次体温', '运动先停几天'],
  fever: ['每 4 小时量一次体温', '多喝水（发烧很耗水）', '躺下休息，别硬撑', '温水擦脖子、腋下帮着降温', '跟导师说一声，先请假', '泡脚只用温水、别太久；烧得高就先不泡'],
  gut: ['少量多次地喝温水', '吃清淡的：粥、面条、馒头', '记一下拉了 / 吐了几次', '想一想昨天吃了什么', '这两天别吃辣、油、凉的'],
  other: ['多休息', '多喝水', '不见好就去校医院'],
};
export const RED_FLAGS = {
  cold: ['体温超过 37.3°C：切到发烧模式', '咳得厉害、胸口疼、喘不上气', '一周还不见好'],
  fever: ['39°C 以上，吃了退烧药也降不下来', '烧了超过 3 天', '喘不上气、胸口疼', '头剧烈疼、脖子发硬', '身上出疹子', '迷迷糊糊、叫不醒', '喝不进水、尿很少'],
  gut: ['拉或吐到喝不进水、尿很少、头晕', '大便有血或者发黑', '肚子剧烈疼、按着更疼', '同时发高烧', '两三天还不见好'],
  other: ['越来越重', '两三天不见好'],
};
// 生病时每天点一下有哪些症状（还可以自己加）
export const SYMPTOMS = {
  cold: ['嗓子疼', '流鼻涕', '鼻塞', '打喷嚏', '咳嗽', '头疼', '浑身酸', '发冷', '没精神'],
  fever: ['发冷', '出汗', '头疼', '浑身酸', '嗓子疼', '咳嗽', '没胃口', '没精神'],
  gut: ['肚子疼', '拉肚子', '恶心', '吐了', '胀气', '没胃口', '发冷', '没精神'],
  other: ['头疼', '没精神', '睡不好', '没胃口'],
};
export const RECOVERY_DAYS = 2; // 好了以后的恢复期：运动先缓缓、早点睡
export const FEVER_FROM = 37.3;

// 常见感冒药的成分：名字里有这些字就认出来。用来提醒「同一种成分别一起吃」。
export const MED_KNOWLEDGE = [
  { match: /感康|复方氨酚烷胺/, ingredients: ['对乙酰氨基酚', '金刚烷胺', '氯苯那敏', '咖啡因'], use: '感冒综合症状' },
  { match: /感冒灵/, ingredients: ['对乙酰氨基酚', '氯苯那敏', '咖啡因'], use: '感冒综合症状（中西药复方）' },
  { match: /快克/, ingredients: ['对乙酰氨基酚', '金刚烷胺', '氯苯那敏', '咖啡因'], use: '感冒综合症状' },
  { match: /白加黑|日夜百服/, ingredients: ['对乙酰氨基酚', '伪麻黄碱', '右美沙芬', '苯海拉明'], use: '感冒综合症状' },
  { match: /新康泰克/, ingredients: ['伪麻黄碱', '氯苯那敏'], use: '鼻塞流涕' },
  { match: /泰诺|对乙酰氨基酚|扑热息痛|必理通/, ingredients: ['对乙酰氨基酚'], use: '退烧止痛' },
  { match: /布洛芬|芬必得/, ingredients: ['布洛芬'], use: '退烧止痛' },
  { match: /甲氧那明|阿斯美/, ingredients: ['甲氧那明', '那可丁', '氨茶碱', '氯苯那敏'], use: '咳嗽' },
  { match: /感冒清热/, ingredients: [], use: '中成药：风寒感冒' },
  { match: /小柴胡/, ingredients: [], use: '中成药：忽冷忽热、口苦' },
  { match: /连花清瘟/, ingredients: [], use: '中成药：流感、发热' },
  { match: /奥司他韦|达菲/, ingredients: ['奥司他韦'], use: '流感（出现症状 48 小时内）', rx: true },
  { match: /沙星|霉素|西林|头孢|阿莫/, ingredients: [], use: '抗生素：只有医生判断是细菌感染才吃，普通感冒没用', rx: true },
  { match: /地塞米松|泼尼松|激素/, ingredients: [], use: '激素', rx: true },
  { match: /蒙脱石/, ingredients: ['蒙脱石'], use: '拉肚子' },
  { match: /保赤丸|健胃消食|多潘立酮|吗丁啉/, ingredients: [], use: '积食、消化不良' },
  { match: /补液盐/, ingredients: [], use: '拉肚子、吐了以后补水补盐' },
  { match: /酮替芬|氯雷他定|西替利嗪/, ingredients: [], use: '过敏' },
  { match: /风油精|清凉油/, ingredients: [], use: '外用：蚊虫叮咬、提神' },
];
// 两种退烧药自己别混着吃
export const FEVER_INGREDIENTS = ['对乙酰氨基酚', '布洛芬'];

// ---------- 读经计划 ----------

export const BIBLE_BOOKS = {
  PSA: { name: '诗篇', chapters: 150, note: '一天一篇，读完用一句话开始祷告' },
  PRO: { name: '箴言', chapters: 31, byDate: true, note: '几号就读第几章，一个月一遍' },
  JHN: { name: '约翰福音', chapters: 21, note: '再读一遍福音书，可以试试英文' },
  MRK: { name: '马可福音', chapters: 16, note: '最短的福音书，节奏快' },
  ACT: { name: '使徒行传', chapters: 28, note: '福音书之后的故事' },
  PHP: { name: '腓立比书', chapters: 4, note: '喜乐的书信，四章' },
  ROM: { name: '罗马书', chapters: 16, note: '信仰的根基，慢慢读' },
  JAS: { name: '雅各书', chapters: 5, note: '很实际的生活智慧' },
};

// ---------- 难受的时候 ----------
// 像生病的预案一样：先分一下是哪种难受，每种有一份可以打勾的清单（用户自己能改）。
// 做法来自常用的情绪自助方法：先稳住身体（呼吸、温水、热水澡）、动一动、找人或者跟神说说话、只想下一小步。
export const LOW_KINDS = {
  down: { name: '低落、提不起劲', icon: '🌧️' },
  anxious: { name: '焦虑、心慌', icon: '🌀' },
  lonely: { name: '孤单', icon: '🌙' },
  hurt: { name: '委屈、生气', icon: '🔥' },
  tired: { name: '累、撑不住', icon: '🪫' },
  unclear: { name: '说不清', icon: '☁️' },
};
export const LOW_PLANS = {
  down: ['喝一杯温水', '拉开窗帘，或者把灯打开', '洗把脸，或者冲个热水澡', '出去走 10 分钟，不用去哪', '做一件 5 分钟能做完的小事：叠被子、擦桌子', '吃点东西，别饿着'],
  anxious: ['慢慢呼吸一分钟', '看看四周：说出 5 样看到的、4 样摸得到的、3 种听到的声音', '把担心的事写下来，一行一件', '只想下一步：现在能做的最小的一件事是什么', '用热水泡泡手、泡泡脚'],
  lonely: ['给家里打个电话，或者发条消息', '去有人的地方待一会儿：图书馆、咖啡店、食堂', '跟神说说话，就像跟朋友说', '听一段喜欢的播客或者看一段喜欢的视频', '跟自己说一句：「我现在有点孤单，这没关系。」'],
  hurt: ['先别回消息、别做决定', '把想说的全写下来（写完可以删掉）', '出去快走一圈', '用冷水洗把脸', '睡一觉再看，很多事第二天就小了'],
  tired: ['今天到这里就够了，先停下来', '洗个热水澡', '早点睡，手机放远一点', '明天只列 3 件事，其他的先放一放'],
  unclear: ['慢慢呼吸一分钟', '喝一杯温水', '洗个热水澡', '出去走 10 分钟', '跟神说说话'],
};
export const LOW_VERSES = [
  { ref: '诗篇 34:18', text: '耶和华靠近伤心的人，拯救灵性痛悔的人。' },
  { ref: '诗篇 147:3', text: '他医好伤心的人，裹好他们的伤处。' },
  { ref: '以赛亚书 41:10', text: '你不要害怕，因为我与你同在；不要惊惶，因为我是你的神。我必坚固你，我必帮助你；我必用我公义的右手扶持你。' },
  { ref: '诗篇 42:5', text: '我的心哪，你为何忧闷？为何在我里面烦躁？应当仰望神，因他笑脸帮助我；我还要称赞他。' },
  { ref: '马太福音 11:28', text: '凡劳苦担重担的人可以到我这里来，我就使你们得安息。' },
  { ref: '彼得前书 5:7', text: '你们要将一切的忧虑卸给神，因为他顾念你们。' },
  { ref: '诗篇 62:8', text: '你们众民当时时倚靠他，在他面前倾心吐意；神是我们的避难所。' },
];
// 很难受、有伤害自己的念头时：马上找人
export const HOTLINES = [
  { name: '全国心理援助热线', phone: '12356' },
  { name: '希望 24 热线（24 小时）', phone: '4001619995', show: '400-161-9995' },
  { name: '急救', phone: '120' },
];

// ---------- 我是这样的人（形象方向的认同） ----------
// 第一人称、现在时。按方向给默认的几句，用户可以改成自己的话。
export const IDENTITY = {
  refined: ['我是一个对自己用心的人。', '我的东西不多，但每一样都是认真挑过的。', '我干净、整齐，从指甲到鞋边。', '我值得被好好对待，所以我先好好对待自己。', '精致不是花很多钱，是每个细节都不将就。'],
  bookish: ['我说话轻，做事稳。', '我身上的书卷气，是因为我真的在读书、在思考。', '我温柔，但不软弱。', '我慢慢来，也一直在往前走。'],
  clean: ['我清清爽爽，让人愿意靠近。', '我的东西少而好。'],
  crisp: ['我站得直，做事利落。', '我说到做到。'],
  all: ['我说真话，温柔但清楚。', '我的需要和别人的一样重要。', '我每天都在变成我想成为的样子。'],
};
// 每天一条小讲究（通用的生活常识）
export const REFINED_TIPS = [
  '衬衫的领口和袖口最先显旧：洗之前先用洗衣液搓一下这两处。',
  '鞋边脏了当天就用湿纸巾擦，比攒一周好擦得多。',
  '剪完指甲用锉刀把边磨一下，摸起来不刮手。',
  '毛衣起球用剃毛球器，别用手揪。',
  '香水在手腕或者耳后喷一下就够了。别人凑近才闻到，刚刚好。',
  '桌面上只留正在用的东西，整个人看起来都会安静下来。',
  '吃饭不出声，筷子不在盘子里翻，这是最基本的讲究。',
  '说话前停半秒，语速放慢一点，人会显得从容。',
  '坐着的时候背靠椅背、双脚放平，比刻意挺胸更自然。',
  '头发勤修一点，一直都整齐，比隔很久剪一次好。',
  '嘴唇干了就涂润唇膏，起皮了不要撕。',
  '眼镜每天用眼镜布擦一次，镜片亮了人就精神。',
  '全身的颜色不超过三种，最不容易出错。',
  '包里常备纸巾、润唇膏和一把小梳子。',
  '读书时手边放一支笔，把喜欢的句子划下来。',
  '字写慢一点，就好看一点。',
  '回消息不用急，想好了再回。',
  '收到东西说谢谢，别人帮了忙也说谢谢。',
  '一个人吃饭也好好吃：坐下来，慢慢吃。',
  '早上把床铺平，房间立刻整齐一半。',
  '洗完澡擦干后马上涂身体乳，最好吸收。',
  '手机屏幕擦干净，手机壳旧了就换一个。',
  '穿深色衣服出门前用粘毛器滚一遍。',
  '鞋子轮换着穿，每双都能穿得更久。',
  '白衬衫配米色、藏青，最有书卷气。',
  '少说「随便」，多说「我喜欢……」。讲究，是从知道自己喜欢什么开始的。',
  '好东西买一件，比普通的买三件更让人开心。',
  '出门前照一次镜子：领子、头发、牙缝。',
  '走路时步子小一点、稳一点，不拖鞋跟。',
  '用一支顺手的好笔写计划，写的时候会更认真。',
  '衣服买回来先看洗标，照着洗能穿很久。',
  '房间里有一点干净的味道，比如晒过的被子、洗衣液的香味，就很舒服。',
  '别人说话时看着对方，等他说完再开口。',
  '指甲缝、耳后、后颈，这些自己看不到的地方，别人看得到。',
];

// ---------- 活出自己：散在各页角落的一句话 ----------
// 用户想摆脱唯唯诺诺、老好人，活成一个清晰的人。标准放在「真的、对的、我在乎的」，不放在别人的脸色上。
export const SELF_LINES = [
  { text: '好好生活，自有收获。' },
  { text: '慢慢来，也是在往前走。' },
  { text: '简单一点，就很好。' },
  { text: '认真吃饭，好好睡觉。' },
  { text: '喜欢的东西，少而好。' },
  { text: '安静地，做好一件小事。' },
  { text: '温柔一点，也清楚一点。' },
  { text: '按自己的节奏来。' },
  { text: '平常的日子，也值得好好过。' },
  { text: '少一点勉强，多一点自在。' },
  { text: '想好了，再开口。' },
  { text: '做不完也没关系，明天还在。' },
  { text: '今天也辛苦了。' },
  { text: '一杯温水，一页书。' },
  { text: '干净的房间，安静的心。' },
  { text: '留一点时间，给自己。' },
  { text: '不必讨好谁，做自己就好。' },
  { text: '可以说好，也可以说不。' },
  { text: '心里舒服，比面子要紧。' },
  { text: '不比别人，只看昨天的自己。' },
  { text: '好的习惯，会慢慢长成你的样子。' },
  { text: '照顾好自己，是最要紧的事。' },
  { text: '你本来的样子，就很好。' },
  { text: '不着急，也不停下。' },
  { text: '把日子，过得干干净净。' },
  { text: '晒过的被子，有太阳的味道。' },
  { text: '早一点睡，明天会更轻。' },
  { text: '好东西，值得慢慢用。' },
  { text: '说真话，轻轻地说。' },
  { text: '累了，就歇一歇。' },
  { text: '走一走，风会把心事吹轻。' },
  { text: '小小的讲究，是给自己的礼物。' },
  { text: '一点一点，就好。' },
  { text: '不用急着回答，想好再说。' },
  { text: '今天的你，也很好。' },
  { text: '你们要休息，要知道我是神。', ref: '诗篇 46:10' },
  { text: '凡劳苦担重担的人可以到我这里来，我就使你们得安息。', ref: '马太福音 11:28' },
  { text: '我必安然躺下睡觉，因为独有你—耶和华使我安然居住。', ref: '诗篇 4:8' },
  { text: '只要以里面存着长久温柔、安静的心为妆饰；这在神面前是极宝贵的。', ref: '彼得前书 3:4' },
  { text: '你们的话，是，就说是；不是，就说不是。', ref: '马太福音 5:37（节选）' },
];
