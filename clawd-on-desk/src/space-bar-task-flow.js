"use strict";

(function initSpaceBarTaskFlow(root) {
  const TASKS = Object.freeze([
    "说一个你最近使用大模型时遇到的真实痛点。",
    "找一位现场朋友，互相吐槽一个 AI 工具\u201c最让你下头\u201d的瞬间。",
    "你在本地/端侧跑模型时踩过最大的一个坑是什么？",
    "如果让你给现在的 AI 硬件产品提一个最想改的缺点，你会提什么？",
    "如果你身边有一个离线可用的本地 AI 助手，第一件事你想让它帮你做什么？",
    "AI 变成桌宠，你最希望它有什么能力？",
    "和身边的人一起，用三个关键词形容你们理想中的桌面 AI 助手。",
    "如果 MiniCPM5 跑在你的电脑上，你最希望它帮你接管哪类任务：文件、日程、浏览器，还是别的？",
    "AI 硬件这么多形态（桌宠、AI 玩具、可穿戴、机器人……），你觉得哪种最有机会先火起来？为什么？",
    "用一句话说说：为什么有些 AI 能力应该放在本地，而不是全部放在云端？",
    "你觉得端侧 AI 落地最大的拦路虎是什么：算力、内存、功耗，还是体验？",
    "为什么小参数模型在今天依然值得做？说一个你认可的理由。",
    "你觉得一个端侧小模型最重要的能力是什么：速度、隐私、工具调用，还是别的？",
    "你怎么看\u201c小模型负责本地执行、大模型负责复杂推理\u201d这种分工？你自己会怎么搭配着用？",
    "未来一年，端侧 AI 你最期待发生的一个变化是什么？",
    "找一位现场朋友，互相分享一个你们最近关注的技术方向。",
    "向身边的人安利一个你最近觉得值得关注的 AI 开源项目，并说说它解决了什么问题。",
    "和身边的人讨论：什么任务最不适合交给 AI？",
    "找一位身边的人，互相回答：你觉得本地 AI 最酷的一点是什么？",
    "分享一个你最近在做、或最想做的 AI 项目/Demo idea。",
  ]);

  const WELCOME =
    "欢迎来到 AGI Bar，我是 OpenBMB 开源社区的 MiniCPM Desk Pet。\n" +
    "想解锁月亮碎片的话，先介绍一下你自己吧～";

  const SYSTEM_PROMPT =
    "你是 AGI Bar 的赛博小猫，一只可爱的桌面宠物。你正在和参加活动的开发者互动。\n" +
    "你的性格：活泼、温暖、有点调皮，喜欢用短句聊天。偶尔会提到月亮、太空、星星这些主题。\n" +
    "请用简短的中文回复，保持轻松友好的语气。";

  const SWAP_PATTERNS = [
    /换(?:一个|一下|个|个任务)?$/i,
    /换(?:一个|个)?任务/i,
    /这个不太行/i,
    /太难了/i,
    /换个简单/i,
    /再抽一次/i,
    /重新抽/i,
    /another task/i,
    /change (?:the )?task/i,
    /too hard/i,
  ];

  const COMPLETE_PATTERNS = [
    /我完成了/i,
    /任务完成/i,
    /已完成/i,
    /完成啦/i,
    /^\s*done[!.。！]?\s*$/i,
    /^\s*完成[了啦]?[!.。！]?\s*$/i,
  ];

  const RESET_PATTERNS = [
    /^\s*(?:下一位|下一位参与者|重新开始|重置任务|新一轮)\s*[!.。！]?\s*$/i,
    /^\s*(?:next participant|start over|reset)\s*[!.。！]?\s*$/i,
  ];

  const INTRO_PATTERNS = [
    /(?:我是|我叫|叫我)\s*([A-Za-z][A-Za-z0-9_.-]{0,23}|[\u3400-\u9fff]{1,8})/i,
    /(?:i am|i'm|my name is)\s+([A-Za-z][A-Za-z0-9_.-]{0,23})/i,
    /^([A-Za-z][A-Za-z0-9_.-]{0,23})\s*[,，]?\s*(?:来自|from|at)\s+/i,
  ];

  function matchesAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .replace(/[，。,.！!？?；;：:、].*$/, "")
      .slice(0, 24);
  }

  function extractParticipantName(text) {
    const value = String(text || "").trim();
    for (const pattern of INTRO_PATTERNS) {
      const match = value.match(pattern);
      if (match) return normalizeName(match[1]);
    }
    return "";
  }

  function looksLikeIntroduction(text) {
    const value = String(text || "").trim();
    if (value.length < 4) return false;
    return !!extractParticipantName(value);
  }

  class SpaceBarTaskFlow {
    constructor({ tasks = TASKS, random = Math.random, maxSwaps = 2 } = {}) {
      this.tasks = Array.from(tasks);
      this.random = typeof random === "function" ? random : Math.random;
      this.maxSwaps = Math.max(0, Number(maxSwaps) || 0);
      this.reset();
    }

    reset() {
      this.stage = "awaiting_intro";
      this.name = "";
      this.currentTask = "";
      this.swapCount = 0;
      this.usedTasks = new Set();
      return WELCOME;
    }

    onOpen() {
      if (this.stage === "completed") return this.reset();
      if (this.stage === "active" && this.currentTask) {
        return `欢迎回来，${this.name || "开发者"}。你当前的任务是：\n${this.currentTask}`;
      }
      return WELCOME;
    }

    pickTask() {
      if (!this.tasks.length) return "向赛博小猫说一句今晚的通关宣言。";
      let candidates = this.tasks.filter((task) => !this.usedTasks.has(task));
      if (!candidates.length) {
        this.usedTasks.clear();
        candidates = this.tasks.slice();
      }
      const rawIndex = Math.floor(this.random() * candidates.length);
      const index = Math.max(0, Math.min(candidates.length - 1, rawIndex));
      const task = candidates[index];
      this.usedTasks.add(task);
      this.currentTask = task;
      return task;
    }

    handle(text) {
      const value = String(text || "").trim();
      if (!value) return { handled: false };

      if (this.stage === "awaiting_intro") {
        if (!looksLikeIntroduction(value)) {
          // Not a self-introduction: fall through to LLM chat
          return { handled: false };
        }
        this.name = extractParticipantName(value) || "开发者";
        const task = this.pickTask();
        this.stage = "active";
        return {
          handled: true,
          reply:
            `喵～ 欢迎 ${this.name} 来到 AGI Bar。\n` +
            `我刚刚在酒杯里闻到了一点月亮碎片的味道……\n` +
            `想找到它的话，要先完成一个小小的大冒险任务。\n\n` +
            `你今晚抽到的任务是：${task}\n\n` +
            `要是这个任务不太合适，可以对我说「换一个任务」。不过机会有限哦，最多还能换 ${this.maxSwaps} 次。`,
          task,
        };
      }

      if (this.stage === "active") {
        if (matchesAny(value, RESET_PATTERNS)) {
          return { handled: true, reset: true, reply: this.reset() };
        }

        if (matchesAny(value, COMPLETE_PATTERNS)) {
          this.stage = "completed";
          return {
            handled: true,
            completed: true,
            reply:
              "喵！挑战完成，我已经看到你的精彩表现啦～\n" +
              "恭喜你获得月亮碎片 × 1。看来你离酒杯里的秘密又近了一步。\n\n" +
              "现场 NPC 会帮你确认一下，并完成奖励发放哦。",
          };
        }

        if (matchesAny(value, SWAP_PATTERNS)) {
          if (this.swapCount >= this.maxSwaps) {
            return {
              handled: true,
              reply:
                `已经换过 ${this.maxSwaps} 次啦，第 3 个任务就是最终任务：\n` +
                `${this.currentTask}\n\n放轻松，完成后告诉我"任务完成"就好～`,
            };
          }
          this.swapCount += 1;
          const task = this.pickTask();
          return {
            handled: true,
            task,
            reply:
              `好呀，喵帮你重新摸一张任务卡～\n` +
              `新的大冒险任务是：${task}\n\n` +
              `还可以再换 ${this.maxSwaps - this.swapCount} 次，要谨慎使用哦！`,
          };
        }

        // Not a task command: fall through to LLM chat
        return { handled: false };
      }

      // completed or unknown stage: fall through to LLM chat
      return { handled: false };
    }

    getSystemPrompt() {
      let prompt = SYSTEM_PROMPT;
      if (this.name) {
        prompt += `\n\n你正在和 ${this.name} 聊天。`;
      }
      if (this.stage === "active" && this.currentTask) {
        prompt += `\n${this.name || "这位开发者"}当前的大冒险任务是：${this.currentTask}`;
        prompt += "\n如果对方聊到和任务相关的话题，可以鼓励 ta 去完成任务。";
      }
      return prompt;
    }
  }

  const api = {
    TASKS,
    WELCOME,
    SYSTEM_PROMPT,
    SpaceBarTaskFlow,
    extractParticipantName,
    looksLikeIntroduction,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ClawdSpaceBarTaskFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
