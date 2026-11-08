/**
 * 香港常見中文姓名。姓同名分開，開局按病人性別抽一個，唔再用「伯／太／婆婆」。
 * 用 seed 同病人 id 決定，唔消耗遊戲 RNG，所以唔會打亂其他隨機序列。
 */
import { hashString } from '../core/rng';

export const HK_SURNAMES = [
  '陳',
  '李',
  '張',
  '黃',
  '林',
  '劉',
  '吳',
  '王',
  '梁',
  '何',
  '周',
  '鄭',
  '謝',
  '蔡',
  '楊',
  '許',
  '馬',
  '朱',
  '胡',
  '徐',
  '孫',
  '高',
  '羅',
  '郭',
  '曾',
  '蕭',
  '葉',
  '潘',
  '馮',
  '鄧',
  '曹',
  '袁',
  '彭',
  '余',
  '盧',
  '丁',
  '沈',
  '蘇',
  '呂',
  '姚',
] as const;

export const HK_GIVEN_MALE = [
  '大文',
  '志明',
  '家豪',
  '俊傑',
  '子軒',
  '嘉豪',
  '偉強',
  '國強',
  '志偉',
  '建華',
  '家明',
  '俊豪',
  '浩然',
  '梓軒',
  '博文',
  '子謙',
  '嘉俊',
  '啟明',
  '永強',
  '文傑',
] as const;

export const HK_GIVEN_FEMALE = [
  '美玲',
  '嘉欣',
  '詠詩',
  '曉彤',
  '慧敏',
  '淑芬',
  '麗華',
  '秀英',
  '雅婷',
  '欣怡',
  '詩涵',
  '可欣',
  '婉婷',
  '慧琳',
  '家琪',
  '詠琳',
  '曉雯',
  '雅文',
  '秀娟',
  '麗娟',
] as const;

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error('姓名表索引超出範圍');
  return value;
}

export function pickHkName(
  seed: string,
  patientId: string,
  sex: 'M' | 'F',
  used: ReadonlySet<string>,
): string {
  const given = sex === 'M' ? HK_GIVEN_MALE : HK_GIVEN_FEMALE;
  const span = HK_SURNAMES.length * given.length;
  const start = hashString(`${seed}\u0000hk-name\u0000${patientId}`) % span;
  for (let step = 0; step < span; step += 1) {
    const index = (start + step) % span;
    const name =
      at(HK_SURNAMES, index % HK_SURNAMES.length) +
      at(given, Math.floor(index / HK_SURNAMES.length));
    if (!used.has(name)) return name;
  }
  return at(HK_SURNAMES, start % HK_SURNAMES.length) + at(given, 0);
}
