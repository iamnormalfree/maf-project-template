const TelegramBot = require('node-telegram-bot-api');
const { execSync, spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ROUNDTABLE_DIR = process.env.ROUNDTABLE_DIR || '/root/projects/roundtable';
const LOG_FILE = path.join(ROUNDTABLE_DIR, '.agent-mail/telegram-bot.log');
const TMUX_BIN = fs.existsSync('/usr/bin/tmux') ? '/usr/bin/tmux' : 'tmux';
const TMUX_SEND_DELAY_MS = Number.isFinite(parseInt(process.env.TMUX_SEND_DELAY_MS, 10))
  ? parseInt(process.env.TMUX_SEND_DELAY_MS, 10)
  : 200;
const TMUX_CLEAR_DELAY_MS = Number.isFinite(parseInt(process.env.TMUX_CLEAR_DELAY_MS, 10))
  ? parseInt(process.env.TMUX_CLEAR_DELAY_MS, 10)
  : 120;
const IDLE_BROADCAST_THRESHOLD_SEC = Number.isFinite(parseInt(process.env.MAF_IDLE_BROADCAST_THRESHOLD_SEC, 10))
  ? parseInt(process.env.MAF_IDLE_BROADCAST_THRESHOLD_SEC, 10)
  : 180;
const IDLE_MAIL_POLICY = (process.env.MAF_IDLE_MAIL_POLICY || 'ignore').toLowerCase(); // ignore|skip|wake
const ACTIVITY_WINDOW_SEC = Number.isFinite(parseInt(process.env.ACTIVITY_WINDOW_SEC, 10))
  ? parseInt(process.env.ACTIVITY_WINDOW_SEC, 10)
  : 300;
const PROMPT_DETECTION_REGEX = /Supervisor:|Reviewer:|Implementor|check Agent Mail|Claim bead|Resume bead|Reserve relevant paths|Suggested picks/i;
const QUIET_LINE_REGEX = /context left|background task|press up to edit queued messages|ctrl\+g/i;
const TOOL_CONFIRM_REGEX = /Do you want to proceed\?|Yes, and don't ask again|1\. Yes/i;
const TOOL_CONFIRM_TRUST_REGEX = /don't ask again/i;
const TOOL_CONFIRM_TOOL_REGEX = /mcp-agent-mail/i;
const SETTINGS_ERROR_REGEX = /Settings Error/i;
const SETTINGS_MENU_REGEX = /Exit and fix manually|Continue without these settings/i;
const DEFAULT_PROMPT_PATTERNS = [
  /^explain this codebase$/i,
  /^find and fix a bug in @filename$/i,
  /^write tests for @filename$/i,
  /^improve documentation in @filename$/i,
  /^summarize recent commits$/i,
  /^review the restored context above and continue.*$/i,
  /^implement\s+\{feature\}$/i,
  /^try\s+"[^"]*<[^>]+>[^"]*"$/i
];
const IMPLEMENTOR_GUARDRAILS = 'Do not run git commit/push. Wait for reviewer sign-off before asking the supervisor to close. Follow supervisor instructions.';
const MAF_STATE_DIR = path.join(ROUNDTABLE_DIR, '.maf', 'state');
const BROADCAST_PLAN_PATH = path.join(MAF_STATE_DIR, 'broadcast-targeted.json');
const BROADCAST_ASSIGNMENTS_PATH = path.join(MAF_STATE_DIR, 'broadcast-assignments.json');
const BROADCAST_SEND_AGENT_MAIL = (process.env.MAF_BROADCAST_SEND_AGENT_MAIL || 'true').toLowerCase() === 'true';
const CONTEXT_MANAGER_SCRIPT = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', 'context-manager-v2.sh');
const MEMORY_STATUS_SCRIPT = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', 'memory-service-unified.py');
const AGENTS_WINDOW_NAME = process.env.MAF_AGENT_WINDOW || 'agents';
const REVIEW_ROUTER_STATE_PATH = path.join(MAF_STATE_DIR, 'review-router.json');
const REVIEW_ROUTER_ENABLED = (process.env.MAF_REVIEW_ROUTER_ENABLED || 'true').toLowerCase() !== 'false';
const REVIEW_AUTO_CLOSE_ENABLED = (process.env.MAF_REVIEW_AUTO_CLOSE_ENABLED || 'false').toLowerCase() === 'true';
const REVIEW_REQUEST_ROUTER_STATE_PATH = path.join(MAF_STATE_DIR, 'review-requests.json');
const REVIEW_REQUEST_ROUTER_ENABLED = (process.env.MAF_REVIEW_REQUEST_ROUTER_ENABLED || 'true').toLowerCase() !== 'false';
const REVIEW_REQUEST_POLL_INTERVAL_MS = Number.isFinite(parseInt(process.env.MAF_REVIEW_REQUEST_ROUTER_INTERVAL_MS, 10))
  ? parseInt(process.env.MAF_REVIEW_REQUEST_ROUTER_INTERVAL_MS, 10)
  : 30000;
const TELEGRAM_CHAT_TO_SUPERVISOR_ENABLED = (process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_ENABLED || 'false').toLowerCase() === 'true';
const TELEGRAM_CHAT_TO_SUPERVISOR_ACK = (process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_ACK || 'true').toLowerCase() !== 'false';
const TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID = process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID != null
  ? Number(process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID)
  : null;
const TELEGRAM_CHAT_TO_SUPERVISOR_PANE = (process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_PANE || 'true').toLowerCase() !== 'false';
const TELEGRAM_CHAT_TO_SUPERVISOR_RETURN = (process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_RETURN || 'true').toLowerCase() !== 'false';
const TELEGRAM_RELAY_STATE_PATH = path.join(MAF_STATE_DIR, 'telegram-relay.json');
const TELEGRAM_RELAY_POLL_INTERVAL_MS = Number.isFinite(parseInt(process.env.MAF_TELEGRAM_RELAY_POLL_INTERVAL_MS, 10))
  ? Math.max(parseInt(process.env.MAF_TELEGRAM_RELAY_POLL_INTERVAL_MS, 10), 1500)
  : 4000;
const TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID_AUTOSET = (process.env.MAF_TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID_AUTOSET || 'true').toLowerCase() !== 'false';
const AUTOPILOT_ENABLED = (process.env.MAF_AUTOPILOT_ENABLED || 'false').toLowerCase() === 'true';
const AUTOPILOT_IDLE_ONLY = (process.env.MAF_AUTOPILOT_IDLE_ONLY || 'true').toLowerCase() !== 'false';
const AUTOPILOT_INTERVAL_MS = Number.isFinite(parseInt(process.env.MAF_AUTOPILOT_INTERVAL_MS, 10))
  ? Math.max(parseInt(process.env.MAF_AUTOPILOT_INTERVAL_MS, 10), 30000)
  : 120000;
const AUTOPILOT_COOLDOWN_SEC = Number.isFinite(parseInt(process.env.MAF_AUTOPILOT_COOLDOWN_SEC, 10))
  ? Math.max(parseInt(process.env.MAF_AUTOPILOT_COOLDOWN_SEC, 10), 0)
  : 900;
const AUTOPILOT_REQUIRE_CHANGE = (process.env.MAF_AUTOPILOT_REQUIRE_CHANGE || 'true').toLowerCase() !== 'false';
const AUTOPILOT_REPEAT_SEC = Number.isFinite(parseInt(process.env.MAF_AUTOPILOT_REPEAT_SEC, 10))
  ? Math.max(parseInt(process.env.MAF_AUTOPILOT_REPEAT_SEC, 10), 0)
  : 21600;
const AUTOPILOT_UNBLOCK_ENABLED = (process.env.MAF_AUTOPILOT_UNBLOCK_ENABLED || 'false').toLowerCase() === 'true';
const AUTOPILOT_UNBLOCK_INTERVAL_MS = Number.isFinite(parseInt(process.env.MAF_AUTOPILOT_UNBLOCK_INTERVAL_MS, 10))
  ? Math.max(parseInt(process.env.MAF_AUTOPILOT_UNBLOCK_INTERVAL_MS, 10), 5000)
  : 15000;
const AUTOPILOT_UNBLOCK_SUBMIT = (process.env.MAF_AUTOPILOT_UNBLOCK_SUBMIT || 'true').toLowerCase() !== 'false';
const AUTOPILOT_UNBLOCK_TRUST_MCP_AGENT_MAIL = (process.env.MAF_AUTOPILOT_UNBLOCK_TRUST_MCP_AGENT_MAIL || 'false').toLowerCase() === 'true';
const AUTOPILOT_UNBLOCK_CONFIRM_MCP_AGENT_MAIL = (process.env.MAF_AUTOPILOT_UNBLOCK_CONFIRM_MCP_AGENT_MAIL || 'true').toLowerCase() !== 'false';
const AUTOPILOT_UNBLOCK_TRUST_RESPONSE_AWARENESS = (process.env.MAF_AUTOPILOT_UNBLOCK_TRUST_RESPONSE_AWARENESS || 'false').toLowerCase() === 'true';
const AUTOPILOT_UNBLOCK_CONFIRM_RESPONSE_AWARENESS = (process.env.MAF_AUTOPILOT_UNBLOCK_CONFIRM_RESPONSE_AWARENESS || 'true').toLowerCase() !== 'false';
const AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK = (process.env.MAF_AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK || 'true').toLowerCase() !== 'false';
const AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK_CHOICE = (() => {
  const raw = (process.env.MAF_AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK_CHOICE || '0').trim();
  const allowed = new Set(['0', '1', '2', '3']);
  return allowed.has(raw) ? raw : '0';
})();
const MAIL_SWEEP_ON_CLOSE = (process.env.MAF_MAIL_SWEEP_ON_CLOSE || 'true').toLowerCase() !== 'false';
const MAIL_SWEEP_AUTO_ACK_CONTACT_REQUESTS = (process.env.MAF_MAIL_SWEEP_AUTO_ACK_CONTACT_REQUESTS || 'true').toLowerCase() !== 'false';
const MAIL_SWEEP_AUTO_ACK_STALE_DAYS = Number.isFinite(parseInt(process.env.MAF_MAIL_SWEEP_AUTO_ACK_STALE_DAYS, 10))
  ? Math.max(parseInt(process.env.MAF_MAIL_SWEEP_AUTO_ACK_STALE_DAYS, 10), 0)
  : 1;
const MAIL_SWEEP_EXTRA_AGENTS = (process.env.MAF_MAIL_SWEEP_EXTRA_AGENTS || '')
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);
const AUTOPILOT_STATE_PATH = path.join(MAF_STATE_DIR, 'autopilot.json');
const BROADCAST_DEDUPE_ENABLED = (process.env.MAF_BROADCAST_DEDUPE_ENABLED || 'true').toLowerCase() !== 'false';
const BROADCAST_DEDUPE_STATE_PATH = path.join(MAF_STATE_DIR, 'broadcast-dedupe.json');
const PULSE_STATE_PATH = path.join(MAF_STATE_DIR, 'pulse.json');
const IDLE_MAIL_STATE_PATH = path.join(MAF_STATE_DIR, 'idle-mail.json');
const MAIL_FORWARD_ENABLED = (process.env.MAF_MAIL_FORWARD_ENABLED || 'true').toLowerCase() === 'true';
const MAIL_FORWARD_INTERVAL_MS = Number.isFinite(parseInt(process.env.MAF_MAIL_FORWARD_INTERVAL_MS, 10))
  ? Math.max(parseInt(process.env.MAF_MAIL_FORWARD_INTERVAL_MS, 10), 60000)
  : 300000;
const MAIL_FORWARD_FILTER_BEADS_ONLY = (process.env.MAF_MAIL_FORWARD_FILTER_BEADS_ONLY || 'true').toLowerCase() === 'true';
const MAIL_FORWARD_STATE_PATH = path.join(MAF_STATE_DIR, 'mail-forward.json');
const IMPLEMENTOR_DEFAULT_RESPONSE_AWARENESS = (process.env.MAF_IMPLEMENTOR_DEFAULT_RESPONSE_AWARENESS || 'false').toLowerCase() === 'true';
const REVIEW_POLL_INTERVAL_MS = Number.isFinite(parseInt(process.env.MAF_REVIEW_ROUTER_INTERVAL_MS, 10))
  ? parseInt(process.env.MAF_REVIEW_ROUTER_INTERVAL_MS, 10)
  : 60000;
const REVIEW_REQUEST_REMINDER_SEC = Number.isFinite(parseInt(process.env.MAF_REVIEW_REQUEST_REMINDER_SEC, 10))
  ? Math.max(parseInt(process.env.MAF_REVIEW_REQUEST_REMINDER_SEC, 10), 60)
  : 1800;
const REVIEW_ACCEPTANCE_WARNING_SEC = Number.isFinite(parseInt(process.env.MAF_REVIEW_ACCEPTANCE_WARNING_SEC, 10))
  ? Math.max(parseInt(process.env.MAF_REVIEW_ACCEPTANCE_WARNING_SEC, 10), 60)
  : 600;
const REVIEW_ROUTER_LOOKBACK_SEC = Number.isFinite(parseInt(process.env.MAF_REVIEW_ROUTER_LOOKBACK_SEC, 10))
  ? Math.max(parseInt(process.env.MAF_REVIEW_ROUTER_LOOKBACK_SEC, 10), 60)
  : 7200;
const REVIEW_ALLOWED_SENDERS = (process.env.MAF_REVIEW_ALLOWED_SENDERS || '')
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);
const REVIEW_DONE_REGEX = /(review done|review complete|review completed|review finished|reviewed|approval|approved|needs fixes|fixes needed|reopen)/i;
const REVIEW_NEGATIVE_REGEX = /(needs fixes|fixes needed|reopen|changes requested|request changes|blocker)/i;
const REVIEW_POSITIVE_REGEX = /(review done|review complete|review completed|review finished|reviewed|approved|approval)/i;
const BEAD_ID_REGEX = /(roundtable-[a-z0-9][a-z0-9._-]*)/i;
const BEAD_ID_FULL_REGEX = new RegExp(`^${BEAD_ID_REGEX.source}$`, 'i');
const REVIEW_WAITING_REGEX = new RegExp(`Waiting\\s+for:\\s*Reviewer\\s+sign[- ]off[^\\n]*\\bbead\\s+${BEAD_ID_REGEX.source}`, 'i');
const JSON_KV_REGEX = /^"[\w-]+"\s*:/;
const SUPERVISOR_BUSY_WINDOW_SEC = Number.isFinite(parseInt(process.env.MAF_SUPERVISOR_BUSY_WINDOW_SEC, 10))
  ? parseInt(process.env.MAF_SUPERVISOR_BUSY_WINDOW_SEC, 10)
  : 90;
const OPERATOR_AGENT_NAME = process.env.MAF_OPERATOR_AGENT || 'HumanOverseer';
const BUSY_OUTPUT_REGEX = /(generating|thinking|inferring|processing|computing|reviewing|working|considering|smooshing|puttering|in progress|esc to interrupt)/i;
const BROADCAST_BUSY_REGEX = /(generating|thinking|inferring|processing|computing|reviewing|working|considering|smooshing|puttering|esc to interrupt)/i;
const BROADCAST_BUSY_RECENT_LINES = Number.isFinite(parseInt(process.env.MAF_BROADCAST_BUSY_RECENT_LINES, 10))
  ? Math.max(parseInt(process.env.MAF_BROADCAST_BUSY_RECENT_LINES, 10), 5)
  : 25;
const AGENT_NAME_BY_PANE = {
  0: 'GreenMountain',
  1: 'BlackDog',
  2: 'OrangePond',
  3: 'FuchsiaCreek'
};
const AGENT_TOPOLOGY_PATH = path.join(ROUNDTABLE_DIR, '.maf', 'config', 'agent-topology.json');
const DEFAULT_ROLE_TO_PANE = {
  supervisor: 0,
  reviewer: 1,
  'implementor-1': 2,
  'implementor-2': 3
};
let cachedAgentTopologyConfig = undefined;
const CONTEXT_MANAGER_ENV_PATH = path.join(ROUNDTABLE_DIR, '.maf', 'config', 'context-manager.env');
const CODEX_REASONING_CHOICE = (process.env.MAF_REASONING_LEVEL_CHOICE || '3').toString();
const BEAD_RESERVATIONS_DIR = path.join(ROUNDTABLE_DIR, '.agent-mail', 'reservations');
const BROADCAST_PACK_PATH = path.join(ROUNDTABLE_DIR, '.maf', 'config', 'broadcast-pack.json');
const PROMPT_PACKS_DIR = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', 'prompt-packs');

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Configure it before starting the bot.');
  process.exit(1);
}

// Bot instance
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
let pollingRestartTimer = null;
let pollingRestartInProgress = false;
let pollingBackoffMs = 5000;
const POLLING_BACKOFF_MAX_MS = 60000;

let telegramRelayInProgress = false;
async function routeTelegramSupervisorReplies() {
  if (!TELEGRAM_CHAT_TO_SUPERVISOR_ENABLED || !TELEGRAM_CHAT_TO_SUPERVISOR_RETURN) {
    return;
  }
  if (!checkTmuxSession()) {
    return;
  }
  if (telegramRelayInProgress) {
    return;
  }
	telegramRelayInProgress = true;
	try {
	  const state = readTelegramRelayState() || {};
	  const lastChatId = Number.isFinite(Number(state.lastChatId)) ? Number(state.lastChatId) : null;
	  if (lastChatId == null) {
	    return;
	  }

	  const delivered = Array.isArray(state.delivered) ? state.delivered : [];
		  const deliveredSet = new Set(delivered.slice(-80));

		  const sessionName = resolveTmuxSessionName();
		  const supervisorPaneIndex = resolveRoleAgents(getAgentInfo()).supervisorPaneIndex;
		  const target = buildAgentTarget(sessionName, supervisorPaneIndex);
		  const rawLines = captureTmuxPaneLines(target, 220);
		  if (!Array.isArray(rawLines) || rawLines.length === 0) {
		    return;
		  }
	  const trimmedLines = rawLines.map(line => String(line || '').trim());

	  // Only relay replies that appear after the most recent inbound Telegram marker (prevents replaying older TG: lines).
	  let scanStartIndex = 0;
	  const marker = typeof state.lastMarker === 'string' ? state.lastMarker.trim() : '';
	  if (marker) {
	    for (let i = trimmedLines.length - 1; i >= 0; i -= 1) {
	      if (trimmedLines[i] && trimmedLines[i].includes(marker)) {
	        scanStartIndex = i + 1;
	        break;
	      }
	    }
	    if (scanStartIndex >= trimmedLines.length) {
	      scanStartIndex = 0;
	    }
	  }

	  const candidates = [];
	  for (let i = scanStartIndex; i < trimmedLines.length; i += 1) {
	    const trimmedLine = trimmedLines[i];
	    if (!trimmedLine) {
	      continue;
	    }
	    // Strip common list/prompt prefixes: bullets, hyphens, and Codex prompt markers (›/❯).
	    const prefixStripped = trimmedLine.replace(/^(?:[•\u2022\-*>\u00bb\u203a\u276f]\s*)+/, '');
	    const match = prefixStripped.match(/^TG:(.*)$/i)
	      || prefixStripped.match(/^TG\((\d+)\):\s*(.*)$/i)
	      || prefixStripped.match(/^TG\[(\d+)\]:\s*(.*)$/i);
	    if (!match) {
	      continue;
	    }

	    let chatId = lastChatId;
	    let text = null;
	    if (match[1] != null && match.length === 2) {
	      text = match[1].trim();
	    } else if (match[1] && match[2] != null) {
	      const parsedChatId = Number(match[1]);
	      if (Number.isFinite(parsedChatId)) {
	        chatId = parsedChatId;
	      }
	      text = String(match[2]).trim();
	    }
	    if (!text) {
	      continue;
	    }
	    text = text.replace(/\s+/g, ' ').trim();
	    // If someone types "TG:: message", drop the extra colon.
	    text = text.replace(/^:\s*/, '').trim();
	    if (!text) {
	      continue;
	    }

	    // If tmux wrapped the TG: line, append any following indented lines as part of the same reply.
	    for (let j = i + 1; j < rawLines.length; j += 1) {
	      const nextRaw = String(rawLines[j] || '');
	      if (!/^\s+/.test(nextRaw)) {
	        break;
	      }
	      const nextTrimmed = trimmedLines[j];
	      if (!nextTrimmed) {
	        break;
	      }
	      const nextPrefixStripped = nextTrimmed.replace(/^(?:[•\u2022\-*>\u00bb\u203a\u276f]\s*)+/, '');
	      if (/^TG[:(\[]/i.test(nextPrefixStripped) || /^Telegram chat from/i.test(nextPrefixStripped)) {
	        break;
	      }
	      text = `${text} ${nextPrefixStripped}`.replace(/\s+/g, ' ').trim();
	      i = j;
	    }

	    // Key must be stable across tmux reflows; do NOT include idx.
	    const key = crypto.createHash('sha1').update(`${chatId}:${text}`).digest('hex');
	    if (deliveredSet.has(key)) {
	      continue;
	    }
	    candidates.push({ key, chatId, text });
	  }

	  if (candidates.length === 0) {
	    return;
	  }

    // Send at most one Telegram message per chat per tick (combine any pending replies).
    const byChat = new Map();
    candidates.forEach(item => {
      const chatId = Number(item.chatId);
      if (!Number.isFinite(chatId)) return;
      const existing = byChat.get(chatId);
      if (!existing) {
        byChat.set(chatId, { texts: [item.text], keys: [item.key] });
      } else {
        existing.texts.push(item.text);
        existing.keys.push(item.key);
      }
    });

    for (const [chatId, payload] of byChat.entries()) {
      const uniqueTexts = [];
      const seen = new Set();
      payload.texts.forEach(text => {
        if (seen.has(text)) return;
        seen.add(text);
        uniqueTexts.push(text);
      });

      let combined = uniqueTexts.join('\n');
      if (combined.length > 3900) {
        combined = combined.slice(0, 3900).trimEnd() + '…';
      }

      await bot.sendMessage(chatId, combined);
      payload.keys.forEach(key => {
        deliveredSet.add(key);
        delivered.push(key);
      });
    }

    state.delivered = delivered.slice(-120);
    writeTelegramRelayState(state);
  } catch (error) {
    log('ERROR', 'Telegram relay tick failed', error);
  } finally {
    telegramRelayInProgress = false;
  }
}

bot.on('message', async (msg) => {
  if (!TELEGRAM_CHAT_TO_SUPERVISOR_ENABLED) {
    return;
  }
  if (!msg || typeof msg.text !== 'string') {
    return;
  }
  if (msg.from && msg.from.is_bot) {
    return;
  }

  const text = msg.text.trim();
  if (!text || text.startsWith('/')) {
    return;
  }

  const incomingChatId = Number(msg.chat?.id);
  if (!Number.isFinite(incomingChatId)) {
    return;
  }

  const relayState = readTelegramRelayState() || {};
  const allowedChatIdFromState = Number.isFinite(Number(relayState.allowedChatId))
    ? Number(relayState.allowedChatId)
    : null;

  if (TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID != null && Number.isFinite(TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID)) {
    if (incomingChatId !== TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID) {
      return;
    }
  } else if (allowedChatIdFromState != null) {
    if (incomingChatId !== allowedChatIdFromState) {
      return;
    }
  } else if (TELEGRAM_CHAT_TO_SUPERVISOR_CHAT_ID_AUTOSET && msg.chat?.type === 'private') {
    relayState.allowedChatId = incomingChatId;
    relayState.allowedAt = new Date().toISOString();
    writeTelegramRelayState(relayState);
    if (TELEGRAM_CHAT_TO_SUPERVISOR_ACK) {
      bot.sendMessage(incomingChatId, `🔒 Bound chat-to-supervisor to this chat (${incomingChatId}).`);
    }
  }

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const supervisorPaneIndex = roleAgents.supervisorPaneIndex;
  const fromBits = [];
  if (msg.from?.username) {
    fromBits.push(`@${msg.from.username}`);
  }
  if (msg.from?.first_name || msg.from?.last_name) {
    fromBits.push([msg.from.first_name, msg.from.last_name].filter(Boolean).join(' '));
  }
  const fromLabel = fromBits.length > 0 ? fromBits.join(' ') : 'unknown';

  const subject = `Telegram chat: ${fromLabel || 'operator'}`;
  const body = `Telegram chat message (no slash command).\n\nFrom: ${fromLabel}\nChat: ${msg.chat?.id ?? 'unknown'}\n\n${text}`;
  relayState.lastChatId = Number(msg.chat?.id);
  relayState.lastFromLabel = fromLabel;
  relayState.lastIncomingAt = new Date().toISOString();
  relayState.lastMarker = `TG_MARKER:${crypto.randomBytes(4).toString('hex')}`;
  writeTelegramRelayState(relayState);

  try {
    const sent = await sendAgentMailMessage(supervisorName, [supervisorName], subject, body);
    if (sent) {
      if (TELEGRAM_CHAT_TO_SUPERVISOR_ACK) {
        bot.sendMessage(msg.chat.id, `✅ Sent to supervisor inbox (${supervisorName}).`);
      }
      // Also nudge the supervisor pane so they can respond quickly.
      if (TELEGRAM_CHAT_TO_SUPERVISOR_PANE && checkTmuxSession()) {
        const sessionName = resolveTmuxSessionName();
        if (isPaneSafeToPrompt(sessionName, supervisorPaneIndex)) {
          const replyHint = TELEGRAM_CHAT_TO_SUPERVISOR_RETURN
            ? 'Reply here with `TG: <your reply>` (or `TG(<chatId>): <reply>` to target a different chat).'
            : 'Reply here normally (Telegram return relay is disabled).';
          sendTmuxPrompt(buildAgentTarget(sessionName, supervisorPaneIndex), `Telegram chat from ${fromLabel}: ${text} ${replyHint} (${relayState.lastMarker})`);
        }
      }
      return;
    }
  } catch (error) {
    log('ERROR', 'Failed to route Telegram chat to supervisor', error);
  }

  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, '⚠️ Could not send to supervisor (Agent Mail + tmux unavailable).');
    return;
  }

  sendTmuxPrompt(buildAgentTarget(resolveTmuxSessionName(), supervisorPaneIndex), `Telegram chat from ${fromLabel}: ${text}`);
  bot.sendMessage(msg.chat.id, '⚠️ Agent Mail failed; sent to supervisor pane instead.');
});

function resetPollingBackoff() {
  pollingBackoffMs = 5000;
}

// Logging
function log(level, message, error = null) {
  const timestamp = new Date().toISOString();
  const errorDetails = (() => {
    if (!error) return '';
    const asObject = typeof error === 'object' ? error : null;
    const stack = asObject && typeof asObject.stack === 'string' ? asObject.stack : null;
    const messageText = asObject && typeof asObject.message === 'string' ? asObject.message : String(error);
    const cause = asObject && asObject.cause ? asObject.cause : null;
    const causeObject = cause && typeof cause === 'object' ? cause : null;
    const causeMessage = causeObject && typeof causeObject.message === 'string' ? causeObject.message : (cause ? String(cause) : null);
    const causeCode = causeObject && typeof causeObject.code === 'string' ? causeObject.code : null;
    const lines = [];
    lines.push(stack ? stack : `Error: ${messageText}`);
    if (causeMessage || causeCode) {
      lines.push(`Cause: ${causeCode ? `${causeCode} ` : ''}${causeMessage || ''}`.trim());
    }
    return `\n${lines.join('\n')}`.slice(0, 2500);
  })();

  const logMessage = `[${timestamp}] ${level}: ${message}${errorDetails}\n`;
  console.log(logMessage);

  // Ensure log directory exists
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  fs.appendFileSync(LOG_FILE, logMessage);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// systemd uses ProtectSystem=strict; some tools (e.g. tac) need a writable TMPDIR.
try {
  // Ensure child processes have a writable HOME/XDG tree under the allowed ReadWritePaths.
  // (ProtectHome=read-only + ProtectSystem=strict makes /root unwritable for services.)
  const runtimeHome = process.env.MAF_RUNTIME_HOME || path.join(ROUNDTABLE_DIR, '.agent-mail', 'runtime-home');
  process.env.HOME = runtimeHome;
  process.env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(runtimeHome, '.config');
  process.env.XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(runtimeHome, '.cache');
  process.env.XDG_STATE_HOME = process.env.XDG_STATE_HOME || path.join(runtimeHome, '.local', 'state');
  ensureDir(process.env.XDG_CONFIG_HOME);
  ensureDir(process.env.XDG_CACHE_HOME);
  ensureDir(process.env.XDG_STATE_HOME);

  const tmpDir = process.env.TMPDIR || path.join(MAF_STATE_DIR, 'tmp');
  process.env.TMPDIR = tmpDir;
  process.env.TMP = process.env.TMP || tmpDir;
  process.env.TEMP = process.env.TEMP || tmpDir;
  ensureDir(tmpDir);
} catch (error) {
  // Not fatal; best-effort only.
  log('ERROR', 'Failed to initialize TMPDIR', error);
}

function isSafePackName(name) {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9_-]*$/i.test(name);
}

function listPromptPacks() {
  if (!fs.existsSync(PROMPT_PACKS_DIR)) {
    return [];
  }
  try {
    return fs.readdirSync(PROMPT_PACKS_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace(/\.json$/, ''))
      .filter(isSafePackName)
      .sort();
  } catch (error) {
    log('ERROR', 'Failed to list prompt packs', error);
    return [];
  }
}

function readBroadcastPackSelection() {
  if (!fs.existsSync(BROADCAST_PACK_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(BROADCAST_PACK_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const pack = parsed && typeof parsed.pack === 'string' ? parsed.pack : null;
    return isSafePackName(pack) ? pack : null;
  } catch (error) {
    log('ERROR', 'Failed to read broadcast pack selection', error);
    return null;
  }
}

function writeBroadcastPackSelection(pack) {
  if (!isSafePackName(pack)) {
    return { ok: false, reason: 'invalid pack name' };
  }
  ensureDir(path.dirname(BROADCAST_PACK_PATH));
  try {
    fs.writeFileSync(BROADCAST_PACK_PATH, JSON.stringify({ pack }, null, 2));
    return { ok: true };
  } catch (error) {
    log('ERROR', 'Failed to write broadcast pack selection', error);
    return { ok: false, reason: error.message };
  }
}

function clearBroadcastPackSelection() {
  if (!fs.existsSync(BROADCAST_PACK_PATH)) {
    return { ok: true, removed: false };
  }
  try {
    fs.unlinkSync(BROADCAST_PACK_PATH);
    return { ok: true, removed: true };
  } catch (error) {
    log('ERROR', 'Failed to clear broadcast pack selection', error);
    return { ok: false, reason: error.message };
  }
}

function loadPromptPack(packName) {
  if (!isSafePackName(packName)) {
    return null;
  }
  const packPath = path.join(PROMPT_PACKS_DIR, `${packName}.json`);
  if (!fs.existsSync(packPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(packPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    log('ERROR', `Failed to load prompt pack ${packName}`, error);
    return null;
  }
}

function matchesAnyPrefix(value, prefixes) {
  if (!value) {
    return false;
  }
  if (!Array.isArray(prefixes) || prefixes.length === 0) {
    return true;
  }
  return prefixes.some(prefix => typeof prefix === 'string' && prefix && String(value).startsWith(prefix));
}

function readBroadcastPlan() {
  if (!fs.existsSync(BROADCAST_PLAN_PATH)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(BROADCAST_PLAN_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    log('ERROR', 'Failed to read broadcast plan', error);
    return null;
  }
}

function writeBroadcastPlan(plan) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(BROADCAST_PLAN_PATH, JSON.stringify(plan, null, 2));
}

function clearBroadcastPlan() {
  if (fs.existsSync(BROADCAST_PLAN_PATH)) {
    fs.unlinkSync(BROADCAST_PLAN_PATH);
  }
}

function readBroadcastAssignments() {
  if (!fs.existsSync(BROADCAST_ASSIGNMENTS_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(BROADCAST_ASSIGNMENTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const assignments = parsed && typeof parsed === 'object' ? parsed.assignments : null;
    if (!assignments || typeof assignments !== 'object') {
      return {};
    }
    return assignments;
  } catch (error) {
    log('ERROR', 'Failed to read broadcast assignments', error);
    return {};
  }
}

function writeBroadcastAssignments(assignments) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(BROADCAST_ASSIGNMENTS_PATH, JSON.stringify({
    updatedAt: new Date().toISOString(),
    assignments: assignments || {}
  }, null, 2));
}

function readAutopilotState() {
  if (!fs.existsSync(AUTOPILOT_STATE_PATH)) {
    return { sent: {} };
  }
  try {
    const raw = fs.readFileSync(AUTOPILOT_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { sent: {} };
    }
    if (!parsed.sent || typeof parsed.sent !== 'object') {
      parsed.sent = {};
    }
    return parsed;
  } catch (error) {
    log('ERROR', 'Failed to read autopilot state', error);
    return { sent: {} };
  }
}

function writeAutopilotState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(AUTOPILOT_STATE_PATH, JSON.stringify(state || { sent: {} }, null, 2));
}

function readMailForwardState() {
  if (!fs.existsSync(MAIL_FORWARD_STATE_PATH)) {
    return { forwardedMessageIds: [], lastCheckedAt: null };
  }
  try {
    const raw = fs.readFileSync(MAIL_FORWARD_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { forwardedMessageIds: [], lastCheckedAt: null };
    }
    if (!Array.isArray(parsed.forwardedMessageIds)) {
      parsed.forwardedMessageIds = [];
    }
    return parsed;
  } catch (error) {
    log('ERROR', 'Failed to read mail forward state', error);
    return { forwardedMessageIds: [], lastCheckedAt: null };
  }
}

function writeMailForwardState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(MAIL_FORWARD_STATE_PATH, JSON.stringify(state || { forwardedMessageIds: [], lastCheckedAt: null }, null, 2));
}

function readBroadcastDedupeState() {
  if (!fs.existsSync(BROADCAST_DEDUPE_STATE_PATH)) {
    return { sent: {} };
  }
  try {
    const raw = fs.readFileSync(BROADCAST_DEDUPE_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { sent: {} };
    }
    if (!parsed.sent || typeof parsed.sent !== 'object') {
      parsed.sent = {};
    }
    return parsed;
  } catch (error) {
    log('ERROR', 'Failed to read broadcast dedupe state', error);
    return { sent: {} };
  }
}

function writeBroadcastDedupeState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(BROADCAST_DEDUPE_STATE_PATH, JSON.stringify(state || { sent: {} }, null, 2));
}

function readPulseState() {
  if (!fs.existsSync(PULSE_STATE_PATH)) {
    return { lastHash: null };
  }
  try {
    const raw = fs.readFileSync(PULSE_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { lastHash: null };
  } catch (error) {
    log('ERROR', 'Failed to read pulse state', error);
    return { lastHash: null };
  }
}

function writePulseState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(PULSE_STATE_PATH, JSON.stringify(state || { lastHash: null }, null, 2));
}

function readIdleMailState() {
  if (!fs.existsSync(IDLE_MAIL_STATE_PATH)) {
    return { latestByAgent: {} };
  }
  try {
    const raw = fs.readFileSync(IDLE_MAIL_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { latestByAgent: {} };
    }
    if (!parsed.latestByAgent || typeof parsed.latestByAgent !== 'object') {
      parsed.latestByAgent = {};
    }
    return parsed;
  } catch (error) {
    log('ERROR', 'Failed to read idle-mail state', error);
    return { latestByAgent: {} };
  }
}

function writeIdleMailState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(IDLE_MAIL_STATE_PATH, JSON.stringify(state || { latestByAgent: {} }, null, 2));
}

function hasNewInboxMail(state, agentName, latestMessageId) {
  if (!agentName) {
    return false;
  }
  const id = Number.isFinite(Number(latestMessageId)) ? Number(latestMessageId) : null;
  if (id == null) {
    return false;
  }
  const key = String(agentName);
  const last = state?.latestByAgent?.[key];
  const lastId = last && Number.isFinite(Number(last.latestMessageId)) ? Number(last.latestMessageId) : null;
  // If we have no baseline yet, treat "latest exists" as new mail so wake-mode can prompt.
  if (lastId == null) {
    return true;
  }
  return id > lastId;
}

function hashPrompt(prompt) {
  const role = prompt?.role ? String(prompt.role) : '';
  const target = prompt?.target ? String(prompt.target) : '';
  const message = prompt?.message ? String(prompt.message) : '';
  return crypto.createHash('sha1').update(`${role}\n${target}\n${message}`).digest('hex');
}

function shouldSendBroadcastPrompt({ prompt, state, forceMode }) {
  if (forceMode) {
    return true;
  }
  if (!prompt?.role || !prompt?.target) {
    return true;
  }
  const key = `${prompt.role}:${prompt.target}`;
  const last = state?.sent?.[key];
  if (!last || typeof last !== 'object') {
    return true;
  }
  const lastHash = typeof last.hash === 'string' ? last.hash : null;
  if (!lastHash) {
    return true;
  }
  return lastHash !== hashPrompt(prompt);
}

function shouldSendAutopilotPrompt({ prompt, state, nowMs, cooldownMs }) {
  if (!prompt?.role || !prompt?.target) {
    return true;
  }
  const key = `${prompt.role}:${prompt.target}`;
  const last = state?.sent?.[key];
  if (!last || typeof last !== 'object') {
    return true;
  }
  const lastHash = typeof last.hash === 'string' ? last.hash : null;
  const lastSentAt = Number.isFinite(Number(last.sentAtMs)) ? Number(last.sentAtMs) : null;
  if (!lastHash || lastSentAt == null) {
    return true;
  }
  if (cooldownMs <= 0) {
    return true;
  }
  const same = lastHash === hashPrompt(prompt);
  if (!same) {
    return true;
  }
  if (AUTOPILOT_REQUIRE_CHANGE) {
    if (AUTOPILOT_REPEAT_SEC <= 0) {
      return false;
    }
    return (nowMs - lastSentAt) >= (AUTOPILOT_REPEAT_SEC * 1000);
  }
  return (nowMs - lastSentAt) >= cooldownMs;
}

function summarizeBroadcastPlan(plan) {
  if (!plan) {
    return '📡 Broadcast plan: none';
  }

  const createdAt = plan.createdAt ? new Date(plan.createdAt).getTime() : null;
  const ageSeconds = createdAt ? Math.floor((Date.now() - createdAt) / 1000) : null;
  const promptCount = Array.isArray(plan.prompts) ? plan.prompts.length : 0;
  const status = plan.status || 'unknown';

  if (status === 'pending') {
    return `📡 Broadcast plan: pending ${formatAge(ageSeconds)} ago (${promptCount} prompts). Use /broadcast-apply or /broadcast-cancel.`;
  }

  if (status === 'sent') {
    const sentAt = plan.sentAt ? new Date(plan.sentAt).getTime() : null;
    const sentAge = sentAt ? Math.floor((Date.now() - sentAt) / 1000) : null;
    return `📡 Broadcast plan: sent ${formatAge(sentAge)} ago (${promptCount} prompts).`;
  }

  if (status === 'canceled') {
    return '📡 Broadcast plan: canceled.';
  }

  return `📡 Broadcast plan: ${status} (${promptCount} prompts).`;
}

function readReviewRouterState() {
  if (!fs.existsSync(REVIEW_ROUTER_STATE_PATH)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(REVIEW_ROUTER_STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    log('ERROR', 'Failed to read review router state', error);
    return null;
  }
}

function writeReviewRouterState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(REVIEW_ROUTER_STATE_PATH, JSON.stringify(state, null, 2));
}

function readReviewRequestState() {
  if (!fs.existsSync(REVIEW_REQUEST_ROUTER_STATE_PATH)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(REVIEW_REQUEST_ROUTER_STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    log('ERROR', 'Failed to read review request state', error);
    return null;
  }
}

function writeReviewRequestState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(REVIEW_REQUEST_ROUTER_STATE_PATH, JSON.stringify(state, null, 2));
}

function readTelegramRelayState() {
  if (!fs.existsSync(TELEGRAM_RELAY_STATE_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(TELEGRAM_RELAY_STATE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    log('ERROR', 'Failed to read telegram relay state', error);
    return null;
  }
}

function writeTelegramRelayState(state) {
  ensureDir(MAF_STATE_DIR);
  fs.writeFileSync(TELEGRAM_RELAY_STATE_PATH, JSON.stringify(state, null, 2));
}

function summarizeReviewRouterState() {
  if (!REVIEW_ROUTER_ENABLED) {
    return '🔁 Review router: disabled';
  }

  const state = readReviewRouterState();
  if (!state) {
    return '🔁 Review router: enabled (awaiting first signal)';
  }

  const lastSeen = state.lastSeenTs ? new Date(state.lastSeenTs).getTime() : null;
  const lastRouted = state.lastRoutedAt ? new Date(state.lastRoutedAt).getTime() : null;
  const seenAge = lastSeen ? formatAge(Math.floor((Date.now() - lastSeen) / 1000)) : null;
  const routedAge = lastRouted ? formatAge(Math.floor((Date.now() - lastRouted) / 1000)) : null;

  let summary = '🔁 Review router: enabled';
  if (seenAge) {
    summary += ` (last inbox ${seenAge} ago)`;
  }
  if (state.lastBeadId) {
    summary += `, last bead ${state.lastBeadId}`;
  }
  if (routedAge) {
    summary += `, last routed ${routedAge} ago`;
  }
  return summary;
}

function getContextManagerStatus() {
  if (!fs.existsSync(CONTEXT_MANAGER_SCRIPT)) {
    return { status: 'missing', message: 'Context manager script not found' };
  }

  const result = spawnSync('bash', [CONTEXT_MANAGER_SCRIPT, 'status'], {
    encoding: 'utf8',
    timeout: 5000
  });

  if (result.error) {
    return { status: 'error', message: result.error.message };
  }

  const output = result.stdout || '';
  const statusLine = output.split('\n').find(line => line.startsWith('Status:'));
  if (!statusLine) {
    return { status: 'unknown', message: 'Status line missing', raw: output };
  }

  if (statusLine.includes('RUNNING')) {
    const pidMatch = statusLine.match(/PID\s+(\d+)/);
    return { status: 'running', pid: pidMatch ? pidMatch[1] : null, raw: statusLine.trim() };
  }

  if (statusLine.includes('stale')) {
    return { status: 'stale', raw: statusLine.trim() };
  }

  return { status: 'stopped', raw: statusLine.trim() };
}

function getMemoryServiceStatus() {
  if (!fs.existsSync(MEMORY_STATUS_SCRIPT)) {
    return { status: 'missing', message: 'Memory status script not found' };
  }

  const result = spawnSync('python3', [MEMORY_STATUS_SCRIPT, 'status'], {
    encoding: 'utf8',
    timeout: 8000
  });

  if (result.error) {
    return { status: 'error', message: result.error.message };
  }

  if (result.status !== 0) {
    return { status: 'error', message: result.stderr || 'Memory status failed' };
  }

  const output = result.stdout || '';
  const lines = output.split('\n');
  const summary = {};
  lines.forEach(line => {
    const match = line.match(/^\s*([a-z_]+):\s*(.+)\s*$/i);
    if (match) {
      summary[match[1]] = match[2];
    }
  });

  return {
    status: 'ok',
    usingMemlayer: summary.using_memlayer === 'True',
    openaiKeySet: summary.openai_key_set === 'True',
    storagePath: summary.storage_path,
    raw: output.trim()
  };
}

function sleepSync(ms) {
  if (!ms || ms <= 0) {
    return;
  }
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function findLastSignificantLine(lines) {
  if (!Array.isArray(lines)) {
    return '';
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = (lines[i] || '').trim();
    if (isIgnorableLine(line)) {
      continue;
    }

    return line;
  }

  return '';
}

function isIgnorableLine(line) {
  if (!line) {
    return true;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  if (QUIET_LINE_REGEX.test(trimmed)) {
    return true;
  }

  if (JSON_KV_REGEX.test(trimmed)) {
    return true;
  }

  if (isPlaceholderLine(trimmed)) {
    return true;
  }

  if (isInputPromptLine(trimmed)) {
    return true;
  }

  if (trimmed.length >= 6 && /^[^A-Za-z0-9]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

function isInputPromptLine(line) {
  if (!line) {
    return false;
  }

  const trimmed = line.trim();
  if (!/^[›>]/.test(trimmed)) {
    return false;
  }

  if (/↵\s*send/i.test(trimmed)) {
    return true;
  }

  if (/\bsend\b/i.test(trimmed) && trimmed.length <= 160) {
    return true;
  }

  if (trimmed.length <= 200) {
    return true;
  }

  return false;
}

function computePromptWaiting(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return false;
  }

  let lastPromptIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] || '').trim();
    if (!line) {
      continue;
    }

    if (isInputPromptLine(line)) {
      const inputText = extractPromptInput(line);
      if (isDefaultPromptInput(inputText)) {
        continue;
      }
      lastPromptIndex = i;
      continue;
    }

    if (PROMPT_DETECTION_REGEX.test(line)) {
      lastPromptIndex = i;
    }
  }

  if (lastPromptIndex === -1) {
    return false;
  }

  // If the latest input bar is visible, assume the prompt is still waiting.
  for (let i = lines.length - 1; i > lastPromptIndex; i -= 1) {
    const line = (lines[i] || '').trim();
    if (isInputPromptLine(line)) {
      const inputText = extractPromptInput(line);
      if (isDefaultPromptInput(inputText)) {
        continue;
      }
      return true;
    }

    if (!isIgnorableLine(line) && !PROMPT_DETECTION_REGEX.test(line)) {
      return false;
    }
  }

  return true;
}

function formatAge(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'unknown';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h${remainder}m`;
}

function getPaneIdleAgeSeconds(sessionName, paneIndex) {
  const target = buildAgentTarget(sessionName, paneIndex);
  const activity = readPaneActivity(sessionName, target, paneIndex);
  if (!activity || !Number.isFinite(activity.value)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (activity.value > 1000000000) {
    return Math.max(0, now - activity.value);
  }

  return Math.max(0, activity.value);
}

function isPaneBusy(activity, idleAgeSeconds) {
  if (idleAgeSeconds !== null && idleAgeSeconds < SUPERVISOR_BUSY_WINDOW_SEC) {
    return true;
  }

  if (!activity) {
    return false;
  }

  if (Array.isArray(activity.fullHistory) && activity.fullHistory.some(line => BUSY_OUTPUT_REGEX.test(line))) {
    return true;
  }

  if (Array.isArray(activity.conversationHistory) && activity.conversationHistory.some(entry => BUSY_OUTPUT_REGEX.test(entry.content))) {
    return true;
  }

  return false;
}

function readPaneActivity(sessionName, target, paneIndex) {
  const agentWindow = resolveAgentWindowName(sessionName);
  const formats = ['#{pane_activity}', '#{pane_last_activity}'];
  for (const format of formats) {
    try {
      const raw = execSync(`${TMUX_BIN} display-message -p -t "${target}" "${format}"`, { encoding: 'utf8' }).trim();
      const value = parseInt(raw, 10);
      if (!Number.isNaN(value) && value > 0) {
        return { value, raw };
      }
    } catch (error) {
      // ignore
    }
  }

  try {
    const listOutput = execSync(
      `${TMUX_BIN} list-panes -t "${sessionName}:${agentWindow}" -F "#{pane_index} #{pane_activity} #{pane_last_activity}"`,
      { encoding: 'utf8' }
    );
    const lines = listOutput.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) {
        continue;
      }
      const index = parseInt(parts[0], 10);
      if (Number.isNaN(index) || index !== paneIndex) {
        continue;
      }
      const activityValue = parseInt(parts[1], 10);
      if (!Number.isNaN(activityValue) && activityValue > 0) {
        return { value: activityValue, raw: parts[1] };
      }
      const lastValue = parts[2] ? parseInt(parts[2], 10) : NaN;
      if (!Number.isNaN(lastValue) && lastValue > 0) {
        return { value: lastValue, raw: parts[2] };
      }
    }
  } catch (error) {
    // ignore
  }

  return { value: null, raw: null };
}

function listTmuxSessions() {
  try {
    const output = execSync(`${TMUX_BIN} list-sessions -F "#{session_name}"`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    log('ERROR', 'Failed to list tmux sessions', error);
    return [];
  }
}

function resolveTmuxSessionName() {
  const envSession = process.env.MAF_TMUX_SESSION || process.env.TMUX_SESSION;
  if (envSession) {
    return envSession;
  }

  const sessions = listTmuxSessions();

  const agents = getAgentInfo();
  const registrySession = agents.find(agent => agent.session)?.session;
  if (registrySession && sessions.includes(registrySession)) {
    return registrySession;
  }

  if (sessions.length === 1) {
    return sessions[0];
  }

  return 'maf-cli';
}

function resolveAgentWindowName(sessionName) {
  if (!sessionName) {
    return '0';
  }

  try {
    const output = execSync(`${TMUX_BIN} list-windows -t "${sessionName}" -F "#{window_name}"`, { encoding: 'utf8' });
    const names = output.trim().split('\n').filter(Boolean);
    if (names.includes(AGENTS_WINDOW_NAME)) {
      return AGENTS_WINDOW_NAME;
    }
  } catch (error) {
    // ignore
  }

  return '0';
}

function buildAgentTarget(sessionName, paneIndex) {
  const windowName = resolveAgentWindowName(sessionName);
  return `${sessionName}:${windowName}.${paneIndex}`;
}

// Check if tmux session exists
function checkTmuxSession() {
  const sessionName = resolveTmuxSessionName();
  const sessions = listTmuxSessions();
  if (sessions.includes(sessionName)) {
    return true;
  }

  const probe = spawnSync(TMUX_BIN, ['has-session', '-t', sessionName], { stdio: 'ignore' });
  return probe.status === 0;
}

// Get all tmux sessions info
function getAllTmuxSessions() {
  try {
    const output = execSync(`${TMUX_BIN} list-sessions -F "#{session_name}: #{session_windows} windows, #{session_panes} panes, created #{session_created_string}"`, { encoding: 'utf8' });
    return output.trim().split('\n');
  } catch (error) {
    log('ERROR', 'Failed to get tmux sessions', error);
    return [];
  }
}

// Get tmux pane info for specific session
function getTmuxPaneInfo(sessionName) {
  const resolvedSession = sessionName || resolveTmuxSessionName();
  try {
    const output = execSync(`${TMUX_BIN} list-panes -t "${resolvedSession}" -F "#{pane_index}: #{pane_current_command} #{pane_id}"`, { encoding: 'utf8' });
    return output.trim().split('\n');
  } catch (error) {
    log('ERROR', `Failed to get tmux pane info for session ${resolvedSession}`, error);
    return [];
  }
}

// Get detailed session info
function getDetailedSessionInfo(sessionName) {
  const resolvedSession = sessionName || resolveTmuxSessionName();
  try {
    const windows = execSync(`${TMUX_BIN} list-windows -t "${resolvedSession}" -F "#{window_index}: #{window_name} (#{window_panes} panes)"`, { encoding: 'utf8' });
    const panes = execSync(`${TMUX_BIN} list-panes -t "${resolvedSession}" -F "  Pane #{pane_index}: #{pane_current_command} (#{pane_width}x#{pane_height})"`, { encoding: 'utf8' });
    return {
      windows: windows.trim().split('\n'),
      panes: panes.trim().split('\n')
    };
  } catch (error) {
    return { windows: [], panes: [] };
  }
}

// Get agent information from Agent Mail registry
function getAgentInfo() {
  try {
    const registryPath = path.join(ROUNDTABLE_DIR, '.agent-mail', 'agents', 'registry.json');
    if (fs.existsSync(registryPath)) {
      const content = fs.readFileSync(registryPath, 'utf8');
      const data = JSON.parse(content);
      return data.agents || [];
    }
  } catch (error) {
    log('ERROR', 'Failed to read agent registry', error);
  }
  return [];
}

function readAgentTopologyConfig() {
  if (cachedAgentTopologyConfig !== undefined) {
    return cachedAgentTopologyConfig;
  }
  cachedAgentTopologyConfig = null;
  try {
    if (!fs.existsSync(AGENT_TOPOLOGY_PATH)) {
      return cachedAgentTopologyConfig;
    }
    const raw = fs.readFileSync(AGENT_TOPOLOGY_PATH, 'utf8');
    cachedAgentTopologyConfig = JSON.parse(raw);
  } catch (error) {
    cachedAgentTopologyConfig = null;
    log('ERROR', 'Failed to read agent-topology config', error);
  }
  return cachedAgentTopologyConfig;
}

function normalizePaneIndex(value) {
  if (value == null) {
    return null;
  }
  const idx = Number.parseInt(String(value), 10);
  return Number.isFinite(idx) ? idx : null;
}

function getRoleToPaneMap() {
  const base = { ...DEFAULT_ROLE_TO_PANE };
  const topology = readAgentTopologyConfig();

  const roleToPane = topology && typeof topology.role_to_pane === 'object' ? topology.role_to_pane : null;
  if (roleToPane) {
    Object.entries(roleToPane).forEach(([role, paneIndex]) => {
      const idx = normalizePaneIndex(paneIndex);
      if (idx == null) return;
      base[String(role)] = idx;
    });
  } else if (topology && Array.isArray(topology.panes)) {
    topology.panes.forEach(pane => {
      const role = pane && pane.role ? String(pane.role) : '';
      const idx = normalizePaneIndex(pane && pane.index);
      if (!role || idx == null) return;
      base[role] = idx;
    });
  }

  return base;
}

function getAgentNameForPane(paneIndex) {
  const idx = normalizePaneIndex(paneIndex);
  if (idx == null) {
    return null;
  }

  const topology = readAgentTopologyConfig();
  if (topology && Array.isArray(topology.panes)) {
    const found = topology.panes.find(pane => normalizePaneIndex(pane && pane.index) === idx);
    if (found && found.agent_name) {
      return String(found.agent_name);
    }
  }

  return AGENT_NAME_BY_PANE[idx] || null;
}

function getAgentIdByPane(agentInfo, paneIndex) {
  if (!Array.isArray(agentInfo)) {
    return null;
  }
  const idx = normalizePaneIndex(paneIndex);
  if (idx == null) {
    return null;
  }
  const found = agentInfo.find(agent => normalizePaneIndex(agent && agent.pane) === idx);
  if (found && found.id) {
    return String(found.id);
  }
  return null;
}

function resolveRoleAgents(agentInfo) {
  const roleToPane = getRoleToPaneMap();
  const supervisorPaneIndex = normalizePaneIndex(roleToPane.supervisor) ?? DEFAULT_ROLE_TO_PANE.supervisor;
  const reviewerPaneIndex = normalizePaneIndex(roleToPane.reviewer) ?? DEFAULT_ROLE_TO_PANE.reviewer;
  const implementor1PaneIndex = normalizePaneIndex(roleToPane['implementor-1']) ?? DEFAULT_ROLE_TO_PANE['implementor-1'];
  const implementor2PaneIndex = normalizePaneIndex(roleToPane['implementor-2']) ?? DEFAULT_ROLE_TO_PANE['implementor-2'];

  const supervisorName = getAgentIdByPane(agentInfo, supervisorPaneIndex)
    || getAgentNameForPane(supervisorPaneIndex)
    || 'GreenMountain';
  const reviewerName = getAgentIdByPane(agentInfo, reviewerPaneIndex)
    || getAgentNameForPane(reviewerPaneIndex)
    || 'BlackDog';
  const implementor1Name = getAgentIdByPane(agentInfo, implementor1PaneIndex)
    || getAgentNameForPane(implementor1PaneIndex)
    || 'OrangePond';
  const implementor2Name = getAgentIdByPane(agentInfo, implementor2PaneIndex)
    || getAgentNameForPane(implementor2PaneIndex)
    || 'FuchsiaCreek';

  return {
    supervisorName,
    reviewerName,
    implementor1Name,
    implementor2Name,
    supervisorPaneIndex,
    reviewerPaneIndex,
    implementor1PaneIndex,
    implementor2PaneIndex
  };
}

function sanitizeTmuxLine(line) {
  if (!line) {
    return '';
  }
  let clean = stripAnsiCodes(line);
  clean = clean.replace(/\u00a0/g, ' ');
  clean = clean.replace(/\r/g, '');
  return clean;
}

function buildPaneSnapshot(sessionName, paneIndex, maxLines = 6) {
  const target = buildAgentTarget(sessionName, paneIndex);
  const rawLines = captureTmuxPaneLines(target, 40);
  const cleaned = rawLines
    .map(line => sanitizeTmuxLine(line).trim())
    .filter(line => line)
    .filter(line => !isNoiseLine(line) && !isPlaceholderLine(line));
  const tail = cleaned.slice(-maxLines);
  if (tail.length === 0) {
    return '(idle)';
  }
  return tail.join('\n');
}

let cachedContextManagerEnv = null;

function readContextManagerEnv() {
  if (cachedContextManagerEnv) {
    return cachedContextManagerEnv;
  }

  const env = {};
  try {
    if (!fs.existsSync(CONTEXT_MANAGER_ENV_PATH)) {
      cachedContextManagerEnv = env;
      return env;
    }
    const contents = fs.readFileSync(CONTEXT_MANAGER_ENV_PATH, 'utf8');
    contents.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        return;
      }
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    });
  } catch (error) {
    log('ERROR', 'Failed to read context-manager.env', error);
  }
  cachedContextManagerEnv = env;
  return env;
}

function shellEscapeSingleQuotes(value) {
  if (!value) {
    return '';
  }
  return value.replace(/'/g, `'\\''`);
}

function getCodexCommandForPane(paneIndex) {
  const env = readContextManagerEnv();
  const idx = normalizePaneIndex(paneIndex);
  const roleToPane = getRoleToPaneMap();
  const supervisorPaneIndex = normalizePaneIndex(roleToPane.supervisor) ?? DEFAULT_ROLE_TO_PANE.supervisor;
  const reviewerPaneIndex = normalizePaneIndex(roleToPane.reviewer) ?? DEFAULT_ROLE_TO_PANE.reviewer;

  if (idx != null && idx === supervisorPaneIndex) {
    return process.env.MAF_SUPERVISOR_CMD || env.MAF_SUPERVISOR_CMD || 'claude --sandbox danger-full-access --ask-for-approval never';
  }
  if (idx != null && idx === reviewerPaneIndex) {
    return process.env.MAF_REVIEWER_CMD || env.MAF_REVIEWER_CMD || 'claude --sandbox danger-full-access --ask-for-approval never';
  }
  return 'claude --sandbox danger-full-access --ask-for-approval never';
}

function buildCodexResetCommand(sessionName, agentName, paneIndex) {
  const memoryScript = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', 'agent-memory.sh');
  const mailFetch = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', 'agent-mail-fetch.sh');
  const teamName = `team_${sessionName}`;
  const steps = [
    `export AGENT_NAME="${agentName}"`,
    `export AGENT_TEAM="${teamName}"`,
    'echo "=== AGENT RESTARTED WITH MEMLAYER RESTORE ==="',
    `${memoryScript} restore`,
    `${mailFetch} "${agentName}"`,
    'bd ready --json | head -5',
    getCodexCommandForPane(paneIndex)
  ];
  return `bash -lc '${shellEscapeSingleQuotes(steps.join('; '))}'`;
}

function resetCodexPane(sessionName, paneIndex) {
  const agentInfo = getAgentInfo();
  const agentName = getAgentIdByPane(agentInfo, paneIndex)
    || getAgentNameForPane(paneIndex)
    || `agent-${paneIndex}`;
  const target = buildAgentTarget(sessionName, paneIndex);
  const cmd = buildCodexResetCommand(sessionName, agentName, paneIndex);
  const result = spawnSync(TMUX_BIN, ['respawn-pane', '-t', target, '-k', cmd], { cwd: ROUNDTABLE_DIR });
  if (result.status === 0) {
    sleepSync(1200);
    maybeSelectReasoningLevel(target);
  }
  return result.status === 0;
}

function maybeSelectReasoningLevel(target) {
  const snapshot = captureTmuxPaneLines(target, 40).join('\n');
  if (!/Select Reasoning Level/i.test(snapshot)) {
    return;
  }
  spawnSync(TMUX_BIN, ['send-keys', '-t', target, CODEX_REASONING_CHOICE], { cwd: ROUNDTABLE_DIR });
  sleepSync(TMUX_SEND_DELAY_MS);
  spawnSync(TMUX_BIN, ['send-keys', '-t', target, 'C-m'], { cwd: ROUNDTABLE_DIR });
}

function extractBeadSummary(lines) {
  if (!lines || lines.length === 0) {
    return null;
  }
  let beadId = null;
  let title = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = sanitizeTmuxLine(lines[i]).trim();
    if (!line) continue;
    const idMatch = line.match(/"id"\s*:\s*"(roundtable-[a-z0-9]+)"/i);
    if (idMatch) {
      beadId = idMatch[1];
    }
    const titleMatch = line.match(/"title"\s*:\s*"([^"]+)"/);
    if (titleMatch) {
      title = titleMatch[1];
    }
    if (beadId && title) {
      break;
    }
  }
  if (beadId && title) {
    return `${beadId}: ${title}`;
  }
  if (beadId) {
    return beadId;
  }
  return null;
}

function isPlaceholderLine(line) {
  if (!line) {
    return false;
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  const promptText = extractPromptInput(trimmed);
  if (isDefaultPromptInput(promptText)) {
    return true;
  }

  if (/^[›>]\s*Try\s+"[^"]*<[^>]+>[^"]*"\s*$/i.test(trimmed)) {
    return true;
  }

  return false;
}

function isNoiseLine(line) {
  if (!line) {
    return true;
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.startsWith('Tip:')) return true;
  if (/^\/model to /i.test(trimmed)) return true;
  if (/^model:/i.test(trimmed)) return true;
  if (/^directory:/i.test(trimmed)) return true;
  if (/context left/i.test(trimmed)) return true;
  if (/OpenAI Codex/i.test(trimmed)) return true;
  if (/Claude Code v/i.test(trimmed)) return true;
  if (/API Usage Billing/i.test(trimmed)) return true;
  if (/^slash-commands#/i.test(trimmed)) return true;
  if (/~/i.test(trimmed) && /projects\/roundtable/i.test(trimmed)) return true;
  if (/^[╭╰│]/.test(trimmed)) return true;
  if (/^[─-]{5,}$/.test(trimmed)) return true;
  if (/^[›>]\s*$/.test(trimmed)) return true;
  if (JSON_KV_REGEX.test(trimmed)) return true;

  return false;
}

// Get pane activity and last message
function getPaneActivity(sessionName, paneIndex) {
  try {
    // Use correct tmux targeting: session:window.pane for panes in window 0, or session:pane for panes in window 0 with default window
    const target = buildAgentTarget(sessionName, paneIndex);

    // Capture the last 50 lines from the pane (increased for better context)
    const history = execSync(`${TMUX_BIN} capture-pane -t "${target}" -p -S -50`, { encoding: 'utf8' });
    const lines = history
      .split('\n')
      .map(line => sanitizeTmuxLine(line))
      .filter(line => line.trim());
    const activityInfo = readPaneActivity(sessionName, target, paneIndex);
    const lastActivity = activityInfo.value;
    const lastActivityRaw = activityInfo.raw;

    if (lines.length === 0) {
      return {
        lastSpeaker: 'none',
        lastMessage: 'No activity',
        isActive: false,
        conversationHistory: [],
        lastActivity,
        lastActivityRaw,
        target: target
      };
    }

    // Extract LLM conversation content
    let conversationHistory = extractConversationContent(lines);
    const beadSummary = extractBeadSummary(lines);

    // Find the last meaningful line with enhanced logic
    let lastMeaningfulLine = '';
    let speaker = 'unknown';

    // Define patterns to skip (separators, decorations, etc.)
    const skipPatterns = [
      /^[-─=]{10,}$/,  // Lines with 10+ dashes, equals, or box-drawing characters
      /^[*]{10,}$/,    // Lines with 10+ asterisks
      /^\s*[·•▪▫◦]\s*$/,  // Bullet points without text
      /^\s*\d+\.\s*$/,  // Numbered list items without text
      /^\s*\[[^\]]+\]\s*$/,  // Empty checkboxes or markers like [ ]
      /^\s*[()]\s*$/,  // Empty parentheses
      /^\s*[{}]\s*$/,  // Empty braces
      /^\s*[<>]\s*$/,  // Empty angle brackets
      /^\s*\|\s*$/,    // Single pipe character
      /^\s*#\s*$/,     // Single hash
      /^\s*---\s*$/,   // Three dashes (markdown separator)
      /^\s*\*\*\*\s*$/ // Three asterisks (markdown separator)
    ];

    // Define patterns that indicate meaningful content
    const meaningfulPatterns = [
      /^\d+%.*left/,  // Context remaining messages
      /^[Uu]ser:|^[Hh]uman:|^[Qq]uestion:/,  // User messages
      /^[Cc]laude:|^[Aa]ssistant:|^[Aa]nswer:/,  // Agent messages
      /^(✓|✔|✅|→|➜|▶|❌|⚠️|⚡|🔄|⚙️|🔧)/,  // Task/action/status indicators with emojis
      /🎯|📋|✨|💡|🎉|📝|🔍|🚀/,  // Meaningful emoji content
      /^(TODO|FIXME|NOTE|INFO|WARNING|ERROR):/i,  // Development markers
      /\b(completed|finished|done|success|failed|error)\b/i,  // Status words
      /\b(Next steps|Follow-up|Implementation|Review)\b/i,  // Action phrases
      /\b(TypeScript|JavaScript|Node\.js|Python|bash)\b/,  // Technology references
      />\s*\w+/,  // Git diffs or output markers
      /^\s*\w+\s*:\s*[\w\S]+/,  // Key-value pairs
      /\[\w+\]/,  // Tags or markers with content
      /\.{3}|…/,  // Ellipses (often in progress messages)
    ];

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();

      // Skip empty lines and command prompts
      if (!line || line.match(/^[\$]/)) {
        continue;
      }

      if (isNoiseLine(line) || isPlaceholderLine(line)) {
        continue;
      }

      // Skip separator lines and decorations
      if (skipPatterns.some(pattern => line.match(pattern))) {
        continue;
      }

      // Check if line contains meaningful content
      if (meaningfulPatterns.some(pattern => line.match(pattern)) ||
          (line.length > 5 && !line.match(/^[\s\-_#=*|\\\/]+$/))) {
        lastMeaningfulLine = line;
        break;
      }
    }

    // Determine who spoke last based on conversation patterns
    if (conversationHistory.length > 0) {
      const lastEntry = conversationHistory[conversationHistory.length - 1];
      speaker = lastEntry.speaker;
    } else if (lastMeaningfulLine) {
      // Enhanced fallback detection
      if (lastMeaningfulLine.match(/^\d+%.*left/)) {
        speaker = 'agent'; // Context messages are from the agent
      } else if (lastMeaningfulLine.match(/User:|Human:|👤|question/i)) {
        speaker = 'user';
      } else if (lastMeaningfulLine.match(/Claude:|Assistant:|🤖|answer|response/i)) {
        speaker = 'agent';
      } else if (lastMeaningfulLine.match(/^(✓|✔|✅|→|➜|▶|❌|⚠️|⚡|🔄|⚙️|🔧)/)) {
        speaker = 'agent'; // Status/action indicators are typically from agents
      } else if (lines.some(line => line.match(/^[\$>]/))) {
        // If we see command prompts in the history, assume it's a user context
        speaker = 'user';
      } else {
        // Default to agent for LLM terminals
        speaker = 'agent';
      }
    }

    if ((!lastMeaningfulLine || JSON_KV_REGEX.test(lastMeaningfulLine)) && beadSummary) {
      lastMeaningfulLine = beadSummary;
    }

    if (conversationHistory.length === 0 && beadSummary) {
      conversationHistory = [
        {
          speaker: 'agent',
          content: `Bead: ${beadSummary}`,
          type: 'status_update'
        }
      ];
    }

    return {
      lastSpeaker: speaker,
      lastMessage: lastMeaningfulLine ? lastMeaningfulLine.substring(0, 150) : '(idle)', // Increased length limit
      isActive: lines.filter(line => !isNoiseLine(line) && !isPlaceholderLine(line)).length > 2,
      fullHistory: lines.slice(-10), // More context
      conversationHistory: conversationHistory.slice(-3), // Last 3 conversation entries
      lastActivity,
      lastActivityRaw,
      target: target
    };
  } catch (error) {
    log('ERROR', `Failed to get pane activity for ${sessionName}:${paneIndex}`, error);
    return {
      lastSpeaker: 'error',
      lastMessage: `Could not read activity: ${error.message}`,
      isActive: false,
      conversationHistory: [],
      target: buildAgentTarget(sessionName, paneIndex)
    };
  }
}

// Extract LLM conversation content from pane history
function extractConversationContent(lines) {
  const conversations = [];

  // Define patterns to skip (separators and non-meaningful content)
  const skipPatterns = [
    /^[-─=]{10,}$/,  // Lines with 10+ dashes, equals, or box-drawing characters
    /^[*]{10,}$/,    // Lines with 10+ asterisks
    /^\s*[·•▪▫◦]\s*$/,  // Bullet points without text
    /^\s*\d+\.\s*$/,  // Numbered list items without text
    /^\s*\[[^\]]+\]\s*$/,  // Empty checkboxes or markers
    /^\s*[()]\s*$/,  // Empty parentheses
    /^\s*[{}]\s*$/,  // Empty braces
    /^\s*---\s*$/,   // Three dashes (markdown separator)
    /^\s*\*\*\*\s*$/ // Three asterisks (markdown separator)
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = sanitizeTmuxLine(lines[i]).trim();

    // Skip separator lines and decorations
    if (skipPatterns.some(pattern => line.match(pattern))) {
      continue;
    }

    // Skip empty lines and command prompts
    if (!line || line.match(/^[\$>]/)) {
      continue;
    }

    if (isNoiseLine(line) || isPlaceholderLine(line)) {
      continue;
    }

    if (JSON_KV_REGEX.test(line)) {
      continue;
    }

    // Enhanced user message patterns
    if (line.match(/^[Uu]ser:|^[Hh]uman:|^[Qq]uestion:/)) {
      conversations.push({
        speaker: 'user',
        content: line.replace(/^[Uu]ser:|^[Hh]uman:|^[Qq]uestion:/, '').trim(),
        type: 'question'
      });
    }
    // Enhanced agent message patterns
    else if (line.match(/^[Cc]laude:|^[Aa]ssistant:|^[Aa]nswer:/)) {
      conversations.push({
        speaker: 'agent',
        content: line.replace(/^[Cc]laude:|^[Aa]ssistant:|^[Aa]nswer:/, '').trim(),
        type: 'response'
      });
    }
    // Task completion patterns (enhanced)
    else if (line.match(/^(✓|✔|✅)/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'task_complete'
      });
    }
    // Action/execution patterns (enhanced)
    else if (line.match(/^(→|➜|▶|⇒|↳)/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'action'
      });
    }
    // Error/warning patterns (enhanced)
    else if (line.match(/^(❌|⚠️|⚡|🚫|❗)/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'error'
      });
    }
    // Progress/work patterns (enhanced)
    else if (line.match(/^(🔄|⚙️|🔧|🛠️|📝|🔍|📋)/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'progress'
      });
    }
    // Context indicators (already good)
    else if (line.match(/^\d+%.*left/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'context'
      });
    }
    // Follow-up and next steps patterns
    else if (line.match(/🎯|📋|✨|💡|🎉|🚀|📊|📈|💬/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'status_update'
      });
    }
    // Development marker patterns
    else if (line.match(/^(TODO|FIXME|NOTE|INFO|WARNING|ERROR):/i)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'development_marker'
      });
    }
    // Status completion patterns
    else if (line.match(/\b(completed|finished|done|success|implemented|resolved)\b/i)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'completion'
      });
    }
    // Action-oriented phrases
    else if (line.match(/\b(Next steps|Follow-up|Implementation|Review|Testing)\b/i)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'action_plan'
      });
    }
    // Error patterns without emojis
    else if (line.match(/\b(error|failed|failure|exception|bug)\b/i)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'error'
      });
    }
    // Technology-specific messages
    else if (line.match(/\b(TypeScript|JavaScript|Node\.js|Python|bash|git|npm|pnpm)\b/)) {
      // Check if it's a meaningful message about the technology
      if (line.length > 10) {
        conversations.push({
          speaker: 'agent',
          content: line,
          type: 'technical_message'
        });
      }
    }
    // File operation patterns
    else if (line.match(/\b(create|update|modify|edit|write|read|delete|remove)\s+\w+/i)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'file_operation'
      });
    }
    // Git operation patterns
    else if (line.match(/^(git|commit|push|pull|merge|branch|checkout)/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'git_operation'
      });
    }
    // Structured output patterns (e.g., from commands)
    else if (line.match(/^[A-Z][a-z]+:\s*.+/)) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'structured_output'
      });
    }
    // Lines with parentheses indicating results
    else if (line.match(/\(.+\)$/) && line.length > 5) {
      conversations.push({
        speaker: 'agent',
        content: line,
        type: 'result'
      });
    }
    // Lines that look like meaningful text content
    else if (line.length > 10 &&
             !line.match(/^[\s\-_#=*|\\\/]+$/) &&
             !line.match(/^\d+%.*left/) && // Already captured above
             !line.match(/^\[\w+\]$/) &&  // Single tags without content
             line.match(/[A-Za-z]/)) {  // Contains letters
      conversations.push({
        speaker: 'agent', // Default to agent for general content
        content: line,
        type: 'general_content'
      });
    }
  }

  return conversations;
}

// Detect LLM model from command line or environment
function detectLLMModel(command, paneHistory = []) {
  // Check command line for model info
  if (command.includes('claude')) {
    if (command.includes('opus') || paneHistory.some(line => line.includes('opus'))) return 'Claude Opus';
    if (command.includes('sonnet') || paneHistory.some(line => line.includes('sonnet'))) return 'Claude Sonnet';
    if (command.includes('haiku') || paneHistory.some(line => line.includes('haiku'))) return 'Claude Haiku';
    return 'Claude (unknown model)';
  }

  if (command.includes('gpt') || command.includes('openai')) {
    if (command.includes('gpt-4') || paneHistory.some(line => line.includes('gpt-4'))) return 'GPT-4';
    if (command.includes('gpt-3') || paneHistory.some(line => line.includes('gpt-3'))) return 'GPT-3';
    return 'OpenAI (unknown model)';
  }

  if (command.includes('node')) return 'Node.js App';
  if (command.includes('python')) return 'Python';
  if (command.includes('bash')) return 'Bash Shell';

  return command || 'Unknown';
}

// Map pane index to agent role based on MAF layout (topology-derived)
function getAgentRole(paneIndex) {
  const idx = normalizePaneIndex(paneIndex);
  if (idx == null) {
    return { name: `Agent-${paneIndex}`, type: 'unknown', focus: 'general' };
  }

  const roles = {
    supervisor: { name: 'Supervisor', type: 'claude', focus: 'coordination' },
    reviewer: { name: 'Reviewer', type: 'claude', focus: 'code-review' },
    'implementor-1': { name: 'Implementor-1', type: 'claude', focus: 'frontend/site' },
    'implementor-2': { name: 'Implementor-2', type: 'claude', focus: 'backend/api' }
  };

  const roleToPane = getRoleToPaneMap();
  const resolvedRole = ['supervisor', 'reviewer', 'implementor-1', 'implementor-2']
    .find(role => normalizePaneIndex(roleToPane[role]) === idx);
  if (resolvedRole && roles[resolvedRole]) {
    return roles[resolvedRole];
  }

  return { name: `Agent-${idx}`, type: 'unknown', focus: 'general' };
}

// Execute script with feedback
function executeScript(scriptName, chatId) {
  return new Promise((resolve) => {
    const scriptPath = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', scriptName);

    if (!fs.existsSync(scriptPath)) {
      bot.sendMessage(chatId, `❌ Script not found: ${scriptPath}`);
      return resolve({ success: false, error: 'Script not found' });
    }

    bot.sendMessage(chatId, `🚀 Executing script: ${scriptName}`);

    let output = '';
    let errorOutput = '';

    const child = spawn('bash', [scriptPath], {
      cwd: ROUNDTABLE_DIR,
      env: { ...process.env, MAF_TMUX_SESSION: resolveTmuxSessionName() }
    });

    child.stdout.on('data', (data) => {
      output += data.toString();
      // Send output in chunks to avoid message length limits
      if (output.length > 1000) {
        bot.sendMessage(chatId, `📤 Output:\n\`\`\`\n${output.slice(0, 1000)}...\`\`\``, { parse_mode: 'Markdown' });
        output = output.slice(1000);
      }
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        bot.sendMessage(chatId, `✅ Script completed successfully!\n\nFinal output:\n\`\`\`\n${output || 'No output'}\`\`\``, { parse_mode: 'Markdown' });
        log('INFO', `Script ${scriptName} executed successfully`);
        resolve({ success: true, output });
      } else {
        bot.sendMessage(chatId, `❌ Script failed with exit code ${code}\n\nError:\n\`\`\`\n${errorOutput}\`\`\``, { parse_mode: 'Markdown' });
        log('ERROR', `Script ${scriptName} failed`, new Error(errorOutput));
        resolve({ success: false, error: errorOutput });
      }
    });

    child.on('error', (error) => {
      bot.sendMessage(chatId, `❌ Failed to execute script: ${error.message}`);
      log('ERROR', `Failed to execute script ${scriptName}`, error);
      resolve({ success: false, error: error.message });
    });
  });
}

// Get focused agent activity
function getFocusedAgentActivity(debug = false) {
  const sessionName = resolveTmuxSessionName();

  try {
    if (!checkTmuxSession()) {
      return `❌ No active tmux session "${sessionName}" found`;
    }

    // Get agent registry information (Agent Mail registry.json)
    const agentInfo = getAgentInfo();
    const roleAgents = resolveRoleAgents(agentInfo);
    const supervisorPaneIndex = roleAgents.supervisorPaneIndex;
    const reviewerPaneIndex = roleAgents.reviewerPaneIndex;
    const implementor1PaneIndex = roleAgents.implementor1PaneIndex;
    const implementor2PaneIndex = roleAgents.implementor2PaneIndex;

    // Check for agent names in recent reservations
    const reservationsDir = path.join(ROUNDTABLE_DIR, '.agent-mail', 'reservations');
    const recentReservations = {};

    if (fs.existsSync(reservationsDir)) {
      const files = fs.readdirSync(reservationsDir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(reservationsDir, file), 'utf8');
            const data = JSON.parse(content);
            if (data.agent_id) {
              recentReservations[data.agent_id] = file.replace('.json', '');
            }
          } catch (e) {
            // Skip invalid reservation files
          }
        }
      });
    }

    // Create activity status message
    let activityStatus = '🤖 **Agent Activity Status**\n\n';

    const contextManager = getContextManagerStatus();
    const planSummary = summarizeBroadcastPlan(readBroadcastPlan());
    const reviewRouterSummary = summarizeReviewRouterState();

    if (contextManager.status === 'running') {
      const pidInfo = contextManager.pid ? ` (PID ${contextManager.pid})` : '';
      activityStatus += `🧠 Context manager: running${pidInfo}\n`;
    } else if (contextManager.status === 'stale') {
      activityStatus += '🧠 Context manager: stale PID file\n';
    } else if (contextManager.status === 'missing') {
      activityStatus += '🧠 Context manager: not installed\n';
    } else if (contextManager.status === 'error') {
      activityStatus += `🧠 Context manager: error (${contextManager.message})\n`;
    } else {
      activityStatus += '🧠 Context manager: stopped\n';
    }

    activityStatus += `${planSummary}\n`;
    activityStatus += `${reviewRouterSummary}\n\n`;

    // Define pane roles (topology-derived)
    const panes = [
      { index: supervisorPaneIndex, role: 'Supervisor', emoji: '👁️', type: 'coordinator' },
      { index: reviewerPaneIndex, role: 'Reviewer', emoji: '📋', type: 'reviewer' },
      { index: implementor1PaneIndex, role: 'Implementor-1', emoji: '🔧', type: 'implementor' },
      { index: implementor2PaneIndex, role: 'Implementor-2', emoji: '🔧', type: 'implementor' }
    ].filter(entry => entry.index != null);

    // Process each pane
    const debugEntries = [];
    panes.forEach(pane => {
      const activity = getPaneActivity(sessionName, pane.index);
      const history = (activity.fullHistory || []).map(line => sanitizeTmuxLine(line));
      const meaningfulHistory = history.filter(line => {
        const trimmed = (line || '').trim();
        if (!trimmed) return false;
        if (isNoiseLine(trimmed)) return false;
        if (isPlaceholderLine(trimmed)) return false;
        if (JSON_KV_REGEX.test(trimmed)) return false;
        return true;
      });

      // Extract meaningful information based on agent type
      let status = '❓ Status unknown';
      let workingOn = 'No specific task detected';
      let isActive = activity.isActive;
      const recentLines = meaningfulHistory.slice(-15);
      const recentText = recentLines.join(' ').toLowerCase();
      const lastSignificantLine = findLastSignificantLine(recentLines);
      const promptWaiting = computePromptWaiting(history);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const activityAge = activity.lastActivity ? nowSeconds - activity.lastActivity : null;
      const recentlyActive = activityAge !== null ? activityAge <= ACTIVITY_WINDOW_SEC : false;

      const agentName = getAgentIdByPane(agentInfo, pane.index)
        || getAgentNameForPane(pane.index)
        || pane.role;

      // Search for specific patterns based on agent type
      if (promptWaiting) {
        workingOn = 'Awaiting response to latest prompt';
        status = '🟠 Prompted (awaiting response)';
      } else if (!recentlyActive) {
        workingOn = 'No recent activity';
        status = '⏸️ Idle';
      } else if (pane.index === supervisorPaneIndex) {
        // Supervisor patterns - look for coordination activities
        const supervisingPatterns = [
          /coordinat.*?(\d+)\s*ready\s*beads?/i,
          /assigned\s+(roundtable-\w+)/i,
          /rout.*?bead/i,
          /supervis/i,
          /check.*?beads?/i
        ];

        for (const pattern of supervisingPatterns) {
          const match = recentText.match(pattern);
          if (match) {
            if (match[1]) {
              // Ready beads count found
              const assignMatch = recentText.match(/assigned\s+(roundtable-\w+)/i);
              const assignedBead = assignMatch ? assignMatch[1] : null;
              workingOn = `Coordinating ${match[1]} ready beads${assignedBead ? `, assigned ${assignedBead} to self` : ''}`;
            } else if (match[0].includes('roundtable-')) {
              workingOn = `Assigned ${match[0]} for coordination`;
            } else {
              workingOn = 'Coordinating agent workflows';
            }
            status = '✅ Monitoring';
            break;
          }
        }

        if (status === '❓ Status unknown') {
          status = '🟡 Active (recent output)';
          workingOn = lastSignificantLine ? `Recent output: ${lastSignificantLine}` : 'Recent output detected';
        }
      } else if (pane.index === implementor1PaneIndex || pane.index === implementor2PaneIndex) {
        // Implementor patterns - look for bead work
        const implementPatterns = [
          /claim.*?(roundtable-[a-z0-9]+)/i,
          /working.*?(roundtable-[a-z0-9]+)/i,
          /fixing\s+(.+?)(?:\s|$)/i,
          /implementing\s+(.+?)(?:\s|$)/i,
          /creating\s+(.+?)(?:\s|$)/i,
          /modifying\s+(.+?)(?:\s|$)/i
        ];

        for (const pattern of implementPatterns) {
          const match = recentText.match(pattern);
          if (match) {
            if (match[1] && match[1].startsWith('roundtable-')) {
              workingOn = `Claiming bead ${match[1]} or similar`;
            } else if (match[1]) {
              workingOn = `${match[0].substring(0, 80)}`;
            }
            status = '✅ Working';
            break;
          }
        }

        if (status === '❓ Status unknown') {
          // Check for any mention of roundtable or beads
          if (recentText.includes('roundtable-') || recentText.includes('bead')) {
            const beadMatch = recentText.match(/(roundtable-[a-z0-9]+)/i);
            if (beadMatch) {
              workingOn = `Processing bead ${beadMatch[1]}`;
              status = '✅ Working';
            } else {
              workingOn = 'Working on beads or roundtable tasks';
              status = '✅ Working';
            }
          } else {
            status = '🟡 Active (recent output)';
            workingOn = lastSignificantLine ? `Recent output: ${lastSignificantLine}` : 'Recent output detected';
          }
        }
      } else if (pane.index === reviewerPaneIndex) {
        // Reviewer patterns - look for review activities
        const reviewPatterns = [
          /reviewing\s+(.+?)(?:\s|$)/i,
          /flagged\s+(.+?)(?:\s|$)/i,
          /error\s+(.+?)(?:\s|$)/i,
          /issue\s+(.+?)(?:\s|$)/i,
          /(fuchsia|orange|green|black)/i
        ];

        for (const pattern of reviewPatterns) {
          const match = recentText.match(pattern);
          if (match) {
            if (match[1] && (match[1].includes('fuchsia') || match[1].includes('orange') ||
                           match[1].includes('green') || match[1].includes('black'))) {
              workingOn = `Reviewing ${match[1]} - noted issues`;
            } else if (match[0].includes('error') || match[0].includes('flag')) {
              workingOn = `Flagged ${match[0].replace(/\s+(error|flag)/i, '')} issue`;
            } else if (match[1]) {
              workingOn = `Reviewing ${match[1].substring(0, 50)}`;
            }
            status = '✅ Processing reviews';
            break;
          }
        }

        if (status === '❓ Status unknown') {
          status = '🟡 Active (recent output)';
          workingOn = lastSignificantLine ? `Recent output: ${lastSignificantLine}` : 'Recent output detected';
        }
      }

      // Add to activity status
      activityStatus += `${pane.emoji} **${pane.role}** (${agentName})\n`;
      activityStatus += `   Status: ${workingOn}\n`;
      activityStatus += `   Active: ${status}`;
      if (activityAge !== null) {
        activityStatus += ` (last ${formatAge(activityAge)} ago)`;
      }
      activityStatus += '\n\n';

      if (debug) {
        const sanitizedLines = recentLines.map(line => (line || '').replace(/`/g, "'"));
        debugEntries.push({
          role: pane.role,
          agentName,
          activityAge,
          activityRaw: activity.lastActivityRaw,
          promptWaiting,
          lastSignificantLine: (lastSignificantLine || '').replace(/`/g, "'"),
          recentLines: sanitizedLines
        });
      }
    });

    if (debug) {
      activityStatus += '🧪 **Activity Debug (last 15 lines)**\n';
      debugEntries.forEach(entry => {
        activityStatus += `\n${entry.role} (${entry.agentName})\n`;
        activityStatus += `Last activity: ${entry.activityAge !== null ? formatAge(entry.activityAge) : 'unknown'}`;
        if (entry.activityRaw) {
          activityStatus += ` (raw ${entry.activityRaw})`;
        }
        activityStatus += '\n';
        activityStatus += `Prompt waiting: ${entry.promptWaiting ? 'yes' : 'no'}\n`;
        activityStatus += `Last significant: ${entry.lastSignificantLine || '(none)'}\n`;
        activityStatus += 'Recent lines:\n';
        activityStatus += '```\n';
        activityStatus += `${entry.recentLines.join('\n')}\n`;
        activityStatus += '```\n';
      });
      activityStatus += '\n';
    }

    return activityStatus;

  } catch (error) {
    log('ERROR', 'Failed to get focused agent activity', error);
    return `❌ Error getting agent activity: ${error.message}`;
  }
}

// Check if agents are being prompted (monitor tmux activity)
function checkAgentActivity(chatId) {
  try {
    const monitorScript = path.join(ROUNDTABLE_DIR, 'scripts', 'maf', 'tmux-agent-monitor.sh');

    if (fs.existsSync(monitorScript)) {
      // Use the enhanced monitor script
      const output = execSync(`bash "${monitorScript}" telegram`, {
        encoding: 'utf8',
        env: { ...process.env, MAF_TMUX_SESSION: resolveTmuxSessionName() }
      });

      // Strip ANSI codes and escape Markdown characters
      const cleanOutput = stripAnsiCodes(output);
      const escapedOutput = escapeMarkdown(cleanOutput);

      // Split into chunks if too long
      const messages = splitMessage(escapedOutput, 4000);
      messages.forEach(msg => {
        bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' }).catch(err => {
          // If Markdown parsing fails, send without formatting
          log('ERROR', 'Markdown parsing failed, sending plain text', err);
          bot.sendMessage(chatId, cleanOutput);
        });
      });
    } else {
      // Fallback to basic monitoring
      basicAgentActivity(chatId);
    }
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error checking agent activity: ${error.message}`);
    log('ERROR', 'Failed to check agent activity', error);
  }
}

// Fallback basic activity monitor
function basicAgentActivity(chatId) {
  try {
    // Check if tmux session is active
    if (!checkTmuxSession()) {
      bot.sendMessage(chatId, `❌ No active tmux session "${resolveTmuxSessionName()}" found`);
      return;
    }

    const sessionName = resolveTmuxSessionName();
    const paneInfo = getTmuxPaneInfo();

    // Check pane activity
    const activityReport = [];
    activityReport.push('📊 **Agent Activity Report**\n');

    // Get recent commands from each pane (canonical topology: 0=Supervisor, 1=Reviewer, 2=Implementor-1, 3=Implementor-2)
    const panes = ['0.0', '0.1', '0.2', '0.3'];
    const paneNames = ['Supervisor', 'Reviewer', 'Implementor-1', 'Implementor-2'];

    panes.forEach((pane, index) => {
      try {
        const history = execSync(`${TMUX_BIN} capture-pane -t "${sessionName}:${pane}" -p | tail -10`, { encoding: 'utf8' });
        const isActive = history.trim().length > 0;

        activityReport.push(`${isActive ? '🟢' : '🔴'} **${paneNames[index]}** (${sessionName}:${pane})`);

        if (isActive && history.trim()) {
          const lines = history.trim().split('\n').slice(-3);
          activityReport.push(`\`\`\`${lines.join('\n')}\`\`\``);
        }
      } catch (error) {
        activityReport.push(`🔴 **${paneNames[index]}** - Error checking status`);
      }
      activityReport.push('');
    });

    bot.sendMessage(chatId, activityReport.join('\n'), { parse_mode: 'Markdown' });

  } catch (error) {
    bot.sendMessage(chatId, `❌ Error checking agent activity: ${error.message}`);
    log('ERROR', 'Failed to check agent activity', error);
  }
}

// Escape Markdown characters for Telegram
function escapeMarkdown(text) {
  if (!text) return '';
  // Only escape the core Markdown characters that actually cause issues
  return text.replace(/[*_`[\]()]/g, '\\$&');
}

// Strip ANSI color codes from text
function stripAnsiCodes(text) {
  if (!text) return '';
  // Remove ANSI escape sequences (handles both \x1b and \u001b formats)
  return text.replace(/\u001b\[[0-9;]*m|\x1b\[[0-9;]*m/g, '');
}

function sendMarkdownMessage(chatId, message) {
  return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(err => {
    log('ERROR', 'Markdown parsing failed, sending plain text', err);
    return bot.sendMessage(chatId, message);
  });
}

function sendTmuxKeys(target, keys) {
  if (!keys || keys.length === 0) {
    return;
  }

  spawnSync(TMUX_BIN, ['send-keys', '-t', target, ...keys], { cwd: ROUNDTABLE_DIR });
}

function applyPaneAction(target, action) {
  if (action === 'confirm') {
    sendTmuxKeys(target, ['1']);
    sleepSync(TMUX_SEND_DELAY_MS);
    sendTmuxKeys(target, ['C-m']);
    return true;
  }

  if (action === 'trust') {
    sendTmuxKeys(target, ['2']);
    sleepSync(TMUX_SEND_DELAY_MS);
    sendTmuxKeys(target, ['C-m']);
    return true;
  }

  if (action === 'submit') {
    sendTmuxKeys(target, ['C-m']);
    return true;
  }

  if (action === 'clear') {
    sendTmuxKeys(target, ['C-u']);
    return true;
  }

  return false;
}

// Split long messages into chunks
function splitMessage(message, maxLength = 4000) {
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks = [];
  const lines = message.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
    }
    currentChunk += line + '\n';
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [message];
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function safeParseIsoDate(value) {
  if (!value) {
    return null;
  }
  try {
    const raw = String(value).trim();
    if (!raw) {
      return null;
    }
    // bead-assigner.py uses naive ISO; treat as UTC by default.
    const normalized = raw.endsWith('Z') || raw.includes('+')
      ? raw
      : `${raw}Z`;
    const ts = Date.parse(normalized);
    if (!Number.isFinite(ts)) {
      return null;
    }
    return new Date(ts);
  } catch {
    return null;
  }
}

function getBdIdsByStatusJson(status) {
  const result = runBdCommand(`list --status ${status} --json --no-daemon`);
  if (!result.output) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(result.output);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.map(item => item && item.id).filter(Boolean));
  } catch (error) {
    log('ERROR', `Failed to parse bd list --status ${status} --json`, error);
    return new Set();
  }
}

function countBdStatus(status) {
  return getBdIdsByStatusJson(status).size;
}

function readBeadReservationFiles() {
  const results = [];
  if (!fs.existsSync(BEAD_RESERVATIONS_DIR)) {
    return results;
  }
  const files = fs.readdirSync(BEAD_RESERVATIONS_DIR).filter(file => file.endsWith('.json'));
  files.forEach(file => {
    const fullPath = path.join(BEAD_RESERVATIONS_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const beadId = data.bead_id || file.replace(/\.json$/, '');
      const agentId = data.agent_id || null;
      const expiresAt = safeParseIsoDate(data.expires_at);
      const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
      results.push({
        path: fullPath,
        file,
        beadId,
        agentId,
        status: data.status || 'unknown',
        expiresAt,
        isExpired
      });
    } catch (error) {
      results.push({
        path: fullPath,
        file,
        beadId: file.replace(/\.json$/, ''),
        agentId: null,
        status: 'unparseable',
        expiresAt: null,
        isExpired: false,
        error: error.message
      });
    }
  });
  return results;
}

function cleanupBeadReservations(mode = 'auto', { beadIds } = {}) {
  const reservations = readBeadReservationFiles();
  const openIds = getBdIdsByStatusJson('open');
  const inProgressIds = getBdIdsByStatusJson('in_progress');
  const blockedIds = getBdIdsByStatusJson('blocked');
  const allDone = openIds.size === 0 && inProgressIds.size === 0 && blockedIds.size === 0;
  // Auto mode behavior:
  // - If there is no active work at all, clear everything.
  // - Otherwise, clear stale reservations (anything not still "open").
  //
  // Rationale: once a bead moves to in_progress/blocked/closed, Beads assignee is the source of truth;
  // reservation files are only for deconflicting "claiming" of open work.
  const effectiveMode = mode === 'auto' ? (allDone ? 'all' : 'stale') : mode;

  let removed = 0;
  let removedExpired = 0;
  let removedStale = 0;
  let removedExplicit = 0;
  const errors = [];

  reservations.forEach(entry => {
    if (entry.status !== 'reserved') {
      return;
    }

    if (beadIds && beadIds.size > 0) {
      if (!beadIds.has(entry.beadId)) {
        return;
      }
      try {
        fs.unlinkSync(entry.path);
        removed += 1;
        removedExplicit += 1;
      } catch (error) {
        errors.push(`${entry.file}: ${error.message}`);
      }
      return;
    }

    const isStale = entry.isExpired || (entry.beadId && !openIds.has(entry.beadId));
    const shouldRemove = effectiveMode === 'all'
      || (effectiveMode === 'expired' && entry.isExpired)
      || (effectiveMode === 'stale' && isStale);

    if (!shouldRemove) {
      return;
    }

    try {
      fs.unlinkSync(entry.path);
      removed += 1;
      if (entry.isExpired) removedExpired += 1;
      if (isStale) removedStale += 1;
    } catch (error) {
      errors.push(`${entry.file}: ${error.message}`);
    }
  });

  return {
    mode: effectiveMode,
    allDone,
    totalFiles: reservations.length,
    reservedFiles: reservations.filter(r => r.status === 'reserved').length,
    removed,
    removedExpired,
    removedStale,
    removedExplicit,
    errors
  };
}

function formatReservationSummary(summary) {
  if (!summary) {
    return '';
  }
  const parts = [];
  if (summary.removed > 0) {
    parts.push(`🧹 Cleared ${summary.removed} bead reservation(s) (${summary.mode}).`);
  }
  if (summary.errors && summary.errors.length > 0) {
    parts.push(`⚠️ Reservation cleanup errors: ${summary.errors.length}.`);
  }
  return parts.join(' ');
}

function runBdCommand(args) {
  if (!commandExists('bd')) {
    return { error: 'bd command not found' };
  }

  try {
    const output = execSync(`bd ${args}`, {
      // NOTE: bd auto-discovers its DB at `.beads/beads.db` relative to the repo root.
      // Running with `cwd=.beads/` breaks auto-discovery (it looks for `.beads/.beads/*`).
      cwd: ROUNDTABLE_DIR,
      encoding: 'utf8'
    });
    return { output };
  } catch (error) {
    const stderr = error && typeof error === 'object' && error.stderr
      ? String(error.stderr).trim()
      : '';
    const stdout = error && typeof error === 'object' && error.stdout
      ? String(error.stdout).trim()
      : '';
    const detail = [
      stderr ? `stderr: ${stderr.slice(0, 800)}` : null,
      stdout ? `stdout: ${stdout.slice(0, 800)}` : null
    ].filter(Boolean).join(' | ');
    log('ERROR', `bd ${args} failed${detail ? ` (${detail})` : ''}`, error);
    return { error: error.message };
  }
}

function parseBdListOutput(output) {
  const result = {
    total: null,
    items: []
  };

  if (!output) {
    return result;
  }

  const lines = output.split('\n');
  const totalMatch = lines.find(line => line.startsWith('Found '));
  const readyHeader = lines.find(line => line.includes('Ready work'));

  if (totalMatch) {
    const match = totalMatch.match(/Found\s+(\d+)\s+issues?/i);
    if (match) {
      result.total = parseInt(match[1], 10);
    }
  } else if (readyHeader) {
    const match = readyHeader.match(/Ready work\s*\((\d+)\s+issues?/i);
    if (match) {
      result.total = parseInt(match[1], 10);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const readyMatch = line.match(/^\d+\.\s+\[P(\d+)\]\s+(\S+):\s*(.+)$/);
    if (readyMatch) {
      const priority = readyMatch[1];
      const id = readyMatch[2];
      const title = readyMatch[3];
      const assigneeLine = (lines[i + 1] || '').trim();
      const assigneeMatch = assigneeLine.match(/^Assignee:\s*(.+)$/);
      const assignee = assigneeMatch ? assigneeMatch[1].trim() : null;
      result.items.push({ id, priority, type: 'task', status: 'ready', title, assignee });
      continue;
    }

    const match = line.match(/^(\S+)\s+\[P(\d+)\]\s+\[(\w+)\]\s+(\w+)/);
    if (match) {
      const id = match[1];
      const priority = match[2];
      const type = match[3];
      const status = match[4];
      const titleLine = (lines[i + 1] || '').trim();
      const title = titleLine.replace(/^\s+/, '');

      const assigneeLine = (lines[i + 2] || '').trim();
      const assigneeMatch = assigneeLine.match(/^Assignee:\s*(.+)$/);
      const assignee = assigneeMatch ? assigneeMatch[1].trim() : null;

      result.items.push({ id, priority, type, status, title, assignee });
    }
  }

  return result;
}

function formatBdSection(title, output, maxItems = 5) {
  const parsed = parseBdListOutput(output);
  const countLabel = parsed.total !== null ? ` (${parsed.total})` : '';
  let section = `**${title}${countLabel}**\n`;

  if (parsed.items.length === 0) {
    return `${section}(none)\n`;
  }

  const limit = maxItems === null ? parsed.items.length : maxItems;
  parsed.items.slice(0, limit).forEach(item => {
    const line = `- ${item.id} (P${item.priority}, ${item.status}) ${item.title || ''}`;
    section += `${escapeMarkdown(line)}\n`;
  });

  if (maxItems !== null && parsed.items.length > maxItems) {
    section += `…and ${parsed.items.length - maxItems} more\n`;
  }

  return section;
}

function getBeadsSnapshot(maxItems = 5) {
  const ready = runBdCommand('ready --no-daemon');
  const inProgress = runBdCommand('list -s in_progress --no-daemon');
  const closedLimit = maxItems === null ? '' : ` --limit ${maxItems}`;
  const closed = runBdCommand(`list -s closed --no-daemon${closedLimit}`);

  let message = '📌 **Beads Snapshot**\n\n';

  if (ready.error || inProgress.error || closed.error) {
    message += '⚠️ One or more bead queries failed.\n';
    if (ready.error) message += `- Ready: ${escapeMarkdown(ready.error)}\n`;
    if (inProgress.error) message += `- In progress: ${escapeMarkdown(inProgress.error)}\n`;
    if (closed.error) message += `- Closed: ${escapeMarkdown(closed.error)}\n`;
    message += '\n';
  }

  if (ready.output) {
    message += `${formatBdSection('Ready', ready.output, maxItems)}\n`;
  }
  if (inProgress.output) {
    message += `${formatBdSection('In Progress', inProgress.output, maxItems)}\n`;
  }
  if (closed.output) {
    message += `${formatBdSection('Recently Closed', closed.output, maxItems)}\n`;
  }

  return message.trim();
}

function parseSnapshotArgs(text) {
  if (!text) {
    return { maxItems: 5 };
  }

  const raw = text.replace('/snapshot', '').trim();
  if (!raw) {
    return { maxItems: 5 };
  }

  if (raw.toLowerCase() === 'all') {
    return { maxItems: null };
  }

  if (/^\d+$/.test(raw)) {
    return { maxItems: parseInt(raw, 10) };
  }

  return { maxItems: 5 };
}

function parseStaleArgs(text) {
  if (!text) {
    return { days: 3, maxItems: 5 };
  }

  const raw = text.replace('/stale', '').trim();
  if (!raw) {
    return { days: 3, maxItems: 5 };
  }

  if (raw.toLowerCase() === 'all') {
    return { days: 3, maxItems: null };
  }

  if (/^\d+$/.test(raw)) {
    return { days: Math.max(0, parseInt(raw, 10)), maxItems: 5 };
  }

  return { days: 3, maxItems: 5 };
}

function getStaleBeads(days = 3, maxItems = 5) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const stale = runBdCommand(`list -s in_progress --updated-before ${cutoffDate} --no-daemon`);

  let message = `⏳ **Stale In-Progress Beads**\n\nNo updates since ${cutoffDate} (${days} day${days === 1 ? '' : 's'}+)\n\n`;

  if (stale.error) {
    message += `⚠️ ${escapeMarkdown(stale.error)}\n`;
    return message.trim();
  }

  if (stale.output) {
    message += `${formatBdSection('Stale In Progress', stale.output, maxItems)}\n`;
  }

  return message.trim();
}

function runBvTriage() {
  if (!commandExists('bv')) {
    return null;
  }

  try {
    const output = execSync('bv --robot-triage', {
      cwd: ROUNDTABLE_DIR,
      encoding: 'utf8'
    });
    return JSON.parse(output);
  } catch (error) {
    log('ERROR', 'bv --robot-triage failed', error);
    return null;
  }
}

function readReservations() {
  const reservationsDir = path.join(ROUNDTABLE_DIR, '.agent-mail', 'reservations');
  const result = {};

  if (!fs.existsSync(reservationsDir)) {
    return result;
  }

  const files = fs.readdirSync(reservationsDir).filter(file => file.endsWith('.json'));
  files.forEach(file => {
    try {
      const content = fs.readFileSync(path.join(reservationsDir, file), 'utf8');
      const data = JSON.parse(content);
      if (data.agent_id && data.bead_id && data.status === 'reserved') {
        result[data.agent_id] = data.bead_id;
      }
    } catch (error) {
      log('ERROR', `Failed to read reservation ${file}`, error);
    }
  });

  return result;
}

function shellEscape(value) {
  const raw = value == null ? '' : String(value);
  return `'${raw.replace(/'/g, `'\\''`)}'`;
}

function isSafeBeadId(beadId) {
  const raw = String(beadId || '');
  if (!raw) {
    return false;
  }

  // Safety constraints:
  // - used as a filename under `.agent-mail/reservations/`
  // - must not allow path separators or whitespace
  // - allow dot-based epics like `roundtable-jlh.1`
  if (raw.length > 120) {
    return false;
  }
  if (/[\/\\\s]/.test(raw)) {
    return false;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(raw);
}

function ensureReservationDir() {
  ensureDir(BEAD_RESERVATIONS_DIR);
}

function writeBeadReservation(beadId, agentId, durationHours = 4) {
  if (!isSafeBeadId(beadId)) {
    return { ok: false, reason: 'invalid bead id' };
  }
  if (!agentId) {
    return { ok: false, reason: 'missing agent id' };
  }

  ensureReservationDir();
  const fileName = `${beadId}.json`;
  const filePath = path.join(BEAD_RESERVATIONS_DIR, fileName);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  const payload = {
    bead_id: beadId,
    agent_id: String(agentId),
    reserved_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    status: 'reserved'
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return { ok: true, path: filePath };
  } catch (error) {
    log('ERROR', `Failed to write reservation ${fileName}`, error);
    return { ok: false, reason: error.message };
  }
}

function deleteBeadReservation(beadId) {
  if (!isSafeBeadId(beadId)) {
    return { ok: false, reason: 'invalid bead id' };
  }
  const filePath = path.join(BEAD_RESERVATIONS_DIR, `${beadId}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: true, removed: false };
  }
  try {
    fs.unlinkSync(filePath);
    return { ok: true, removed: true };
  } catch (error) {
    log('ERROR', `Failed to delete reservation ${beadId}`, error);
    return { ok: false, reason: error.message };
  }
}

function setBeadAssignee(beadId, assignee) {
  if (!isSafeBeadId(beadId) || !assignee) {
    return { ok: false };
  }
  const result = runBdCommand(`update ${beadId} --assignee ${shellEscape(assignee)} --no-daemon`);
  if (result.error) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

function sendTmuxPrompt(target, message) {
  if (!message) {
    return;
  }

  const pendingInput = getPendingPaneInput(target);
  if (pendingInput) {
    spawnSync(TMUX_BIN, ['send-keys', '-t', target, 'C-u'], { cwd: ROUNDTABLE_DIR });
    sleepSync(TMUX_CLEAR_DELAY_MS);
  }

  const normalizedMessage = normalizePromptForTmux(message);
  spawnSync(TMUX_BIN, ['send-keys', '-t', target, '-l', normalizedMessage], { cwd: ROUNDTABLE_DIR });
  sleepSync(TMUX_SEND_DELAY_MS);
  spawnSync(TMUX_BIN, ['send-keys', '-t', target, 'C-m'], { cwd: ROUNDTABLE_DIR });
  sleepSync(TMUX_SEND_DELAY_MS);

  const postState = detectPaneInputState(target);
  if (postState.inputText && postState.inputText.trim() === normalizedMessage.trim()) {
    spawnSync(TMUX_BIN, ['send-keys', '-t', target, 'C-m'], { cwd: ROUNDTABLE_DIR });
  }
}

function isPaneSafeToPrompt(sessionName, paneIndex, idleThresholdSec = IDLE_BROADCAST_THRESHOLD_SEC) {
  const target = buildAgentTarget(sessionName, paneIndex);
  const state = detectPaneInputState(target);

  if (state.confirmPending || state.menuPrompt || state.skillConfirmPending) {
    return false;
  }

  // If the pane is actively producing output, do not interrupt even if an input bar is visible.
  // (Some CLIs show an input line while still "thinking".)
  const recentLines = captureTmuxPaneLines(target, 120);
  if (Array.isArray(recentLines) && recentLines.length > 0) {
    const trimmed = recentLines.map(line => (line || '').trim());
    const busyIndexes = [];
    const inputIndexes = [];

    for (let i = 0; i < trimmed.length; i += 1) {
      const line = trimmed[i];
      if (!line) {
        continue;
      }
      if (BROADCAST_BUSY_REGEX.test(line)) {
        busyIndexes.push(i);
      }
      if (isInputPromptLine(line)) {
        inputIndexes.push(i);
      }
    }

    const lastBusy = busyIndexes.length > 0 ? busyIndexes[busyIndexes.length - 1] : -1;
    const lastInput = inputIndexes.length > 0 ? inputIndexes[inputIndexes.length - 1] : -1;

    // Claude/Codex UIs often keep a prompt line visible even while a task is actively running.
    // If we see a busy marker very close to the bottom, treat the pane as not safe to prompt.
    if (lastBusy !== -1 && (trimmed.length - 1 - lastBusy) <= BROADCAST_BUSY_RECENT_LINES) {
      return false;
    }

    // If the most recent "busy" marker appears after the most recent input prompt,
    // treat the pane as actively running.
    if (lastBusy > lastInput) {
      return false;
    }
  }

  // If the pane is showing an input bar, it's generally safe to prompt: `sendTmuxPrompt()`
  // clears any pending input before sending. We still gate on "busy" markers above.
  if (state.hasPrompt) {
    return true;
  }

  const idleAgeSeconds = getPaneIdleAgeSeconds(sessionName, paneIndex);
  if (idleAgeSeconds !== null) {
    return idleAgeSeconds >= idleThresholdSec;
  }

  // Some tmux builds don't expose pane activity timestamps. Fall back to a heuristic:
  // if the pane output doesn't look "busy", treat it as safe.
  const recentText = Array.isArray(recentLines) ? recentLines.join('\n') : '';
  if (!recentText) {
    return true;
  }

  return !BROADCAST_BUSY_REGEX.test(recentText);
}

function getPendingPaneInput(target) {
  const state = detectPaneInputState(target);
  if (!state.inputText) {
    return null;
  }
  return state.inputText;
}

function captureTmuxPaneLines(target, lineCount = 20) {
  const result = spawnSync(TMUX_BIN, ['capture-pane', '-p', '-t', target, '-S', `-${lineCount}`], {
    cwd: ROUNDTABLE_DIR,
    encoding: 'utf8'
  });

  if (result.error || typeof result.stdout !== 'string') {
    return [];
  }

  return result.stdout.split('\n');
}

function captureTmuxPaneLinesAnsi(target, lineCount = 20) {
  const result = spawnSync(TMUX_BIN, ['capture-pane', '-p', '-e', '-t', target, '-S', `-${lineCount}`], {
    cwd: ROUNDTABLE_DIR,
    encoding: 'utf8'
  });

  if (result.error || typeof result.stdout !== 'string') {
    return [];
  }

  return result.stdout.split('\n');
}

function hasPlaceholderAnsi(line) {
  if (!line) {
    return false;
  }
  return /\u001b\[[0-9;]*2m/.test(line) || /\u001b\[[0-9;]*90m/.test(line);
}

function extractPromptInput(line) {
  if (!line) {
    return '';
  }

  const trimmed = line.trim();
  const match = trimmed.match(/^[›>]\s*(.*)$/);
  if (!match) {
    return '';
  }

  let input = match[1] || '';
  input = input.replace(/↵\s*send/i, '').trim();
  return input;
}

function isDefaultPromptInput(text) {
  if (!text) {
    return false;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (DEFAULT_PROMPT_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return true;
  }

  if (/[@]filename/i.test(trimmed)) {
    return true;
  }

  if (/\{feature\}/i.test(trimmed)) {
    return true;
  }

  return false;
}

function detectPaneInputState(target) {
  const rawLines = captureTmuxPaneLinesAnsi(target, 40);
  const lines = rawLines.length > 0
    ? rawLines.map(line => stripAnsiCodes(line))
    : captureTmuxPaneLines(target, 40);
  if (lines.length === 0) {
    return {
      hasPrompt: false,
      inputText: '',
      confirmPending: false,
      confirmTrustable: false,
      confirmToolAgentMail: false,
      confirmResponseAwareness: false,
      claudeSessionFeedbackPrompt: false,
      placeholderDetected: false,
      menuPrompt: false,
      skillConfirmPending: false,
      skillConfirmSkillName: null,
      skillConfirmResponseAwareness: false
    };
  }

  const recent = lines.slice(-25);
  const joined = recent.join('\n');
  const confirmPending = TOOL_CONFIRM_REGEX.test(joined);
  const confirmTrustable = confirmPending
    && TOOL_CONFIRM_TRUST_REGEX.test(joined)
    && TOOL_CONFIRM_TOOL_REGEX.test(joined);
  const confirmToolAgentMail = confirmPending && TOOL_CONFIRM_TOOL_REGEX.test(joined);
  const confirmResponseAwareness = confirmPending && /response-awareness/i.test(joined);
  const claudeSessionFeedbackPrompt = /How is Claude doing this session\?/i.test(joined)
    && /\b0:\s*Dismiss\b/i.test(joined)
    && /\b1:\s*Bad\b/i.test(joined)
    && /\b2:\s*Fine\b/i.test(joined)
    && /\b3:\s*Good\b/i.test(joined);
  const menuPrompt = SETTINGS_ERROR_REGEX.test(joined) && SETTINGS_MENU_REGEX.test(joined);
  const skillConfirmMatch = joined.match(/Use skill "([^"]+)"/);
  const skillConfirmSkillName = skillConfirmMatch ? String(skillConfirmMatch[1]) : null;
  const skillConfirmPending = Boolean(skillConfirmSkillName)
    && /Do you want to proceed\?/i.test(joined)
    && /\b1\.\s*Yes\b/i.test(joined)
    && /\b2\.\s*Yes,\s*and\s*don't\s*ask\s*again\b/i.test(joined);
  const skillConfirmResponseAwareness = skillConfirmPending
    && (/^response-awareness-/i.test(skillConfirmSkillName || '') || /^response\s+awareness\b/i.test(skillConfirmSkillName || ''));
  let inputLine = '';
  let rawInputLine = '';

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const line = (recent[i] || '').trim();
    if (isInputPromptLine(line)) {
      inputLine = line;
      if (rawLines.length > 0) {
        const raw = (rawLines[rawLines.length - (recent.length - i)] || '').trim();
        rawInputLine = raw;
      }
      break;
    }
  }

  let inputText = inputLine ? extractPromptInput(inputLine) : '';
  const placeholderDetected = isDefaultPromptInput(inputText) || hasPlaceholderAnsi(rawInputLine);
  if (placeholderDetected) {
    inputText = '';
  }
  return {
    hasPrompt: Boolean(inputLine),
    inputText,
    confirmPending,
    confirmTrustable,
    confirmToolAgentMail,
    confirmResponseAwareness,
    claudeSessionFeedbackPrompt,
    placeholderDetected,
    menuPrompt,
    skillConfirmPending,
    skillConfirmSkillName,
    skillConfirmResponseAwareness
  };
}

function normalizePromptForTmux(message) {
  if (!message) {
    return message;
  }

  const trimmed = message.trim();
  if (!trimmed.includes('\n')) {
    return trimmed;
  }

  return trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' | ');
}

function filterRecommendations(recommendations, labels, excludeIds) {
  if (!recommendations) {
    return null;
  }

  return recommendations.find(item => {
    if (!item || !item.id) {
      return false;
    }

    if (excludeIds.has(item.id)) {
      return false;
    }

    if (item.status && item.status !== 'open') {
      return false;
    }

    if (!labels || labels.length === 0) {
      return true;
    }

    const itemLabels = Array.isArray(item.labels) ? item.labels : [];
    return labels.some(label => itemLabels.includes(label));
  });
}

function formatBeadLine(item) {
  if (!item) {
    return 'No bead selected.';
  }
  return `${item.id}: ${item.title || 'Untitled bead'}`;
}

function buildSupervisorDraft(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return null;
  }

  const assignmentLines = prompts
    .filter(prompt => prompt.role !== 'Supervisor')
    .map(prompt => `- ${prompt.role}: ${prompt.detail || 'No assignment'}`);

  if (assignmentLines.length === 0) {
    return null;
  }

  return [
    'Supervisor: Review targeted assignments and adjust if needed.',
    'Recommended picks:',
    ...assignmentLines,
    'Approve from Telegram with /broadcast-apply or rerun /broadcast-targeted auto to send immediately.'
  ].join('\n');
}

function extractToolStructuredArray(result) {
  if (!result) {
    return null;
  }
  if (Array.isArray(result)) {
    return result;
  }
  if (typeof result === 'object') {
    if (Array.isArray(result.structuredContent)) {
      return result.structuredContent;
    }
    const content = Array.isArray(result.content) ? result.content : null;
    const text = content && content[0] && typeof content[0] === 'object' ? content[0].text : null;
    if (typeof text === 'string') {
      const trimmed = text.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : null);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAgentMailMcpUrl() {
  const raw = (process.env.AGENT_MAIL_URL || '').trim();
  if (!raw) {
    return 'http://127.0.0.1:8765/mcp/';
  }

  // Allow values like:
  // - http://127.0.0.1:8765
  // - http://127.0.0.1:8765/mcp
  // - http://127.0.0.1:8765/mcp/
  if (raw.endsWith('/mcp/')) return raw;
  if (raw.endsWith('/mcp')) return `${raw}/`;
  if (raw.endsWith('/')) return `${raw}mcp/`;
  return `${raw}/mcp/`;
}

function tryCurlJson(url, payload) {
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(
      'curl',
      ['-sS', '--max-time', '5', '-H', 'content-type: application/json', '-d', JSON.stringify(payload), url],
      { encoding: 'utf8' }
    );
    return JSON.parse(out);
  } catch (error) {
    return null;
  }
}

async function fetchWithRetry(url, payload, label = 'fetch') {
  const body = JSON.stringify(payload);
  const attempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      });
      if (!response.ok) {
        throw new Error(`${label}: HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      // Fallback: node-fetch/undici occasionally fails under systemd sandboxing; curl is a pragmatic backup.
      const curlData = tryCurlJson(url, payload);
      if (curlData) {
        return curlData;
      }

      lastError = error;
      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }
  throw lastError || new Error(`${label}: fetch failed`);
}

async function fetchAgentInboxMeta(agentName) {
  if (!agentName) {
    return null;
  }

  const url = getAgentMailMcpUrl();
  const payload = {
    jsonrpc: '2.0',
    id: `inbox-${agentName}-${Date.now()}`,
    method: 'tools/call',
    params: {
      name: 'fetch_inbox',
      arguments: {
        project_key: ROUNDTABLE_DIR,
        agent_name: agentName,
        limit: 10,
        urgent_only: false,
        include_bodies: false
      }
    }
  };

  try {
    const data = await fetchWithRetry(url, payload, `fetch inbox meta for ${agentName}`);
    const items = extractToolStructuredArray(data.result) || (Array.isArray(data.data) ? data.data : null);
    if (!Array.isArray(items)) {
      return null;
    }

    const count = items.length;
    const ackRequiredCount = items.filter(item => item && typeof item === 'object' && item.ack_required === true).length;
    const first = items[0] && typeof items[0] === 'object' ? items[0] : null;
    const latestMessageId = first && (first.id ?? first.message_id ?? null);
    const latestCreatedTs = first && (first.created_ts ?? first.createdTs ?? first.created_at ?? first.created ?? null);
    return { count, ackRequiredCount, latestMessageId, latestCreatedTs };
  } catch (error) {
    log('ERROR', `Failed to fetch inbox for ${agentName}`, error);
    return null;
  }
}

async function fetchAgentInbox(agentName, options = {}) {
  if (!agentName) {
    return null;
  }

  const url = getAgentMailMcpUrl();
  const payload = {
    jsonrpc: '2.0',
    id: `inbox-full-${agentName}-${Date.now()}`,
    method: 'tools/call',
    params: {
      name: 'fetch_inbox',
      arguments: {
        project_key: ROUNDTABLE_DIR,
        agent_name: agentName,
        limit: options.limit || 20,
        urgent_only: false,
        include_bodies: options.include_bodies !== false
      }
    }
  };

  try {
    const data = await fetchWithRetry(url, payload, `fetch inbox for ${agentName}`);
    const items = extractToolStructuredArray(data.result) || (Array.isArray(data.data) ? data.data : null);
    if (Array.isArray(items)) {
      return items;
    }

    return null;
  } catch (error) {
    log('ERROR', `Failed to fetch inbox for ${agentName}`, error);
    return null;
  }
}

async function acknowledgeAgentMailMessage(agentName, messageId) {
  if (!agentName || messageId == null) {
    return false;
  }

  const url = getAgentMailMcpUrl();
  const payload = {
    jsonrpc: '2.0',
    id: `ack-${agentName}-${messageId}-${Date.now()}`,
    method: 'tools/call',
    params: {
      name: 'acknowledge_message',
      arguments: {
        project_key: ROUNDTABLE_DIR,
        agent_name: agentName,
        message_id: messageId
      }
    }
  };

  try {
    const data = await fetchWithRetry(url, payload, `ack message ${messageId} for ${agentName}`);
    const result = data?.result;
    if (result && typeof result === 'object') {
      const ack = result.acknowledged;
      if (ack === true) return true;
    }
    return true;
  } catch (error) {
    log('ERROR', `Failed to acknowledge message ${messageId} for ${agentName}`, error);
    return false;
  }
}

function shouldAutoAckMessage(item, staleBefore) {
  if (!item || typeof item !== 'object') {
    return false;
  }
  if (item.ack_required !== true) {
    return false;
  }
  const subject = String(item.subject || '').trim();
  if (MAIL_SWEEP_AUTO_ACK_CONTACT_REQUESTS && /^Contact request\b/i.test(subject)) {
    return true;
  }
  if (staleBefore) {
    const created = safeParseIsoDate(item.created_ts || item.createdTs || item.created_at || item.created || null);
    if (created && created.getTime() <= staleBefore.getTime()) {
      return true;
    }
  }
  return false;
}

async function runMailSweep({ agents, staleDays, chatId, verbose } = {}) {
  const agentList = Array.isArray(agents) ? agents.filter(Boolean) : [];
  if (agentList.length === 0) {
    return { acked: 0, remaining: 0, remainingItems: [] };
  }

  const staleBefore = Number.isFinite(Number(staleDays)) && staleDays > 0
    ? new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000)
    : null;

  const ackedDetails = [];
  const remainingItems = [];
  for (const agentName of agentList) {
    const inbox = await fetchAgentInbox(agentName, { limit: 60, include_bodies: false });
    if (!Array.isArray(inbox) || inbox.length === 0) {
      continue;
    }
    const ackRequired = inbox.filter(item => item && typeof item === 'object' && item.ack_required === true);
    for (const item of ackRequired) {
      const id = item.id ?? item.message_id ?? null;
      if (id == null) continue;
      if (shouldAutoAckMessage(item, staleBefore)) {
        const ok = await acknowledgeAgentMailMessage(agentName, id);
        if (ok) {
          ackedDetails.push({ agentName, id, subject: String(item.subject || '').trim() });
        }
      } else {
        remainingItems.push({ agentName, id, subject: String(item.subject || '').trim(), created_ts: item.created_ts || null });
      }
    }
  }

  if (chatId != null) {
    const lines = [];
    lines.push('📨 **Mail Sweep**');
    lines.push(`- Auto-acked: ${ackedDetails.length} (contact requests + stale ≥ ${MAIL_SWEEP_AUTO_ACK_STALE_DAYS}d)`);
    lines.push(`- Remaining ack_required: ${remainingItems.length}`);
    if (verbose && remainingItems.length > 0) {
      const preview = remainingItems
        .slice(0, 12)
        .map(item => `- ${item.agentName} #${item.id}: ${escapeMarkdown(item.subject || '(no subject)')}`)
        .join('\n');
      lines.push('');
      lines.push(preview);
      if (remainingItems.length > 12) {
        lines.push(`…and ${remainingItems.length - 12} more`);
      }
    }
    sendMarkdownMessage(chatId, lines.join('\n'));
  }

  return { acked: ackedDetails.length, remaining: remainingItems.length, remainingItems };
}

let mailForwardInProgress = false;

async function runMailForwardTick() {
  if (!MAIL_FORWARD_ENABLED) {
    return;
  }
  if (mailForwardInProgress) {
    return;
  }

  // Get the operator's Telegram chat ID from the relay state
  const relayState = readTelegramRelayState();
  const chatId = relayState.lastChatId || null;
  if (!chatId) {
    return;
  }

  mailForwardInProgress = true;
  try {
    const state = readMailForwardState();
    const forwardedIds = new Set(state.forwardedMessageIds || []);

    // Fetch inbox for the operator agent
    const inbox = await fetchAgentInbox(OPERATOR_AGENT_NAME, { limit: 20, include_bodies: false });
    if (!Array.isArray(inbox) || inbox.length === 0) {
      state.lastCheckedAt = new Date().toISOString();
      writeMailForwardState(state);
      return;
    }

    const newMessages = inbox.filter(item => {
      const id = item.id ?? item.message_id;
      if (!id || forwardedIds.has(id)) {
        return false;
      }

      // Only forward from GreenMountain (Supervisor)
      const from = item.from || '';
      if (from !== 'GreenMountain') {
        return false;
      }

      // Check for bead-related patterns in subject
      if (MAIL_FORWARD_FILTER_BEADS_ONLY) {
        const subject = String(item.subject || '').toLowerCase();
        // Bead-related patterns: bead ID (roundtable-xxx), "bead", "open", "closed", etc.
        const hasBeadPattern = /roundtable-[a-z0-9]|bead|opened|closed|reopened/i.test(subject);
        if (!hasBeadPattern) {
          return false;
        }
      }

      // Also include ack_required messages (important messages you need to respond to)
      if (item.ack_required === true) {
        return true;
      }

      return true;
    });

    if (newMessages.length > 0) {
      const lines = [];
      lines.push(`📬 **Agent Mail** (${newMessages.length} new)`);

      for (const msg of newMessages.slice(0, 10)) {
        const id = msg.id ?? msg.message_id;
        const from = msg.from || '(unknown)';
        const subject = escapeMarkdown(msg.subject || '(no subject)');
        const ackIcon = msg.ack_required ? ' ✓' : '';

        lines.push(`\n**${from}**:${ackIcon}`);
        lines.push(`${subject}`);

        forwardedIds.add(id);
      }

      if (newMessages.length > 10) {
        lines.push(`\n...and ${newMessages.length - 10} more`);
      }

      await sendMarkdownMessage(chatId, lines.join('\n'));
      log('INFO', `Mail forward: forwarded ${newMessages.length} messages to Telegram`);
    }

    state.forwardedMessageIds = Array.from(forwardedIds);
    state.lastCheckedAt = new Date().toISOString();
    writeMailForwardState(state);
  } catch (error) {
    log('ERROR', 'Mail forward tick failed', error);
  } finally {
    mailForwardInProgress = false;
  }
}

function getInboxField(item, keys) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item, key) && item[key] != null) {
      return item[key];
    }
  }

  return null;
}

function parseTimestampMs(rawValue) {
  if (rawValue == null) {
    return null;
  }

  if (typeof rawValue === 'number') {
    return rawValue < 1e12 ? rawValue * 1000 : rawValue;
  }

  if (typeof rawValue === 'string') {
    const numeric = Number(rawValue);
    if (!Number.isNaN(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(rawValue);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizeInboxItem(item) {
  const id = getInboxField(item, ['id', 'message_id']);
  const subject = getInboxField(item, ['subject']);
  const body = getInboxField(item, ['body_md', 'body', 'body_md_rendered']);
  const threadId = getInboxField(item, ['thread_id', 'threadId']);
  const sender = getInboxField(item, ['sender_name', 'sender', 'from', 'from_name']);
  const createdRaw = getInboxField(item, ['created_ts', 'createdTs', 'created_at', 'created']);
  const createdMs = parseTimestampMs(createdRaw);

  return {
    id,
    subject,
    body,
    threadId,
    sender,
    createdRaw,
    createdMs,
    raw: item
  };
}

function extractBeadId(text) {
  if (!text) {
    return null;
  }
  const match = text.match(BEAD_ID_REGEX);
  return match ? match[1] : null;
}

function readBdShowIssue(beadId) {
  if (!beadId) {
    return null;
  }
  const result = runBdCommand(`show ${shellEscape(beadId)} --json --no-daemon`);
  if (!result.output) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.output);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0];
    }
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch (error) {
    log('ERROR', `Failed to parse bd show ${beadId} --json`, error);
    return null;
  }
}

function formatIssueNotesForMail(issue) {
  const notes = issue && typeof issue.notes === 'string' ? issue.notes.trim() : '';
  if (!notes) {
    return null;
  }
  // Keep mail bodies readable; notes can contain long transcripts.
  if (notes.length <= 1800) {
    return notes;
  }
  return `${notes.slice(0, 1800).trimEnd()}\n\n(Truncated; see \`bd show ${issue.id}\` for full notes.)`;
}

function extractBeadIdFromMessage(message) {
  const candidates = [
    message.threadId,
    message.subject,
    message.body
  ].filter(Boolean);

  for (const candidate of candidates) {
    const beadId = extractBeadId(String(candidate));
    if (beadId) {
      return beadId;
    }
  }

  return null;
}

function detectCompletedBeadIdFromPane(sessionName, paneIndex) {
  const target = buildAgentTarget(sessionName, paneIndex);
  const lines = captureTmuxPaneLines(target, 140);
  if (!Array.isArray(lines) || lines.length === 0) {
    return null;
  }

  const joined = lines.join('\n');
  const match = joined.match(REVIEW_WAITING_REGEX);
  if (match && match[1]) {
    const beadId = extractBeadId(String(match[1]));
    if (beadId) {
      return beadId;
    }
  }

  // Fallback: if the pane says it's waiting for reviewer sign-off, take the last bead-looking token nearby.
  if (/waiting\s+for:\s*reviewer\s+sign[- ]off/i.test(joined)) {
    const tail = lines.slice(-60).join(' ');
    const fallback = extractBeadId(tail);
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

function isAwaitingReviewerSignoffInPane(sessionName, paneIndex) {
  const target = buildAgentTarget(sessionName, paneIndex);
  const lines = captureTmuxPaneLines(target, 220);
  if (!Array.isArray(lines) || lines.length === 0) {
    return false;
  }
  const joined = lines.join('\n');
  return /(awaiting\s+reviewer\s+sign[- ]off|waiting\s+for:\s*reviewer\s+sign[- ]off|ready\s+for\s+review|ready\s+for\s+reviewer|reviewer\s+sign[- ]off)/i.test(joined);
}

function resolveAssignedBeadForAgent(agentName) {
  if (!agentName) {
    return null;
  }
  const reservations = readReservations();
  const reserved = reservations[agentName];
  if (reserved) {
    return reserved;
  }
  const assignments = readBroadcastAssignments();
  return assignments[agentName] || null;
}

function buildAllowedReviewSenderSet({ reviewerName, promptPack }) {
  const allowed = new Set();
  if (reviewerName) {
    allowed.add(normalizeAgentName(reviewerName));
  }
  REVIEW_ALLOWED_SENDERS.forEach(name => allowed.add(normalizeAgentName(name)));
  const packAllowed = Array.isArray(promptPack?.reviewer?.allowed_senders)
    ? promptPack.reviewer.allowed_senders
    : [];
  packAllowed.forEach(name => allowed.add(normalizeAgentName(name)));
  return allowed;
}

function parseAcceptanceFilePaths(acceptance) {
  if (!acceptance) return [];
  const text = String(acceptance);
  const found = new Set();
  const regex = /(?:^|[\s`"'(])((?:apps\/backend\/|apps\/site\/|packages\/shared\/)?test\/[^\s`"')]+?\.(?:test|spec)\.(?:ts|js))(?:$|[\s`"')])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

function inferAcceptanceWorkspaceRoot(acceptance) {
  const text = acceptance ? String(acceptance) : '';
  if (/--filter\s+backend\b/.test(text) || /@roundtable\/backend/.test(text)) return path.join(ROUNDTABLE_DIR, 'apps', 'backend');
  if (/--filter\s+site\b/.test(text) || /@roundtable\/site/.test(text)) return path.join(ROUNDTABLE_DIR, 'apps', 'site');
  if (/--filter\s+@roundtable\/shared\b/.test(text) || /@roundtable\/shared/.test(text)) return path.join(ROUNDTABLE_DIR, 'packages', 'shared');
  return null;
}

function resolveAcceptanceCheckPath(workspaceRoot, token) {
  if (!token) return null;
  const normalized = String(token).replace(/\\/g, '/');
  if (normalized.startsWith('apps/') || normalized.startsWith('packages/')) {
    return path.join(ROUNDTABLE_DIR, normalized);
  }
  if (normalized.startsWith('test/')) {
    if (!workspaceRoot) return null;
    return path.join(workspaceRoot, normalized);
  }
  return null;
}

function listMissingAcceptanceFiles(issue) {
  if (!issue || typeof issue !== 'object') return [];
  const acceptance = issue.acceptance_criteria ? String(issue.acceptance_criteria) : '';
  if (!acceptance.trim()) return [];
  const workspaceRoot = inferAcceptanceWorkspaceRoot(acceptance);
  const tokens = parseAcceptanceFilePaths(acceptance);
  if (tokens.length === 0) return [];
  const missing = [];
  for (const token of tokens) {
    const filePath = resolveAcceptanceCheckPath(workspaceRoot, token);
    if (!filePath) continue;
    if (!fs.existsSync(filePath)) {
      missing.push({ token, filePath });
    }
  }
  return missing;
}

function shouldSendAcceptanceWarning(meta) {
  const lastWarnAtMs = parseTimestampMs(meta?.lastWarnAt ? String(meta.lastWarnAt) : null);
  const nowMs = Date.now();
  if (lastWarnAtMs && (nowMs - lastWarnAtMs) < (REVIEW_ACCEPTANCE_WARNING_SEC * 1000)) {
    return false;
  }
  return true;
}

function listPendingReviewCandidates({ implementorName, assignments, idPrefixes }) {
  const state = readReviewRequestState();
  const sent = state && state.sent && typeof state.sent === 'object' ? state.sent : {};
  const candidates = [];

  for (const [beadIdRaw, metaRaw] of Object.entries(sent)) {
    const beadId = beadIdRaw ? String(beadIdRaw) : '';
    if (!beadId) continue;
    if (Array.isArray(idPrefixes) && idPrefixes.length > 0 && !matchesAnyPrefix(beadId, idPrefixes)) {
      continue;
    }

    const meta = metaRaw && typeof metaRaw === 'object' ? metaRaw : {};
    const sentAt = meta.sentAt ? String(meta.sentAt) : null;
    const metaImplementor = meta.implementor ? String(meta.implementor) : null;
    const assignedImplementor = assignments && assignments[beadId] ? String(assignments[beadId]) : null;
    const effectiveImplementor = metaImplementor || assignedImplementor;

    if (implementorName && effectiveImplementor) {
      if (normalizeAgentName(effectiveImplementor) !== normalizeAgentName(implementorName)) {
        continue;
      }
    } else if (implementorName && !effectiveImplementor) {
      continue;
    }

    const issue = readBdShowIssue(beadId);
    if (!issue) continue;
    if (issue.status !== 'open' && issue.status !== 'in_progress') continue;
    candidates.push({ beadId, sentAtMs: parseTimestampMs(sentAt) || 0 });
  }

  candidates.sort((a, b) => b.sentAtMs - a.sentAtMs);
  return candidates.map(entry => entry.beadId);
}

function inferBeadIdFromReviewContext({ messageSourceKey, implementorName, assignments, idPrefixes }) {
  const pendingCandidates = listPendingReviewCandidates({ implementorName, assignments, idPrefixes });
  if (pendingCandidates.length === 1) {
    return pendingCandidates[0];
  }

  if (implementorName) {
    const assignedBead = resolveAssignedBeadForAgent(implementorName);
    if (assignedBead) {
      const issue = readBdShowIssue(assignedBead);
      if (issue && (issue.status === 'open' || issue.status === 'in_progress')) {
        if (pendingCandidates.length === 0) {
          return assignedBead;
        }
        if (pendingCandidates.includes(assignedBead)) {
          return assignedBead;
        }
      }
    }
  }

  // If this approval landed in an implementor inbox but we couldn't resolve to a single bead,
  // do not guess; we'll ask the reviewer to include the bead id.
  if (messageSourceKey && /^implementor/.test(messageSourceKey)) {
    return null;
  }

  // Supervisor inbox: if there's exactly one pending review in the current pack, infer it.
  if (!implementorName && pendingCandidates.length === 1) {
    return pendingCandidates[0];
  }

  return null;
}

function buildAutoReviewRequestBody({ beadId, issue, implementorName, reviewerName, supervisorName }) {
  const title = issue && issue.title ? issue.title : null;
  const acceptance = issue && typeof issue.acceptance_criteria === 'string' ? issue.acceptance_criteria.trim() : '';
  const notes = issue ? formatIssueNotesForMail(issue) : null;
  const lines = [];
  lines.push(`Bead \`${beadId}\`${title ? ` — ${title}` : ''}`);
  lines.push('');
  lines.push('This bead appears complete and is waiting on reviewer sign-off (auto-detected from tmux output).');
  lines.push('');
  lines.push('Review steps:');
  lines.push(`- Read: \`bd show ${beadId}\``);
  if (acceptance) {
    lines.push(`- Acceptance: ${acceptance}`);
  } else {
    lines.push('- Run the bead’s acceptance command(s) from `bd show`.');
  }
  lines.push('');
  if (notes) {
    lines.push('Notes (from `bd show --json`):');
    lines.push(notes);
    lines.push('');
  }
  lines.push(`If approved, reply with: \`APPROVED ${beadId}\` (preferred).`);
  lines.push(`If it needs changes, reply with: \`NEEDS FIXES ${beadId}\` (preferred).`);
  lines.push('If you only reply `APPROVED` / `NEEDS FIXES`, the bot will infer the bead when unambiguous.');
  lines.push(`(You can reply to ${implementorName} directly; the bot will route/auto-close as ${supervisorName}.)`);
  lines.push('');
  lines.push(`Reviewer: ${reviewerName}`);
  lines.push(`Supervisor (auto-closer): ${supervisorName}`);
  return lines.join('\n');
}

function shouldSendReviewReminder(meta) {
  if (!meta || typeof meta !== 'object') {
    return false;
  }
  const sentAtMs = parseTimestampMs(meta.sentAt ? String(meta.sentAt) : null);
  if (!sentAtMs) {
    return false;
  }
  const lastReminderAtMs = parseTimestampMs(meta.lastReminderAt ? String(meta.lastReminderAt) : null);
  const nowMs = Date.now();
  const thresholdMs = REVIEW_REQUEST_REMINDER_SEC * 1000;
  if (nowMs - sentAtMs < thresholdMs) {
    return false;
  }
  if (lastReminderAtMs && (nowMs - lastReminderAtMs) < thresholdMs) {
    return false;
  }
  return true;
}

function determineReviewOutcome(text) {
  if (!text) {
    return 'update';
  }

  if (REVIEW_NEGATIVE_REGEX.test(text)) {
    return 'needs_fixes';
  }

  if (REVIEW_POSITIVE_REGEX.test(text)) {
    return 'approved';
  }

  return 'update';
}

function buildReviewSnippet(message) {
  const parts = [];
  if (message.subject) {
    parts.push(String(message.subject));
  }
  if (message.body) {
    parts.push(String(message.body));
  }

  if (parts.length === 0) {
    return null;
  }

  const combined = parts.join(' ');
  return combined.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getBeadAssigneeMap() {
  const assignments = {};
  const sources = [
    { cmd: 'list -s in_progress --no-daemon' },
    { cmd: 'ready --no-daemon' },
    { cmd: 'list -s closed --no-daemon' }
  ];

  sources.forEach(source => {
    const result = runBdCommand(source.cmd);
    if (!result.output) {
      return;
    }

    const parsed = parseBdListOutput(result.output);
    parsed.items.forEach(item => {
      if (item.id && item.assignee && !assignments[item.id]) {
        assignments[item.id] = item.assignee;
      }
    });
  });

  const reservations = readReservations();
  Object.entries(reservations).forEach(([agentId, beadId]) => {
    if (beadId && agentId && !assignments[beadId]) {
      assignments[beadId] = agentId;
    }
  });

  return assignments;
}

function normalizeAgentName(name) {
  if (!name) {
    return '';
  }
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveImplementorTarget(assignee, roleAgents) {
  if (!assignee) {
    return null;
  }

  const normalized = normalizeAgentName(assignee);
  const impl1Name = roleAgents?.implementor1Name || 'OrangePond';
  const impl2Name = roleAgents?.implementor2Name || 'FuchsiaCreek';
  const impl1PaneIndex = normalizePaneIndex(roleAgents?.implementor1PaneIndex)
    ?? DEFAULT_ROLE_TO_PANE['implementor-1'];
  const impl2PaneIndex = normalizePaneIndex(roleAgents?.implementor2PaneIndex)
    ?? DEFAULT_ROLE_TO_PANE['implementor-2'];

  const impl1Keys = [
    normalizeAgentName(impl1Name),
    'implementor1',
    'implementor-1',
    'orangepond'
  ];

  const impl2Keys = [
    normalizeAgentName(impl2Name),
    'implementor2',
    'implementor-2',
    'fuchsiacreek'
  ];

  if (impl1Keys.some(key => normalized.includes(key))) {
    return { paneIndex: impl1PaneIndex, agentName: impl1Name };
  }

  if (impl2Keys.some(key => normalized.includes(key))) {
    return { paneIndex: impl2PaneIndex, agentName: impl2Name };
  }

  return null;
}

async function sendAgentMailMessage(senderName, recipients, subject, body, threadId) {
  if (!senderName || !Array.isArray(recipients) || recipients.length === 0) {
    return false;
  }

  const url = getAgentMailMcpUrl();
  const payload = {
    jsonrpc: '2.0',
    id: `send-${senderName}-${Date.now()}`,
    method: 'tools/call',
    params: {
      name: 'send_message',
      arguments: {
        project_key: ROUNDTABLE_DIR,
        sender_name: senderName,
        to: recipients,
        subject: subject || 'Review update',
        body_md: body || '',
        thread_id: threadId || undefined,
        ack_required: false
      }
    }
  };

  try {
    const data = await fetchWithRetry(url, payload, `send Agent Mail from ${senderName}`);
    if (!data || typeof data !== 'object') {
      return false;
    }
    const result = data.result && typeof data.result === 'object' ? data.result : null;
    if (result && result.isError) {
      return false;
    }
    return true;
  } catch (error) {
    log('ERROR', `Failed to send Agent Mail from ${senderName}`, error);
    return false;
  }
}

function buildAssignmentMailBody({ bead, pack, reserveHint, testCommands, guardrails }) {
  const lines = [];
  if (bead?.id) {
    lines.push(`Bead: \`${bead.id}\``);
  }
  if (bead?.title) {
    lines.push(`Title: ${bead.title}`);
  }
  if (pack?.id) {
    lines.push(`Prompt pack: \`${pack.id}\`${pack.title ? ` (${pack.title})` : ''}`);
  }
  lines.push('');
  lines.push('Next steps:');
  lines.push(`- Read: \`bd show ${bead.id}\``);
  lines.push(`- When complete: \`bd close ${bead.id}\``);
  lines.push('- Send reviewer a short summary + how to test');
  lines.push('');
  if (reserveHint) {
    lines.push(`Reserve paths (hint): \`${reserveHint}\``);
  }
  if (Array.isArray(testCommands) && testCommands.length > 0) {
    lines.push('Run tests:');
    testCommands.forEach(cmd => lines.push(`- \`${cmd}\``));
  }
  if (guardrails) {
    lines.push('');
    lines.push('Guardrails:');
    lines.push(`- ${guardrails}`);
  }
  lines.push('');
  lines.push('If your pane shows typed input “awaiting response”, use Telegram: `/unblock submit` (or `/unblock clear`).');
  return lines.join('\n');
}

async function routeReviewCompletions() {
  if (!REVIEW_ROUTER_ENABLED) {
    return;
  }

  const tmuxAvailable = checkTmuxSession();

  const state = readReviewRouterState() || {};
  state.inboxes = state.inboxes && typeof state.inboxes === 'object' ? state.inboxes : {};
  state.initializedAt = state.initializedAt || new Date().toISOString();

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const reviewerName = roleAgents.reviewerName;
  const implementor1Name = roleAgents.implementor1Name;
  const implementor2Name = roleAgents.implementor2Name;
  const supervisorPaneIndex = roleAgents.supervisorPaneIndex;
  const reviewerPaneIndex = roleAgents.reviewerPaneIndex;
  const tmuxSession = resolveTmuxSessionName();
  const selectedPack = readBroadcastPackSelection();
  const promptPack = selectedPack ? loadPromptPack(selectedPack) : null;
  const idPrefixes = Array.isArray(promptPack?.id_prefixes) ? promptPack.id_prefixes : [];
  const allowedReviewSenders = buildAllowedReviewSenderSet({ reviewerName, promptPack });

  const inboxSources = [
    { key: 'supervisor', agentName: supervisorName },
    { key: 'implementor1', agentName: implementor1Name },
    { key: 'implementor2', agentName: implementor2Name }
  ];

  state.processedMessageIds = Array.isArray(state.processedMessageIds) ? state.processedMessageIds : [];
  const processedSet = new Set(state.processedMessageIds.map(id => String(id)));
  state.nudgedMessageIds = Array.isArray(state.nudgedMessageIds) ? state.nudgedMessageIds : [];
  const nudgedSet = new Set(state.nudgedMessageIds.map(id => String(id)));
  const rememberProcessed = (id) => {
    if (!id) return;
    const key = String(id);
    if (processedSet.has(key)) return;
    processedSet.add(key);
    state.processedMessageIds.push(key);
    // Keep state bounded to avoid unbounded growth.
    if (state.processedMessageIds.length > 300) {
      state.processedMessageIds = state.processedMessageIds.slice(-200);
      processedSet.clear();
      state.processedMessageIds.forEach(entry => processedSet.add(String(entry)));
    }
  };
  const rememberNudged = (id) => {
    if (!id) return;
    const key = String(id);
    if (nudgedSet.has(key)) return;
    nudgedSet.add(key);
    state.nudgedMessageIds.push(key);
    if (state.nudgedMessageIds.length > 300) {
      state.nudgedMessageIds = state.nudgedMessageIds.slice(-200);
      nudgedSet.clear();
      state.nudgedMessageIds.forEach(entry => nudgedSet.add(String(entry)));
    }
  };

  const collected = [];
  for (const source of inboxSources) {
    const inbox = await fetchAgentInbox(source.agentName, { limit: 25, include_bodies: true });
    if (!Array.isArray(inbox) || inbox.length === 0) {
      continue;
    }

    const normalized = inbox.map(normalizeInboxItem).filter(item => item.createdMs);
    if (normalized.length === 0) {
      continue;
    }

    const latestMessage = normalized.reduce((latest, item) => {
      if (!latest) {
        return item;
      }
      if (item.createdMs > latest.createdMs) {
        return item;
      }
      if (item.createdMs === latest.createdMs && item.id && latest.id) {
        const itemId = Number(item.id);
        const latestId = Number(latest.id);
        if (Number.isFinite(itemId) && Number.isFinite(latestId) && itemId > latestId) {
          return item;
        }
      }
      return latest;
    }, null);

    const prior = state.inboxes[source.key] && typeof state.inboxes[source.key] === 'object'
      ? state.inboxes[source.key]
      : {};

    // Back-compat: older state stored supervisor inbox pointers at top-level.
    if (source.key === 'supervisor' && !prior.lastSeenTs && state.lastSeenTs) {
      prior.lastSeenTs = state.lastSeenTs;
      prior.lastSeenId = state.lastSeenId;
    }

    const lastSeenMs = parseTimestampMs(prior.lastSeenTs);
    const lastSeenId = Number.isFinite(Number(prior.lastSeenId)) ? Number(prior.lastSeenId) : null;

    const newMessages = lastSeenMs
      ? normalized.filter(item => {
        if (!item || !item.id) return false;
        const itemId = String(item.id);
        if (processedSet.has(itemId)) return false;
        const cutoffMs = Math.max(0, lastSeenMs - (REVIEW_ROUTER_LOOKBACK_SEC * 1000));
        return item.createdMs >= cutoffMs;
      })
      : [];

    if (latestMessage) {
      prior.lastSeenTs = new Date(latestMessage.createdMs).toISOString();
      if (latestMessage.id) {
        prior.lastSeenId = latestMessage.id;
      }
    }
    state.inboxes[source.key] = prior;

    // If this is our first pass, don't process historical messages.
    if (!lastSeenMs) {
      continue;
    }

    newMessages.forEach(message => collected.push({ message, sourceKey: source.key }));
  }

  const supervisorState = state.inboxes.supervisor;
  if (supervisorState?.lastSeenTs) state.lastSeenTs = supervisorState.lastSeenTs;
  if (supervisorState?.lastSeenId) state.lastSeenId = supervisorState.lastSeenId;

  if (collected.length === 0) {
    writeReviewRouterState(state);
    return;
  }

  collected.sort((a, b) => {
    if (a.message.createdMs !== b.message.createdMs) {
      return a.message.createdMs - b.message.createdMs;
    }
    const aId = Number.isFinite(Number(a.message.id)) ? Number(a.message.id) : 0;
    const bId = Number.isFinite(Number(b.message.id)) ? Number(b.message.id) : 0;
    return aId - bId;
  });

  const assignments = getBeadAssigneeMap();
  for (const entry of collected) {
    const message = entry.message;
    const senderOk = allowedReviewSenders.has(normalizeAgentName(message.sender));
    if (!senderOk) {
      continue;
    }

    if (message.id && processedSet.has(String(message.id))) {
      continue;
    }

    const combinedText = [message.subject, message.body, message.threadId].filter(Boolean).join(' ');
    if (!REVIEW_DONE_REGEX.test(combinedText)) {
      continue;
    }

    let beadId = extractBeadIdFromMessage(message);
    if (!beadId) {
      const implementorName = entry.sourceKey === 'implementor1'
        ? implementor1Name
        : (entry.sourceKey === 'implementor2' ? implementor2Name : null);
      beadId = inferBeadIdFromReviewContext({
        messageSourceKey: entry.sourceKey,
        implementorName,
        assignments,
        idPrefixes
      });
    }
    if (!beadId) {
      if (message.id && !nudgedSet.has(String(message.id))) {
        const implementorName = entry.sourceKey === 'implementor1'
          ? implementor1Name
          : (entry.sourceKey === 'implementor2' ? implementor2Name : null);
        const pending = listPendingReviewCandidates({ implementorName, assignments, idPrefixes });
        const pendingSummary = pending.length > 0 ? pending.slice(0, 6).map(id => `\`${id}\``).join(', ') : '(none found)';
        const subject = 'Approval received, but missing bead id';
        const body = [
          'I saw your review outcome message, but couldn’t determine which bead it refers to.',
          '',
          `Please reply with the bead id, e.g. \`APPROVED <bead-id>\` or \`NEEDS FIXES <bead-id>\`.`,
          '',
          implementorName ? `Likely pending for ${implementorName}: ${pendingSummary}` : `Pending beads: ${pendingSummary}`
        ].join('\n');
        await sendAgentMailMessage(supervisorName, [reviewerName], subject, body);
        if (tmuxAvailable && isPaneSafeToPrompt(tmuxSession, reviewerPaneIndex)) {
          sendTmuxPrompt(buildAgentTarget(tmuxSession, reviewerPaneIndex), 'Need bead id to route approval. Reply “APPROVED <bead-id>”.');
        }
        rememberNudged(message.id);
      }
      rememberProcessed(message.id);
      continue;
    }

    const outcome = determineReviewOutcome(combinedText);
    const issue = readBdShowIssue(beadId);
    // Avoid spamming follow-up notifications for already-closed beads.
    // If a reviewer sends multiple "approved" messages (or the same approval gets echoed),
    // we treat it as no-op once the bead is closed.
    if (outcome === 'approved' && issue && issue.status === 'closed') {
      rememberProcessed(message.id);
      state.lastRoutedAt = new Date().toISOString();
      state.lastBeadId = beadId;
      state.lastSender = message.sender || null;
      continue;
    }
    const assignee = assignments[beadId];
    const implementorTarget = resolveImplementorTarget(assignee, roleAgents);
    const snippet = buildReviewSnippet(message);

    const supervisorPromptLines = [
      `Reviewer update for ${beadId}: ${outcome.replace('_', ' ')}.`,
      snippet ? `Summary: ${snippet}` : null,
      assignee ? `Assignee: ${assignee}` : 'Assignee: unknown'
    ].filter(Boolean);
    if (tmuxAvailable) {
      sendTmuxPrompt(buildAgentTarget(tmuxSession, supervisorPaneIndex), supervisorPromptLines.join(' '));
    }

    if (implementorTarget) {
      const implPromptLines = [
        `Review update for ${beadId}: ${outcome.replace('_', ' ')}.`,
        snippet ? `Summary: ${snippet}` : null,
        outcome === 'needs_fixes'
          ? 'Address reviewer notes, then notify reviewer.'
          : 'Proceed with next steps and notify reviewer.'
      ].filter(Boolean);
      if (tmuxAvailable) {
        sendTmuxPrompt(buildAgentTarget(tmuxSession, implementorTarget.paneIndex), implPromptLines.join(' '));
      }

      const mailSubject = `[${beadId}] Review ${outcome === 'needs_fixes' ? 'needs fixes' : outcome}`;
      const mailBody = [
        `Reviewer update for ${beadId}: ${outcome.replace('_', ' ')}.`,
        snippet ? `Summary: ${snippet}` : null,
        'Please check your inbox and follow up with the reviewer.'
      ].filter(Boolean).join('\n');

      // IMPORTANT: Do not send the forwarded update *from* the reviewer into implementor inboxes.
      // This router reads implementor inboxes to catch cases where the reviewer replied directly to them.
      // If we forward from the reviewer, we create an infinite loop (the router sees its own forwarded message).
      await sendAgentMailMessage(supervisorName, [implementorTarget.agentName], mailSubject, mailBody, beadId);
    }

    if (REVIEW_AUTO_CLOSE_ENABLED && outcome === 'approved') {
      if (issue && (issue.status === 'in_progress' || issue.status === 'open')) {
        const closeReason = `Auto-closed after reviewer approval (${reviewerName})`;
        const result = runBdCommand(
          `close ${shellEscape(beadId)} --reason ${shellEscape(closeReason)} --actor ${shellEscape(supervisorName)} --no-daemon`
        );
        if (!result.error) {
          cleanupBeadReservations('auto', { beadIds: new Set([beadId]) });

          const closeSummary = `✅ Auto-closed ${beadId} after reviewer approval.`;
          if (tmuxAvailable) {
            sendTmuxPrompt(buildAgentTarget(tmuxSession, supervisorPaneIndex), closeSummary);
          }
          if (implementorTarget) {
            if (tmuxAvailable) {
              sendTmuxPrompt(buildAgentTarget(tmuxSession, implementorTarget.paneIndex), closeSummary);
            }
            await sendAgentMailMessage(
              supervisorName,
              [implementorTarget.agentName],
              `[${beadId}] Closed (auto)`,
              closeSummary,
              beadId
            );
          }
          await sendAgentMailMessage(
            supervisorName,
            [reviewerName],
            `[${beadId}] Closed (auto)`,
            closeSummary,
            beadId
          );
        } else {
          const errLine = `⚠️ Auto-close failed for ${beadId}: ${result.error}`;
          if (tmuxAvailable) {
            sendTmuxPrompt(buildAgentTarget(tmuxSession, supervisorPaneIndex), errLine);
          }
        }
      }
    }

    rememberProcessed(message.id);
    state.lastRoutedAt = new Date().toISOString();
    state.lastBeadId = beadId;
    state.lastSender = message.sender || null;
  }

  writeReviewRouterState(state);
}

let reviewRequestRouterInProgress = false;
async function routeReviewRequests() {
  if (!REVIEW_REQUEST_ROUTER_ENABLED) {
    return;
  }
  if (!checkTmuxSession()) {
    return;
  }
  if (reviewRequestRouterInProgress) {
    return;
  }

  reviewRequestRouterInProgress = true;
  try {
    const tmuxSession = resolveTmuxSessionName();
    const agentInfo = getAgentInfo();
    const roleAgents = resolveRoleAgents(agentInfo);
    const supervisorName = roleAgents.supervisorName;
    const reviewerName = roleAgents.reviewerName;
    const implementor1Name = roleAgents.implementor1Name;
    const implementor2Name = roleAgents.implementor2Name;
    const reviewerPaneIndex = roleAgents.reviewerPaneIndex;
    const implementor1PaneIndex = roleAgents.implementor1PaneIndex;
    const implementor2PaneIndex = roleAgents.implementor2PaneIndex;

    const state = readReviewRequestState() || {};
    state.sent = state.sent && typeof state.sent === 'object' ? state.sent : {};
    state.acceptanceWarnings = state.acceptanceWarnings && typeof state.acceptanceWarnings === 'object'
      ? state.acceptanceWarnings
      : {};
    state.lastRunAt = new Date().toISOString();

    // Avoid duplicate requests if reviewer already has a recent thread for the bead.
    const reviewerInbox = await fetchAgentInbox(reviewerName, { limit: 25, include_bodies: false });
    const recentBeads = new Set();
    if (Array.isArray(reviewerInbox)) {
      reviewerInbox.map(normalizeInboxItem).forEach(item => {
        if (!item) return;
        const bead = extractBeadIdFromMessage(item);
        if (bead) {
          recentBeads.add(bead);
        }
      });
    }

    // Prefer sending review requests for beads explicitly marked "Ready for review" in Beads notes.
    // This is more reliable than parsing pane output, and avoids a deadlock where earlier coordination
    // messages containing bead IDs cause `recentBeads` to suppress the *first* actual request.
    const selectedPack = readBroadcastPackSelection();
    const promptPack = selectedPack ? loadPromptPack(selectedPack) : null;
    const idPrefixes = Array.isArray(promptPack?.id_prefixes) ? promptPack.id_prefixes : [];

    const openIssues = (() => {
      const result = runBdCommand('list -s open --no-daemon --json');
      if (!result.output) return [];
      try {
        const parsed = JSON.parse(result.output);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const inProgressIssues = (() => {
      const result = runBdCommand('list -s in_progress --no-daemon --json');
      if (!result.output) return [];
      try {
        const parsed = JSON.parse(result.output);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    const explicitReadyCandidates = [...openIssues, ...inProgressIssues]
      .map(issue => (issue && typeof issue === 'object') ? issue : null)
      .filter(Boolean)
      .filter(issue => {
        const beadId = issue.id ? String(issue.id) : '';
        if (!beadId) return false;
        if (idPrefixes.length > 0 && !matchesAnyPrefix(beadId, idPrefixes)) return false;
        const notes = issue.notes ? String(issue.notes) : '';
        return /ready for review/i.test(notes);
      });

    for (const issue of explicitReadyCandidates) {
      const beadId = String(issue.id);
      if (!beadId) continue;
      const priorMeta = state.sent[beadId];
      if (priorMeta) {
        if (!shouldSendReviewReminder(priorMeta)) continue;
        const liveIssue = readBdShowIssue(beadId);
        if (!liveIssue || (liveIssue.status !== 'open' && liveIssue.status !== 'in_progress')) continue;
        const subject = `[${beadId}] Review request reminder (auto)`;
        const acceptance = liveIssue.acceptance_criteria ? String(liveIssue.acceptance_criteria).trim() : '';
        const body = [
          `Reminder: review pending for \`${beadId}\`.`,
          '',
          acceptance ? `Acceptance: \`${acceptance}\`` : 'Acceptance: run the bead’s acceptance command(s) from `bd show`.',
          '',
          'Reply with `APPROVED` (or `APPROVED <bead-id>`) when ready.'
        ].join('\n');
        const ok = await sendAgentMailMessage(supervisorName, [reviewerName], subject, body, beadId);
        if (ok) {
          priorMeta.lastReminderAt = new Date().toISOString();
          priorMeta.reminderCount = (Number.isFinite(Number(priorMeta.reminderCount)) ? Number(priorMeta.reminderCount) : 0) + 1;
          state.sent[beadId] = priorMeta;
          if (isPaneSafeToPrompt(tmuxSession, reviewerPaneIndex)) {
            sendTmuxPrompt(buildAgentTarget(tmuxSession, reviewerPaneIndex), `Reminder: review pending for ${beadId}. ${acceptance ? `Run: ${acceptance}` : 'See Agent Mail for details.'}`);
          }
        }
        continue;
      }

      // If a thread already exists, still send the *first* automated request; state.sent prevents repeats.
      const subject = `[${beadId}] Review request (auto)`;
      const body = buildAutoReviewRequestBody({
        beadId,
        issue,
        implementorName: issue.assignee ? String(issue.assignee) : 'unassigned',
        reviewerName,
        supervisorName
      });

      const missingAcceptance = listMissingAcceptanceFiles(issue);
      if (missingAcceptance.length > 0) {
        const warnMeta = state.acceptanceWarnings[beadId] || {};
        if (shouldSendAcceptanceWarning(warnMeta)) {
          const implementorName = issue.assignee ? String(issue.assignee) : null;
          const missingText = missingAcceptance.map(entry => `- \`${entry.token}\` (expected at \`${path.relative(ROUNDTABLE_DIR, entry.filePath)}\`)`).join('\n');
          const warnBody = [
            `Bead \`${beadId}\` is marked ready for review, but its acceptance_criteria references missing file(s):`,
            '',
            missingText,
            '',
            'Please either create the referenced file(s) or update the bead acceptance_criteria to point at existing tests, then mark it Ready for review again.',
            '',
            `Suggested command: \`bd update ${beadId} --acceptance "<command>" --actor ${supervisorName}\``
          ].join('\n');
          await sendAgentMailMessage(supervisorName, [reviewerName], `[${beadId}] Review blocked: acceptance command invalid`, warnBody, beadId);
          if (implementorName) {
            await sendAgentMailMessage(supervisorName, [implementorName], `[${beadId}] Fix acceptance criteria (auto)`, warnBody, beadId);
          }
          warnMeta.lastWarnAt = new Date().toISOString();
          warnMeta.count = (Number.isFinite(Number(warnMeta.count)) ? Number(warnMeta.count) : 0) + 1;
          state.acceptanceWarnings[beadId] = warnMeta;
          if (implementorName) {
            const targetPane = normalizeAgentName(implementorName) === normalizeAgentName(implementor1Name)
              ? implementor1PaneIndex
              : (normalizeAgentName(implementorName) === normalizeAgentName(implementor2Name) ? implementor2PaneIndex : null);
            if (targetPane != null && isPaneSafeToPrompt(tmuxSession, targetPane)) {
              sendTmuxPrompt(buildAgentTarget(tmuxSession, targetPane), `Acceptance criteria for ${beadId} references missing test files. Please update bead acceptance_criteria or add the file.`);
            }
          }
        }
        continue;
      }

      const ok = await sendAgentMailMessage(supervisorName, [reviewerName], subject, body, beadId);
      if (ok) {
        state.sent[beadId] = {
          sentAt: new Date().toISOString(),
          implementor: issue.assignee ? String(issue.assignee) : null,
          reviewer: reviewerName,
          source: 'beads-notes'
        };
        if (isPaneSafeToPrompt(tmuxSession, reviewerPaneIndex)) {
          sendTmuxPrompt(buildAgentTarget(tmuxSession, reviewerPaneIndex), `Agent Mail: review request queued for ${beadId}. Reply with “APPROVED ${beadId}” if OK.`);
        }
      }
    }

    const candidates = [
      { paneIndex: implementor1PaneIndex, implementorName: implementor1Name },
      { paneIndex: implementor2PaneIndex, implementorName: implementor2Name }
    ];

    for (const candidate of candidates) {
      const beadId = detectCompletedBeadIdFromPane(tmuxSession, candidate.paneIndex)
        || (isAwaitingReviewerSignoffInPane(tmuxSession, candidate.paneIndex)
          ? resolveAssignedBeadForAgent(candidate.implementorName)
          : null);
      if (!beadId) {
        continue;
      }
      if (state.sent[beadId]) {
        const priorMeta = state.sent[beadId];
        if (!shouldSendReviewReminder(priorMeta)) {
          continue;
        }
        const liveIssue = readBdShowIssue(beadId);
        if (!liveIssue || (liveIssue.status !== 'open' && liveIssue.status !== 'in_progress')) {
          continue;
        }
        const subject = `[${beadId}] Review request reminder (auto)`;
        const acceptance = liveIssue.acceptance_criteria ? String(liveIssue.acceptance_criteria).trim() : '';
        const body = [
          `Reminder: ${candidate.implementorName} is still waiting for reviewer sign-off on \`${beadId}\`.`,
          '',
          acceptance ? `Acceptance: \`${acceptance}\`` : 'Acceptance: run the bead’s acceptance command(s) from `bd show`.',
          '',
          'Reply with `APPROVED` (or `APPROVED <bead-id>`) when ready.'
        ].join('\n');
        const ok = await sendAgentMailMessage(supervisorName, [reviewerName], subject, body, beadId);
        if (ok) {
          priorMeta.lastReminderAt = new Date().toISOString();
          priorMeta.reminderCount = (Number.isFinite(Number(priorMeta.reminderCount)) ? Number(priorMeta.reminderCount) : 0) + 1;
          state.sent[beadId] = priorMeta;
          if (isPaneSafeToPrompt(tmuxSession, reviewerPaneIndex)) {
            sendTmuxPrompt(buildAgentTarget(tmuxSession, reviewerPaneIndex), `Reminder: review pending for ${beadId}. ${acceptance ? `Run: ${acceptance}` : 'See Agent Mail for details.'}`);
          }
        }
        continue;
      }

      const issue = readBdShowIssue(beadId);
      const subject = `[${beadId}] Review request (auto)`;
      const body = buildAutoReviewRequestBody({
        beadId,
        issue,
        implementorName: candidate.implementorName,
        reviewerName,
        supervisorName
      });

      const missingAcceptance = listMissingAcceptanceFiles(issue);
      if (missingAcceptance.length > 0) {
        const warnMeta = state.acceptanceWarnings[beadId] || {};
        if (shouldSendAcceptanceWarning(warnMeta)) {
          const missingText = missingAcceptance.map(entry => `- \`${entry.token}\` (expected at \`${path.relative(ROUNDTABLE_DIR, entry.filePath)}\`)`).join('\n');
          const warnBody = [
            `Bead \`${beadId}\` looks complete, but its acceptance_criteria references missing file(s):`,
            '',
            missingText,
            '',
            `Implementor: ${candidate.implementorName}`,
            '',
            'Please either create the referenced file(s) or update the bead acceptance_criteria to point at existing tests, then re-request review.'
          ].join('\n');
          await sendAgentMailMessage(supervisorName, [reviewerName], `[${beadId}] Review blocked: acceptance command invalid`, warnBody, beadId);
          await sendAgentMailMessage(supervisorName, [candidate.implementorName], `[${beadId}] Fix acceptance criteria (auto)`, warnBody, beadId);
          warnMeta.lastWarnAt = new Date().toISOString();
          warnMeta.count = (Number.isFinite(Number(warnMeta.count)) ? Number(warnMeta.count) : 0) + 1;
          state.acceptanceWarnings[beadId] = warnMeta;
          if (isPaneSafeToPrompt(tmuxSession, candidate.paneIndex)) {
            sendTmuxPrompt(buildAgentTarget(tmuxSession, candidate.paneIndex), `Acceptance criteria for ${beadId} references missing test files. Please update bead acceptance_criteria or add the file.`);
          }
        }
        continue;
      }

      const ok = await sendAgentMailMessage(candidate.implementorName, [reviewerName, supervisorName], subject, body, beadId);
      if (ok) {
        state.sent[beadId] = {
          sentAt: new Date().toISOString(),
          implementor: candidate.implementorName,
          reviewer: reviewerName
        };

        if (isPaneSafeToPrompt(tmuxSession, reviewerPaneIndex)) {
          sendTmuxPrompt(buildAgentTarget(tmuxSession, reviewerPaneIndex), `Agent Mail: review request queued for ${beadId}. Reply with “APPROVED ${beadId}” if OK.`);
        }
      }
    }

    writeReviewRequestState(state);
  } catch (error) {
    log('ERROR', 'Review request router tick failed', error);
  } finally {
    reviewRequestRouterInProgress = false;
  }
}

// Bot commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '🤖 **Roundtable MAF Bot**\n\n' +
    'Quick start (beads clearing):\n' +
    '1) `/status`\n' +
    '2) `/broadcast-targeted`\n' +
    '3) `/broadcast-apply`\n' +
    '4) `/activity`\n\n' +
    'If a pane says “awaiting response” (typed input is waiting): `/unblock submit`\n' +
    'If anything stalls: `/unblock`\n\n' +
    'Type `/help` for the full command list.',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '🤖 **Roundtable MAF Bot Help**\n\n' +
    '**Recommended flow (beads clearing):**\n' +
    '1) `/status` (health + tmux)\n' +
    '2) `/broadcast-targeted` (draft assignments)\n' +
    '3) `/broadcast-apply` (send prompts)\n' +
    '4) `/activity` (watch progress)\n' +
    '5) If a pane is “awaiting response”: `/unblock submit`\n' +
    '6) If anything stalls: `/unblock`\n\n' +
    '**Do more with less (common shortcuts):**\n' +
    '• `/pulse` - “Did anything change?” (beads + mail + recommendations)\n' +
    '• `/pulse auto idle` - Only broadcast when something changed (recommended)\n' +
    '• `/snapshot 120` - One-glance: beads + last pane lines\n' +
    '• `/review <bead-id>` - Send a full review request\n' +
    '• `/reviewer <message>` - Nudge reviewer with an exact command\n' +
    '• `/mail-sweep` - Auto-ack safe `ack_required` mail + report remaining\n' +
    '• `/broadcast-targeted auto idle` - Send prompts to idle/safe panes only\n' +
    '• `/broadcast-targeted auto` - Send immediately (use sparingly)\n' +
    '• `/broadcast-targeted auto force` - Resend even if nothing changed\n\n' +
    '**Core commands:**\n' +
    '• `/status` - System + tmux + flow status\n' +
    '• `/activity` - Focused per-agent activity\n' +
    '• `/activity debug` - Include extra pane diagnostics\n' +
    '• `/snapshot [all|N]` - Beads overview + tmux monitor (N = last N lines)\n' +
    '• `/stale [days|all]` - Stale in-progress beads (default: 3)\n' +
    '• `/close <bead-id>` - Close a bead (records in Beads)\n\n' +
    '**Broadcasting work:**\n' +
    '• `/broadcast-pack` - Show/set the active prompt pack for /broadcast-targeted\n' +
    '• `/broadcast-targeted` - Draft targeted prompts (supervisor approves)\n' +
    '• `/broadcast-targeted auto` - Draft + immediately send (dedupes if nothing changed)\n' +
    '• `/broadcast-targeted idle` - Draft prompts only for idle/safe panes\n' +
    '• `/broadcast-targeted auto idle` - Immediate send, idle panes only\n' +
    '• `/broadcast-apply` - Send the pending draft\n' +
    '• `/broadcast-cancel` - Discard pending draft\n\n' +
    'Note: auto broadcasts also send the assignment via Agent Mail (durable), so agents can scroll back later.\n\n' +
    '**Review workflow:**\n' +
    '• `/review <bead-id>` - Send review request + bead notes to reviewer (Agent Mail) and nudge reviewer pane\n' +
    '• `/reviewer <message>` - Send a note to reviewer inbox (Agent Mail) and nudge reviewer pane\n\n' +
    '**Supervisor comms:**\n' +
    '• `/supervisor <message>` - Send a note to supervisor inbox (Agent Mail)\n' +
    '• `/supervisor-update` - Ask supervisor for a short update (won’t interrupt if busy)\n\n' +
    '**Recovery / stuck panes:**\n' +
    '• `/unblock` - Diagnose panes (default placeholders are ignored)\n' +
    '• `/unblock submit` - Press Enter on real pending input (use this if “awaiting response”)\n' +
    '• `/unblock clear` - Clear the input line (including default placeholders)\n' +
    '• `/unblock confirm` - Confirm a skill/tool prompt once\n' +
    '• `/unblock trust` - Approve + remember\n\n' +
    '**Mail hygiene:**\n' +
    '• `/mail-sweep` - Auto-ack safe `ack_required` items (contact requests + stale)\n' +
    '• `/mail-sweep verbose` - Show the remaining `ack_required` items\n' +
    'Note: `/close ...` also triggers a small auto mail-sweep.\n\n' +
    '**Resets (SOP):**\n' +
    '• `/reset-supervisor` / `/reset-reviewer` / `/reset-codex`\n' +
    '  - Restores Memlayer context + fetches inbox + prints `bd ready`\n' +
    '  - Auto-selects Codex reasoning level (default: High)\n\n' +
    '**Bead reservations:**\n' +
    '• `/reservations` - Show bead reservation files\n' +
    '• `/reservations-clean [auto|expired|stale|all]` - Clear stale reservations\n\n' +
    'If a command doesn’t respond, retry once (Telegram polling can reconnect).',
    { parse_mode: 'Markdown' }
  );
});

function computePulseHash(payload) {
  try {
    return crypto.createHash('sha1').update(JSON.stringify(payload || {})).digest('hex');
  } catch {
    return crypto.randomBytes(8).toString('hex');
  }
}

async function buildPulseSnapshot() {
  const selectedPack = readBroadcastPackSelection();
  const promptPack = selectedPack ? loadPromptPack(selectedPack) : null;
  const idPrefixes = Array.isArray(promptPack?.id_prefixes) ? promptPack.id_prefixes : [];
  const epicId = typeof promptPack?.id === 'string' && promptPack.id.trim() ? promptPack.id.trim() : null;

  const ready = runBdCommand('ready --no-daemon');
  const inProgress = runBdCommand('list -s in_progress --no-daemon');
  const open = runBdCommand('list -s open --no-daemon');
  const blocked = runBdCommand('blocked --no-daemon');

  const readyItems = parseBdListOutput(ready.output).items.filter(item => matchesAnyPrefix(item.id, idPrefixes));
  const inProgressItems = parseBdListOutput(inProgress.output).items.filter(item => matchesAnyPrefix(item.id, idPrefixes));
  const openItems = parseBdListOutput(open.output).items.filter(item => matchesAnyPrefix(item.id, idPrefixes));
  const blockedItems = parseBdListOutput(blocked.output).items.filter(item => matchesAnyPrefix(item.id, idPrefixes));

  const openAll = parseBdListOutput(open.output).items;
  const blockedAll = parseBdListOutput(blocked.output).items;
  const epicOpen = epicId
    ? openAll.find(item => item.id === epicId && item.type === 'epic' && item.status === 'open')
    : null;
  const epicChildrenOpen = epicId
    ? openAll.some(item => item.id.startsWith(`${epicId}.`) && item.status === 'open')
    : false;
  const epicChildrenInProgress = epicId
    ? inProgressItems.some(item => item.id.startsWith(`${epicId}.`))
    : false;
  const epicChildrenBlocked = epicId
    ? blockedAll.some(item => item.id.startsWith(`${epicId}.`) && item.status === 'blocked')
    : false;
  const epicCloseReady = Boolean(epicOpen) && !epicChildrenOpen && !epicChildrenInProgress && !epicChildrenBlocked;

  const triage = runBvTriage();
  const recommendations = Array.isArray(triage?.triage?.recommendations) ? triage.triage.recommendations : [];
  const topPick = recommendations.find(r => r?.id && matchesAnyPrefix(r.id, idPrefixes)) || null;

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const reviewerName = roleAgents.reviewerName;
  const implementor1Name = roleAgents.implementor1Name;
  const implementor2Name = roleAgents.implementor2Name;

  const [supervisorMeta, reviewerMeta, impl1Meta, impl2Meta] = await Promise.all([
    fetchAgentInboxMeta(supervisorName),
    fetchAgentInboxMeta(reviewerName),
    fetchAgentInboxMeta(implementor1Name),
    fetchAgentInboxMeta(implementor2Name)
  ]);

  const reservations = readReservations();
  const assignments = readBroadcastAssignments();
  const reservationEntries = Object.entries(reservations || {}).map(([k, v]) => [String(k), v ? String(v) : '']).sort((a, b) => a[0].localeCompare(b[0]));
  const assignmentEntries = Object.entries(assignments || {}).map(([k, v]) => [String(k), v ? String(v) : '']).sort((a, b) => a[0].localeCompare(b[0]));
  const inboxEntries = Object.entries({
    [supervisorName]: supervisorMeta?.latestMessageId ?? null,
    [reviewerName]: reviewerMeta?.latestMessageId ?? null,
    [implementor1Name]: impl1Meta?.latestMessageId ?? null,
    [implementor2Name]: impl2Meta?.latestMessageId ?? null
  }).map(([k, v]) => [String(k), v == null ? null : Number(v)]).sort((a, b) => a[0].localeCompare(b[0]));

  const snapshot = {
    pack: selectedPack || null,
    epic: epicId ? { id: epicId, status: epicOpen ? 'open' : null, close_ready: epicCloseReady } : null,
    ready: readyItems.map(item => item.id).sort(),
    in_progress: inProgressItems.map(item => item.id).sort(),
    open: openItems.map(item => item.id).sort(),
    blocked: blockedItems.map(item => item.id).sort(),
    inbox_latest: inboxEntries,
    reservations: reservationEntries,
    assignments: assignmentEntries,
    top_pick: topPick ? { id: topPick.id, title: topPick.title || '' } : null
  };
  return snapshot;
}

bot.onText(/^\/pulse(?:\s+.*)?$/, async (msg) => {
  const text = (msg.text || '').toLowerCase();
  const auto = /\bauto\b/.test(text);
  const idle = /\bidle\b/.test(text);
  const force = /\bforce\b/.test(text);

  try {
    const snapshot = await buildPulseSnapshot();
    const hash = computePulseHash(snapshot);
    const state = readPulseState();
    const changed = force || !state.lastHash || state.lastHash !== hash;

    const lines = [];
    lines.push('🧭 **Pulse**');
    if (snapshot.pack) lines.push(`- Pack: \`${snapshot.pack}\``);
    if (snapshot.epic?.id) {
      lines.push(`- Epic: \`${snapshot.epic.id}\`${snapshot.epic.status ? ` (${snapshot.epic.status})` : ''}`);
      if (snapshot.epic.close_ready) {
        lines.push(`- Epic close: ready (close with \`/close ${snapshot.epic.id}\`)`);
      }
    }
    lines.push(`- Ready: ${snapshot.ready.length}, In progress: ${snapshot.in_progress.length}, Open: ${snapshot.open.length}, Blocked: ${snapshot.blocked.length}`);
    if (snapshot.top_pick?.id) lines.push(`- Top pick: \`${snapshot.top_pick.id}\` ${snapshot.top_pick.title ? `— ${snapshot.top_pick.title}` : ''}`);
    lines.push(changed ? '- Change: yes' : '- Change: no');
    if (auto) lines.push(`- Auto: ${idle ? 'broadcast idle-only' : 'broadcast all'}${force ? ' (force)' : ''}`);
    sendMarkdownMessage(msg.chat.id, lines.join('\n'));

    writePulseState({ lastHash: hash, lastAt: new Date().toISOString(), lastChanged: changed, lastMode: auto ? (idle ? 'auto idle' : 'auto') : 'check' });

    if (!auto) return;
    if (!changed) {
      sendMarkdownMessage(msg.chat.id, '✅ No changes detected; skipping broadcast. Use `/pulse auto force` to resend anyway.');
      return;
    }
    await runBroadcastTargeted({
      chatId: msg.chat.id,
      autoMode: true,
      idleOnlyMode: idle,
      forceMode: force,
      source: 'telegram'
    });
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error);
    bot.sendMessage(msg.chat.id, `❌ pulse failed: ${message}`);
  }
});

bot.onText(/^\/supervisor-update$/, (msg) => {
  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found.`);
    return;
  }

  const sessionName = resolveTmuxSessionName();
  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorPaneIndex = roleAgents.supervisorPaneIndex;
  const reviewerPaneIndex = roleAgents.reviewerPaneIndex;
  const implementor1PaneIndex = roleAgents.implementor1PaneIndex;
  const implementor2PaneIndex = roleAgents.implementor2PaneIndex;

  const target = buildAgentTarget(sessionName, supervisorPaneIndex);
  const inputState = detectPaneInputState(target);
  const activity = getPaneActivity(sessionName, supervisorPaneIndex);
  const impl1Activity = getPaneActivity(sessionName, implementor1PaneIndex);
  const reviewerActivity = getPaneActivity(sessionName, reviewerPaneIndex);
  const impl2Activity = getPaneActivity(sessionName, implementor2PaneIndex);
  const fallbackSummary = [
    `Supervisor: ${activity.lastMessage || '(idle)'}`,
    `Implementor-1: ${impl1Activity.lastMessage || '(idle)'}`,
    `Reviewer: ${reviewerActivity.lastMessage || '(idle)'}`,
    `Implementor-2: ${impl2Activity.lastMessage || '(idle)'}`
  ].join('\n');

  if (inputState.confirmPending) {
    bot.sendMessage(
      msg.chat.id,
      `⏸️ Supervisor is awaiting a tool confirmation. Use /unblock trust or /unblock confirm.\n\n${escapeMarkdown(fallbackSummary)}`
    );
    return;
  }

  if (inputState.inputText) {
    bot.sendMessage(
      msg.chat.id,
      `⏸️ Supervisor has pending input. Use /unblock submit or /unblock clear.\n\n${escapeMarkdown(fallbackSummary)}`
    );
    return;
  }

  const idleAge = getPaneIdleAgeSeconds(sessionName, supervisorPaneIndex);
  if (isPaneBusy(activity, idleAge)) {
    bot.sendMessage(
      msg.chat.id,
      `⏳ Supervisor is busy (last activity ${formatAge(idleAge)} ago). Try again later or send a note with /supervisor <message>.\n\n${escapeMarkdown(fallbackSummary)}`
    );
    return;
  }
  const prompt =
    'Supervisor: Provide a concise status update (3-5 bullets) with blockers and next steps. ' +
    'Context: ' +
    `Implementor-1: ${impl1Activity.lastMessage || '(idle)'}; ` +
    `Reviewer: ${reviewerActivity.lastMessage || '(idle)'}; ` +
    `Implementor-2: ${impl2Activity.lastMessage || '(idle)'}. ` +
    'Reply only with the update.';

  sendTmuxPrompt(target, prompt);
  bot.sendMessage(msg.chat.id, '🧭 Supervisor prompted. I will post the update here shortly.');

  setTimeout(() => {
    const activity = getPaneActivity(sessionName, supervisorPaneIndex);
    let summary = '';
    if (activity.conversationHistory && activity.conversationHistory.length > 0) {
      summary = activity.conversationHistory.map(entry => entry.content).join('\n');
    }
    if (!summary && activity.lastMessage) {
      summary = activity.lastMessage;
    }
    if (!summary) {
      summary = '(No response yet. Try /supervisor-update again.)';
    }
    sendMarkdownMessage(msg.chat.id, `🧭 **Supervisor Update**\n${escapeMarkdown(summary)}`);
  }, 25000);
});

bot.onText(/^\/reset-supervisor$/, (msg) => {
  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found.`);
    return;
  }
  const sessionName = resolveTmuxSessionName();
  const roleAgents = resolveRoleAgents(getAgentInfo());
  const ok = resetCodexPane(sessionName, roleAgents.supervisorPaneIndex);
  bot.sendMessage(msg.chat.id, ok ? '🔄 Supervisor pane restarted.' : '❌ Failed to restart supervisor pane.');
});

bot.onText(/^\/reset-reviewer$/, (msg) => {
  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found.`);
    return;
  }
  const sessionName = resolveTmuxSessionName();
  const roleAgents = resolveRoleAgents(getAgentInfo());
  const ok = resetCodexPane(sessionName, roleAgents.reviewerPaneIndex);
  bot.sendMessage(msg.chat.id, ok ? '🔄 Reviewer pane restarted.' : '❌ Failed to restart reviewer pane.');
});

bot.onText(/^\/reset-codex$/, (msg) => {
  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found.`);
    return;
  }
  const sessionName = resolveTmuxSessionName();
  const roleAgents = resolveRoleAgents(getAgentInfo());
  const okSupervisor = resetCodexPane(sessionName, roleAgents.supervisorPaneIndex);
  const okReviewer = resetCodexPane(sessionName, roleAgents.reviewerPaneIndex);
  if (okSupervisor && okReviewer) {
    bot.sendMessage(msg.chat.id, '🔄 Supervisor + reviewer panes restarted.');
    return;
  }
  bot.sendMessage(msg.chat.id, '⚠️ Restarted with issues. Check /status for details.');
});

bot.onText(/^\/supervisor\s+([\s\S]+)/, async (msg, match) => {
  const message = (match && match[1] ? match[1].trim() : '');
  if (!message) {
    bot.sendMessage(msg.chat.id, 'Usage: /supervisor <message>');
    return;
  }

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const sent = await sendAgentMailMessage(
    supervisorName,
    [supervisorName],
    'Operator message',
    message
  );

  if (sent) {
    bot.sendMessage(msg.chat.id, `✅ Sent to supervisor inbox (${supervisorName}).`);
    return;
  }

  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found, and Agent Mail failed.`);
    return;
  }

  const sessionName = resolveTmuxSessionName();
  const target = buildAgentTarget(sessionName, roleAgents.supervisorPaneIndex);
  sendTmuxPrompt(target, `Operator message: ${message}`);
  bot.sendMessage(msg.chat.id, '⚠️ Agent Mail failed; sent to supervisor pane instead.');
});

bot.onText(/^\/review(?:\s+.*)?$/, async (msg) => {
  const text = (msg.text || '').trim();
  const beadId = extractBeadId(text);
  if (!beadId) {
    bot.sendMessage(msg.chat.id, 'Usage: /review <bead-id> (example: /review roundtable-jlh.9)');
    return;
  }

  const issue = readBdShowIssue(beadId);
  if (!issue) {
    bot.sendMessage(msg.chat.id, `❌ Could not read bead details for ${beadId}. Try: bd show ${beadId}`);
    return;
  }

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const reviewerName = roleAgents.reviewerName;
  const sessionName = resolveTmuxSessionName();

  const acceptance = issue.acceptance_criteria ? String(issue.acceptance_criteria).trim() : '';
  const assignee = issue.assignee ? String(issue.assignee).trim() : '';
  const notes = formatIssueNotesForMail(issue);

  const subject = `[${issue.id}] Review requested: ${issue.title || issue.id}`;
  const bodyLines = [];
  bodyLines.push(`Please review \`${issue.id}\` (${issue.title || 'Untitled'}).`);
  if (assignee) bodyLines.push(`Assignee: ${assignee}`);
  if (acceptance) bodyLines.push(`Acceptance: ${acceptance}`);
  bodyLines.push('');
  bodyLines.push('Suggested review steps:');
  bodyLines.push(`- \`bd show ${issue.id}\``);
  if (acceptance) bodyLines.push(`- Run: \`${acceptance}\``);
  bodyLines.push('- If ok: close or confirm closure is ok');
  bodyLines.push('- If not ok: reopen with concrete fixes');
  if (notes) {
    bodyLines.push('');
    bodyLines.push('Bead notes:');
    bodyLines.push(notes);
  }

  const sent = await sendAgentMailMessage(supervisorName, [reviewerName], subject, bodyLines.join('\n'), issue.id);
  if (sent) {
    bot.sendMessage(msg.chat.id, `✅ Sent review request to reviewer inbox (${reviewerName}) for ${issue.id}.`);
  } else {
    bot.sendMessage(msg.chat.id, `⚠️ Failed to send Agent Mail to reviewer (${reviewerName}). Prompting reviewer pane.`);
  }

  if (checkTmuxSession()) {
    const reviewerTarget = buildAgentTarget(sessionName, roleAgents.reviewerPaneIndex);
    const prompt = `Reviewer: please review ${issue.id} (${issue.title || ''}). ${acceptance ? `Run: ${acceptance}.` : ''} Check Agent Mail thread ${issue.id} for details.`;
    sendTmuxPrompt(reviewerTarget, prompt);
  }
});

bot.onText(/^\/reviewer\s+([\s\S]+)/, async (msg, match) => {
  const message = (match && match[1] ? match[1].trim() : '');
  if (!message) {
    bot.sendMessage(msg.chat.id, 'Usage: /reviewer <message>');
    return;
  }

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const reviewerName = roleAgents.reviewerName;
  const sent = await sendAgentMailMessage(
    supervisorName,
    [reviewerName],
    'Operator note',
    message
  );

  if (sent) {
    bot.sendMessage(msg.chat.id, `✅ Sent to reviewer inbox (${reviewerName}). Also nudging reviewer pane.`);
  } else {
    bot.sendMessage(msg.chat.id, `⚠️ Agent Mail failed to reviewer inbox (${reviewerName}). Nudging reviewer pane anyway.`);
  }

  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found to nudge the reviewer pane.`);
    return;
  }

  const sessionName = resolveTmuxSessionName();
  const target = buildAgentTarget(sessionName, roleAgents.reviewerPaneIndex);
  sendTmuxPrompt(target, `Reviewer: check Agent Mail inbox. Operator note: ${message}`);
});

bot.onText(/^\/broadcast$/, async (msg) => {
  await executeScript('broadcast-role-prompts.sh', msg.chat.id);

  // Wait a moment then check activity
  setTimeout(() => {
    checkAgentActivity(msg.chat.id);
  }, 3000);
});

bot.onText(/\/snapshot(?:\s+.*)?/, (msg) => {
  const { maxItems } = parseSnapshotArgs(msg.text || '');
  const cleanup = cleanupBeadReservations('auto');
  const cleanupLine = formatReservationSummary(cleanup);
  let snapshot = getBeadsSnapshot(maxItems);
  if (cleanupLine) {
    snapshot = `${cleanupLine}\n\n${snapshot}`;
  }
  const messages = splitMessage(snapshot, 4000);
  messages.forEach(message => {
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' }).catch(err => {
      log('ERROR', 'Markdown parsing failed for snapshot, sending plain text', err);
      bot.sendMessage(msg.chat.id, snapshot);
    });
  });

  // Follow with tmux activity details
  setTimeout(() => {
    checkAgentActivity(msg.chat.id);
  }, 1000);
});

bot.onText(/\/stale(?:\s+.*)?/, (msg) => {
  const { days, maxItems } = parseStaleArgs(msg.text || '');
  const staleReport = getStaleBeads(days, maxItems);
  const messages = splitMessage(staleReport, 4000);
  messages.forEach(message => {
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' }).catch(err => {
      log('ERROR', 'Markdown parsing failed for stale report, sending plain text', err);
      bot.sendMessage(msg.chat.id, staleReport);
    });
  });
});

bot.onText(/\/close(?:\s+.*)?/, (msg) => {
  const parts = (msg.text || '').trim().split(/\s+/);
  const rawIds = parts.slice(1);
  if (rawIds.length === 0) {
    bot.sendMessage(msg.chat.id, 'Usage: /close <bead-id>', { parse_mode: 'Markdown' });
    return;
  }

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;

  const ids = rawIds
    .map(rawId => {
      const match = String(rawId || '').match(BEAD_ID_FULL_REGEX);
      if (!match) return null;
      return match[1] || match[0];
    })
    .filter(Boolean);

  const invalidId = rawIds.find(id => !String(id || '').match(BEAD_ID_FULL_REGEX));
  if (invalidId) {
    bot.sendMessage(msg.chat.id, `⚠️ Invalid bead id: ${escapeMarkdown(invalidId)}`, { parse_mode: 'Markdown' });
    return;
  }

  const result = runBdCommand(
    `close ${ids.map(id => shellEscape(id)).join(' ')} --reason ${shellEscape('Closed via Telegram bot')} --actor ${shellEscape(supervisorName)} --no-daemon`
  );
  if (result.error) {
    bot.sendMessage(msg.chat.id, `❌ ${escapeMarkdown(result.error)}`, { parse_mode: 'Markdown' });
    return;
  }

  const output = result.output ? result.output.trim() : '✅ Bead closed.';
  bot.sendMessage(msg.chat.id, escapeMarkdown(output), { parse_mode: 'Markdown' });

  const beadSet = new Set(ids);
  const cleanup = cleanupBeadReservations('auto', { beadIds: beadSet });
  if (cleanup.removedExplicit > 0) {
    bot.sendMessage(msg.chat.id, `🧹 Cleared ${cleanup.removedExplicit} bead reservation file(s).`, { parse_mode: 'Markdown' });
  }

  if (MAIL_SWEEP_ON_CLOSE) {
    const reviewerName = roleAgents.reviewerName;
    const implementor1Name = roleAgents.implementor1Name;
    const implementor2Name = roleAgents.implementor2Name;
    const agents = Array.from(new Set([supervisorName, reviewerName, implementor1Name, implementor2Name, ...MAIL_SWEEP_EXTRA_AGENTS]));
    runMailSweep({ agents, staleDays: MAIL_SWEEP_AUTO_ACK_STALE_DAYS, chatId: msg.chat.id, verbose: false })
      .catch(error => log('ERROR', 'Mail sweep after close failed', error));
  }
});

bot.onText(/^\/mail-sweep(?:\s+.*)?$/, (msg) => {
  const args = (msg.text || '').trim().split(/\s+/).slice(1).map(part => part.trim()).filter(Boolean);
  const verbose = args.includes('verbose') || args.includes('v');
  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const reviewerName = roleAgents.reviewerName;
  const implementor1Name = roleAgents.implementor1Name;
  const implementor2Name = roleAgents.implementor2Name;
  const agents = Array.from(new Set([supervisorName, reviewerName, implementor1Name, implementor2Name, ...MAIL_SWEEP_EXTRA_AGENTS]));
  runMailSweep({ agents, staleDays: MAIL_SWEEP_AUTO_ACK_STALE_DAYS, chatId: msg.chat.id, verbose })
    .catch(error => {
      const message = error?.message ? String(error.message) : String(error);
      bot.sendMessage(msg.chat.id, `❌ mail-sweep failed: ${message}`);
    });
});

bot.onText(/\/reservations(?:\s+.*)?/, (msg) => {
  const openCount = countBdStatus('open');
  const inProgressCount = countBdStatus('in_progress');
  const blockedCount = countBdStatus('blocked');
  const entries = readBeadReservationFiles().filter(item => item.status === 'reserved');
  const expired = entries.filter(item => item.isExpired);

  let message = '🧾 **Bead Reservations**\n\n';
  message += `Active beads: open ${openCount}, in progress ${inProgressCount}, blocked ${blockedCount}\n`;
  message += `Reservation files: ${entries.length} reserved (${expired.length} expired)\n\n`;

  if (entries.length === 0) {
    message += '(none)';
    sendMarkdownMessage(msg.chat.id, message);
    return;
  }

  const preview = entries
    .sort((a, b) => String(a.beadId).localeCompare(String(b.beadId)))
    .slice(0, 12)
    .map(item => {
      const agent = item.agentId ? ` → ${item.agentId}` : '';
      const exp = item.isExpired ? ' (expired)' : '';
      return `- ${item.beadId}${agent}${exp}`;
    })
    .join('\n');
  message += escapeMarkdown(preview);
  if (entries.length > 12) {
    message += `\n… and ${entries.length - 12} more`;
  }
  message += '\n\nUse `/reservations-clean auto` to clear expired (or all when all beads are done).';
  sendMarkdownMessage(msg.chat.id, message);
});

bot.onText(/\/reservations-clean(?:\s+.*)?/, (msg) => {
  const parts = (msg.text || '').trim().split(/\s+/);
  const mode = (parts[1] || 'auto').toLowerCase();
  const allowed = new Set(['auto', 'expired', 'stale', 'all']);
  if (!allowed.has(mode)) {
    sendMarkdownMessage(msg.chat.id, 'Usage: /reservations-clean [auto|expired|stale|all]');
    return;
  }

  const before = readBeadReservationFiles().filter(item => item.status === 'reserved').length;
  const cleanup = cleanupBeadReservations(mode);
  const after = readBeadReservationFiles().filter(item => item.status === 'reserved').length;

  let message = `🧹 **Reservation Cleanup**\n\nMode: ${cleanup.mode}\nRemoved: ${cleanup.removed}\nRemaining: ${after} (was ${before})`;
  if (cleanup.errors && cleanup.errors.length > 0) {
    message += `\nErrors: ${cleanup.errors.length}`;
  }
  sendMarkdownMessage(msg.chat.id, message);
});

bot.onText(/^\/unblock(?:\s+.*)?$/, (msg) => {
  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found. Start the session before unblocking.`);
    return;
  }

  const args = (msg.text || '').trim().split(/\s+/).slice(1);
  const mode = args.join(' ').toLowerCase();
  const doConfirm = mode.includes('confirm') || mode.includes('approve') || mode.includes('yes');
  const doTrust = mode.includes('trust');
  const doSubmit = mode.includes('submit') || mode.includes('enter');
  const doClear = mode.includes('clear') || mode.includes('cancel');
  const doAll = mode.includes('apply') || mode.includes('all') || mode.includes('run');

  const sessionName = resolveTmuxSessionName();
  const roleAgents = resolveRoleAgents(getAgentInfo());
  const paneDefinitions = [
    { index: roleAgents.supervisorPaneIndex, role: 'Supervisor', emoji: '👁️' },
    { index: roleAgents.reviewerPaneIndex, role: 'Reviewer', emoji: '📋' },
    { index: roleAgents.implementor1PaneIndex, role: 'Implementor-1', emoji: '🔧' },
    { index: roleAgents.implementor2PaneIndex, role: 'Implementor-2', emoji: '🔧' }
  ];
  const seenPaneIndexes = new Set();
  const panes = paneDefinitions
    .map(entry => ({ ...entry, index: normalizePaneIndex(entry.index) }))
    .filter(entry => entry.index != null && !seenPaneIndexes.has(entry.index) && Boolean(seenPaneIndexes.add(entry.index)));

  const lines = ['🧹 **Pane Unblocker**'];
  const actions = [];

  panes.forEach(pane => {
    const target = buildAgentTarget(sessionName, pane.index);
    const state = detectPaneInputState(target);
    let action = 'none';
    let hint = 'No pending input detected.';

    if (state.menuPrompt) {
      action = 'manual';
      hint = 'Settings error prompt detected → choose `1` to exit and fix or `2` to continue without settings.';
    } else if (state.skillConfirmPending) {
      action = 'skill';
      const skillLabel = state.skillConfirmSkillName ? `\`${escapeMarkdown(state.skillConfirmSkillName)}\`` : 'a skill';
      hint = `Skill confirmation pending for ${skillLabel} → press \`1\` to proceed once (or \`2\` to trust).`;
    } else if (state.confirmPending) {
      action = state.confirmTrustable ? 'trust' : 'confirm';
      if (state.confirmResponseAwareness) {
        hint = 'Response Awareness confirmation pending → press `1` to proceed once (or `2` to trust).';
      } else {
        hint = state.confirmTrustable
          ? 'Tool confirmation pending → press `2` to trust (or `1` to proceed once).'
          : 'Tool confirmation pending → press `1` then Enter.';
      }
    } else if (state.inputText) {
      action = 'submit';
      hint = `Pending input: \`${escapeMarkdown(state.inputText)}\` → press Enter to submit.`;
    } else if (state.placeholderDetected) {
      action = 'clearable';
      hint = 'Default prompt placeholder detected (use `/unblock clear` to clear the input line).';
    } else if (state.hasPrompt) {
      action = 'clearable';
      hint = 'Prompt open but empty (use `/unblock clear` to clear the input line).';
    }

    actions.push({ target, action, role: pane.role });
    lines.push(`${pane.emoji} **${pane.role}**: ${hint}`);
  });

  const applyConfirm = doConfirm || doAll;
  const applyTrust = doTrust || doAll;
  const applySubmit = doSubmit || doAll;
  const applyClear = doClear;

  if (applyConfirm || applyTrust || applySubmit || applyClear) {
    const applied = [];
    actions.forEach(entry => {
      if (entry.action === 'skill') {
        if (applyTrust) {
          if (applyPaneAction(entry.target, 'trust')) {
            applied.push(`${entry.role}: trusted skill`);
          }
        } else if (applyConfirm) {
          if (applyPaneAction(entry.target, 'confirm')) {
            applied.push(`${entry.role}: confirmed skill`);
          }
        }
      } else if (entry.action === 'trust' && applyTrust) {
        if (applyPaneAction(entry.target, 'trust')) {
          applied.push(`${entry.role}: trusted`);
        }
      } else if (entry.action === 'confirm' && applyConfirm) {
        if (applyPaneAction(entry.target, 'confirm')) {
          applied.push(`${entry.role}: confirmed`);
        }
      } else if (entry.action === 'submit' && applySubmit) {
        if (applyPaneAction(entry.target, 'submit')) {
          applied.push(`${entry.role}: submitted`);
        }
      } else if ((entry.action === 'submit' || entry.action === 'clearable') && applyClear) {
        if (applyPaneAction(entry.target, 'clear')) {
          applied.push(`${entry.role}: cleared`);
        }
      }
    });

    lines.push('');
    if (applied.length > 0) {
      lines.push(`Applied: ${applied.join(', ')}`);
    } else {
      lines.push('No changes applied.');
    }
  } else {
    lines.push('');
    lines.push('Actions: `/unblock confirm` (approve tool prompt once), `/unblock trust` (approve + remember), `/unblock submit` (submit pending input), `/unblock clear` (clear pending input).');
  }

  sendMarkdownMessage(msg.chat.id, lines.join('\n'));
});

bot.onText(/^\/broadcast-targeted(?:\s+.*)?$/, async (msg) => {
  const commandText = (msg.text || '').toLowerCase();
  const forceMode = commandText.includes('force');
  const autoMode = commandText.includes('auto') || forceMode;
  const idleOnlyMode = commandText.includes('idle');
  try {
    await runBroadcastTargeted({
      chatId: msg.chat.id,
      autoMode,
      idleOnlyMode,
      forceMode,
      source: 'telegram'
    });
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error);
    log('ERROR', 'broadcast-targeted failed', error);
    bot.sendMessage(msg.chat.id, `❌ broadcast-targeted failed: ${message}`);
  }
});

async function runBroadcastTargeted({ chatId, autoMode, idleOnlyMode, forceMode, source }) {
  if (!checkTmuxSession()) {
    if (chatId != null) {
      bot.sendMessage(chatId, `❌ No active tmux session "${resolveTmuxSessionName()}" found. Start the session before broadcasting.`);
    }
    return { ok: false, reason: 'no tmux session' };
  }

  // Keep `.agent-mail/reservations/` aligned with Beads status so we don't keep prompting
  // implementors about already-closed or in-progress work.
  try {
    const reservationCleanup = cleanupBeadReservations('auto');
    const summary = formatReservationSummary(reservationCleanup);
    if (summary) {
      log('INFO', summary);
    }
  } catch (error) {
    log('ERROR', 'Reservation cleanup failed', error);
  }

  const selectedPack = readBroadcastPackSelection();
  const promptPack = selectedPack ? loadPromptPack(selectedPack) : null;
  const idPrefixes = Array.isArray(promptPack?.id_prefixes) ? promptPack.id_prefixes : [];
  const tmuxSession = resolveTmuxSessionName();
  const paneInfo = getTmuxPaneInfo(tmuxSession);
  const paneCommandByIndex = {};
  paneInfo.forEach(line => {
    const match = String(line || '').match(/^(\d+):\s*([^\s]+)\s+/);
    if (!match) return;
    const idx = parseInt(match[1], 10);
    if (!Number.isFinite(idx)) return;
    paneCommandByIndex[idx] = match[2];
  });

  const ready = runBdCommand('ready --no-daemon');
  const inProgress = runBdCommand('list -s in_progress --no-daemon');
  const open = runBdCommand('list -s open --no-daemon');
  const closed = runBdCommand('list -s closed --no-daemon');
  const blocked = runBdCommand('blocked --no-daemon');
  const readyItems = parseBdListOutput(ready.output).items;
  const inProgressItems = parseBdListOutput(inProgress.output).items;
  const openItems = parseBdListOutput(open.output).items;
  const closedItems = parseBdListOutput(closed.output).items;
  const blockedItems = parseBdListOutput(blocked.output).items;

  const reservations = readReservations();
  const triage = runBvTriage();
  const recommendations = triage?.triage?.recommendations || [];

  const excludeIds = new Set([
    ...inProgressItems.map(item => item.id),
    ...Object.values(reservations)
  ]);

  const agentInfo = getAgentInfo();
  const roleAgents = resolveRoleAgents(agentInfo);
  const supervisorName = roleAgents.supervisorName;
  const reviewerName = roleAgents.reviewerName;
  const implementor1Name = roleAgents.implementor1Name;
  const implementor2Name = roleAgents.implementor2Name;
  const supervisorPaneIndex = roleAgents.supervisorPaneIndex;
  const reviewerPaneIndex = roleAgents.reviewerPaneIndex;
  const implementor1PaneIndex = roleAgents.implementor1PaneIndex;
  const implementor2PaneIndex = roleAgents.implementor2PaneIndex;

  const [supervisorInboxMeta, reviewerInboxMeta, impl1InboxMeta, impl2InboxMeta] = await Promise.all([
    fetchAgentInboxMeta(supervisorName),
    fetchAgentInboxMeta(reviewerName),
    fetchAgentInboxMeta(implementor1Name),
    fetchAgentInboxMeta(implementor2Name)
  ]);

  const supervisorInbox = supervisorInboxMeta?.count ?? null;
  const reviewerInbox = reviewerInboxMeta?.count ?? null;
  const impl1Inbox = impl1InboxMeta?.count ?? null;
  const impl2Inbox = impl2InboxMeta?.count ?? null;
  const supervisorAckRequired = supervisorInboxMeta?.ackRequiredCount ?? null;
  const reviewerAckRequired = reviewerInboxMeta?.ackRequiredCount ?? null;
  const impl1AckRequired = impl1InboxMeta?.ackRequiredCount ?? null;
  const impl2AckRequired = impl2InboxMeta?.ackRequiredCount ?? null;

  const impl1Labels = Array.isArray(promptPack?.implementor_1?.label_preferences)
    ? promptPack.implementor_1.label_preferences
    : ['frontend', 'site'];
  const impl2Labels = Array.isArray(promptPack?.implementor_2?.label_preferences)
    ? promptPack.implementor_2.label_preferences
    : ['backend', 'db', 'publish', 'email', 'auth'];

  let frontendPick = filterRecommendations(recommendations, impl1Labels, excludeIds);
  let backendPick = filterRecommendations(recommendations, impl2Labels, excludeIds);
  if (idPrefixes.length > 0) {
    if (frontendPick?.id && !matchesAnyPrefix(frontendPick.id, idPrefixes)) {
      frontendPick = null;
    }
    if (backendPick?.id && !matchesAnyPrefix(backendPick.id, idPrefixes)) {
      backendPick = null;
    }
  }

  const usedIds = new Set();
  const pickFallback = () => readyItems.find(item => !excludeIds.has(item.id) && !usedIds.has(item.id) && matchesAnyPrefix(item.id, idPrefixes));
  const impl1Reservation = reservations[implementor1Name];
  const impl2Reservation = reservations[implementor2Name];
  const idleMailState = idleOnlyMode && IDLE_MAIL_POLICY !== 'ignore' ? readIdleMailState() : null;
  const supervisorHasNewMail = idleMailState ? hasNewInboxMail(idleMailState, supervisorName, supervisorInboxMeta?.latestMessageId) : false;
  const reviewerHasNewMail = idleMailState ? hasNewInboxMail(idleMailState, reviewerName, reviewerInboxMeta?.latestMessageId) : false;
  const impl1HasNewMail = idleMailState ? hasNewInboxMail(idleMailState, implementor1Name, impl1InboxMeta?.latestMessageId) : false;
  const impl2HasNewMail = idleMailState ? hasNewInboxMail(idleMailState, implementor2Name, impl2InboxMeta?.latestMessageId) : false;

  const paneSafe = (paneIndex) => isPaneSafeToPrompt(tmuxSession, paneIndex);
  const idleGate = (paneIndex, hasNewMail) => {
    if (!idleOnlyMode) return true;
    if (!paneSafe(paneIndex)) return false;
    if (IDLE_MAIL_POLICY === 'skip') return !hasNewMail;
    // wake + ignore both allow prompting when pane is safe; wake affects whether we prompt when mail arrives.
    return true;
  };

  const supervisorPromptable = !idleOnlyMode || idleGate(supervisorPaneIndex, supervisorHasNewMail);
  const reviewerPromptable = !idleOnlyMode || idleGate(reviewerPaneIndex, reviewerHasNewMail);
  const impl1Promptable = !idleOnlyMode || idleGate(implementor1PaneIndex, impl1HasNewMail);
  const impl2Promptable = !idleOnlyMode || idleGate(implementor2PaneIndex, impl2HasNewMail);

  const impl1Task = impl1Reservation
    ? { id: impl1Reservation, title: 'Reserved bead' }
    : (impl1Promptable ? (frontendPick || pickFallback()) : null);
  if (impl1Task) {
    usedIds.add(impl1Task.id);
  }

  const impl2Task = impl2Reservation
    ? { id: impl2Reservation, title: 'Reserved bead' }
    : (impl2Promptable ? (backendPick || pickFallback()) : null);
  if (impl2Task) {
    usedIds.add(impl2Task.id);
  }

  const basePrefix = typeof promptPack?.base_prefix === 'string' && promptPack.base_prefix.trim()
    ? promptPack.base_prefix.trim()
    : 'First, check Agent Mail (fetch_inbox) and reply to urgent items.';
  const guardrails = Array.isArray(promptPack?.guardrails) && promptPack.guardrails.length > 0
    ? `${promptPack.guardrails.join(' ')}`
    : IMPLEMENTOR_GUARDRAILS;

  const epicId = typeof promptPack?.id === 'string' && promptPack.id.trim() ? promptPack.id.trim() : null;
  const epicOpen = epicId
    ? openItems.find(item => item.id === epicId && item.type === 'epic' && item.status === 'open')
    : null;
  const epicChildrenOpen = epicId
    ? openItems.some(item => item.id.startsWith(`${epicId}.`) && item.status === 'open')
    : false;
  const epicChildrenInProgress = epicId
    ? inProgressItems.some(item => item.id.startsWith(`${epicId}.`))
    : false;
  const epicChildrenBlocked = epicId
    ? blockedItems.some(item => item.id.startsWith(`${epicId}.`) && item.status === 'blocked')
    : false;
  const epicCloseReady = Boolean(epicOpen) && !epicChildrenOpen && !epicChildrenInProgress && !epicChildrenBlocked;

  const prompts = [];
  const priorAssignments = readBroadcastAssignments();

  // Persist assignments into Beads assignee (source of truth) and reserve selected open work
  // to prevent double-claiming by multiple implementors.
  if (impl1Task && impl1Task.id) {
    setBeadAssignee(impl1Task.id, implementor1Name);
    if (!impl1Reservation) {
      writeBeadReservation(impl1Task.id, implementor1Name, 4);
    }
  }
  if (impl2Task && impl2Task.id) {
    setBeadAssignee(impl2Task.id, implementor2Name);
    if (!impl2Reservation) {
      writeBeadReservation(impl2Task.id, implementor2Name, 4);
    }
  }

  const supervisorInboxCount = supervisorInboxMeta?.count ?? null;
  const reviewerInboxCount = reviewerInboxMeta?.count ?? null;
  const wakeSupervisorForMail = idleOnlyMode
    && IDLE_MAIL_POLICY === 'wake'
    && (supervisorInboxCount == null || (Number.isFinite(Number(supervisorInboxCount)) && Number(supervisorInboxCount) > 0));
  if (((readyItems.length > 0 || inProgressItems.length > 0) || wakeSupervisorForMail) && supervisorPromptable) {
    let supervisorMessage = `${basePrefix}\nReady: ${readyItems.length}, In progress: ${inProgressItems.length}.`;
    if (supervisorInbox != null) {
      supervisorMessage += ` Agent Mail: ${supervisorInbox} recent${supervisorAckRequired != null ? ` (ack_required: ${supervisorAckRequired})` : ''}.`;
    }
    if (frontendPick || backendPick) {
      supervisorMessage += `\nSuggested picks:\n- Frontend: ${formatBeadLine(frontendPick)}\n- Backend: ${formatBeadLine(backendPick)}`;
    }
    if (selectedPack) {
      supervisorMessage += `\nPrompt pack: ${selectedPack}${promptPack?.title ? ` (${promptPack.title})` : ''}.`;
    }
    if (idleOnlyMode) {
      supervisorMessage += `\nIdle-only mode: prompts are only sent to panes that appear idle/safe (threshold ${IDLE_BROADCAST_THRESHOLD_SEC}s).`;
    }
    supervisorMessage += '\nCoordinate assignments, clear blockers, and close beads after reviewer verification (or enable auto-close).';
    if (epicCloseReady) {
      supervisorMessage += `\nAll child beads under ${epicId}. are closed; the epic is still open. Close it now with: /close ${epicId}`;
    }
    if (typeof promptPack?.supervisor?.extra === 'string' && promptPack.supervisor.extra.trim()) {
      supervisorMessage += `\n${promptPack.supervisor.extra.trim()}`;
    }
    prompts.push({
      role: 'Supervisor',
      target: buildAgentTarget(tmuxSession, supervisorPaneIndex),
      message: supervisorMessage,
      detail: `ready ${readyItems.length}, in progress ${inProgressItems.length}`
    });
  }

  const wakeReviewerForMail = idleOnlyMode
    && IDLE_MAIL_POLICY === 'wake'
    && (reviewerInboxCount == null || (Number.isFinite(Number(reviewerInboxCount)) && Number(reviewerInboxCount) > 0));
  if (((closedItems.length > 0 || inProgressItems.length > 0) || wakeReviewerForMail) && reviewerPromptable) {
    let reviewerMessage = `${basePrefix}`;
    if (reviewerInbox != null) {
      reviewerMessage += ` Agent Mail: ${reviewerInbox} recent${reviewerAckRequired != null ? ` (ack_required: ${reviewerAckRequired})` : ''}.`;
    }
    reviewerMessage += '\nReview completed beads and check Agent Mail for review requests.';
    if (closedItems.length > 0) {
      reviewerMessage += '\nRecently closed:\n';
      closedItems.slice(0, 3).forEach(item => {
        reviewerMessage += `- ${item.id}: ${item.title}\n`;
      });
    }
    reviewerMessage += '\nReopen beads if needed and notify supervisor.';
    if (typeof promptPack?.reviewer?.extra === 'string' && promptPack.reviewer.extra.trim()) {
      reviewerMessage += `\n${promptPack.reviewer.extra.trim()}`;
    }
    prompts.push({
      role: 'Reviewer',
      target: buildAgentTarget(tmuxSession, reviewerPaneIndex),
      message: reviewerMessage.trim(),
      detail: `closed ${closedItems.length}, in progress ${inProgressItems.length}`
    });
  }

  const shouldPromptImpl1 = Boolean(impl1Task) && (!idleOnlyMode || impl1Promptable);
  if (shouldPromptImpl1) {
    const impl1IsClaude = String(paneCommandByIndex[implementor1PaneIndex] || '').toLowerCase() === 'claude';
    let impl1Message = `${basePrefix}`;
    if (impl1Inbox) {
      impl1Message += ` Agent Mail: ${impl1Inbox} recent${impl1AckRequired != null ? ` (ack_required: ${impl1AckRequired})` : ''}.`;
    }
    impl1Message += `\n${impl1Reservation ? 'Resume' : 'Claim'} bead: ${formatBeadLine(impl1Task)}.`;
    const impl1ReserveHint = typeof promptPack?.implementor_1?.reserve_paths_hint === 'string'
      ? promptPack.implementor_1.reserve_paths_hint.trim()
      : '';
    if (impl1ReserveHint) {
      impl1Message += `\nReserve paths (hint): ${impl1ReserveHint}.`;
    } else {
      impl1Message += '\nReserve relevant paths before editing.';
    }
    const impl1Tests = Array.isArray(promptPack?.implementor_1?.test_commands) ? promptPack.implementor_1.test_commands : [];
    if (impl1Tests.length > 0) {
    impl1Message += `\nRun tests: ${impl1Tests.join(' ; ')}.`;
  }
    impl1Message += `\nUpdate bead status. When done, notify the reviewer with results and ask them to reply with: "APPROVED ${impl1Task.id}" (the bot will route/auto-close as supervisor).`;
    impl1Message += `\n${guardrails}`;
    if (IMPLEMENTOR_DEFAULT_RESPONSE_AWARENESS && impl1IsClaude) {
      const taskLine = `Bead ${impl1Task.id}: ${impl1Task.title || 'Untitled bead'}.`;
      const testsLine = impl1Tests.length > 0 ? `Run: ${impl1Tests.join(' ; ')}.` : '';
      const reserveLine = impl1ReserveHint ? `Reserve paths: ${impl1ReserveHint}.` : '';
      const raArgs = [
        taskLine,
        reserveLine,
        testsLine,
        `Guardrails: ${IMPLEMENTOR_GUARDRAILS}`,
        'Proceed to implement (do not stop at planning).'
      ].filter(Boolean).join(' ');
      impl1Message = `/response-awareness "${raArgs.replace(/"/g, '\\"')}"`;
    }
    prompts.push({
      role: 'Implementor-1',
      target: buildAgentTarget(tmuxSession, implementor1PaneIndex),
      message: impl1Message,
      detail: formatBeadLine(impl1Task)
    });
  }
  // If there is no bead to assign, still give the implementor a "what now" instruction.
  if (!impl1Task) {
    const topInProgress = inProgressItems && inProgressItems.length > 0 ? inProgressItems[0] : null;
    const assistText = topInProgress
      ? `No new bead assigned right now. Assist by verifying in-progress: ${topInProgress.id}: ${topInProgress.title} (run the target tests from the bead notes), then report findings to the reviewer.`
      : 'No new bead assigned right now. Check Agent Mail for requests; otherwise standby until more work is unblocked.';

    const impl1StandbyPromptable = !idleOnlyMode || impl1Promptable;
    if (impl1StandbyPromptable) {
      prompts.push({
        role: 'Implementor-1',
        target: buildAgentTarget(tmuxSession, implementor1PaneIndex),
        message: `${basePrefix}\n${assistText}\nIf your pane shows typed input “awaiting response”, use Telegram: /unblock submit (or /unblock clear).`,
        detail: topInProgress ? `assist ${topInProgress.id}` : 'standby'
      });
    }
  }

  const shouldPromptImpl2 = Boolean(impl2Task) && (!idleOnlyMode || impl2Promptable);
  if (shouldPromptImpl2) {
    const impl2IsClaude = String(paneCommandByIndex[implementor2PaneIndex] || '').toLowerCase() === 'claude';
    let impl2Message = `${basePrefix}`;
    if (impl2Inbox) {
      impl2Message += ` Agent Mail: ${impl2Inbox} recent${impl2AckRequired != null ? ` (ack_required: ${impl2AckRequired})` : ''}.`;
    }
    impl2Message += `\n${impl2Reservation ? 'Resume' : 'Claim'} bead: ${formatBeadLine(impl2Task)}.`;
    const impl2ReserveHint = typeof promptPack?.implementor_2?.reserve_paths_hint === 'string'
      ? promptPack.implementor_2.reserve_paths_hint.trim()
      : '';
    if (impl2ReserveHint) {
      impl2Message += `\nReserve paths (hint): ${impl2ReserveHint}.`;
    } else {
      impl2Message += '\nReserve relevant paths before editing.';
    }
    const impl2Tests = Array.isArray(promptPack?.implementor_2?.test_commands) ? promptPack.implementor_2.test_commands : [];
    if (impl2Tests.length > 0) {
      impl2Message += `\nRun tests: ${impl2Tests.join(' ; ')}.`;
    }
    impl2Message += `\nUpdate bead status. When done, notify the reviewer with results and ask them to reply with: "APPROVED ${impl2Task.id}" (the bot will route/auto-close as supervisor).`;
    impl2Message += `\n${guardrails}`;
    if (IMPLEMENTOR_DEFAULT_RESPONSE_AWARENESS && impl2IsClaude) {
      const taskLine = `Bead ${impl2Task.id}: ${impl2Task.title || 'Untitled bead'}.`;
      const testsLine = impl2Tests.length > 0 ? `Run: ${impl2Tests.join(' ; ')}.` : '';
      const reserveLine = impl2ReserveHint ? `Reserve paths: ${impl2ReserveHint}.` : '';
      const raArgs = [
        taskLine,
        reserveLine,
        testsLine,
        `Guardrails: ${IMPLEMENTOR_GUARDRAILS}`,
        'Proceed to implement (do not stop at planning).'
      ].filter(Boolean).join(' ');
      impl2Message = `/response-awareness "${raArgs.replace(/"/g, '\\"')}"`;
    }
    prompts.push({
      role: 'Implementor-2',
      target: buildAgentTarget(tmuxSession, implementor2PaneIndex),
      message: impl2Message,
      detail: formatBeadLine(impl2Task)
    });
  }

  // If there is no bead to assign, still give the implementor a durable "what now" instruction.
  if (!impl2Task) {
    const topInProgress = inProgressItems && inProgressItems.length > 0 ? inProgressItems[0] : null;
    const assistText = topInProgress
      ? `No new bead assigned right now. Assist by verifying in-progress: ${topInProgress.id}: ${topInProgress.title} (run the target tests from the bead notes), then report findings to the reviewer.`
      : 'No new bead assigned right now. Check Agent Mail for requests; otherwise standby until more work is unblocked.';

    const impl2StandbyPromptable = !idleOnlyMode || impl2Promptable;
    if (impl2StandbyPromptable) {
      prompts.push({
        role: 'Implementor-2',
        target: buildAgentTarget(tmuxSession, implementor2PaneIndex),
        message: `${basePrefix}\n${assistText}\nIf your pane shows typed input “awaiting response”, use Telegram: /unblock submit (or /unblock clear).`,
        detail: topInProgress ? `assist ${topInProgress.id}` : 'standby'
      });
    }
  }

  const idleSkipSummaries = [];
  if (idleOnlyMode) {
    const addSkip = (role, paneIndex, agentName, hasNewMail, promptable) => {
      if (promptable) return;
      let reason = 'not idle/safe';
      if (IDLE_MAIL_POLICY === 'skip' && hasNewMail) {
        reason = 'new mail (idle mail policy=skip)';
      } else if (paneIndex != null) {
        const state = detectPaneInputState(buildAgentTarget(tmuxSession, paneIndex));
        if (state.confirmPending || state.menuPrompt) {
          reason = 'awaiting confirmation';
        }
      }
      idleSkipSummaries.push(`- ${role}: skipped (${reason})${agentName ? ` — ${agentName}` : ''}`);
    };

    addSkip('Supervisor', supervisorPaneIndex, supervisorName, supervisorHasNewMail, supervisorPromptable);
    addSkip('Reviewer', reviewerPaneIndex, reviewerName, reviewerHasNewMail, reviewerPromptable);
    addSkip('Implementor-1', implementor1PaneIndex, implementor1Name, impl1HasNewMail, impl1Promptable);
    addSkip('Implementor-2', implementor2PaneIndex, implementor2Name, impl2HasNewMail, impl2Promptable);
  }

  const summaryLines = prompts.map(prompt => {
    let summaryVerb = 'prompted';
    if (!autoMode) {
      summaryVerb = prompt.role === 'Supervisor' ? 'drafted' : 'queued';
    }
    const detail = prompt.detail ? ` — ${prompt.detail}` : '';
    return `- ${prompt.role}: ${detail ? `${summaryVerb}${detail}` : summaryVerb}`;
  });
  if (idleSkipSummaries.length > 0) {
    summaryLines.push(...idleSkipSummaries);
  }
  if (idleOnlyMode && !supervisorPromptable) {
    // Skip reasons already included above.
  } else if (idleOnlyMode && !prompts.some(p => p.role === 'Supervisor')) {
    summaryLines.push('- Supervisor: not prompted (no ready/in-progress work and no mail wake)');
  }
  if (summaryLines.length === 0) {
    summaryLines.push(autoMode
      ? '- No prompts sent (no ready or in-progress work found).'
      : '- No prompts queued (no ready or in-progress work found).');
  }

  if (prompts.length === 0) {
    clearBroadcastPlan();
    if (chatId != null) {
      sendMarkdownMessage(
        chatId,
        `🎯 **Targeted Broadcast**\n${summaryLines.join('\n')}`
      );
    }
    return { ok: true, mode: autoMode ? 'auto' : 'draft', sent: false, reason: 'no prompts' };
  }

  if (idleMailState) {
    const nowIso = new Date().toISOString();
    const latestByAgent = { ...(idleMailState.latestByAgent || {}) };
    const updateLatest = (agentName, meta) => {
      if (!agentName || !meta) return;
      const latestMessageId = meta.latestMessageId;
      if (!Number.isFinite(Number(latestMessageId))) return;
      latestByAgent[String(agentName)] = {
        latestMessageId: Number(latestMessageId),
        updatedAt: nowIso
      };
    };
    updateLatest(supervisorName, supervisorInboxMeta);
    updateLatest(reviewerName, reviewerInboxMeta);
    updateLatest(implementor1Name, impl1InboxMeta);
    updateLatest(implementor2Name, impl2InboxMeta);
    writeIdleMailState({ latestByAgent, updatedAt: nowIso });
  }

  const plan = {
    status: autoMode ? 'sent' : 'pending',
    createdAt: new Date().toISOString(),
    sentAt: autoMode ? new Date().toISOString() : null,
    session: tmuxSession,
    prompts,
    summaryLines
  };

  writeBroadcastPlan(plan);

  if (autoMode) {
    let promptsToSend = prompts;
    if (source === 'autopilot') {
      const nowMs = Date.now();
      const cooldownMs = AUTOPILOT_COOLDOWN_SEC * 1000;
      const state = readAutopilotState();
      promptsToSend = prompts.filter(prompt => shouldSendAutopilotPrompt({ prompt, state, nowMs, cooldownMs }));
      promptsToSend.forEach(prompt => {
        const key = `${prompt.role}:${prompt.target}`;
        state.sent[key] = { hash: hashPrompt(prompt), sentAtMs: nowMs };
      });
      state.lastRunAt = new Date(nowMs).toISOString();
      writeAutopilotState(state);
      if (promptsToSend.length === 0) {
        log('INFO', 'Autopilot tick: no prompts sent (cooldown gating)');
      }
    } else if (BROADCAST_DEDUPE_ENABLED && !forceMode) {
      const nowMs = Date.now();
      const state = readBroadcastDedupeState();
      const filtered = prompts.filter(prompt => shouldSendBroadcastPrompt({ prompt, state, forceMode: false }));
      filtered.forEach(prompt => {
        const key = `${prompt.role}:${prompt.target}`;
        state.sent[key] = { hash: hashPrompt(prompt), sentAtMs: nowMs };
      });
      state.lastRunAt = new Date(nowMs).toISOString();
      writeBroadcastDedupeState(state);
      promptsToSend = filtered;
      if (promptsToSend.length === 0) {
        const summary = '🎯 **Targeted Broadcast**\n- No prompts sent (no changes since last broadcast). Use `/broadcast-targeted auto force` to resend anyway.';
        if (chatId != null) {
          sendMarkdownMessage(chatId, summary);
        }
        return { ok: true, mode: 'auto', sent: false, reason: 'no changes (dedupe)' };
      }
    }

    promptsToSend.forEach(prompt => sendTmuxPrompt(prompt.target, prompt.message));

    // Durable comms: send assignment notes via Agent Mail so work persists beyond tmux scrollback.
    if (BROADCAST_SEND_AGENT_MAIL) {
      const nextAssignments = { ...priorAssignments };

      const sendAssignment = async ({ agentName, bead, reserveHint, testCommands }) => {
        if (!agentName || !bead?.id) {
          return;
        }
        if (priorAssignments[agentName] === bead.id) {
          return;
        }

        const subject = `[${bead.id}] Assignment: ${bead.title || bead.id}`;
        const body = buildAssignmentMailBody({
          bead,
          pack: promptPack,
          reserveHint,
          testCommands,
          guardrails
        });

        const ok = await sendAgentMailMessage(supervisorName, [agentName], subject, body, bead.id);
        if (ok) {
          nextAssignments[agentName] = bead.id;
        }
      };

      try {
        await sendAssignment({
          agentName: implementor1Name,
          bead: impl1Task && impl1Task.id ? { id: impl1Task.id, title: impl1Task.title } : null,
          reserveHint: typeof promptPack?.implementor_1?.reserve_paths_hint === 'string' ? promptPack.implementor_1.reserve_paths_hint.trim() : '',
          testCommands: Array.isArray(promptPack?.implementor_1?.test_commands) ? promptPack.implementor_1.test_commands : []
        });

        await sendAssignment({
          agentName: implementor2Name,
          bead: impl2Task && impl2Task.id ? { id: impl2Task.id, title: impl2Task.title } : null,
          reserveHint: typeof promptPack?.implementor_2?.reserve_paths_hint === 'string' ? promptPack.implementor_2.reserve_paths_hint.trim() : '',
          testCommands: Array.isArray(promptPack?.implementor_2?.test_commands) ? promptPack.implementor_2.test_commands : []
        });
      } catch (error) {
        log('ERROR', 'Failed to send broadcast assignment Agent Mail', error);
      }

      writeBroadcastAssignments(nextAssignments);
    }

    if (chatId != null) {
      sendMarkdownMessage(
        chatId,
        `🎯 **Targeted Broadcast Summary**\n${summaryLines.join('\n')}`
      );

      setTimeout(() => {
        checkAgentActivity(chatId);
      }, 3000);
    }
    return { ok: true, mode: 'auto', sent: true };
  }

  const supervisorDraft = buildSupervisorDraft(prompts);
  if (supervisorDraft) {
    sendTmuxPrompt(buildAgentTarget(tmuxSession, supervisorPaneIndex), supervisorDraft);
  }

  if (chatId != null) {
    sendMarkdownMessage(
      chatId,
      `🎯 **Targeted Broadcast Drafted**\n${summaryLines.join('\n')}\n\nSupervisor prompted; other roles queued until /broadcast-apply.\nApprove with /broadcast-apply or discard with /broadcast-cancel.\nIf any panes show pending input in /activity, run /unblock to see what to press.`
    );
  }
  return { ok: true, mode: 'draft', sent: false };
}

bot.onText(/^\/broadcast-pack(?:\s+.*)?$/, (msg) => {
  const raw = (msg.text || '').trim();
  const args = raw.split(/\s+/).slice(1);

  const available = listPromptPacks();
  const current = readBroadcastPackSelection();

  if (args.length === 0) {
    const lines = [];
    lines.push(`🎛️ Prompt pack: ${current ? current : 'none'}`);
    lines.push(`Available: ${available.length > 0 ? available.join(', ') : '(none found)'}`);
    lines.push('Set: `/broadcast-pack set <name>`');
    lines.push('Clear: `/broadcast-pack clear`');
    sendMarkdownMessage(msg.chat.id, lines.join('\n'));
    return;
  }

  const verb = (args[0] || '').toLowerCase();
  if (verb === 'clear') {
    const cleared = clearBroadcastPackSelection();
    if (!cleared.ok) {
      bot.sendMessage(msg.chat.id, `❌ Failed to clear prompt pack: ${cleared.reason || 'unknown error'}`);
      return;
    }
    bot.sendMessage(msg.chat.id, cleared.removed ? '🧹 Prompt pack cleared.' : 'Prompt pack already empty.');
    return;
  }

  if (verb === 'set' && args[1]) {
    const packName = args[1];
    if (!isSafePackName(packName)) {
      bot.sendMessage(msg.chat.id, '❌ Invalid pack name. Use letters/numbers/dash/underscore only.');
      return;
    }
    if (!available.includes(packName)) {
      bot.sendMessage(msg.chat.id, `❌ Unknown pack "${packName}". Available: ${available.join(', ') || '(none)'}`);
      return;
    }
    const written = writeBroadcastPackSelection(packName);
    if (!written.ok) {
      bot.sendMessage(msg.chat.id, `❌ Failed to set prompt pack: ${written.reason || 'unknown error'}`);
      return;
    }
    const pack = loadPromptPack(packName);
    bot.sendMessage(msg.chat.id, `✅ Prompt pack set to "${packName}"${pack?.title ? ` (${pack.title})` : ''}.`);
    return;
  }

  bot.sendMessage(msg.chat.id, 'Usage: /broadcast-pack | /broadcast-pack set <name> | /broadcast-pack clear');
});

bot.onText(/^\/broadcast-apply$/, (msg) => {
  const plan = readBroadcastPlan();
  if (!plan || !Array.isArray(plan.prompts) || plan.prompts.length === 0) {
    bot.sendMessage(msg.chat.id, '❌ No pending broadcast plan found. Run /broadcast-targeted first.');
    return;
  }

  if (plan.status !== 'pending') {
    bot.sendMessage(msg.chat.id, `⚠️ Broadcast plan status is "${plan.status}". Run /broadcast-targeted to create a new plan.`);
    return;
  }

  if (!checkTmuxSession()) {
    bot.sendMessage(msg.chat.id, `❌ No active tmux session "${resolveTmuxSessionName()}" found. Start the session before broadcasting.`);
    return;
  }

  const promptsToSend = plan.prompts.filter(prompt => prompt.role !== 'Supervisor');
  promptsToSend.forEach(prompt => sendTmuxPrompt(prompt.target, prompt.message));
  plan.status = 'sent';
  plan.sentAt = new Date().toISOString();
  writeBroadcastPlan(plan);

  const summaryLines = promptsToSend.map(prompt => {
    const detail = prompt.detail ? ` — ${prompt.detail}` : '';
    return `- ${prompt.role}: prompted${detail}`;
  });

  if (summaryLines.length === 0) {
    summaryLines.push('- No non-supervisor prompts to send.');
  }

  sendMarkdownMessage(
    msg.chat.id,
    `✅ **Targeted Broadcast Sent**\n${summaryLines.join('\n')}`
  );

  setTimeout(() => {
    checkAgentActivity(msg.chat.id);
  }, 3000);
});

bot.onText(/^\/broadcast-cancel$/, (msg) => {
  const plan = readBroadcastPlan();
  if (!plan) {
    bot.sendMessage(msg.chat.id, 'No pending broadcast plan to cancel.');
    return;
  }

  plan.status = 'canceled';
  plan.canceledAt = new Date().toISOString();
  writeBroadcastPlan(plan);

  bot.sendMessage(msg.chat.id, '🧹 Pending broadcast plan canceled.');
});

bot.onText(/\/activity/, (msg) => {
  const messageText = (msg.text || '').toLowerCase();
  const debug = messageText.includes('debug');
  const focusedActivity = getFocusedAgentActivity(debug);
  bot.sendMessage(msg.chat.id, focusedActivity, { parse_mode: 'Markdown' }).catch(err => {
    // If Markdown parsing fails, send without formatting
    log('ERROR', 'Markdown parsing failed for focused activity, sending plain text', err);
    bot.sendMessage(msg.chat.id, focusedActivity);
  });
});

bot.onText(/\/activity-debug/, (msg) => {
  const focusedActivity = getFocusedAgentActivity(true);
  bot.sendMessage(msg.chat.id, focusedActivity, { parse_mode: 'Markdown' }).catch(err => {
    log('ERROR', 'Markdown parsing failed for focused activity debug, sending plain text', err);
    bot.sendMessage(msg.chat.id, focusedActivity);
  });
});

bot.onText(/\/status/, (msg) => {
  const allSessions = getAllTmuxSessions();
  const hasMafSession = checkTmuxSession();
  const sessionName = resolveTmuxSessionName();
  const mafPaneInfo = hasMafSession ? getTmuxPaneInfo(sessionName) : [];
  const agentRegistry = getAgentInfo();
  const contextManager = getContextManagerStatus();
  const memoryStatus = getMemoryServiceStatus();
  const broadcastPlan = readBroadcastPlan();
  const broadcastPack = readBroadcastPackSelection();
  const reviewRouterSummary = summarizeReviewRouterState();
  const cleanup = cleanupBeadReservations('auto');
  const reservationAfter = readBeadReservationFiles().filter(item => item.status === 'reserved');
  const expiredAfter = reservationAfter.filter(item => item.isExpired);

  let statusMessage = '📊 **System Status**\n\n';

  // Tmux server status
  statusMessage += `🖥️ **Tmux Server**: ${allSessions.length > 0 ? '🟢 Running' : '🔴 Not Running'}\n`;
  statusMessage += `📱 **Total Sessions**: ${allSessions.length}\n\n`;

  statusMessage += '**🧭 Flow Status:**\n';
  if (contextManager.status === 'running') {
    const pidInfo = contextManager.pid ? ` (PID ${contextManager.pid})` : '';
    statusMessage += `• Context manager: 🟢 running${pidInfo}\n`;
  } else if (contextManager.status === 'stale') {
    statusMessage += '• Context manager: 🟠 stale PID file\n';
  } else if (contextManager.status === 'missing') {
    statusMessage += '• Context manager: 🔴 missing script\n';
  } else if (contextManager.status === 'error') {
    statusMessage += `• Context manager: 🔴 error (${contextManager.message})\n`;
  } else {
    statusMessage += '• Context manager: 🔴 stopped\n';
  }

  if (memoryStatus.status === 'ok') {
    statusMessage += `• Memlayer: ${memoryStatus.usingMemlayer ? '🟢 active' : '🟠 fallback'}\n`;
    if (memoryStatus.storagePath) {
      statusMessage += `• Memory store: ${memoryStatus.storagePath}\n`;
    }
  } else if (memoryStatus.status === 'missing') {
    statusMessage += '• Memlayer: 🔴 status script missing\n';
  } else if (memoryStatus.status === 'error') {
    statusMessage += `• Memlayer: 🔴 error (${memoryStatus.message})\n`;
  }

  statusMessage += `• ${summarizeBroadcastPlan(broadcastPlan)}\n`;
  statusMessage += `• Prompt pack: ${broadcastPack ? broadcastPack : 'none'}\n`;
  statusMessage += `• ${reviewRouterSummary}\n\n`;
  statusMessage += `• Review auto-close: ${REVIEW_AUTO_CLOSE_ENABLED ? 'enabled' : 'disabled'}\n\n`;
  statusMessage += `• Autopilot: ${AUTOPILOT_ENABLED ? 'enabled' : 'disabled'}\n`;
  if (AUTOPILOT_ENABLED) {
    statusMessage += `  ↳ interval: ${Math.round(AUTOPILOT_INTERVAL_MS / 1000)}s • idle-only: ${AUTOPILOT_IDLE_ONLY ? 'yes' : 'no'} • cooldown: ${AUTOPILOT_COOLDOWN_SEC}s\n\n`;
  } else {
    statusMessage += '\n';
  }
  statusMessage += `• Idle mail policy: ${IDLE_MAIL_POLICY}\n\n`;
  statusMessage += `• Autopilot unblock: ${AUTOPILOT_UNBLOCK_ENABLED ? 'enabled' : 'disabled'}\n`;
  if (AUTOPILOT_UNBLOCK_ENABLED) {
    statusMessage += `  ↳ interval: ${Math.round(AUTOPILOT_UNBLOCK_INTERVAL_MS / 1000)}s • submit: ${AUTOPILOT_UNBLOCK_SUBMIT ? 'yes' : 'no'} • confirm_mail: ${AUTOPILOT_UNBLOCK_CONFIRM_MCP_AGENT_MAIL ? 'yes' : 'no'} • trust_mail: ${AUTOPILOT_UNBLOCK_TRUST_MCP_AGENT_MAIL ? 'yes' : 'no'} • confirm_RA: ${AUTOPILOT_UNBLOCK_CONFIRM_RESPONSE_AWARENESS ? 'yes' : 'no'} • trust_RA: ${AUTOPILOT_UNBLOCK_TRUST_RESPONSE_AWARENESS ? 'yes' : 'no'} • feedback: ${AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK ? `yes(${AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK_CHOICE})` : 'no'}\n\n`;
  } else {
    statusMessage += '\n';
  }
  statusMessage += `• Mail → Telegram forward: ${MAIL_FORWARD_ENABLED ? 'enabled' : 'disabled'}\n`;
  if (MAIL_FORWARD_ENABLED) {
    const mailState = readMailForwardState();
    statusMessage += `  ↳ interval: ${Math.round(MAIL_FORWARD_INTERVAL_MS / 1000)}s • from: GreenMountain (bead msgs) • forwarded: ${mailState.forwardedMessageIds?.length || 0} • last_check: ${mailState.lastCheckedAt ? new Date(mailState.lastCheckedAt).toLocaleTimeString() : 'never'}\n\n`;
  } else {
    statusMessage += '\n';
  }
  statusMessage += `• Implementor RA default: ${IMPLEMENTOR_DEFAULT_RESPONSE_AWARENESS ? 'enabled' : 'disabled'}\n\n`;

  if (reservationAfter.length > 0 || cleanup.removed > 0) {
    statusMessage += `• Bead reservations: ${reservationAfter.length} reserved (${expiredAfter.length} expired)\n`;
    if (cleanup.removed > 0) {
      statusMessage += `• Reservations cleanup: cleared ${cleanup.removed} (${cleanup.mode})\n`;
    }
    statusMessage += '\n';
  }

  // List all sessions
  if (allSessions.length > 0) {
    statusMessage += '**📋 All Active Sessions:**\n';
    allSessions.forEach(session => {
      statusMessage += `• ${session}\n`;
    });
    statusMessage += '\n';
  }

  // Detailed MAF session info (if exists)
  if (hasMafSession) {
    statusMessage += '🤖 **MAF Session Details:**\n';
    statusMessage += `Session: ${sessionName}\n\n`;

    // Enhanced agent pane information
    const mafDetails = getDetailedSessionInfo(sessionName);
    statusMessage += '**👥 Agent Panes:**\n\n';

    // Extract pane commands from the basic pane info
    const paneCommands = {};
    mafPaneInfo.forEach(paneInfo => {
      const match = paneInfo.match(/(\d+):\s*(.+?)\s+(\w+)$/);
      if (match) {
        paneCommands[parseInt(match[1])] = match[2];
      }
    });

    // Show detailed info for each pane (0-3 for MAF layout)
    for (let i = 0; i < 4; i++) {
      const activity = getPaneActivity(sessionName, i);
      const role = getAgentRole(i);
      const command = paneCommands[i] || 'unknown';
      const model = detectLLMModel(command, activity.fullHistory);

      // Find agent in registry
      const registryAgent = agentRegistry.find(a => a.id === role.name.toLowerCase().replace('-', '')) ||
                           agentRegistry.find(a => a.pane === i);

      statusMessage += `${activity.isActive ? '🟢' : '🔴'} **${role.name}** (Pane ${i})\n`;
      statusMessage += `  🎭 Role: ${role.type} • ${role.focus}\n`;
      statusMessage += `  🤖 Model: ${model}\n`;

      if (registryAgent) {
        statusMessage += `  📋 Agent ID: ${registryAgent.id}\n`;
        statusMessage += `  💓 Status: ${registryAgent.status}\n`;
      }

      statusMessage += `  💬 Last: ${activity.lastSpeaker === 'user' ? '👤 User' : activity.lastSpeaker === 'agent' ? '🤖 Agent' : '❓ Unknown'}\n`;

      // Escape Markdown characters in message content
      const escapedMessage = escapeMarkdown(activity.lastMessage);
      statusMessage += `  📝 "${escapedMessage}"\n`;

      // Extract context percentage and background tasks as separate status rows
      let contextPercent = null;
      let backgroundTasks = null;

      if (activity.conversationHistory && activity.conversationHistory.length > 0) {
        activity.conversationHistory.forEach(conv => {
          // Extract context percentage
          if (conv.type === 'context' && conv.content.match(/(\d+)%/)) {
            const match = conv.content.match(/(\d+)%/);
            if (match) contextPercent = match[1] + '%';
          }
          // Extract background tasks
          if (conv.content.toLowerCase().includes('background task')) {
            const taskMatch = conv.content.match(/(\d+)\s*background\s*task/);
            if (taskMatch) backgroundTasks = taskMatch[1] + ' tasks';
          }
        });

        // Show context percentage as separate row
        if (contextPercent) {
          statusMessage += `  📊 Context: ${contextPercent} remaining\n`;
        }

        // Show background tasks as separate row
        if (backgroundTasks) {
          statusMessage += `  🔄 Background: ${backgroundTasks}\n`;
        }
      }

      // Show Recent Chat (last 3 meaningful messages, excluding context & background tasks as they have their own rows)
      if (activity.conversationHistory && activity.conversationHistory.length > 0) {
        // Filter out context messages and background task messages since they're shown as separate status rows
        const chatMessages = activity.conversationHistory.filter(conv =>
          conv.type !== 'context' &&
          !conv.content.toLowerCase().includes('background task')
        );

        if (chatMessages.length > 0) {
          statusMessage += `  💭 **Recent Chat:**\n`;
          chatMessages.slice(0, 3).forEach((conv, idx) => {
            const icon = conv.speaker === 'user' ? '👤' : '🤖';
            const typeIcon = {
              'question': '❓',
              'response': '💬',
              'task_complete': '✅',
              'action': '➜',
              'error': '❌',
              'progress': '🔄',
              'status_update': '📋',
              'development_marker': '📌',
              'completion': '✨',
              'action_plan': '🎯',
              'technical_message': '⚙️',
              'file_operation': '📁',
              'git_operation': '🔀',
              'structured_output': '📝',
              'result': '📤',
              'general_content': '💭'
            }[conv.type] || '💭';

            const escapedContent = escapeMarkdown(conv.content.substring(0, 80) + (conv.content.length > 80 ? '...' : ''));
            statusMessage += `    ${idx + 1}. ${icon} ${typeIcon} ${escapedContent}\n`;
          });
        }
      }
      statusMessage += '\n';
    }

    if (mafDetails.windows.length > 0) {
      statusMessage += '**🪟 Windows:**\n';
      mafDetails.windows.forEach(window => {
        statusMessage += `• ${window}\n`;
      });
    }
  } else {
    statusMessage += '🔴 **MAF Session**: Not found\n';
    statusMessage += `   (Expected session: "${sessionName}")\n`;
  }

  // Split message if too long for Telegram
  const messages = splitMessage(statusMessage.trim(), 4000);
  messages.forEach((message, index) => {
    if (index === 0) {
      bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
    }
  });
});

bot.on('message', () => {
  resetPollingBackoff();
});

// Error handling
bot.on('polling_error', (error) => {
  log('ERROR', 'Telegram polling error', error);
  if (pollingRestartInProgress) {
    return;
  }
  pollingRestartInProgress = true;
  if (pollingRestartTimer) {
    clearTimeout(pollingRestartTimer);
  }
  const delay = pollingBackoffMs;
  pollingBackoffMs = Math.min(pollingBackoffMs * 2, POLLING_BACKOFF_MAX_MS);
  pollingRestartTimer = setTimeout(() => {
    try {
      bot.stopPolling();
    } catch (stopError) {
      log('ERROR', 'Failed to stop polling cleanly', stopError);
    }
    try {
      bot.startPolling();
      resetPollingBackoff();
    } catch (startError) {
      log('ERROR', 'Failed to restart polling', startError);
    } finally {
      pollingRestartInProgress = false;
    }
  }, delay);
});

if (REVIEW_ROUTER_ENABLED) {
  setTimeout(() => {
    routeReviewCompletions().catch(error => {
      log('ERROR', 'Review router tick failed', error);
    });
  }, 5000);

  setInterval(() => {
    routeReviewCompletions().catch(error => {
      log('ERROR', 'Review router tick failed', error);
    });
  }, REVIEW_POLL_INTERVAL_MS);
}

if (REVIEW_REQUEST_ROUTER_ENABLED) {
  setTimeout(() => {
    routeReviewRequests().catch(error => {
      log('ERROR', 'Review request router kickoff failed', error);
    });
  }, 6000);

  setInterval(() => {
    routeReviewRequests().catch(error => {
      log('ERROR', 'Review request router tick failed', error);
    });
  }, REVIEW_REQUEST_POLL_INTERVAL_MS);
}

if (TELEGRAM_CHAT_TO_SUPERVISOR_ENABLED && TELEGRAM_CHAT_TO_SUPERVISOR_RETURN) {
  setInterval(() => {
    routeTelegramSupervisorReplies().catch(error => {
      log('ERROR', 'Telegram relay tick failed', error);
    });
  }, TELEGRAM_RELAY_POLL_INTERVAL_MS);
}

let autopilotInProgress = false;
async function runAutopilotTick() {
  if (!AUTOPILOT_ENABLED) {
    return;
  }
  if (autopilotInProgress) {
    return;
  }
  autopilotInProgress = true;
  try {
    await runBroadcastTargeted({
      chatId: null,
      autoMode: true,
      idleOnlyMode: AUTOPILOT_IDLE_ONLY,
      source: 'autopilot'
    });
  } catch (error) {
    log('ERROR', 'Autopilot tick failed', error);
  } finally {
    autopilotInProgress = false;
  }
}

let autopilotUnblockInProgress = false;
async function runAutopilotUnblockTick() {
  if (!AUTOPILOT_UNBLOCK_ENABLED) {
    return;
  }
  if (!checkTmuxSession()) {
    return;
  }
  if (autopilotUnblockInProgress) {
    return;
  }
  autopilotUnblockInProgress = true;
	  try {
	    const sessionName = resolveTmuxSessionName();
	    const roleAgents = resolveRoleAgents(getAgentInfo());
	    const panes = [
	      { index: roleAgents.supervisorPaneIndex, role: 'Supervisor' },
	      { index: roleAgents.reviewerPaneIndex, role: 'Reviewer' },
	      { index: roleAgents.implementor1PaneIndex, role: 'Implementor-1' },
	      { index: roleAgents.implementor2PaneIndex, role: 'Implementor-2' }
	    ].map(entry => ({ ...entry, index: normalizePaneIndex(entry.index) }))
	      .filter(entry => entry.index != null);

    const applied = [];
    for (const pane of panes) {
      const target = buildAgentTarget(sessionName, pane.index);
      const state = detectPaneInputState(target);
      if (!state) {
        continue;
      }

      if (AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK && state.claudeSessionFeedbackPrompt) {
        sendTmuxKeys(target, [AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK_CHOICE]);
        sleepSync(TMUX_SEND_DELAY_MS);
        sendTmuxKeys(target, ['C-m']);
        applied.push(`${pane.role}: dismissed Claude session feedback (${AUTOPILOT_UNBLOCK_CLAUDE_SESSION_FEEDBACK_CHOICE})`);
        continue;
      }

      if (state.skillConfirmPending && state.skillConfirmResponseAwareness) {
        if (AUTOPILOT_UNBLOCK_TRUST_RESPONSE_AWARENESS) {
          if (applyPaneAction(target, 'trust')) {
            applied.push(`${pane.role}: trusted ${state.skillConfirmSkillName || 'Response Awareness skill'}`);
          }
          continue;
        }
        if (AUTOPILOT_UNBLOCK_CONFIRM_RESPONSE_AWARENESS) {
          if (applyPaneAction(target, 'confirm')) {
            applied.push(`${pane.role}: confirmed ${state.skillConfirmSkillName || 'Response Awareness skill'}`);
          }
          continue;
        }
      }

      if (state.confirmPending && state.confirmResponseAwareness) {
        if (AUTOPILOT_UNBLOCK_TRUST_RESPONSE_AWARENESS) {
          if (applyPaneAction(target, 'trust')) {
            applied.push(`${pane.role}: trusted response-awareness prompt`);
          }
          continue;
        }
        if (AUTOPILOT_UNBLOCK_CONFIRM_RESPONSE_AWARENESS) {
          if (applyPaneAction(target, 'confirm')) {
            applied.push(`${pane.role}: confirmed response-awareness prompt`);
          }
          continue;
        }
      }

      if (state.confirmPending) {
        if (!state.confirmToolAgentMail) {
          continue;
        }
        if (state.confirmTrustable && AUTOPILOT_UNBLOCK_TRUST_MCP_AGENT_MAIL) {
          if (applyPaneAction(target, 'trust')) {
            applied.push(`${pane.role}: trusted`);
          }
          continue;
        }
        if (AUTOPILOT_UNBLOCK_CONFIRM_MCP_AGENT_MAIL) {
          if (applyPaneAction(target, 'confirm')) {
            applied.push(`${pane.role}: confirmed`);
          }
        }
        continue;
      }

      if (AUTOPILOT_UNBLOCK_SUBMIT && state.inputText && state.inputText.trim()) {
        const text = state.inputText.trim();
        const safeToSubmit = /^\/response-awareness(?:\s|$)/i.test(text)
          || /^\/response-awareness-(light|medium|heavy|full|plan|implement)(?:\s|$)/i.test(text);
        if (safeToSubmit && applyPaneAction(target, 'submit')) {
          applied.push(`${pane.role}: submitted`);
        }
      }
    }

    if (applied.length > 0) {
      log('INFO', `Autopilot unblock applied: ${applied.join(', ')}`);
    }
  } catch (error) {
    log('ERROR', 'Autopilot unblock tick failed', error);
  } finally {
    autopilotUnblockInProgress = false;
  }
}

if (AUTOPILOT_ENABLED) {
  setTimeout(() => {
    runAutopilotTick().catch(error => log('ERROR', 'Autopilot kickoff failed', error));
  }, 7000);

  setInterval(() => {
    runAutopilotTick().catch(error => log('ERROR', 'Autopilot tick failed', error));
  }, AUTOPILOT_INTERVAL_MS);
}

if (AUTOPILOT_UNBLOCK_ENABLED) {
  setTimeout(() => {
    runAutopilotUnblockTick().catch(error => log('ERROR', 'Autopilot unblock kickoff failed', error));
  }, 8000);

  setInterval(() => {
    runAutopilotUnblockTick().catch(error => log('ERROR', 'Autopilot unblock tick failed', error));
  }, AUTOPILOT_UNBLOCK_INTERVAL_MS);
}

if (MAIL_FORWARD_ENABLED) {
  setTimeout(() => {
    runMailForwardTick().catch(error => log('ERROR', 'Mail forward kickoff failed', error));
  }, 9000);

  setInterval(() => {
    runMailForwardTick().catch(error => log('ERROR', 'Mail forward tick failed', error));
  }, MAIL_FORWARD_INTERVAL_MS);
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('INFO', 'Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('INFO', 'Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});

log('INFO', 'Roundtable MAF Bot started');
console.log('🤖 Roundtable MAF Bot is running...');
