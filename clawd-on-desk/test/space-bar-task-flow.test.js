"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  TASKS,
  WELCOME,
  SYSTEM_PROMPT,
  SpaceBarTaskFlow,
  extractParticipantName,
  looksLikeIntroduction,
} = require("../src/space-bar-task-flow");

describe("space bar task flow", () => {
  it("ships a sufficiently varied low-pressure task pool", () => {
    assert.ok(TASKS.length >= 20);
    assert.equal(new Set(TASKS).size, TASKS.length);
  });

  it("welcomes a new participant and waits for an introduction", () => {
    const flow = new SpaceBarTaskFlow({ random: () => 0 });
    assert.equal(flow.onOpen(), WELCOME);
    // Non-intro input falls through to LLM (handled=false)
    const result = flow.handle("你好");
    assert.equal(result.handled, false);
    assert.equal(flow.stage, "awaiting_intro");
  });

  it("extracts the participant name and assigns a task", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A", "任务 B"], random: () => 0 });
    const result = flow.handle("我是 Patrick，来自 OpenBMB，今天来参加活动。");
    assert.equal(extractParticipantName("我是 Patrick，来自 OpenBMB"), "Patrick");
    assert.equal(extractParticipantName("Patrick，来自 OpenBMB"), "Patrick");
    assert.equal(looksLikeIntroduction("我是 Patrick，来自 OpenBMB"), true);
    assert.equal(flow.name, "Patrick");
    assert.equal(flow.currentTask, "任务 A");
    assert.match(result.reply, /欢迎 Patrick/);
    assert.match(result.reply, /任务 A/);
  });

  it("allows two swaps without repeating the current task", () => {
    const flow = new SpaceBarTaskFlow({
      tasks: ["任务 A", "任务 B", "任务 C", "任务 D"],
      random: () => 0,
      maxSwaps: 2,
    });
    flow.handle("我叫小明，来自 OpenBMB");
    assert.equal(flow.handle("换一个任务").task, "任务 B");
    assert.equal(flow.handle("太难了，换一个").task, "任务 C");
    const final = flow.handle("再抽一次");
    assert.match(final.reply, /最终任务/);
    assert.equal(flow.currentTask, "任务 C");
  });

  it("completes the challenge and resets for the next participant on open", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A"], random: () => 0 });
    flow.handle("I'm Alice from OpenBMB");
    const done = flow.handle("done");
    assert.equal(done.completed, true);
    assert.match(done.reply, /月亮碎片 × 1/);
    assert.equal(flow.stage, "completed");
    assert.equal(flow.onOpen(), WELCOME);
    assert.equal(flow.stage, "awaiting_intro");
  });

  it("lets an NPC reset an abandoned round for the next participant", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A"], random: () => 0 });
    flow.handle("我是 Patrick，来自 OpenBMB");
    const reset = flow.handle("下一位");
    assert.equal(reset.reset, true);
    assert.equal(reset.reply, WELCOME);
    assert.equal(flow.stage, "awaiting_intro");
    assert.equal(flow.name, "");
  });

  it("falls through to LLM for non-task inputs in active stage", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A"], random: () => 0 });
    flow.handle("我是 Patrick，来自 OpenBMB");
    // Regular chat message should fall through
    const result = flow.handle("今天天气怎么样？");
    assert.equal(result.handled, false);
    // Stage should remain active
    assert.equal(flow.stage, "active");
  });

  it("falls through to LLM for non-task inputs in awaiting_intro stage", () => {
    const flow = new SpaceBarTaskFlow({ random: () => 0 });
    const result = flow.handle("你好呀");
    assert.equal(result.handled, false);
    assert.equal(flow.stage, "awaiting_intro");
  });

  it("falls through to LLM in completed stage", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A"], random: () => 0 });
    flow.handle("我是 Patrick，来自 OpenBMB");
    flow.handle("done");
    const result = flow.handle("谢谢你赛博小猫");
    assert.equal(result.handled, false);
    assert.equal(flow.stage, "completed");
  });

  it("falls through for empty input", () => {
    const flow = new SpaceBarTaskFlow({ random: () => 0 });
    const result = flow.handle("");
    assert.equal(result.handled, false);
  });
});

describe("space bar task flow system prompt", () => {
  it("exports a SYSTEM_PROMPT string", () => {
    assert.ok(typeof SYSTEM_PROMPT === "string" && SYSTEM_PROMPT.length > 0);
  });

  it("getSystemPrompt includes participant name after intro", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A"], random: () => 0 });
    flow.handle("我是 Patrick，来自 OpenBMB");
    const prompt = flow.getSystemPrompt();
    assert.match(prompt, /Patrick/);
  });

  it("getSystemPrompt includes task context in active stage", () => {
    const flow = new SpaceBarTaskFlow({ tasks: ["任务 A"], random: () => 0 });
    flow.handle("我是 Patrick，来自 OpenBMB");
    const prompt = flow.getSystemPrompt();
    assert.match(prompt, /任务 A/);
  });

  it("getSystemPrompt has no task context before intro", () => {
    const flow = new SpaceBarTaskFlow({ random: () => 0 });
    const prompt = flow.getSystemPrompt();
    assert.ok(!prompt.includes("当前的大冒险任务"));
  });
});

describe("space bar task flow integration", () => {
  const srcDir = path.join(__dirname, "..", "src");

  it("loads the task flow before the chat renderer in HTML", () => {
    const html = fs.readFileSync(path.join(srcDir, "minicpm-chat.html"), "utf8");
    assert.ok(html.indexOf('src="space-bar-task-flow.js"') >= 0);
    assert.ok(
      html.indexOf('src="space-bar-task-flow.js"') <
      html.indexOf('src="minicpm-chat-renderer.js"')
    );
  });
});
