import { describe, expect, test } from 'bun:test';

import { applyToData, revertData } from '#/adapter/data';
import * as catalog from '#/core/catalog';
import { setLocale } from '#/core/locale';
import {
  clearMissingTranslations,
  missingTranslations,
  trUI,
} from '#/core/translate';

describe('data', () => {
  test('遍历时跳过音乐列表的 name（曲名不翻译）', () => {
    catalog.registerLocales([{ id: 'test-data', label: '测试' }]);
    catalog.mergeMap('test-data', { 曲名: '曲名译', 普通文本: '普通译文' });
    setLocale('test-data');

    const target = {
      music: [{ name: '曲名', cap: '共通背景' }],
      text: '普通文本',
    };
    applyToData(target);

    expect((target.music[0] as { name: string }).name).toBe('曲名');
    expect(target.text).toBe('普通译文');

    revertData();
    setLocale('ja');
  });

  test('同一对象重复套用不会二次翻译', () => {
    catalog.registerLocales([{ id: 'test-data-twice', label: '测试' }]);
    catalog.mergeMap('test-data-twice', { 設定: '本日', 本日: '今天' });
    setLocale('test-data-twice');

    const target = { text: '設定' };
    applyToData(target);
    expect(target.text).toBe('本日');

    applyToData(target);
    expect(target.text).toBe('本日');

    revertData();
    expect(target.text).toBe('設定');
    setLocale('ja');
  });

  test('数据译文在 DOM 里切回原文时还原成日文', () => {
    catalog.registerLocales([{ id: 'test-data-restore', label: '测试' }]);
    catalog.mergeMap('test-data-restore', {
      'ギルドの依頼を選びます。': '请选择公会委托。',
    });
    setLocale('test-data-restore');

    const target = { note: 'ギルドの依頼を選びます。' };
    applyToData(target);
    expect(target.note).toBe('请选择公会委托。');

    // 游戏从已翻译的数据渲染 DOM；切回日文时节点里留下的仍是中文。
    const rendered = target.note;
    setLocale('ja');
    expect(trUI(rendered)).toBe('ギルドの依頼を選びます。');

    revertData();
    setLocale('ja');
  });

  test('数据模板填值后切回原文仍能还原', () => {
    catalog.registerLocales([{ id: 'test-data-template', label: '测试' }]);
    catalog.mergeMap('test-data-template', {
      'ダンジョン調査 / 体力 -{cost} / 1区画 {reward}G{boostText}':
        '迷宫调查 / 体力 -{cost} / 1区格 {reward}G{boostText}',
    });
    setLocale('test-data-template');

    const target = {
      line: 'ダンジョン調査 / 体力 -{cost} / 1区画 {reward}G{boostText}',
    };
    applyToData(target);
    expect(target.line).toBe(
      '迷宫调查 / 体力 -{cost} / 1区格 {reward}G{boostText}',
    );

    const rendered = target.line
      .replaceAll('{cost}', '20')
      .replaceAll('{reward}', '15')
      .replaceAll('{boostText}', ' / 仕事量x2');
    setLocale('ja');
    expect(trUI(rendered)).toBe(
      'ダンジョン調査 / 体力 -20 / 1区画 15G / 仕事量x2',
    );

    revertData();
    setLocale('ja');
  });

  test('数据模板按具体程度优先反查', () => {
    catalog.registerLocales([{ id: 'test-data-specific', label: '测试' }]);
    catalog.mergeMap('test-data-specific', {
      '使用すると{1}を{0}': '使用后可使{1}{0}',
      '使用すると{1}を{0}段階': '使用后可使{1}提升{0}阶段',
    });
    setLocale('test-data-specific');

    const target = {
      broad: '使用すると{1}を{0}',
      specific: '使用すると{1}を{0}段階',
    };
    applyToData(target);
    const rendered = target.specific
      .replaceAll('{1}', '艾玛')
      .replaceAll('{0}', '3');

    setLocale('ja');
    expect(trUI(rendered)).toBe('使用すると艾玛を3段階');

    revertData();
    setLocale('ja');
  });

  test('相邻占位按数值边界还原', () => {
    catalog.registerLocales([{ id: 'test-data-adjacent', label: '测试' }]);
    catalog.mergeMap('test-data-adjacent', {
      '対面中に使用すると{1}を{0}': '会面中使用可使{1}{0}',
      '対面中に使用すると{1}を{0}段階': '会面中使用可使{1}{0}阶段',
    });
    setLocale('test-data-adjacent');

    const target = {
      plain: '対面中に使用すると{1}を{0}',
      staged: '対面中に使用すると{1}を{0}段階',
    };
    applyToData(target);

    const plain = target.plain
      .replaceAll('{1}', '親密度')
      .replaceAll('{0}', '10');
    const staged = target.staged
      .replaceAll('{1}', 'エッチ慣れ段階')
      .replaceAll('{0}', '3');

    setLocale('ja');
    expect(trUI(plain)).toBe('対面中に使用すると親密度を10');
    expect(trUI(staged)).toBe('対面中に使用するとエッチ慣れ段階を3段階');

    revertData();
    setLocale('ja');
  });

  test('数据译文切到另一语言时按原文重新查表', () => {
    catalog.registerLocales([
      { id: 'test-data-other', label: '甲' },
      { id: 'test-data-other2', label: '乙' },
    ]);
    catalog.mergeMap('test-data-other', { 設定: '设置' });
    catalog.mergeMap('test-data-other2', { 設定: '設定（乙）' });
    setLocale('test-data-other');

    const target = { label: '設定' };
    applyToData(target);
    expect(target.label).toBe('设置');

    const rendered = target.label;
    setLocale('test-data-other2');
    expect(trUI(rendered)).toBe('設定（乙）');

    revertData();
    setLocale('ja');
  });

  test('数据层未命中的日文也会记录', () => {
    catalog.registerLocales([{ id: 'test-data-missing', label: '测试' }]);
    setLocale('test-data-missing');
    clearMissingTranslations();

    const target = { text: '未登録' };
    applyToData(target);

    expect(target.text).toBe('未登録');
    expect(missingTranslations()).toContain('未登録');

    clearMissingTranslations();
    revertData();
    setLocale('ja');
  });

  test('只读属性不会被替换', () => {
    catalog.registerLocales([{ id: 'test-data-readonly', label: '测试' }]);
    catalog.mergeMap('test-data-readonly', { 設定: '设置' });
    setLocale('test-data-readonly');

    const target: Record<string, unknown> = {};
    Object.defineProperty(target, 'text', {
      value: '設定',
      enumerable: true,
      writable: false,
    });
    applyToData(target);

    expect(target.text).toBe('設定');

    revertData();
    setLocale('ja');
  });
});
