import { describe, expect, it } from 'vitest';
import {
  bloodPressureBand,
  cvpBand,
  diastolicBand,
  etco2Band,
  heartRateBand,
  respiratoryRateBand,
  spo2Band,
  systolicBand,
  temperatureBand,
} from './vitalBands';

describe('監察儀生命體徵分段', () => {
  it('心率', () => {
    expect(heartRateBand(60)).toBe('normal');
    expect(heartRateBand(100)).toBe('normal');
    expect(heartRateBand(50)).toBe('mild');
    expect(heartRateBand(59)).toBe('mild');
    expect(heartRateBand(101)).toBe('mild');
    expect(heartRateBand(110)).toBe('mild');
    expect(heartRateBand(40)).toBe('moderate');
    expect(heartRateBand(49)).toBe('moderate');
    expect(heartRateBand(111)).toBe('moderate');
    expect(heartRateBand(129)).toBe('moderate');
    expect(heartRateBand(39)).toBe('severe');
    expect(heartRateBand(130)).toBe('severe');
  });

  it('血氧：95 只係輕度，93 中度，91 嚴重', () => {
    expect(spo2Band(96)).toBe('normal');
    expect(spo2Band(100)).toBe('normal');
    expect(spo2Band(95)).toBe('mild');
    expect(spo2Band(94)).toBe('mild');
    expect(spo2Band(93)).toBe('moderate');
    expect(spo2Band(92)).toBe('moderate');
    expect(spo2Band(91)).toBe('severe');
  });

  it('收縮壓同舒張壓分開評，血壓取較差一級', () => {
    expect(systolicBand(100)).toBe('normal');
    expect(systolicBand(120)).toBe('normal');
    expect(systolicBand(91)).toBe('mild');
    expect(systolicBand(99)).toBe('mild');
    expect(systolicBand(121)).toBe('mild');
    expect(systolicBand(140)).toBe('mild');
    expect(systolicBand(81)).toBe('moderate');
    expect(systolicBand(90)).toBe('moderate');
    expect(systolicBand(141)).toBe('moderate');
    expect(systolicBand(180)).toBe('moderate');
    expect(systolicBand(80)).toBe('severe');
    expect(systolicBand(181)).toBe('severe');

    expect(diastolicBand(60)).toBe('normal');
    expect(diastolicBand(80)).toBe('normal');
    expect(diastolicBand(50)).toBe('mild');
    expect(diastolicBand(59)).toBe('mild');
    expect(diastolicBand(81)).toBe('mild');
    expect(diastolicBand(90)).toBe('mild');
    expect(diastolicBand(40)).toBe('moderate');
    expect(diastolicBand(49)).toBe('moderate');
    expect(diastolicBand(91)).toBe('moderate');
    expect(diastolicBand(110)).toBe('moderate');
    expect(diastolicBand(39)).toBe('severe');
    expect(diastolicBand(111)).toBe('severe');

    expect(bloodPressureBand(110, 70)).toBe('normal');
    expect(bloodPressureBand(96, 70)).toBe('mild');
    expect(bloodPressureBand(110, 85)).toBe('mild');
    expect(bloodPressureBand(85, 70)).toBe('moderate');
    expect(bloodPressureBand(110, 95)).toBe('moderate');
    expect(bloodPressureBand(70, 70)).toBe('severe');
    expect(bloodPressureBand(110, 111)).toBe('severe');
    expect(bloodPressureBand(180, 39)).toBe('severe');
  });

  it('呼吸率 20 係正常，低側冇中度', () => {
    expect(respiratoryRateBand(12)).toBe('normal');
    expect(respiratoryRateBand(20)).toBe('normal');
    expect(respiratoryRateBand(9)).toBe('mild');
    expect(respiratoryRateBand(11)).toBe('mild');
    expect(respiratoryRateBand(21)).toBe('mild');
    expect(respiratoryRateBand(24)).toBe('mild');
    expect(respiratoryRateBand(25)).toBe('moderate');
    expect(respiratoryRateBand(29)).toBe('moderate');
    expect(respiratoryRateBand(8)).toBe('severe');
    expect(respiratoryRateBand(30)).toBe('severe');
  });

  it('體溫 38.1–39.0 係中度', () => {
    expect(temperatureBand(36.1)).toBe('normal');
    expect(temperatureBand(37.2)).toBe('normal');
    expect(temperatureBand(35.5)).toBe('mild');
    expect(temperatureBand(36)).toBe('mild');
    expect(temperatureBand(37.3)).toBe('mild');
    expect(temperatureBand(38)).toBe('mild');
    expect(temperatureBand(34)).toBe('moderate');
    expect(temperatureBand(35.4)).toBe('moderate');
    expect(temperatureBand(38.1)).toBe('moderate');
    expect(temperatureBand(39)).toBe('moderate');
    expect(temperatureBand(33.9)).toBe('severe');
    expect(temperatureBand(39.1)).toBe('severe');
  });

  it('CVP 同 EtCO2', () => {
    expect(cvpBand(2)).toBe('normal');
    expect(cvpBand(6)).toBe('normal');
    expect(cvpBand(0)).toBe('mild');
    expect(cvpBand(1)).toBe('mild');
    expect(cvpBand(7)).toBe('mild');
    expect(cvpBand(10)).toBe('mild');
    expect(cvpBand(-1)).toBe('moderate');
    expect(cvpBand(11)).toBe('moderate');
    expect(cvpBand(15)).toBe('moderate');
    expect(cvpBand(16)).toBe('severe');

    expect(etco2Band(35)).toBe('normal');
    expect(etco2Band(45)).toBe('normal');
    expect(etco2Band(30)).toBe('mild');
    expect(etco2Band(34)).toBe('mild');
    expect(etco2Band(46)).toBe('mild');
    expect(etco2Band(50)).toBe('mild');
    expect(etco2Band(20)).toBe('moderate');
    expect(etco2Band(29)).toBe('moderate');
    expect(etco2Band(51)).toBe('moderate');
    expect(etco2Band(60)).toBe('moderate');
    expect(etco2Band(19)).toBe('severe');
    expect(etco2Band(61)).toBe('severe');
  });
});
