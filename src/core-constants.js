(function initAISQCoreConstants(global) {
  "use strict";
  const SCHEMA_VERSION = 2;
  const PHASES = Object.freeze({
    IDLE: "idle",
    READY: "ready",
    SUBMITTING: "submitting",
    AWAITING: "awaiting_start",
    RUNNING: "running",
    SETTLING: "settling",
    RETRY_WAIT: "retry_wait",
    PACING: "pacing",
    PAUSED: "paused",
    DONE: "done",
    ERROR: "error"
  });
  const PROMPT_STATUSES = Object.freeze(["queued", "pending", "complete", "error", "skipped"]);

  const EVENTS = Object.freeze({
    // Execution lifecycle
    TRANSITION:            'TRANSITION',
    SUBMISSION_PREPARED:   'SUBMISSION_PREPARED',
    SUBMISSION_COMMITTED:  'SUBMISSION_COMMITTED',
    TURN_STARTED:          'TURN_STARTED',
    TURN_COMPLETED:        'TURN_COMPLETED',
    TURN_FAILED:           'TURN_FAILED',
    TURN_UNCERTAIN:        'TURN_UNCERTAIN',
    TURN_TIMED_OUT:        'TURN_TIMED_OUT',
    // Harness control
    RUNNER_STARTED:        'RUNNER_STARTED',
    RUNNER_PAUSED:         'RUNNER_PAUSED',
    RUNNER_RESUMED:        'RUNNER_RESUMED',
    RUNNER_FINISHED:       'RUNNER_FINISHED',
    LEASE_ACQUIRED:        'LEASE_ACQUIRED',
    LEASE_LOST:            'LEASE_LOST',
    // Recovery & repair
    RETRY_SCHEDULED:       'RETRY_SCHEDULED',
    RETRY_EXECUTED:        'RETRY_EXECUTED',
    CIRCUIT_BROKEN:        'CIRCUIT_BROKEN',
    REHYDRATED:            'REHYDRATED',
    // Dynamic chains
    PLAN_RECEIVED:         'PLAN_RECEIVED',
    CHAIN_INJECTED:        'CHAIN_INJECTED',
    REPAIR_INJECTED:       'REPAIR_INJECTED',
    // User commands
    CHAIN_IMPORTED:        'CHAIN_IMPORTED',
    CHAIN_DELETED:         'CHAIN_DELETED',
    PROMPT_EDITED:         'PROMPT_EDITED',
    PROMPT_SKIPPED:        'PROMPT_SKIPPED',
    ACTION:                'ACTION',
    VERIFY:                'VERIFY',
    ERROR:                 'ERROR',
    SYSTEM:                'SYSTEM'
  });


  global.AISQCore = { SCHEMA_VERSION, PHASES, PROMPT_STATUSES, EVENTS };
})(typeof globalThis !== "undefined" ? globalThis : this);
