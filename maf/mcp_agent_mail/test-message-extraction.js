// Test script to demonstrate the improved message extraction logic
const { extractConversationContent } = require('./telegram-bot.js');

// Test cases for different scenarios
const testCases = [
  {
    name: "Case 1: Separator lines should be skipped",
    lines: [
      "🎯 Next Steps for Follow-up:",
      "- Complete TypeScript compilation error fixes",
      "──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────",
      "✅ Fixed type errors in authentication module",
      "48% context left · ? for shortcuts"
    ]
  },
  {
    name: "Case 2: Various meaningful content types",
    lines: [
      "User: Can you help me implement the new feature?",
      "Claude: I'll help you implement the feature.",
      "🔧 Working on the API endpoints...",
      "TODO: Add error handling for edge cases",
      "Implementation completed successfully!",
      "git commit -m 'feat: Add new authentication system'",
      "Error: Missing required parameter"
    ]
  },
  {
    name: "Case 3: Mixed decorative and content lines",
    lines: [
      "***",
      "=== PROGRESS UPDATE ===",
      "📊 75% context left · ? for shortcuts",
      "----------------------------------------",
      "✨ Feature implementation completed",
      "🔄 Testing in progress...",
      "⚙️ Configuration updated",
      "*************",
      "[x] Task completed"
    ]
  }
];

// Run the tests
console.log("Testing Enhanced Message Extraction Logic\n");

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}\n`);

  console.log("Input lines:");
  testCase.lines.forEach((line, i) => {
    console.log(`  ${i}: ${line}`);
  });

  console.log("\nExtracted conversations:");
  const conversations = extractConversationContent(testCase.lines);

  if (conversations.length === 0) {
    console.log("  No meaningful conversations extracted (separators filtered out)");
  } else {
    conversations.forEach((conv, i) => {
      const speakerIcon = conv.speaker === 'user' ? '👤' : '🤖';
      console.log(`  ${i + 1}. ${speakerIcon} [${conv.type}] ${conv.content}`);
    });
  }

  console.log("\n" + "=".repeat(80) + "\n");
});