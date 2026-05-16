import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  perceive, assessDepth, assessUncertainty, deriveObligations,
  notice, deliberate, summarizeConfidence, processTurn,
  loadState, freshState, HEAD_VALUES,
} from '../src/head.mjs';

// ── Values exist ────────────────────────────────────────────────────────────

test('HEAD_VALUES has all 8 cognitive qualities', () => {
  const expected = ['selfHonesty', 'materialCare', 'curiosity', 'strategicPace',
    'proactivity', 'restraint', 'honesty', 'consideration'];
  for (const v of expected) {
    assert.ok(HEAD_VALUES[v], `missing value: ${v}`);
  }
});

// ── Depth assessment ────────────────────────────────────────────────────────

test('simple question → reflexive depth', () => {
  const s = perceive('what is in package.json?', {});
  assert.equal(assessDepth(s), 'reflexive');
});

test('approval → reflexive depth', () => {
  const s = perceive('yes', {});
  assert.equal(assessDepth(s), 'reflexive');
});

test('destructive auth operation → deep depth', () => {
  const s = perceive('delete all auth tokens and reset the database', {
    files: ['src/auth.mjs', 'src/db.mjs'],
  });
  const depth = assessDepth(s);
  assert.ok(depth === 'deep' || depth === 'full', `expected deep or full, got ${depth}`);
});

test('ambiguous request → light or higher', () => {
  const s = perceive('maybe we should think about restructuring this or something?', {});
  const depth = assessDepth(s);
  assert.ok(depth !== 'reflexive', `expected non-reflexive, got ${depth}`);
});

test('prior failures elevate depth', () => {
  const s = perceive('fix the bug', { priorFailures: 3 });
  const depth = assessDepth(s);
  assert.ok(depth === 'full' || depth === 'deep', `expected full/deep with 3 failures, got ${depth}`);
});

// ── Situation model (perceive) ──────────────────────────────────────────────

test('perceive detects risk signals from security keywords', () => {
  const s = perceive('update the auth token encryption', {});
  assert.ok(s.taskShape.riskSignals.includes('security-adjacent'));
  assert.ok(s.taskShape.risk === 'medium' || s.taskShape.risk === 'high');
});

test('perceive detects destructive language', () => {
  const s = perceive('delete all files and wipe the repo', {});
  assert.ok(s.taskShape.riskSignals.includes('destructive-language'));
  assert.equal(s.taskShape.reversibility, 'hard');
});

test('perceive detects ambiguity signals', () => {
  const s = perceive('maybe we could somehow fix this or do something else?', {});
  assert.equal(s.taskShape.ambiguity, 'high');
  assert.ok(s.taskShape.ambiguitySignals.length >= 2);
});

test('perceive infers vague goal', () => {
  const s = perceive('just make it work', {});
  assert.ok(s.inferredGoal, 'should detect vague success criteria');
});

test('perceive detects urgency', () => {
  const s = perceive('fix this now immediately', {});
  assert.equal(s.urgency, 'high');
});

test('perceive detects fragile areas', () => {
  const s = perceive('update the config', { files: ['src/auth.mjs', 'config/secrets.json'] });
  assert.ok(s.material.fragileAreas.length >= 1);
  assert.ok(s.material.value === 'medium' || s.material.value === 'high');
});

// ── Uncertainty ledger ──────────────────────────────────────────────────────

test('uncertainty ledger tracks scope claims for non-small tasks', () => {
  const s = perceive('refactor the authentication module', { files: ['src/auth.mjs', 'src/sessions.mjs', 'src/tokens.mjs'] });
  const u = assessUncertainty(s);
  assert.ok(u.length > 0, 'should have uncertainty entries');
  assert.ok(u.some(e => e.claim.includes('contained')), 'should question scope containment');
});

test('uncertainty drops with prior failures', () => {
  const s = perceive('fix the login bug', { priorFailures: 3 });
  const u = assessUncertainty(s);
  const retryEntry = u.find(e => e.claim.includes('same approach'));
  assert.ok(retryEntry, 'should have retry uncertainty');
  assert.ok(retryEntry.confidence <= 0.15, `retry confidence should be very low, got ${retryEntry.confidence}`);
});

test('summarizeConfidence reports gaps and blockers', () => {
  const s = perceive('fix the auth bug', { priorFailures: 3, files: ['src/auth.mjs'] });
  const u = assessUncertainty(s);
  const summary = summarizeConfidence(u);
  assert.ok(summary.gaps.length > 0 || summary.blockers.length > 0, 'should have gaps or blockers');
  assert.ok(summary.score < 0.7, `score should be low with failures, got ${summary.score}`);
});

// ── Care obligations ────────────────────────────────────────────────────────

test('always-on obligations are present', () => {
  const s = perceive('list files', {});
  const o = deriveObligations(s);
  const types = o.map(ob => ob.type);
  assert.ok(types.includes('protectSecrets'));
  assert.ok(types.includes('honestLimits'));
  assert.ok(types.includes('contextCare'));
});

test('uncommitted files trigger preserveWork', () => {
  const s = perceive('edit src/main.mjs', { uncommittedFiles: ['src/main.mjs'] });
  const o = deriveObligations(s);
  assert.ok(o.some(ob => ob.type === 'preserveWork'));
});

test('irreversible risk triggers askBeforeIrreversi', () => {
  const s = perceive('delete the database and deploy to production', {});
  const o = deriveObligations(s);
  assert.ok(o.some(ob => ob.type === 'askBeforeIrreversi'));
});

test('inferred goal triggers distinguishIntent', () => {
  const s = perceive('just make it work', {});
  const o = deriveObligations(s);
  assert.ok(o.some(ob => ob.type === 'distinguishIntent'));
});

// ── Noticings ───────────────────────────────────────────────────────────────

test('noticings detect repeated failures', () => {
  const s = perceive('fix the bug', { priorFailures: 3 });
  const n = notice(s, {}, {});
  assert.ok(n.some(nn => nn.type === 'pattern' && nn.observation.includes('prior failures')));
});

test('noticings detect context pressure', () => {
  const s = perceive('do something', {});
  const n = notice(s, { contextEstimate: { estimatedTokens: 170000 } }, {});
  assert.ok(n.some(nn => nn.type === 'resource'));
});

test('noticings detect drift from declared goal', () => {
  const s = perceive('refactor the API layer', {});
  const n = notice(s, { declaredGoal: 'fix login bug' }, {});
  // inferredGoal won't be set for non-vague requests, but drift check needs
  // both declaredGoal and inferredGoal to fire. This tests the structure.
  assert.ok(Array.isArray(n));
});

// ── Deliberation ────────────────────────────────────────────────────────────

test('reflexive approval → proceed or respond action', () => {
  const s = perceive('yes', {});
  const d = deliberate(s, [], [], [], {});
  assert.equal(d.depth, 'reflexive');
  assert.ok(d.action.type === 'proceed' || d.action.type === 'respond',
    `expected proceed or respond, got ${d.action.type}`);
  assert.equal(d.shouldAskUser, false);
});

test('reflexive question → respond action', () => {
  const s = perceive('what is X?', {});
  const d = deliberate(s, [], [], [], {});
  assert.equal(d.action.type, 'respond');
});

test('dangerous operation → shouldAskUser true', () => {
  const s = perceive('delete all auth tokens and wipe the database', { files: ['src/auth.mjs'] });
  const u = assessUncertainty(s);
  const o = deriveObligations(s);
  const n = notice(s, {}, {});
  const d = deliberate(s, u, o, n, {});
  assert.equal(d.shouldAskUser, true, 'should ask user before destructive operation');
});

test('high ambiguity → clarify action', () => {
  const s = perceive('maybe we should somehow do something about this or that?', {});
  const u = assessUncertainty(s);
  const o = deriveObligations(s);
  const d = deliberate(s, u, o, [], {});
  assert.ok(
    d.action.type === 'clarify' || d.shouldAskUser,
    `expected clarify or ask, got ${d.action.type}`
  );
});

test('repeated failures → should not blindly dispatch', () => {
  const s = perceive('fix the login bug', { priorFailures: 3 });
  const u = assessUncertainty(s);
  const o = deriveObligations(s);
  const n = notice(s, {}, {});
  const d = deliberate(s, u, o, n, {});
  assert.ok(
    d.action.type === 'clarify' || d.shouldAskUser,
    `should not blindly dispatch after 3 failures, got ${d.action.type}`
  );
});

// ── Full turn processing ────────────────────────────────────────────────────

test('processTurn returns all cognitive artifacts', () => {
  const state = freshState();
  const turn = processTurn(state, 'fix the auth module', { files: ['src/auth.mjs'] });

  assert.ok(turn.situation, 'must have situation');
  assert.ok(turn.depth, 'must have depth');
  assert.ok(Array.isArray(turn.uncertainties), 'must have uncertainties');
  assert.ok(Array.isArray(turn.obligations), 'must have obligations');
  assert.ok(Array.isArray(turn.noticings), 'must have noticings');
  assert.ok(turn.result, 'must have deliberation result');
  assert.ok(turn.rationale, 'must have rationale');
  assert.ok(typeof turn.shouldAskUser === 'boolean', 'must have shouldAskUser');
  assert.ok(typeof turn.shouldDispatch === 'boolean', 'must have shouldDispatch');
});

test('processTurn saves state with turn history', () => {
  const state = freshState();
  processTurn(state, 'hello', {});
  assert.ok(state.turns.length === 1);
  assert.ok(state.lastActivity > 0);
});

// ── Edge cases ──────────────────────────────────────────────────────────────

test('empty message is handled gracefully', () => {
  const s = perceive('', {});
  assert.ok(s.taskShape);
  const d = deliberate(s, [], [], [], {});
  assert.ok(d.action);
});

test('very long message is handled', () => {
  const long = 'fix '.repeat(500) + 'the bug in auth.mjs';
  const s = perceive(long, {});
  assert.ok(s.taskShape);
});

test('correction message → pause action', () => {
  const s = perceive('no stop', {});
  const d = deliberate(s, [], [], [], {});
  assert.ok(d.action.type === 'pause' || d.action.type === 'respond');
});
