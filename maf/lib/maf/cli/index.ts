// ABOUTME: Exports the MAF CLI service layer for easy importing.

export {
  MafCliService,
  createMafCliService,
  type ClaimTaskOptions,
  type ClaimTaskResult,
  type ListReadyOptions,
  type ReadyTasksResult,
  type LeaseConflict,
  MafCliError
} from './cli-service';

export {
  parseClaimTaskArgs,
  parseCliCommand,
  requireAgentId,
  formatOutput,
  handleError,
  showUsage,
  validateArgs,
  verboseLog,
  EXIT_CODES,
  EMOJI,
  type ClaimTaskCliArgs,
  type ParsedCliCommand,
  MafCliArgumentError,
  MafCliNoTasksError,
  MafCliLeaseError
} from './cli-parser';
