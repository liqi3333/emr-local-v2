/**
 * Record data column definitions — single source of truth.
 *
 * Shared by src/services/database.js (for SQL generation) and
 * scripts/verify-integrity.js (for schema verification) so both stay
 * in sync without one requiring the other's side effects.
 */
const RECORD_DATA_COLUMNS = [
  'chief', 'hpi', 'past', 'exam', 'lab', 'diag', 'workup', 'diff', 'plan',
  'summary', 'supplementHistory', 'diagnosis', 'analysis', 'treatment', 'signed',
  'chiefSummary', 'chiefDiagnosis', 'chiefAnalysis', 'chiefTreatment', 'chiefSigned',
  'preopDiagnosis', 'preopIndication', 'preopPlan', 'preopPreparation', 'preopRisk', 'preopSigned',
  'discussionParticipants', 'discussionCaseSummary', 'discussionDiagnosis', 'discussionContent', 'discussionConclusion', 'discussionSigned',
  'surgeryName', 'surgerySurgeon', 'surgeryAssistant', 'surgeryAnesthesia', 'surgeryProcess', 'surgeryFindings', 'surgerySigned',
  'dischargeAdmissionDate', 'dischargeDate', 'dischargeDiagnosis', 'dischargeTreatment', 'dischargeOutcome', 'dischargeAdvice', 'dischargeSigned',
  // Consent forms
  'surgeryIndication', 'surgeryRisks', 'alternatives', 'patientSignature', 'consentDate',
  'bloodType', 'transfusionReason', 'bloodProducts', 'transfusionRisks',
  'anesthesiaType', 'anesthesiaRisks', 'patientCondition',
  // Nursing records
  'admissionTime', 'vitalSigns', 'skinCondition', 'mobility', 'nutrition', 'mentalStatus',
  'riskAssessment', 'nursingDiagnosis', 'goals', 'interventions', 'evaluation',
  'healthEducation', 'dischargePlan', 'recordDate', 'recordTime', 'intakeOutput',
  'medication', 'nursingInterventions', 'nurseSignature',
];

module.exports = { RECORD_DATA_COLUMNS };
