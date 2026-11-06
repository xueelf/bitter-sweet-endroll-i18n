import { afterAll, describe, expect, test } from 'bun:test';

import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';
import {
  clearMissingTranslations,
  missingTranslations,
  trHTML,
  trUI,
} from '#/core/translate';

describe('translate', () => {
  test('体力提示按纯文本模板翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-toast-text',
        label: '测试',
        templates: [
          { from: '体力を ${n} 消費しました', to: '消耗了 ${a} 点体力' },
          {
            from: '残り体力を ${n} 消費しました',
            to: '消耗了剩余 ${a} 点体力',
          },
          { from: '体力が ${n} 回復しました', to: '体力恢复了 ${a} 点' },
        ],
      },
    ]);
    setLocale('test-toast-text');

    expect(trUI('体力を 20 消費しました')).toBe('消耗了 20 点体力');
    expect(trUI('残り体力を 20 消費しました')).toBe('消耗了剩余 20 点体力');
    expect(trUI('体力が 20 回復しました')).toBe('体力恢复了 20 点');
  });

  test('体力提示按带 <b> 的 HTML 模板翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-toast-html',
        label: '测试',
        templates: [
          {
            from: '体力を <b>${n}</b> 消費しました',
            to: '消耗了 <b>${a}</b> 点体力',
          },
          {
            from: '残り体力を <b>${n}</b> 消費しました',
            to: '消耗了剩余 <b>${a}</b> 点体力',
          },
          {
            from: '体力が <b>${n}</b> 回復しました',
            to: '体力恢复了 <b>${a}</b> 点',
          },
        ],
      },
    ]);
    setLocale('test-toast-html');

    expect(trHTML('体力を <b>20</b> 消費しました')).toBe(
      '消耗了 <b>20</b> 点体力',
    );
    expect(trHTML('残り体力を <b>20</b> 消費しました')).toBe(
      '消耗了剩余 <b>20</b> 点体力',
    );
    expect(trHTML('体力が <b>20</b> 回復しました')).toBe(
      '体力恢复了 <b>20</b> 点',
    );
  });

  test('后注册词条会让片段缓存失效', () => {
    catalog.registerLocales([{ id: 'test-fragment-cache', label: '测试' }]);
    catalog.mergeMap('test-fragment-cache', { ABC: '甲' });
    setLocale('test-fragment-cache');

    expect(trUI('XYABC')).toBe('XY甲');

    catalog.mergeMap('test-fragment-cache', { XY: '乙' });
    expect(trUI('XYABC')).toBe('乙甲');
  });

  test('含平假名的句子不拿词典短词做自动片段替换', () => {
    catalog.registerLocales([
      {
        id: 'test-fragment-guard',
        label: '测试',
        fragments: { 手動で: '手动地' },
      },
    ]);
    catalog.mergeMap('test-fragment-guard', {
      体力: '体力',
      消費しました: '消耗了',
      未読: '未读',
    });
    setLocale('test-fragment-guard');

    expect(trUI('体力を20消費しました')).toBe('体力を20消費しました');
    expect(trUI('未読')).toBe('未读');
    expect(trUI('未読設定')).toBe('未読設定');
    expect(trUI('手動で')).toBe('手动地');
  });

  test('手工片段能补全含平假名的 UI 标签', () => {
    catalog.registerLocales([
      {
        id: 'test-fragment-ui',
        label: '测试',
        fragments: {
          体力: '体力',
          報酬: '报酬',
          上限なし: '无上限',
          鉱石キャッチ: '矿石捕捉',
          獲得G: '获得G',
        },
      },
    ]);
    setLocale('test-fragment-ui');

    expect(trUI('鉱石キャッチ / 体力 -20 / 報酬 上限なし')).toBe(
      '矿石捕捉 / 体力 -20 / 报酬 无上限',
    );
    expect(trUI('獲得G x1.5')).toBe('获得G x1.5');
  });

  test('商店道具说明里的目标名也会翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-shop-desc',
        label: '测试',
        templates: [
          {
            from: '对谈中使用可使${target}${value}阶段',
            to: '对谈中使用可使${target}${value}阶段',
          },
          {
            from: '对谈中使用可使${target}${value}',
            to: '对谈中使用可使${target}${value}',
          },
          {
            from: '使用后可使${target}获得的金币 x${value}',
            to: '使用后可使${target}获得的金币 x${value}',
          },
          {
            from: '使用后${target} x${value}',
            to: '使用后${target} x${value}',
          },
        ],
      },
    ]);
    catalog.mergeMap('test-shop-desc', {
      ふれあい: '亲密',
      親密度: '亲密度',
      エッチ慣れ段階: '亲热熟练阶段',
      次の雑用: '下一次杂务',
      本日の雑用の仕事量と体力消費: '今天杂务的工作量与体力消耗',
      本日の雑用の仕事量と体力消费: '今天杂务的工作量与体力消耗',
    });
    setLocale('test-shop-desc');

    expect(trUI('对谈中使用可使ふれあい+30')).toBe('对谈中使用可使亲密+30');
    expect(trUI('对谈中使用可使エッチ慣れ段階+1阶段')).toBe(
      '对谈中使用可使亲热熟练阶段+1阶段',
    );
    expect(trUI('使用后可使次の雑用获得的金币 x2')).toBe(
      '使用后可使下一次杂务获得的金币 x2',
    );
    expect(trUI('使用后本日の雑用の仕事量と体力消费 x3')).toBe(
      '使用后今天杂务的工作量与体力消耗 x3',
    );
  });

  test('商店进度解锁条件能翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-shop-unlock',
        label: '测试',
        templates: [
          {
            from: '${a}と${b}のストーリー進捗率${pct}%で解放',
            to: '${a}和${b}的故事进度达到${pct}%后解锁',
          },
          {
            from: '${name}のストーリー進捗率${pct}%で解放',
            to: '${name}的故事进度达到${pct}%后解锁',
          },
        ],
      },
    ]);
    setLocale('test-shop-unlock');

    expect(trUI('梅尔维のストーリー進捗率100%で解放')).toBe(
      '梅尔维的故事进度达到100%后解锁',
    );
    expect(trUI('艾玛と梅尔维のストーリー進捗率40%で解放')).toBe(
      '艾玛和梅尔维的故事进度达到40%后解锁',
    );
  });

  test('踏破记录奖励模板能翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-explore-bonus',
        label: '测试',
        templates: [
          {
            from: '踏破記録ボーナス：${cells}マス × ${rate}G = +${applied}G',
            to: '踏破记录奖励：${cells}格 × ${rate}G = +${applied}G',
          },
          {
            from: '踏破記録ボーナス：${cells}マス × ${rate}G × 50% = +${applied}G',
            to: '踏破记录奖励：${cells}格 × ${rate}G × 50% = +${applied}G',
          },
        ],
      },
    ]);
    setLocale('test-explore-bonus');

    expect(trUI('踏破記録ボーナス：202マス × 5G × 50% = +505G')).toBe(
      '踏破记录奖励：202格 × 5G × 50% = +505G',
    );
  });

  test('住所休息说明的 <b> 体力值模板能翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-rest-html',
        label: '测试',
        templates: [
          {
            from: '翌朝まで眠る ／ 体力 <b>+${n}</b>',
            to: '睡到第二天早上 ／ 体力 <b>+${n}</b>',
          },
        ],
      },
    ]);
    setLocale('test-rest-html');

    expect(trHTML('翌朝まで眠る ／ 体力 <b>+125</b>')).toBe(
      '睡到第二天早上 ／ 体力 <b>+125</b>',
    );
  });

  test('角色名 + 亲密度槽用模板翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-affinity-gauge',
        label: '测试',
        templates: [
          { from: '${name} 好感度 ${n}', to: '${name} 好感度 ${n}' },
          { from: '${name} 親密度 ${n}', to: '${name} 亲密度 ${n}' },
        ],
      },
    ]);
    setLocale('test-affinity-gauge');

    expect(trUI('艾玛 好感度 30')).toBe('艾玛 好感度 30');
    expect(trUI('艾玛 親密度 30')).toBe('艾玛 亲密度 30');
  });

  test('运行时槽位标签用 KV 短语翻译', () => {
    catalog.registerLocales([
      {
        id: 'test-runtime-gauge',
        label: '测试',
        fragments: { 逃走ゲージ: '逃跑槽' },
      },
    ]);
    setLocale('test-runtime-gauge');

    expect(trUI('逃走ゲージ')).toBe('逃跑槽');
  });

  test('运行期序号占位的数据模板能翻译填值后的串', () => {
    catalog.registerLocales([{ id: 'test-runtime-data', label: '测试' }]);
    catalog.mergeMap('test-runtime-data', {
      '{1}の固定報酬を永続的に +{0}': '使{1}的固定报酬永久 +{0}',
    });
    setLocale('test-runtime-data');

    expect(trUI('雑用の固定報酬を永続的に +5')).toBe('使雑用的固定报酬永久 +5');
  });

  test('模板译文里的字面美元符号原样保留', () => {
    catalog.registerLocales([{ id: 'test-template-dollar', label: '测试' }]);
    catalog.mergeMap('test-template-dollar', {
      '価格${n}': '价格 $${a}',
    });
    setLocale('test-template-dollar');

    expect(trUI('価格100')).toBe('价格 $100');
  });

  test('模板拆开完整短语时用 KV 短语补全', () => {
    catalog.registerLocales([
      {
        id: 'test-template-fragment',
        label: '测试',
        fragments: {
          鉱石キャッチ: '矿石捕捉',
          体力: '体力',
          報酬: '报酬',
          上限なし: '无上限',
        },
      },
    ]);
    catalog.mergeMap('test-template-fragment', {
      '鉱石キャッチ / 体力 -${cost} / 報酬 ${reward}${suffix}':
        '矿石捕捉 / 体力 -${a} / 报酬 ${b}${c}',
    });
    setLocale('test-template-fragment');

    expect(trUI('鉱石キャッチ / 体力 -20 / 報酬 上限なし')).toBe(
      '矿石捕捉 / 体力 -20 / 报酬 无上限',
    );
  });

  test('未命中的日文会记录，命中不会', () => {
    catalog.registerLocales([{ id: 'test-missing', label: '测试' }]);
    catalog.mergeMap('test-missing', { 設定: '设置' });
    setLocale('test-missing');
    clearMissingTranslations();

    expect(trUI('設定')).toBe('设置');
    expect(trUI('未登録')).toBe('未登録');
    expect(missingTranslations()).toContain('未登録');
    expect(missingTranslations()).not.toContain('設定');

    clearMissingTranslations();
  });

  test('模板占位里的日文值也会翻译', () => {
    catalog.registerLocales([{ id: 'test-capture', label: '测试' }]);
    catalog.mergeMap('test-capture', {
      '使用すると{1}を{0}段階': '使用后可使{1}提升{0}阶段',
      エッチ慣れ段階: '亲热熟练阶段',
    });
    setLocale('test-capture');

    expect(trUI('使用するとエッチ慣れ段階を3段階')).toBe(
      '使用后可使亲热熟练阶段提升3阶段',
    );
  });
});

afterAll(() => {
  setLocale('ja');
});
