// ABOUTME: Provides timestamp tracking, caching, and CI validation


import { promises as fs } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";
import { argv } from "process";

interface BuildStatus {
  isFresh: boolean;
  lastBuildTime?: Date;
  sourceFilesModified: string[];
  needsRebuild: boolean;
  buildDirectory: string;
}

interface BuildVerificationOptions {
  buildDirectory: string;
  sourceDirectories: string[];
  staleThresholdMs: number;
}

const DEFAULT_OPTIONS: BuildVerificationOptions = {
  buildDirectory: "dist",
  sourceDirectories: ["scripts/maf"],
  staleThresholdMs: 5 * 60 * 1000, // 5 minutes
};

class EnhancedBuildVerifier {
  private options: BuildVerificationOptions;

  constructor(options: Partial<BuildVerificationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async checkBuildStatus(): Promise<BuildStatus> {
    const lastBuildTime = await this.getLastBuildTime();
    const sourceFilesModified = await this.getModifiedSourceFiles();
    const needsRebuild = await this.isBuildStale();

    return {
      isFresh: !needsRebuild,
      lastBuildTime,
      sourceFilesModified,
      needsRebuild,
      buildDirectory: this.options.buildDirectory,
    };
  }

  async isBuildStale(): Promise<boolean> {
    try {
      const lastBuildTime = await this.getLastBuildTime();
      if (!lastBuildTime) {
        return true; // No build exists
      }

      const modifiedFiles = await this.getModifiedSourceFiles();
      return modifiedFiles.length > 0;
    } catch (error) {
      // If we cannot determine build status, assume rebuild needed
      return true;
    }
  }

  async getModifiedSourceFiles(): Promise<string[]> {
    const modifiedFiles: string[] = [];
    const lastBuildTime = await this.getLastBuildTime();

    try {
      for (const sourceDir of this.options.sourceDirectories) {
        const files = await this.getSourceFiles(sourceDir);
        
        for (const file of files) {
          const stats = await fs.stat(file);
          if (!lastBuildTime || stats.mtime > lastBuildTime) {
            modifiedFiles.push(relative(process.cwd(), file));
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to check source file modifications: ${error}`);
    }

    return modifiedFiles;
  }

  async getLastBuildTime(): Promise<Date | null> {
    try {
      const buildDirStat = await fs.stat(this.options.buildDirectory);
      
      if (!buildDirStat.isDirectory()) {
        return null;
      }

      // Look for compiled script files as build indicators
      const scriptFiles = await fs.readdir(this.options.buildDirectory);
      const mafScriptFiles = scriptFiles.filter(file => 
        file.startsWith("maf/") && file.endsWith(".js")
      );

      if (mafScriptFiles.length === 0) {
        return null;
      }

      // Get the most recent modification time from MAF script files
      let latestTime = 0;
      for (const scriptFile of mafScriptFiles) {
        const scriptPath = join(this.options.buildDirectory, scriptFile);
        const scriptStat = await fs.stat(scriptPath);
        latestTime = Math.max(latestTime, scriptStat.mtime.getTime());
      }

      return new Date(latestTime);
    } catch (error) {
      // Build directory does not exist or is inaccessible
      return null;
    }
  }

  async triggerRebuild(): Promise<void> {
    try {
      console.log("🔄 Rebuilding MAF scripts...");
      
      // Use the npm script defined in package.json
      execSync("npm run maf:build-scripts", {
        stdio: "inherit",
        cwd: process.cwd(),
        timeout: 60000, // 1 minute timeout
      });

      console.log("✅ MAF scripts rebuilt successfully");
    } catch (error) {
      throw new Error(`Failed to rebuild MAF scripts: ${error}`);
    }
  }

  async triggerRebuildWithValidation(): Promise<void> {
    const preBuildStatus = await this.checkBuildStatus();
    
    await this.triggerRebuild();
    
    // Validate that build actually worked
    const postBuildStatus = await this.checkBuildStatus();
    
    if (!postBuildStatus.isFresh) {
      throw new Error("Build completed but verification shows scripts are still stale");
    }

    console.log(`✅ Build validation successful. ${preBuildStatus.sourceFilesModified.length} source files compiled.`);
  }

  private async getSourceFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getSourceFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && fullPath.endsWith(".ts")) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory does not exist or is inaccessible
      // Return empty array - this is expected for some directories
    }
    
    return files;
  }
}

// CLI interface
async function main() {
  const command = argv[2];
  const verifier = new EnhancedBuildVerifier();
  
  try {
    switch (command) {
      case "check":
        const status = await verifier.checkBuildStatus();
        console.log(JSON.stringify(status, null, 2));
        
        // Exit with non-zero code if build needs rebuild (for CI usage)
        if (status.needsRebuild) {
          process.exit(1);
        }
        break;
        
      case "rebuild":
        await verifier.triggerRebuildWithValidation();
        break;
        
      case "verify":
        const isStale = await verifier.isBuildStale();
        console.log(isStale ? "Build is stale" : "Build is fresh");
        
        if (isStale) {
          process.exit(1);
        }
        break;
        
      case "status":
        const buildStatus = await verifier.checkBuildStatus();
        console.log(`Build Status: ${buildStatus.isFresh ? '✅ Fresh' : '❌ Stale'}`);
        if (buildStatus.lastBuildTime) {
          console.log(`Last Build: ${buildStatus.lastBuildTime.toISOString()}`);
        }
        if (buildStatus.sourceFilesModified.length > 0) {
          console.log(`Modified Files: ${buildStatus.sourceFilesModified.length}`);
          buildStatus.sourceFilesModified.forEach(file => console.log(`  - ${file}`));
        }
        break;
        
      default:
        console.error("Usage: tsx scripts/maf/enhanced-build-integration.ts <check|rebuild|verify|status>");
        console.error("  check   - Check build status and exit with 1 if stale (CI friendly)");
        console.error("  rebuild  - Force rebuild with validation");
        console.error("  verify  - Simple verification (fresh/stale)");
        console.error("  status  - Human-readable build status");
        process.exit(1);
    }
  } catch (error) {
    console.error("Build verifier error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { EnhancedBuildVerifier };
