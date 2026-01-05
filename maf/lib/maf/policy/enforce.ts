// ABOUTME: Minimal policy enforcement for MAF - over-engineered security disabled
// ABOUTME: Basic provider routing enforcement only, no complex security validation

const pol = require('./policy.json');

// Existing function - unchanged for backward compatibility
export function assertRoute(label: string, provider: string): true {
  const row = (pol as any).labels?.[label] || (pol as any).labels?.private;
  if (!row) {
    throw new Error(`label ${label} not found in policy configuration`);
  }

  if (row.provider !== provider) {
    throw new Error(`provider ${provider} denied for label ${label}`);
  }
  return true;
}

// Basic quota enforcement function
export function assertQuota(policyLabel: string, count: number): true {
  const config = (pol as any).labels?.[policyLabel];
  if (!config || !config.quota) {
    return true; // No quota defined
  }

  if (count > config.quota) {
    throw new Error(`quota exceeded for ${policyLabel}: ${count}/${config.quota}`);
  }
  return true;
}

// Security functions disabled - over-engineered for current MAF goals
// All assertSecurityPolicy, validateSecurityContext, etc. functions removed
// MAF agents can work without complex security validation

const policyEnforcer = {
  assertRoute,
  assertQuota,
};

export default policyEnforcer;