import { BuildVerifier } from './build-verifier';
import type { BuildVerifierOptions, BuildStatus } from './types';

export class EnhancedBuildVerifier extends BuildVerifier {}

export const createEnhancedBuildVerifier = (options?: BuildVerifierOptions): EnhancedBuildVerifier =>
  new EnhancedBuildVerifier(options);

export { createBuildVerifier, rebuildWithValidationIfNeeded } from './build-verifier';
export type { BuildVerifierOptions, BuildStatus };
