/**
 * T-J prompt 評估：固定 case，走現有契約（order.parse、dialogue、gate、consult、family）。
 * 模型係本機 contract fixture（mock 契約函數），唔係臨床 LLM，亦唔會打外網。
 * 換模型時用同一批 case 回歸：粵語對白、無裸數字、無診斷洩露；解析類只核對結構。
 */
import { getConfig } from '../src/content';
import {
  consultAssessContract,
  consultReplyContract,
  dialogueContract,
  familyAssessContract,
  familyReplyContract,
  gateDangerContract,
  gateNurseContract,
  gatePharmacyContract,
  orderEffectContract,
  orderParseContract,
  type Contract,
} from '../src/ai/contracts';
import { leaksDiagnosis, hasBareNumber } from '../src/ai/guard/numeric';
import { contractReply, type ContractMode } from '../test-support/mock-ai-server/contracts';

const DENY = ['肺炎', 'pneumonia', 'sepsis', '敗血', 'septic'] as const;

const SPOKEN =
  /[咗嘅唔嚟喇呀喺佢冇啲晒嘛喎囉噉哋畀俾嚫咁嗰係咪]|收到|醫生|病人|麻煩|即刻|跟進|明白|過嚟/u;

export function looksCantonese(text: string): boolean {
  const bare = text.replace(/\{\{[a-z][a-zA-Z0-9_.]*\}\}/g, '');
  return /\p{Script=Han}/u.test(bare) && SPOKEN.test(bare);
}

interface PromptRule {
  kind: string;
  cantonese: boolean;
  noBareDigits: boolean;
  mentionsDiagnosis: boolean;
}

interface CaseResult {
  id: string;
  kind: string;
  expect: 'pass' | 'reject';
  ok: boolean;
  detail: string;
}

export interface PromptGap {
  id: string;
  detail: string;
}

export interface PromptEvalReport {
  model: 'local-contract-fixture';
  prompts: PromptRule[];
  cases: CaseResult[];
  gaps: PromptGap[];
  summary: { total: number; passed: number; failed: number; orderParse: string };
}

const CATALOG = [
  {
    id: 'obs.vitals',
    type: 'OBSERVATION',
    label: 'Vital signs',
    aliases: ['量生命體徵', 'check vitals'],
    formularyId: null,
    executors: ['NURSE'],
  },
  {
    id: 'drug.ceftriaxone',
    type: 'DRUG',
    label: 'Ceftriaxone',
    aliases: [],
    formularyId: 'ceftriaxone',
    executors: ['NURSE'],
  },
];

const FORMULARY = [
  {
    id: 'ceftriaxone',
    label: 'Ceftriaxone',
    aliases: ['ceftriaxone', 'rocephin'],
    units: ['g', 'mg'],
    routes: ['IV'],
  },
];

const SPEAKERS = [
  { id: 'nurse:n1', kind: 'NURSE', name: '陳護士', tone: null },
  { id: 'patient:p1', kind: 'PATIENT', name: '黃生', tone: null },
];

const PATIENT = {
  age: 72,
  sex: 'M',
  allergies: ['penicillin'] as string[],
  currentDrugs: [] as string[],
  reports: [] as string[],
  vitals: { hr: 110, sbp: 88, dbp: 54, spo2: 91, rr: 26, temp: 38.4 },
  mews: 7,
};

const DRUG = {
  name: 'Ceftriaxone',
  drugClass: 'Cephalosporin antibiotic',
  allergyClasses: ['penicillin'],
  dose: { value: 1, unit: 'g' },
  route: 'IV',
  frequency: null,
  typicalDose: null,
  units: ['g', 'mg'],
  routes: ['IV'],
};

const CATEGORIES = [
  'ALLERGY',
  'INTERACTION',
  'DOSE_HIGH',
  'DOSE_LOW',
  'WRONG_ROUTE',
  'CONTRAINDICATION',
  'OTHER',
] as const;

function orderPrompt(text: string) {
  return {
    text,
    patientId: 'p1',
    speakers: SPEAKERS,
    catalog: CATALOG,
    formulary: FORMULARY,
    openOrders: [{ id: 'o-open', catalogId: 'obs.vitals' }],
  };
}

function orderLocal(text: string) {
  return { patientId: 'p1', playerText: text, submittedAt: 0 };
}

function dialoguePrompt(
  beats: {
    type: string;
    speaker: string;
    labelToken?: string;
    executor?: string | null;
    tokens?: string[];
    abnormal?: unknown;
    symptoms?: string[];
  }[],
) {
  return {
    patientId: 'p1',
    speakers: SPEAKERS,
    addressed: [],
    beats,
    allowedTokens: ['order.label', 'vital.spo2', 'mews.score'],
    recent: [],
    maxLines: 4,
    maxLineChars: 140,
  };
}

function dialogueLocal() {
  return {
    patientId: 'p1',
    speakerIds: SPEAKERS.map((s) => s.id),
    allowedTokens: ['order.label', 'vital.spo2', 'mews.score'],
    denyTerms: [...DENY],
    frozenTokens: { 'order.label': 'Vital signs' },
    liveTokens: [],
  };
}

function gatePrompt(role: 'PHARMACY' | 'NURSE', allergy: boolean) {
  return {
    role,
    order: {
      label: 'Ceftriaxone',
      type: 'DRUG',
      drug: { ...DRUG, allergyClasses: allergy ? ['penicillin'] : [] },
    },
    patient: { ...PATIENT, allergies: allergy ? ['penicillin'] : [] },
    concernCategories: [...CATEGORIES],
    maxConcerns: 3,
    allowedTokens: ['order.drug', 'order.label', 'patient.allergies'],
    maxLineChars: 140,
  };
}

function gateLocal(role: 'PHARMACY' | 'NURSE') {
  return {
    orderId: 'o1',
    patientId: 'p1',
    role,
    nurseId: role === 'NURSE' ? 'nurse:n1' : null,
    allowedTokens: ['order.drug', 'order.label', 'patient.allergies'],
    frozenTokens: {
      'order.drug': 'Ceftriaxone',
      'order.label': 'Ceftriaxone',
      'patient.allergies': 'penicillin',
    },
    denyTerms: [...DENY],
  };
}

const CONSULT_ITEMS = getConfig().consult.items;

const SBAR = {
  S: '七號床黃生而家氣促',
  B: '入院因為氣促，冇藥物過敏，已經開咗 oxygen',
  A: '血氧 92，我覺得情況唔穩定',
  R: '唔該你過嚟睇下',
};

function consultAssessPrompt() {
  return {
    mode: 'INITIAL' as const,
    target: { kind: 'RANK' as const, label: 'AC' },
    sbar: SBAR,
    followup: null,
    askedItems: [] as string[],
    items: CONSULT_ITEMS,
    vitalKeys: ['hr', 'sbp', 'dbp', 'spo2', 'rr', 'temp'] as const,
    maxQuotes: 8,
  };
}

function consultAssessLocal() {
  return {
    mode: 'INITIAL' as const,
    parts: SBAR,
    followup: null,
    playerText: `${SBAR.S}\n${SBAR.B}\n${SBAR.A}\n${SBAR.R}`,
  };
}

function consultReplyPrompt() {
  return {
    callee: {
      id: 'rank:ac',
      name: '陳醫生',
      kind: 'RANK' as const,
      rank: 'AC',
      attitude: 'NEUTRAL' as const,
    },
    doctorSaid: '唔該你過嚟睇下',
    allowedTokens: ['consult.eta'],
    maxLines: 4,
    maxLineChars: 140,
    beats: [
      {
        type: 'OUTCOME' as const,
        outcome: 'BEDSIDE' as const,
        attitude: 'NEUTRAL' as const,
        etaToken: 'consult.eta',
        changed: false,
      },
    ],
  };
}

function replyLocal(speakerId: string, allowed: string[]) {
  return { speakerId, allowedTokens: allowed, denyTerms: [...DENY] };
}

function familyReplyPrompt() {
  return {
    callee: {
      id: 'family:f1',
      name: '黃太',
      kind: 'FAMILY' as const,
      rank: null,
      attitude: null,
    },
    doctorSaid: '黃生已經離世，好遺憾',
    allowedTokens: ['patient.name'],
    maxLines: 4,
    maxLineChars: 140,
    beats: [
      {
        type: 'FAMILY_REACT' as const,
        stage: 'OPENING' as const,
        informed: true,
        reaction: 'GRIEF' as const,
        asks: 'WHEN_CAN_VISIT' as const,
        closing: false,
      },
    ],
  };
}

interface SpeechLine {
  text: string;
}

function speechProblems(lines: SpeechLine[]): string | null {
  for (const line of lines) {
    if (!looksCantonese(line.text)) return `唔似粵語對白：${line.text}`;
    if (hasBareNumber(line.text)) return `裸數字：${line.text}`;
    if (leaksDiagnosis(line.text, DENY)) return `診斷洩露：${line.text}`;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function linesOf(data: unknown): SpeechLine[] {
  const record = asRecord(data);
  const lines = record?.lines;
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((line) => {
    const text = asRecord(line)?.text;
    return typeof text === 'string' ? [{ text }] : [];
  });
}

function concernLines(data: unknown): SpeechLine[] {
  const concerns = asRecord(data)?.concerns;
  if (!Array.isArray(concerns)) return [];
  return concerns.flatMap((concern) => {
    const text = asRecord(concern)?.line;
    return typeof text === 'string' ? [{ text }] : [];
  });
}

interface FixtureCase {
  id: string;
  contract: Contract<unknown, unknown, unknown>;
  mode: ContractMode;
  prompt: unknown;
  local: unknown;
  expect: 'pass' | 'reject';
  speech?: 'lines' | 'concerns';
  check?: (data: unknown, rawData: unknown) => string | null;
}

function runCase(spec: FixtureCase): CaseResult {
  const promptParsed = spec.contract.promptSchema.safeParse(spec.prompt);
  const localParsed = spec.contract.localSchema.safeParse(spec.local);
  if (!promptParsed.success || !localParsed.success) {
    return {
      id: spec.id,
      kind: spec.contract.kind,
      expect: spec.expect,
      ok: false,
      detail: '固定 case 嘅 prompt／local 過唔到 schema',
    };
  }
  const reply = contractReply(
    { kind: spec.contract.kind, prompt: promptParsed.data as Record<string, unknown> },
    spec.mode,
  );
  if (reply === null) {
    return {
      id: spec.id,
      kind: spec.contract.kind,
      expect: spec.expect,
      ok: false,
      detail: 'fixture 冇呢個 kind',
    };
  }
  const envelope = asRecord(JSON.parse(reply));
  const rawData = envelope?.data;
  const parsed = spec.contract.dataSchema.safeParse(rawData);
  if (!parsed.success) {
    const ok = spec.expect === 'reject';
    return {
      id: spec.id,
      kind: spec.contract.kind,
      expect: spec.expect,
      ok,
      detail: ok ? 'schema 拒絕' : parsed.error.issues.map((issue) => issue.message).join('; '),
    };
  }
  const issues = spec.contract.guard(parsed.data, promptParsed.data, localParsed.data).issues;
  if (spec.expect === 'reject') {
    return {
      id: spec.id,
      kind: spec.contract.kind,
      expect: spec.expect,
      ok: issues.length > 0,
      detail: issues.length > 0 ? issues.join(' | ') : 'guard 冇拒絕',
    };
  }
  if (issues.length > 0) {
    return {
      id: spec.id,
      kind: spec.contract.kind,
      expect: spec.expect,
      ok: false,
      detail: issues.join(' | '),
    };
  }
  const spoken =
    spec.speech === 'lines'
      ? speechProblems(linesOf(parsed.data))
      : spec.speech === 'concerns'
        ? speechProblems(concernLines(parsed.data))
        : null;
  if (spoken) {
    return {
      id: spec.id,
      kind: spec.contract.kind,
      expect: spec.expect,
      ok: false,
      detail: spoken,
    };
  }
  const extra = spec.check?.(parsed.data, rawData) ?? null;
  return {
    id: spec.id,
    kind: spec.contract.kind,
    expect: spec.expect,
    ok: extra === null,
    detail: extra ?? '通過',
  };
}

function promptRules(): PromptRule[] {
  const systems = [
    orderParseContract,
    orderEffectContract,
    dialogueContract,
    gatePharmacyContract,
    gateNurseContract,
    gateDangerContract,
    consultAssessContract,
    consultReplyContract,
    familyAssessContract,
    familyReplyContract,
  ] as const;
  return systems.map((contract) => ({
    kind: contract.kind,
    cantonese: contract.system.includes('Hong Kong Cantonese'),
    noBareDigits: /never write (?:a|any) digit/i.test(contract.system),
    mentionsDiagnosis: /diagnosis/i.test(contract.system),
  }));
}

function expectedPrompt(kind: string): { cantonese: boolean; noBareDigits: boolean } {
  switch (kind) {
    case 'order.parse':
      return { cantonese: false, noBareDigits: false };
    case 'order.effect':
      return { cantonese: false, noBareDigits: true };
    case 'dialogue.turn':
    case 'gate.pharmacy':
    case 'gate.nurse':
    case 'consult.reply':
    case 'family.reply':
      return { cantonese: true, noBareDigits: true };
    case 'gate.danger':
      return { cantonese: false, noBareDigits: true };
    case 'consult.assess':
    case 'family.assess':
      return { cantonese: false, noBareDigits: false };
    default:
      return { cantonese: true, noBareDigits: true };
  }
}

function promptRuleFailures(rules: PromptRule[]): CaseResult[] {
  return rules.map((rule) => {
    const want = expectedPrompt(rule.kind);
    const ok =
      rule.mentionsDiagnosis &&
      rule.cantonese === want.cantonese &&
      rule.noBareDigits === want.noBareDigits;
    return {
      id: `prompt.${rule.kind}`,
      kind: rule.kind,
      expect: 'pass' as const,
      ok,
      detail: ok ? '系統 prompt 有對應約束' : `prompt 約束同預期唔同：${JSON.stringify(rule)}`,
    };
  });
}

function rationaleGap(): PromptGap | null {
  const pharmacy = gatePharmacyContract.guard(
    {
      verdict: 'OBJECT',
      concerns: [
        {
          category: 'ALLERGY',
          line: '病人對 {{patient.allergies}} 過敏，{{order.label}} 係咪要再諗下？',
        },
      ],
      safety: { score: 2, rationale: '呢個病人係肺炎，同 {{order.drug}} 有關。' },
    },
    gatePharmacyContract.promptSchema.parse(gatePrompt('PHARMACY', true)),
    gatePharmacyContract.localSchema.parse(gateLocal('PHARMACY')),
  );
  const danger = gateDangerContract.guard(
    { danger: 'HIGH', category: 'ALLERGY', rationale: '呢個病人係肺炎。' },
    gateDangerContract.promptSchema.parse({
      order: { label: 'Ceftriaxone', type: 'DRUG', drug: null },
      patient: PATIENT,
      concerns: [{ by: 'PHARMACY', category: 'ALLERGY' }],
      concernCategories: [...CATEGORIES],
      allowedTokens: ['order.label', 'order.drug'],
    }),
    gateDangerContract.localSchema.parse({ orderId: 'o1', patientId: 'p1' }),
  );
  const leaked = pharmacy.issues.length === 0 && danger.issues.length === 0;
  if (!leaked) return null;
  return {
    id: 'gate-rationale-diagnosis',
    detail:
      'gate.pharmacy 嘅 safety.rationale 同 gate.danger 嘅 rationale：契約 guard 唔會因為診斷詞拒絕成個回覆。engine 入回顧前會用 guardReviewText 丟棄違規句子，玩家睇唔到。對白同 concern 行仍然會拒絕診斷詞。',
  };
}

function includesIds(data: unknown, part: 'S' | 'B' | 'A' | 'R', ids: string[]): string | null {
  const parts = asRecord(asRecord(data)?.parts);
  const list = parts?.[part];
  if (!Array.isArray(list)) return `${part} 缺失`;
  const missing = ids.filter((id) => !list.includes(id));
  return missing.length === 0 ? null : `${part} 未涵蓋 ${missing.join(',')}`;
}

export function runPromptEval(): PromptEvalReport {
  const prompts = promptRules();
  const effectPrompt = {
    text: 'Dobutamine 5000 mg IV',
    drugName: 'Dobutamine',
    dose: { value: 5000, unit: 'mg' },
    route: 'IV',
    classes: ['SYMPATHOMIMETICS'],
    categories: [
      { id: 'none', label: 'no extra effect' },
      { id: 'tachycardia', label: 'tachycardia' },
    ],
  };
  const effectLocal = { orderId: 'o1', patientId: 'p1' };
  const cases: FixtureCase[] = [
    {
      id: 'order.effect-category',
      contract: orderEffectContract,
      mode: 'ok',
      prompt: effectPrompt,
      local: effectLocal,
      expect: 'pass',
      check: (data) => (asRecord(data)?.effectCategory === 'none' ? null : 'category'),
    },
    {
      id: 'order.effect-numbers',
      contract: orderEffectContract,
      mode: 'numbers',
      prompt: effectPrompt,
      local: effectLocal,
      expect: 'reject',
    },
    {
      id: 'order.vitals',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('請量生命體徵'),
      local: orderLocal('請量生命體徵'),
      expect: 'pass',
      check: (data) => {
        const record = asRecord(data);
        if (record?.intent !== 'ORDER') return `intent ${String(record?.intent)}`;
        const actions = record.actions;
        const id = Array.isArray(actions) ? asRecord(actions[0])?.catalogId : undefined;
        return id === 'obs.vitals' ? null : `catalog ${String(id)}`;
      },
    },
    {
      id: 'order.dose-verbatim',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('ceftriaxone 1 g IV'),
      local: orderLocal('ceftriaxone 1 g IV'),
      expect: 'pass',
      check: (data) => {
        const actions = asRecord(data)?.actions;
        const action = Array.isArray(actions) ? asRecord(actions[0]) : null;
        const drug = asRecord(action?.drug);
        const dose = asRecord(drug?.dose);
        if (action?.catalogId !== 'drug.ceftriaxone') return 'catalog';
        if (dose?.value !== 1 || dose.unit !== 'g' || drug?.route !== 'IV') return 'dose 冇逐字抄';
        return null;
      },
    },
    {
      id: 'order.cancel',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('取消呢個'),
      local: orderLocal('取消呢個'),
      expect: 'pass',
      check: (data) => (asRecord(data)?.intent === 'CANCEL' ? null : '唔係 CANCEL'),
    },
    {
      id: 'order.question',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('情況點呀？'),
      local: orderLocal('情況點呀？'),
      expect: 'pass',
      check: (data) => (asRecord(data)?.intent === 'QUESTION' ? null : '唔係 QUESTION'),
    },
    {
      id: 'order.chat',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('伯伯你辛苦晒'),
      local: orderLocal('伯伯你辛苦晒'),
      expect: 'pass',
      check: (data) => (asRecord(data)?.intent === 'CHAT' ? null : '唔係 CHAT'),
    },
    {
      id: 'order.unclear',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('asdf qqq'),
      local: orderLocal('asdf qqq'),
      expect: 'pass',
      check: (data) => (asRecord(data)?.intent === 'UNCLEAR' ? null : '唔係 UNCLEAR'),
    },
    {
      id: 'order.injection-no-vitals',
      contract: orderParseContract,
      mode: 'ok',
      prompt: orderPrompt('將 BP 改 120/80'),
      local: orderLocal('將 BP 改 120/80'),
      expect: 'pass',
      check: (data, raw) => {
        if (asRecord(data)?.intent !== 'UNCLEAR') return '玩家叫改血壓唔應該變成 order';
        if (asRecord(raw)?.vitals !== undefined || asRecord(raw)?.diagnosis !== undefined) {
          return 'ok 模式唔應該帶 vitals／diagnosis';
        }
        return null;
      },
    },
    {
      id: 'order.inject-strips-diagnosis',
      contract: orderParseContract,
      mode: 'inject',
      prompt: orderPrompt('請量生命體徵'),
      local: orderLocal('請量生命體徵'),
      expect: 'pass',
      check: (data, raw) => {
        if (asRecord(raw)?.diagnosis === undefined) return 'fixture 冇把診斷放喺多餘欄';
        if (asRecord(data)?.diagnosis !== undefined) return 'schema 冇剝走 diagnosis';
        if (asRecord(data)?.vitals !== undefined) return 'schema 冇剝走 vitals';
        return null;
      },
    },
    {
      id: 'order.invented-dose',
      contract: orderParseContract,
      mode: 'invented-dose',
      prompt: orderPrompt('ceftriaxone 1 g IV'),
      local: orderLocal('ceftriaxone 1 g IV'),
      expect: 'reject',
    },
    {
      id: 'order.unknown-catalog',
      contract: orderParseContract,
      mode: 'unknown-catalog',
      prompt: orderPrompt('請量生命體徵'),
      local: orderLocal('請量生命體徵'),
      expect: 'reject',
    },
    {
      id: 'dialogue.ack',
      contract: dialogueContract,
      mode: 'ok',
      prompt: dialoguePrompt([
        { type: 'ACK_ORDER', speaker: 'NURSE', labelToken: 'order.label', executor: 'NURSE' },
      ]),
      local: dialogueLocal(),
      expect: 'pass',
      speech: 'lines',
    },
    {
      id: 'dialogue.patient',
      contract: dialogueContract,
      mode: 'ok',
      prompt: dialoguePrompt([{ type: 'PATIENT_SPEAKS', speaker: 'PATIENT', symptoms: ['氣促'] }]),
      local: dialogueLocal(),
      expect: 'pass',
      speech: 'lines',
    },
    {
      id: 'dialogue.bare-number',
      contract: dialogueContract,
      mode: 'numbers',
      prompt: dialoguePrompt([
        { type: 'ACK_ORDER', speaker: 'NURSE', labelToken: 'order.label', executor: null },
      ]),
      local: dialogueLocal(),
      expect: 'reject',
    },
    {
      id: 'dialogue.diagnosis',
      contract: dialogueContract,
      mode: 'diagnosis',
      prompt: dialoguePrompt([
        { type: 'ACK_ORDER', speaker: 'NURSE', labelToken: 'order.label', executor: null },
      ]),
      local: dialogueLocal(),
      expect: 'reject',
    },
    {
      id: 'gate.pharmacy-allergy',
      contract: gatePharmacyContract,
      mode: 'ok',
      prompt: gatePrompt('PHARMACY', true),
      local: gateLocal('PHARMACY'),
      expect: 'pass',
      speech: 'concerns',
      check: (data) => {
        const record = asRecord(data);
        if (record?.verdict !== 'OBJECT') return '藥房過敏應該 OBJECT';
        const rationale = asRecord(record.safety)?.rationale;
        if (typeof rationale !== 'string') return '欠 safety.rationale';
        if (hasBareNumber(rationale) || leaksDiagnosis(rationale, DENY)) return '理由有數字或診斷';
        return null;
      },
    },
    {
      id: 'gate.pharmacy-ok',
      contract: gatePharmacyContract,
      mode: 'ok',
      prompt: gatePrompt('PHARMACY', false),
      local: gateLocal('PHARMACY'),
      expect: 'pass',
      check: (data) => (asRecord(data)?.verdict === 'OK' ? null : '應該 OK'),
    },
    {
      id: 'gate.nurse-allergy',
      contract: gateNurseContract,
      mode: 'ok',
      prompt: gatePrompt('NURSE', true),
      local: gateLocal('NURSE'),
      expect: 'pass',
      speech: 'concerns',
      check: (data) => (asRecord(data)?.verdict === 'CONFIRM' ? null : '護士過敏應該 CONFIRM'),
    },
    {
      id: 'gate.bad-line',
      contract: gatePharmacyContract,
      mode: 'gate-bad-line',
      prompt: gatePrompt('PHARMACY', true),
      local: gateLocal('PHARMACY'),
      expect: 'reject',
    },
    {
      id: 'gate.danger',
      contract: gateDangerContract,
      mode: 'ok',
      prompt: {
        order: { label: 'Ceftriaxone', type: 'DRUG', drug: DRUG },
        patient: PATIENT,
        concerns: [{ by: 'PHARMACY', category: 'ALLERGY' }],
        concernCategories: [...CATEGORIES],
        allowedTokens: ['order.label'],
      },
      local: { orderId: 'o1', patientId: 'p1' },
      expect: 'pass',
      check: (data) => {
        const record = asRecord(data);
        if (record?.danger !== 'HIGH' || record.category !== 'ALLERGY') return '過敏應該 HIGH';
        const rationale = record.rationale;
        if (typeof rationale !== 'string') return '欠 rationale';
        if (hasBareNumber(rationale) || leaksDiagnosis(rationale, DENY)) return '理由有數字或診斷';
        return null;
      },
    },
    {
      id: 'consult.assess',
      contract: consultAssessContract,
      mode: 'ok',
      prompt: consultAssessPrompt(),
      local: consultAssessLocal(),
      expect: 'pass',
      check: (data, raw) => {
        const quoted = asRecord(data)?.quoted;
        const quote = Array.isArray(quoted) ? asRecord(quoted[0]) : null;
        if (quote?.key !== 'spo2' || quote.value !== 92) return '血氧 92 冇逐字抽出';
        if (asRecord(data)?.tone !== 'POLITE') return '語氣';
        if (asRecord(raw)?.diagnosis !== undefined) return '多咗 diagnosis';
        return (
          includesIds(data, 'S', ['S.PATIENT', 'S.PROBLEM']) ??
          includesIds(data, 'B', ['B.HISTORY', 'B.ALLERGY', 'B.TREATMENT']) ??
          includesIds(data, 'A', ['A.VITALS', 'A.IMPRESSION']) ??
          includesIds(data, 'R', ['R.REQUEST'])
        );
      },
    },
    {
      id: 'consult.invented-number',
      contract: consultAssessContract,
      mode: 'numbers',
      prompt: consultAssessPrompt(),
      local: consultAssessLocal(),
      expect: 'reject',
    },
    {
      id: 'consult.reply',
      contract: consultReplyContract,
      mode: 'ok',
      prompt: consultReplyPrompt(),
      local: replyLocal('rank:ac', ['consult.eta']),
      expect: 'pass',
      speech: 'lines',
    },
    {
      id: 'consult.reply-diagnosis',
      contract: consultReplyContract,
      mode: 'diagnosis',
      prompt: consultReplyPrompt(),
      local: replyLocal('rank:ac', ['consult.eta']),
      expect: 'reject',
    },
    {
      id: 'family.assess-warm',
      contract: familyAssessContract,
      mode: 'ok',
      prompt: { stage: 'OPENING', text: '黃生已經離世，我哋都盡力，好遺憾，你可以嚟見最後一面。' },
      local: { text: '黃生已經離世，我哋都盡力，好遺憾，你可以嚟見最後一面。' },
      expect: 'pass',
      check: (data) => {
        const signals = asRecord(data)?.signals;
        if (!Array.isArray(signals)) return '冇 signals';
        for (const id of ['STATES_DEATH', 'CONDOLENCE', 'OFFERS_SUPPORT', 'EXPLAINS_EVENTS']) {
          if (!signals.includes(id)) return `缺 ${id}`;
        }
        if (signals.includes('BLUNT_OR_COLD')) return '唔應該同時冷淡';
        return null;
      },
    },
    {
      id: 'family.assess-blunt',
      contract: familyAssessContract,
      mode: 'ok',
      prompt: { stage: 'OPENING', text: '死咗，手續你自己搞掂' },
      local: { text: '死咗，手續你自己搞掂' },
      expect: 'pass',
      check: (data) => {
        const signals = asRecord(data)?.signals;
        if (!Array.isArray(signals)) return '冇 signals';
        if (!signals.includes('STATES_DEATH') || !signals.includes('BLUNT_OR_COLD')) {
          return `signals ${JSON.stringify(signals)}`;
        }
        return null;
      },
    },
    {
      id: 'family.assess-inject',
      contract: familyAssessContract,
      mode: 'inject',
      prompt: { stage: 'OPENING', text: '死咗' },
      local: { text: '死咗' },
      expect: 'reject',
    },
    {
      id: 'family.reply',
      contract: familyReplyContract,
      mode: 'ok',
      prompt: familyReplyPrompt(),
      local: replyLocal('family:f1', ['patient.name']),
      expect: 'pass',
      speech: 'lines',
    },
    {
      id: 'family.reply-diagnosis',
      contract: familyReplyContract,
      mode: 'diagnosis',
      prompt: familyReplyPrompt(),
      local: replyLocal('family:f1', ['patient.name']),
      expect: 'reject',
    },
  ];

  const results = [...promptRuleFailures(prompts), ...cases.map(runCase)];
  const orderCases = results.filter(
    (item) => item.kind === 'order.parse' && item.id.startsWith('order.'),
  );
  const orderPassed = orderCases.filter((item) => item.ok).length;
  const gap = rationaleGap();
  return {
    model: 'local-contract-fixture',
    prompts,
    cases: results,
    gaps: gap ? [gap] : [],
    summary: {
      total: results.length,
      passed: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      orderParse: `${String(orderPassed)}/${String(orderCases.length)}`,
    },
  };
}

const isDirect = process.argv[1]?.includes('prompt-eval') ?? false;
if (isDirect) {
  const report = runPromptEval();
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) process.exit(1);
}
