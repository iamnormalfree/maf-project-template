// ABOUTME: Profile inheritance resolution for MAF Codex profile management

import { CodexProfile, InheritanceResolver, ProfileValidationError } from './types';

export class CodexInheritanceResolver implements InheritanceResolver {
  
  resolveInheritance(
    profileName: string,
    profiles: { [name: string]: CodexProfile }
  ): CodexProfile | null {
    const profile = profiles[profileName];
    if (!profile) {
      return null;
    }

    // Check for circular inheritance
    const circularPath = this.detectCircularInheritance(profileName, profiles);
    if (circularPath.length > 0) {
      throw new Error("Circular inheritance detected: " + circularPath.join(' -> '));
    }

    // If no parent, return the profile as-is
    if (!profile.extends) {
      return profile;
    }

    // Recursively resolve parent
    const parentProfile = this.resolveInheritance(profile.extends, profiles);
    if (!parentProfile) {
      throw new Error("Parent profile '" + profile.extends + "' not found for profile '" + profileName + "'");
    }

    // Merge parent and child
    return this.mergeProfiles(parentProfile, profile);
  }

  detectCircularInheritance(
    profileName: string,
    profiles: { [name: string]: CodexProfile }
  ): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const detect = (currentName: string): string[] => {
      if (visited.has(currentName)) {
        const cycleIndex = path.indexOf(currentName);
        return path.slice(cycleIndex).concat(currentName);
      }

      visited.add(currentName);
      path.push(currentName);

      const profile = profiles[currentName];
      if (profile?.extends) {
        const result = detect(profile.extends);
        if (result.length > 0) {
          return result;
        }
      }

      path.pop();
      return [];
    };

    return detect(profileName);
  }

  mergeProfiles(parent: CodexProfile, child: CodexProfile): CodexProfile {
    const merged: CodexProfile = {
      name: child.name, // Child name takes precedence
      priority: child.priority !== 0 ? child.priority : parent.priority,
      extends: child.extends, // Preserve child's extends reference
      environment: { ...parent.environment, ...child.environment },
      active: child.active !== undefined ? child.active : parent.active,
      owner: child.owner || parent.owner,
      last_used: child.last_used || parent.last_used
    };

    // Merge rate limit - child takes precedence if defined
    if (child.rate_limit) {
      merged.rate_limit = {
        ...parent.rate_limit,
        ...child.rate_limit
      };
    } else if (parent.rate_limit) {
      merged.rate_limit = parent.rate_limit;
    }

    return merged;
  }

  /**
   * Validate all inheritance relationships in a profile set
   */
  validateInheritance(profiles: { [name: string]: CodexProfile }): ProfileValidationError[] {
    const errors: ProfileValidationError[] = [];

    for (const [profileName, profile] of Object.entries(profiles)) {
      try {
        // Check for circular inheritance
        const circularPath = this.detectCircularInheritance(profileName, profiles);
        if (circularPath.length > 0) {
          errors.push({
            field: 'extends',
            message: "Circular inheritance detected: " + circularPath.join(' -> '),
            value: profile.extends
          });
          continue;
        }

        // Check if parent exists
        if (profile.extends && !profiles[profile.extends]) {
          errors.push({
            field: 'extends',
            message: "Parent profile '" + profile.extends + "' not found",
            value: profile.extends
          });
        }

      } catch (error) {
        errors.push({
          field: 'extends',
          message: error instanceof Error ? error.message : 'Unknown inheritance error',
          value: profile.extends
        });
      }
    }

    return errors;
  }

  /**
   * Get inheritance chain for a profile (including the profile itself)
   */
  getInheritanceChain(
    profileName: string,
    profiles: { [name: string]: CodexProfile }
  ): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();

    const traverse = (currentName: string): boolean => {
      if (visited.has(currentName)) {
        return false; // Circular reference detected
      }

      visited.add(currentName);
      chain.push(currentName);

      const profile = profiles[currentName];
      if (profile?.extends) {
        return traverse(profile.extends);
      }

      return true;
    };

    traverse(profileName);
    return chain;
  }
}
