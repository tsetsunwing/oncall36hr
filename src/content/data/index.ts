import aclsTransitions from './acls-transitions.json';
import callTemplates from './call-templates.json';
import caseFsm from './case-fsm.json';
import caseTemplates from './case-templates.json';
import consequences from './consequences.json';
import consultDepartments from './consult-departments.json';
import deathProcess from './death-process.json';
import delegationResults from './delegation-results.json';
import difficultyProfiles from './difficulty-profiles.json';
import endings from './endings.json';
import energyConfig from './energy-config.json';
import eventScheduleTemplates from './event-schedule-templates.json';
import familyScenarios from './family-scenarios.json';
import formulary from './formulary.json';
import mews from './mews.json';
import nurseRoster from './nurse-roster.json';
import orderCatalog from './order-catalog.json';
import orderEffects from './order-effects.json';
import quickWords from './quick-words.json';
import rankBehaviour from './rank-behaviour.json';
import rankComplexity from './rank-complexity.json';
import results from './results.json';
import rhythms from './rhythms.json';
import roundsTopics from './rounds-topics.json';
import requiredActions from './required-actions.json';
import scoringModel from './scoring-model.json';
import scoringRules from './scoring-rules.json';
import selfCareActions from './self-care-actions.json';
import subordinates from './subordinates.json';
import trajectories from './trajectories.json';
import wardLayout from './ward-layout.json';
import config from '../config/config.json';

import type { RawContent } from '../loader';

export const rawContent: RawContent = {
  config,
  tables: {
    'acls-transitions': aclsTransitions,
    'call-templates': callTemplates,
    'case-fsm': caseFsm,
    'case-templates': caseTemplates,
    consequences: consequences,
    'consult-departments': consultDepartments,
    'death-process': deathProcess,
    'delegation-results': delegationResults,
    'difficulty-profiles': difficultyProfiles,
    endings: endings,
    'energy-config': energyConfig,
    'event-schedule-templates': eventScheduleTemplates,
    'family-scenarios': familyScenarios,
    formulary: formulary,
    mews: mews,
    'nurse-roster': nurseRoster,
    'order-catalog': orderCatalog,
    'order-effects': orderEffects,
    'quick-words': quickWords,
    'rank-behaviour': rankBehaviour,
    'rank-complexity': rankComplexity,
    results: results,
    rhythms: rhythms,
    'rounds-topics': roundsTopics,
    'required-actions': requiredActions,
    'scoring-model': scoringModel,
    'scoring-rules': scoringRules,
    'self-care-actions': selfCareActions,
    subordinates: subordinates,
    trajectories: trajectories,
    'ward-layout': wardLayout,
  },
};
