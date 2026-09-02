import type { MethodDoc } from '../db/schema';
import { db } from '../db/schema';

/**
 * 实验方法库（SOP 手册）核心逻辑：
 * - 11 个预置骨架（步骤文字已整理好，图片留空待用户批量导入）
 * - 图片压缩（canvas 压到 ~1600px，JPEG 0.82）
 * - 批量导入配图（按选择顺序依次挂到步骤）
 */

/** 预置 11 个实验方法（文字来自用户提供的实验记录） */
export const DEFAULT_METHODS: MethodDoc[] = [
  {
    name: '氨氮测定',
    method: '纳氏试剂法 420nm',
    category: '水质指标',
    scope: '进水 / 出水水样；空白 1、进水 1、出水 1',
    reagents: [
      { name: '酒石酸钾钠', conc: '10%', dose: '500 μL', note: '掩蔽 Ca/Mg' },
      { name: '纳氏试剂', conc: '市售', dose: '500 μL', note: '显色剂' },
    ],
    instruments: ['分光光度计（420 nm）', '比色管 / 比色皿'],
    steps: [
      { text: '取水样（进 2 mL / 出 15 mL），空白 1、进水 1、出水 1 各一管', reagentRefs: [] },
      { text: '加 500 μL 酒石酸钾钠，摇匀', reagentRefs: [0] },
      { text: '加 500 μL 纳氏试剂，摇匀', reagentRefs: [1] },
      { text: '静置显色后，420 nm 处测吸光度', reagentRefs: [] },
    ],
    warnings: ['碘不用空白', '纳氏试剂避光保存'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: '亚硝态氮测定',
    method: '显色法 540nm',
    category: '水质指标',
    scope: '进水 / 出水水样；空白 1、进水 1、出水 1',
    reagents: [{ name: '显色剂', conc: '市售', dose: '500 μL', note: '' }],
    instruments: ['分光光度计（540 nm）'],
    steps: [
      { text: '取水样（进 5 mL / 出 5 mL），空白 1、进水 1、出水 1 各一管', reagentRefs: [] },
      { text: '加 500 μL 显色剂，摇匀', reagentRefs: [0] },
      { text: '显色后 540 nm 处测吸光度', reagentRefs: [] },
    ],
    warnings: ['碘不用空白'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: '硝态氮测定',
    method: '盐酸 + 安吉磺酸',
    category: '水质指标',
    scope: '进水 / 出水水样；空白 1、进水 1、出水 1',
    reagents: [
      { name: '盐酸', conc: '1 mol/L', dose: '500 μL', note: '' },
      { name: '安吉磺酸', conc: '', dose: '50 μL', note: '' },
    ],
    instruments: ['分光光度计'],
    steps: [
      { text: '取水样（进 25 mL / 出 10 mL），空白 1、进水 1、出水 1 各一管', reagentRefs: [] },
      { text: '加 1 mol/L 盐酸 500 μL', reagentRefs: [0] },
      { text: '加安吉磺酸 50 μL', reagentRefs: [1] },
      { text: '测吸光度（进水一般在 0.25 几）', reagentRefs: [] },
    ],
    warnings: [],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: '总磷测定',
    method: '钼酸铵分光法 700nm',
    category: '水质指标',
    scope: '进水 / 出水水样',
    reagents: [
      { name: '过硫酸盐', conc: '', dose: '400 μL', note: '' },
      { name: '抗坏血酸', conc: '', dose: '200 μL', note: '' },
    ],
    instruments: ['分光光度计（700 nm）', '25 mL 比色管', 'COD 消解管'],
    steps: [
      { text: '取水样（进 2 mL / 出 5 mL）在 25 mL 管中定容', reagentRefs: [] },
      { text: '加 5 mL 到 COD 消解管', reagentRefs: [] },
      { text: '加 400 μL 过硫酸盐', reagentRefs: [0] },
      { text: '加 200 μL 抗坏血酸', reagentRefs: [1] },
      { text: '反应 15 min（提前 5 分钟去开仪器，拧第一个管时开始计时）', reagentRefs: [] },
      { text: '单波长 700 nm 测量，调 0', reagentRefs: [] },
    ],
    warnings: ['用 COD 消解管时要两个空白'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: 'COD 测定',
    method: '消解比色法',
    category: '水质指标',
    scope: '进水 / 出水水样（进水不过滤）',
    reagents: [
      { name: 'D 试剂', conc: '', dose: '约 0.7 mL', note: '消解液' },
      { name: 'E 试剂', conc: '', dose: '4.8 mL', note: '消解液（用可吸硫酸氢的）' },
    ],
    instruments: ['COD 消解仪', 'COD 消解管'],
    steps: [
      { text: '加 2.5 mL 水样（进水不过滤）', reagentRefs: [] },
      { text: '加约 0.7 mL D 试剂、4.8 mL E 试剂', reagentRefs: [0, 1] },
      { text: '消解 10 min', reagentRefs: [] },
      { text: '加热，水冷却', reagentRefs: [] },
      { text: '测量（调 0）', reagentRefs: [] },
    ],
    warnings: ['COD 消解管时要两个空白'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: '总氮 TN 测定',
    method: '碱性过硫酸钾-紫外法',
    category: '水质指标',
    scope: '进水 / 出水水样',
    reagents: [
      { name: '碱性过硫酸钾溶液', conc: '', dose: '0.5 mL', note: '消解氧化剂' },
      { name: '盐酸', conc: '1+9', dose: '1 mL', note: '' },
    ],
    instruments: ['25 mL 比色管', '高压灭菌锅（120~124°C / 0.1 MPa）', '紫外分光光度计（220/275 nm）'],
    steps: [
      { text: '取 25 mL 比色管，加 1 mL 水样，纯水定容至 10 mL 刻度线', reagentRefs: [] },
      { text: '加 0.5 mL 碱性过硫酸钾溶液，瓶塞紧塞（用纱布裹住瓶盖），写标签', reagentRefs: [0] },
      { text: '放入高压灭菌锅消解：120~124°C（122°C）、0.1 MPa，持续 30 min', reagentRefs: [] },
      { text: '冷却至室温，压力表降到 0，打开排气阀', reagentRefs: [] },
      { text: '加 1 mL (1+9) 盐酸，定容至 25 mL', reagentRefs: [1] },
      { text: '紫外 220/275 nm 测（按纳氮测）', reagentRefs: [] },
    ],
    warnings: ['高压灭菌锅注意安全，压力归零后才开排气阀'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: 'EPS 提取',
    method: '加热 + 离心法',
    category: '污泥性状',
    scope: '缺氧段污泥（需平行样）',
    reagents: [
      { name: 'NaCl 溶液', conc: '0.05%', dose: '10 mL', note: '提取液（现配现用）' },
      { name: 'NaOH 溶液', conc: '8 g/L', dose: '100 mL', note: '约 0.1 g NaOH + 100 mL 水' },
      { name: '硫酸', conc: '浓', dose: '', note: '去危化品实验室取，钥匙在放滤纸的抽屉，取药需登记' },
    ],
    instruments: ['离心机', '加热/水浴锅（set 调温、run 运行）', '冰水浴（去马老师那边冰箱取冰，用剪刀取冰）'],
    steps: [
      { text: '缺氧段取平行样（用图示离心管），上清液抽取后过滤', reagentRefs: [] },
      { text: '加热 NaCl 控温：按 set 调整温度，run 运行（出现时钟图标=正常运行）', reagentRefs: [0] },
      { text: '配药（现配现用）：提取污泥 10 g/L 需约 0.5 mL，0.5%（0.05 g/10 mL）；配 2 就行', reagentRefs: [1] },
      { text: '先把药对称放进去，空余处用水管充满', reagentRefs: [] },
      { text: '拧上盖子，打开开关，盖上盖', reagentRefs: [] },
      { text: '设转速和时间 → enter → start，达速后离开', reagentRefs: [] },
      { text: '结束时按 stop → 打开盖子 → 关闭开关 → 取出样', reagentRefs: [] },
    ],
    warnings: ['冰水浴用剪刀取冰，不徒手', '取硫酸需登记'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: '污泥浓度',
    method: 'MLSS / MLVSS 烘干灼烧',
    category: '污泥性状',
    scope: '各反应器（每反应器 3 个平行）',
    reagents: [],
    instruments: ['定量滤纸', '干燥器', '电子天平', '坩埚', '抽滤装置', '马弗炉（600°C）', '烘箱（105°C）'],
    steps: [
      { text: '定量滤纸编号（每反应器 3 个），105°C 烘干一夜', reagentRefs: [] },
      { text: '取出放入干燥器冷却 30 min 左右', reagentRefs: [] },
      { text: '坩埚+滤纸一起，电子天平称 M1（V=15 mL）', reagentRefs: [] },
      { text: '抽滤：过滤完 V 后加蒸馏水洗坩埚除杂过滤', reagentRefs: [] },
      { text: '抽坩埚放置到干锅 2~20 min 以上，干燥器内冷却称 M2（滤纸+泥）', reagentRefs: [] },
      { text: '坩埚放入马弗炉 600°C × 5 h，取出称 M4（灼烧残渣）', reagentRefs: [] },
      { text: '计算：MLSS=(M2-M1)/V；MLVSS=(M2+M3-M4)/V', reagentRefs: [] },
    ],
    warnings: ['马弗炉设定：按←箭头看墙上温度表，每设定一次温度按最左边按钮，升温时间 30 min，最后停留末界面，长按↓启动'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: 'SEM 制样',
    method: '戊二醛固定-脱水-置换-干燥',
    category: '表征',
    scope: '缺氧段污泥',
    reagents: [
      { name: '戊二醛固定液', conc: '2.5%，pH 6.8', dose: '浸没样品', note: '4°C 冰箱 3 h' },
      { name: '磷酸盐缓冲液', conc: '0.1 M，pH 6.8', dose: '每次 10 min', note: '冲洗 3 次' },
      { name: '乙醇', conc: '30~90% 梯度 + 无水', dose: '每次 15 min', note: '脱水' },
      { name: '乙酸异戊酯', conc: '1:1 与无水乙醇', dose: '各 15 min', note: '置换' },
    ],
    instruments: ['离心机（6000 rpm）', '4°C 冰箱', '烘箱（60°C）', '瓷坩埚/小盒'],
    steps: [
      { text: '固定：离心 6000 rpm × 10 min 弃上清，蒸馏水清洗 3 次；加 2.5% 戊二醛（pH 6.8）浸没，4°C 冰箱 3 h', reagentRefs: [0] },
      { text: '冲洗：0.1 M 磷酸盐缓冲液（pH 6.8）洗 3 次，每次 10 min', reagentRefs: [1] },
      { text: '脱水：30/50/70/80/90% 乙醇各 15 min，无水乙醇 3 次 × 15 min', reagentRefs: [2] },
      { text: '置换：无水乙醇:乙酸异戊酯=1:1、纯乙酸异戊酯各 1 次 × 15 min', reagentRefs: [3] },
      { text: '干燥：倒入瓷坩埚/小盒，60°C 烘箱 8 h', reagentRefs: [] },
    ],
    warnings: ['微生物测序：10 mL 离心管取样标号、放密封袋、-8°C 冰箱保存'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: '离子色谱使用',
    method: '接气-开软件-进样',
    category: '仪器使用',
    scope: '阴离子测定',
    reagents: [],
    instruments: ['离子色谱仪', '氮气钢瓶', '电脑 + 软件', '样品容器'],
    steps: [
      { text: '连接氮气钢瓶（管路上方节后不连蓝色管）', reagentRefs: [] },
      { text: '接好电，打开电脑', reagentRefs: [] },
      { text: '启动阀组软件，看压力正常后进入操作界面', reagentRefs: [] },
      { text: '装好容器、托盘，吸滤液', reagentRefs: [] },
      { text: '接 JAI 软件处理（Revit 设备进样设置）', reagentRefs: [] },
      { text: '冲洗时调整管路（二元泵不开）', reagentRefs: [] },
      { text: '等 1.5A 左右', reagentRefs: [] },
      { text: '第一次 0.1 mg/L 进样，5S 倍率对样品', reagentRefs: [] },
      { text: '进样、清理', reagentRefs: [] },
    ],
    warnings: [],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
  {
    name: 'SBR 污泥筛粒径',
    method: '200-50μm 四级筛',
    category: '粒径',
    scope: '好氧段泥水混合物',
    reagents: [],
    instruments: ['筛网 200/150/100/50 μm（马老师那边）', '烘箱（马老师那边）', '定量滤纸（7~8 个）', '两个大桶', '洗瓶', '量筒 50 mL', '坩埚'],
    steps: [
      { text: '前一晚：滤纸烘干 7~8 个，叠起来标数字放烘杯', reagentRefs: [] },
      { text: '取 50 mL 泥水混合物（好氧段）到量筒中', reagentRefs: [] },
      { text: '两大桶和筛子先洗一下', reagentRefs: [] },
      { text: '倒到 200 μm 筛子，用洗瓶（非纯水）冲，反冲冲到底部', reagentRefs: [] },
      { text: '冲下的倒到滤纸上（滤纸放漏斗锥形瓶上）', reagentRefs: [] },
      { text: '另一桶接住，桶里的倒到 150 μm 筛子，如此往复到 100、50', reagentRefs: [] },
      { text: '50 μm 段沉淀一晚，第二天倒掉上清液，直接倒到三个滤纸中过滤', reagentRefs: [] },
      { text: '过滤完滤纸放坩埚里，烘干一晚，冷却 20 min 立即称重', reagentRefs: [] },
    ],
    warnings: ['筛网、烘箱都在马老师那边', '50 μm 段沉淀一晚再继续'],
    attachments: [],
    createdAt: '',
    updatedAt: '',
  },
];

/** 生成带时间戳的预置方法 */
export async function seedMethodsIfEmpty(): Promise<number> {
  const n = await db.methodDocs.count();
  if (n > 0) return n;
  const now = new Date().toISOString();
  await db.methodDocs.bulkAdd(
    DEFAULT_METHODS.map((m) => ({ ...m, createdAt: now, updatedAt: now })),
  );
  return DEFAULT_METHODS.length;
}

/** 统计一个方法的配图/附件数（列表页角标用） */
export function countMedia(m: MethodDoc): { stepImages: number; images: number; pdfs: number } {
  const stepImages = m.steps.filter((s) => s.image).length;
  const images = m.attachments.filter((a) => a.kind === 'image').length;
  const pdfs = m.attachments.filter((a) => a.kind === 'pdf').length;
  return { stepImages, images, pdfs };
}

/**
 * 压缩图片为 base64 DataURL：
 * - 最长边压到 maxSize（默认 1600px，控体积）
 * - JPEG 0.82
 * 返回 Promise<string | null>（失败返回 null）
 */
export function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * 批量导入配图：把选中的图片文件按顺序依次挂到方法的步骤上
 * （第 1 张图 → 第 1 个还没配图的步骤）。返回 {ok, failed, skipped}。
 * compress 可注入（测试用）；默认用 compressImage。
 */
export async function importStepImages(
  method: MethodDoc,
  files: File[],
  compress: (f: File) => Promise<string | null> = compressImage,
): Promise<{ ok: number; failed: number; skipped: number }> {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  let stepIdx = 0;
  for (const f of files) {
    // 找下一个没配图的步骤
    while (stepIdx < method.steps.length && method.steps[stepIdx].image) stepIdx++;
    if (stepIdx >= method.steps.length) {
      skipped += files.length - ok - failed - skipped;
      break;
    }
    const data = await compress(f);
    if (!data) {
      failed++;
      continue;
    }
    method.steps[stepIdx] = { ...method.steps[stepIdx], image: data };
    ok++;
    stepIdx++;
  }
  return { ok, failed, skipped };
}
