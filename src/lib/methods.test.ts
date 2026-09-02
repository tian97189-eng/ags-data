import { beforeEach, describe, it, expect } from 'vitest';
import { db } from '../db/schema';
import {
  DEFAULT_METHODS,
  seedMethodsIfEmpty,
  countMedia,
  importStepImages,
} from './methods';
import type { MethodDoc } from '../db/schema';

async function clearAll() {
  for (const table of db.tables) await table.clear();
}

function blankFile(name = 'a.jpg'): File {
  return new File(['x'], name, { type: 'image/jpeg' });
}

describe('methods lib', () => {
  beforeEach(clearAll);

  it('预置 11 个常用实验方法（步骤文字已整理）', () => {
    expect(DEFAULT_METHODS).toHaveLength(11);
    const names = DEFAULT_METHODS.map((m) => m.name);
    expect(names).toContain('氨氮测定');
    expect(names).toContain('污泥浓度');
    expect(names).toContain('SBR 污泥筛粒径');
    expect(names).toContain('SEM 制样');
    expect(names).toContain('离子色谱使用');
    // 每个方法都有非空步骤（骨架文字已整理好）
    for (const m of DEFAULT_METHODS) {
      expect(m.steps.length).toBeGreaterThan(0);
    }
  });

  it('seedMethodsIfEmpty 只在空库时写入 11 条', async () => {
    const n = await seedMethodsIfEmpty();
    expect(n).toBe(11);
    expect(await db.methodDocs.count()).toBe(11);
    // 再调一次不重复
    const n2 = await seedMethodsIfEmpty();
    expect(n2).toBe(11);
    expect(await db.methodDocs.count()).toBe(11);
  });

  it('countMedia 统计步骤配图与附件数', () => {
    const doc: MethodDoc = {
      name: 'x',
      method: '',
      category: '水质指标',
      scope: '',
      reagents: [],
      instruments: [],
      steps: [
        { text: 's1' },
        { text: 's2', image: 'data:image/jpeg;base64,aaa' },
      ],
      warnings: [],
      attachments: [
        { name: 'a.jpg', kind: 'image', data: 'data:image/jpeg;base64,bb' },
        { name: 'b.pdf', kind: 'pdf', data: 'data:application/pdf;base64,cc' },
      ],
      createdAt: '',
      updatedAt: '',
    };
    expect(countMedia(doc)).toEqual({ stepImages: 1, images: 1, pdfs: 1 });
  });

  it('批量导入配图：按顺序挂到没配图的步骤，跳过已配步骤', async () => {
    const doc: MethodDoc = {
      name: 'x',
      method: '',
      category: '',
      scope: '',
      reagents: [],
      instruments: [],
      steps: [
        { text: 's1' },
        { text: 's2', image: 'data:image/jpeg;base64,existing' },
        { text: 's3' },
        { text: 's4' },
      ],
      warnings: [],
      attachments: [],
      createdAt: '',
      updatedAt: '',
    };
    // 第 1 张 → s1（空），第 2 张 → 跳过 s2（已有图）→ s3，第 3 张 → s4，第 4 张 → 无空位 skipped
    const r = await importStepImages(doc, [blankFile('1.jpg'), blankFile('2.jpg'), blankFile('3.jpg'), blankFile('4.jpg')], async () => 'data:image/jpeg;base64,new');
    expect(r).toEqual({ ok: 3, failed: 0, skipped: 1 });
    expect(doc.steps[0].image).toBe('data:image/jpeg;base64,new');
    expect(doc.steps[1].image).toBe('data:image/jpeg;base64,existing'); // 不被覆盖
    expect(doc.steps[2].image).toBe('data:image/jpeg;base64,new');
    expect(doc.steps[3].image).toBe('data:image/jpeg;base64,new');
  });

  it('批量导入：压缩失败的文件计入 failed 且不占步骤', async () => {
    const doc: MethodDoc = {
      name: 'x',
      method: '',
      category: '',
      scope: '',
      reagents: [],
      instruments: [],
      steps: [{ text: 's1' }, { text: 's2' }],
      warnings: [],
      attachments: [],
      createdAt: '',
      updatedAt: '',
    };
    const r = await importStepImages(
      doc,
      [blankFile('bad.jpg'), blankFile('good.jpg')],
      async (f) => (f.name.startsWith('bad') ? null : 'data:image/jpeg;base64,ok'),
    );
    expect(r).toEqual({ ok: 1, failed: 1, skipped: 0 });
    // 坏文件不占位 → 好图挂到第 1 步
    expect(doc.steps[0].image).toBe('data:image/jpeg;base64,ok');
    expect(doc.steps[1].image).toBeUndefined();
  });
});
