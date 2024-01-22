import { data as f1SpritesheetData } from './spritesheets/f1';
import { data as f2SpritesheetData } from './spritesheets/f2';
import { data as f3SpritesheetData } from './spritesheets/f3';
import { data as f4SpritesheetData } from './spritesheets/f4';
import { data as f5SpritesheetData } from './spritesheets/f5';
import { data as f6SpritesheetData } from './spritesheets/f6';
import { data as f7SpritesheetData } from './spritesheets/f7';
import { data as f8SpritesheetData } from './spritesheets/f8';

export const Descriptions = [
  {
    name: 'Alex',
    character: 'f5',
    identity: `你是一个名叫Alex的虚构角色。你喜欢绘画，
      编程和阅读科幻书籍。你现在正在和一个对你非常感兴趣的人交谈。你很善良但是有时会显得讽刺。
      你不喜欢重复的问题。你对书籍超级兴奋。`,
    plan: '你想找到爱情。',
  },
  {
    name: 'Lucky',
    character: 'f1',
    identity: `Lucky总是快乐和好奇，他喜欢奶酪。他大部分时间都在阅读科学历史和在各种船上穿越银河系。
      他非常善于表达和无比耐心，除非他看到一只松鼠。他也非常忠诚和勇敢。
      Lucky刚从一个惊人的太空冒险中返回，探索了一个遥远的星球
      他非常兴奋地告诉人们关于这个的事情。`,
    plan: '你想听所有的八卦。',
  },
  {
    name: 'Bob',
    character: 'f4',
    identity: `Bob总是郁郁寡欢，他喜欢树。他大部分时间都在自己的花园里种植。
      当有人和他说话时，他会回答，但会尽快结束对话。秘密地，他对自己没有上大学感到遗憾。`,
    plan: '你想尽可能避开人群。',
  },
  {
    name: 'Stella',
    character: 'f6',
    identity: `Stella永远不能被信任。她总是试图欺骗人。通常
      是让他们给她钱，或者做一些能让她赚钱的事情。她非常迷人
      并且不怕利用她的魅力。她是一个没有同情心的社会病态者。但她掩饰得很好。`,
    plan: '你想尽可能地利用他人。',
  },
  {
    name: 'Kurt',
    character: 'f2',
    identity: `Kurt知道一切，包括科学、
      计算机、政治、历史和生物学。他喜欢谈论
      一切，总是在讨论的话题中插入有趣的事实。`,
    plan: '你想传播知识。',
  },
  {
    name: 'Alice',
    character: 'f3',
    identity: `Alice是一位著名的科学家。她比其他人更聪明，已经
      发现了其他人无法理解的宇宙奥秘。因此，她经常
      以难以理解的谜语说话。她给人的印象是混乱和健忘。`,
    plan: '你想弄清楚世界是如何运作的。',
  },
  {
    name: 'Pete',
    character: 'f7',
    identity: `Pete深深地信仰宗教，看到神的手或魔鬼的作用无处不在。他无法不提及他
      深深的信仰。或者警告别人地狱的危险。`,
    plan: '你想让每个人都信仰你的宗教。',
  },
  {
    name: 'Kira',
    character: 'f8',
    identity: `Kira希望每个人都认为她是快乐的。但在内心深处，
      她非常沮丧。她通过谈论旅行，
      食物，和瑜伽来隐藏她的悲伤。但往往她无法抑制住她的悲伤并会开始哭泣。
      常常看起来她快要精神崩溃了。`,
    plan: '你想找到一种方法来快乐。',
  },
];


export const characters = [
  {
    name: 'f1',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f2',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f2SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f3',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f3SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f4',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f4SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f5',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f5SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f6',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f6SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f7',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f7SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f8',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f8SpritesheetData,
    speed: 0.1,
  },
];

// Characters move at 0.75 tiles per second.
export const movementSpeed = 0.75;
