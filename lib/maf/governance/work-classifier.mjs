#!/usr/bin/env node
/**
 * Work Classifier for Agent Coordination Governance
 *
 * Classifies work into three tiers:
 * - tactical: < 2 hours, single file, bug fix - direct bead creation
 * - strategic: 2-8 hours, multi-file, PMF/feature - Supervisor approval
 * - multi_epic: > 8 hours, architecture - Human approval
 */

/**
 * Main classification function
 */
function classifyWork(metadata) {
  const factors = {};

  // Factor 1: Labels (weight: 0.35)
  factors.labels = classifyByLabels(metadata.labels);

  // Factor 2: Description length (weight: 0.15)
  factors.description = classifyByDescription(metadata.description);

  // Factor 3: Issue type (weight: 0.20)
  factors.type = classifyByType(metadata.type);

  // Factor 4: Title keywords (weight: 0.15)
  factors.title = classifyByTitle(metadata.title);

  // Factor 5: Dependencies (weight: 0.15)
  factors.dependencies = classifyByDependencies(metadata.dependencies || []);

  // Calculate weighted scores
  const scores = {
    tactical: calculateWeightedScore(factors, 'tactical'),
    strategic: calculateWeightedScore(factors, 'strategic'),
    multi_epic: calculateWeightedScore(factors, 'multi_epic'),
  };

  // Determine category based on highest score
  const category = determineCategory(scores);
  const confidence = calculateConfidence(scores);

  // Generate reasoning
  const reasoning = generateReasoning(factors, category, scores);

  // Determine approval requirement and estimate hours
  const { requiresApproval, estimatedHours } = getApprovalAndEstimate(category, factors);

  return {
    category,
    confidence,
    reasoning,
    requiresApproval,
    estimatedHours,
  };
}

/**
 * Classify by labels
 */
function classifyByLabels(labels) {
  const tacticalLabels = ['bug', 'hotfix', 'quick-fix', 'typo', 'cosmetic', 'tweak'];
  const strategicLabels = ['pmf', 'validation', 'feature', 'research', 'analytics', 'ux', 'interview'];
  const multiEpicLabels = ['architecture', 'refactor', 'migration', 'infra', 'platform', 'db'];

  const hasTactical = labels.some(l => tacticalLabels.includes(l.toLowerCase()));
  const hasStrategic = labels.some(l => strategicLabels.includes(l.toLowerCase()));
  const hasMultiEpic = labels.some(l => multiEpicLabels.includes(l.toLowerCase()));

  if (hasMultiEpic) {
    return { weight: 0.35, score: { multi_epic: 1, strategic: 0.2, tactical: 0 }, reason: 'Multi-epic labels detected' };
  }
  if (hasStrategic) {
    return { weight: 0.35, score: { strategic: 1, multi_epic: 0.3, tactical: 0.1 }, reason: 'Strategic labels detected' };
  }
  if (hasTactical) {
    return { weight: 0.35, score: { tactical: 1, strategic: 0.1, multi_epic: 0 }, reason: 'Tactical labels detected' };
  }

  return { weight: 0.35, score: { tactical: 0.6, strategic: 0.3, multi_epic: 0.1 }, reason: 'No classification labels' };
}

/**
 * Classify by description length
 */
function classifyByDescription(description) {
  const len = description.length;

  if (len < 100) {
    return { weight: 0.15, score: { tactical: 0.8, strategic: 0.2, multi_epic: 0 }, reason: 'Short description (< 100 chars)' };
  }
  if (len < 300) {
    return { weight: 0.15, score: { tactical: 0.4, strategic: 0.5, multi_epic: 0.1 }, reason: 'Medium description (100-300 chars)' };
  }
  if (len < 600) {
    return { weight: 0.15, score: { tactical: 0.1, strategic: 0.7, multi_epic: 0.2 }, reason: 'Long description (300-600 chars)' };
  }

  return { weight: 0.15, score: { tactical: 0, strategic: 0.3, multi_epic: 0.7 }, reason: 'Very long description (> 600 chars)' };
}

/**
 * Classify by issue type
 */
function classifyByType(type) {
  if (!type) {
    return { weight: 0.20, score: { tactical: 0.5, strategic: 0.3, multi_epic: 0.2 }, reason: 'No type specified' };
  }

  const typeLower = type.toLowerCase();

  if (['task', 'bug', 'hotfix'].includes(typeLower)) {
    return { weight: 0.20, score: { tactical: 1, strategic: 0, multi_epic: 0 }, reason: 'Task/bug type' };
  }
  if (['feature', 'story', 'validation'].includes(typeLower)) {
    return { weight: 0.20, score: { tactical: 0.1, strategic: 0.8, multi_epic: 0.1 }, reason: 'Feature/story type' };
  }
  if (['epic', 'architecture'].includes(typeLower)) {
    return { weight: 0.20, score: { tactical: 0, strategic: 0.2, multi_epic: 0.8 }, reason: 'Epic/architecture type' };
  }

  return { weight: 0.20, score: { tactical: 0.4, strategic: 0.4, multi_epic: 0.2 }, reason: `Unknown type: ${type}` };
}

/**
 * Classify by title keywords
 */
function classifyByTitle(title) {
  const titleLower = title.toLowerCase();

  const tacticalKeywords = ['fix', 'typo', 'tweak', 'adjust', 'minor', 'small', 'quick'];
  const strategicKeywords = ['implement', 'add', 'create', 'build', 'track', 'analyze', 'validate'];
  const multiEpicKeywords = ['refactor', 'migrate', 'redesign', 'restructure', 'architecture', 'platform'];

  const hasTactical = tacticalKeywords.some(k => titleLower.includes(k));
  const hasStrategic = strategicKeywords.some(k => titleLower.includes(k));
  const hasMultiEpic = multiEpicKeywords.some(k => titleLower.includes(k));

  if (hasMultiEpic) {
    return { weight: 0.15, score: { multi_epic: 0.9, strategic: 0.1, tactical: 0 }, reason: 'Multi-epic title keywords' };
  }
  if (hasStrategic) {
    return { weight: 0.15, score: { strategic: 0.8, multi_epic: 0.1, tactical: 0.1 }, reason: 'Strategic title keywords' };
  }
  if (hasTactical) {
    return { weight: 0.15, score: { tactical: 0.8, strategic: 0.1, multi_epic: 0 }, reason: 'Tactical title keywords' };
  }

  return { weight: 0.15, score: { tactical: 0.4, strategic: 0.4, multi_epic: 0.2 }, reason: 'No classification keywords in title' };
}

/**
 * Classify by dependencies
 */
function classifyByDependencies(dependencies) {
  const count = dependencies.length;

  if (count === 0) {
    return { weight: 0.15, score: { tactical: 0.7, strategic: 0.2, multi_epic: 0.1 }, reason: 'No dependencies' };
  }
  if (count <= 2) {
    return { weight: 0.15, score: { tactical: 0.4, strategic: 0.5, multi_epic: 0.1 }, reason: 'Few dependencies (1-2)' };
  }
  if (count <= 5) {
    return { weight: 0.15, score: { tactical: 0.1, strategic: 0.6, multi_epic: 0.3 }, reason: 'Moderate dependencies (3-5)' };
  }

  return { weight: 0.15, score: { tactical: 0, strategic: 0.2, multi_epic: 0.8 }, reason: 'Many dependencies (6+)' };
}

/**
 * Calculate weighted score for a category
 */
function calculateWeightedScore(factors, category) {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const factor of Object.values(factors)) {
    totalWeight += factor.weight;
    weightedSum += factor.score[category] * factor.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Determine category from scores
 */
function determineCategory(scores) {
  const maxScore = Math.max(scores.tactical, scores.strategic, scores.multi_epic);

  if (scores.multi_epic === maxScore && scores.multi_epic > 0.5) {
    return 'multi_epic';
  }
  if (scores.strategic === maxScore && scores.strategic > 0.5) {
    return 'strategic';
  }
  if (scores.tactical === maxScore && scores.tactical > 0.5) {
    return 'tactical';
  }

  return 'tactical';
}

/**
 * Calculate confidence based on score distribution
 */
function calculateConfidence(scores) {
  const maxScore = Math.max(scores.tactical, scores.strategic, scores.multi_epic);
  const secondMax = [scores.tactical, scores.strategic, scores.multi_epic]
    .sort((a, b) => b - a)[1];

  const gap = maxScore - secondMax;
  return Math.min(1, Math.max(0.5, gap * 2));
}

/**
 * Generate human-readable reasoning
 */
function generateReasoning(factors, category, scores) {
  const significantFactors = Object.entries(factors)
    .filter(([_, f]) => Math.abs(f.score[category] - 0.5) > 0.2)
    .map(([name, f]) => `${name}: ${f.reason}`)
    .join('; ');

  return `${category.toUpperCase()}: ${significantFactors}. Scores: T=${scores.tactical.toFixed(2)}, S=${scores.strategic.toFixed(2)}, M=${scores.multi_epic.toFixed(2)}`;
}

/**
 * Determine approval requirement and estimate hours
 */
function getApprovalAndEstimate(category, factors) {
  if (category === 'tactical') {
    return { requiresApproval: 'none', estimatedHours: 1 };
  }
  if (category === 'strategic') {
    let hours = 4;
    if (factors.dependencies) {
      hours += factors.dependencies.score.strategic * 2;
    }
    return { requiresApproval: 'supervisor', estimatedHours: Math.min(8, Math.round(hours)) };
  }

  return { requiresApproval: 'human', estimatedHours: 16 };
}

/**
 * CLI interface
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: work-classifier.mjs --title "Title" --description "Desc" --labels "label1,label2" [--type TYPE]');
    process.exit(1);
  }

  const metadata = {
    title: '',
    description: '',
    labels: [],
    type: undefined,
    dependencies: [],
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--title':
        metadata.title = args[++i];
        break;
      case '--description':
        metadata.description = args[++i];
        break;
      case '--labels':
        metadata.labels = args[++i].split(',').map(l => l.trim());
        break;
      case '--type':
        metadata.type = args[++i];
        break;
    }
  }

  const result = classifyWork(metadata);

  console.log(JSON.stringify(result, null, 2));

  if (result.category === 'tactical') {
    process.exit(0);
  } else if (result.category === 'strategic') {
    process.exit(1);
  } else {
    process.exit(2);
  }
}

main();
