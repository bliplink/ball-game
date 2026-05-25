(function () {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const elements = {
    currentPlayerValue: document.getElementById("currentPlayerValue"),
    shotsValue: document.getElementById("shotsValue"),
    tableValue: document.getElementById("tableValue"),
    speedValue: document.getElementById("speedValue"),
    powerValue: document.getElementById("powerValue"),
    powerFill: document.getElementById("powerFill"),
    statusText: document.getElementById("statusText"),
    targetCandidatesValue: document.getElementById("targetCandidatesValue"),
    targetRecommendationValue: document.getElementById("targetRecommendationValue"),
    targetHintValue: document.getElementById("targetHintValue"),
    spinHintValue: document.getElementById("spinHintValue"),
    modeSelect: document.getElementById("modeSelect"),
    aiDifficultySelect: document.getElementById("aiDifficultySelect"),
    drillSelect: document.getElementById("drillSelect"),
    restartRackButton: document.getElementById("restartRackButton"),
    newRoundButton: document.getElementById("newRoundButton"),
    connectServerButton: document.getElementById("connectServerButton"),
    createRoomButton: document.getElementById("createRoomButton"),
    joinRoomButton: document.getElementById("joinRoomButton"),
    serverUrlInput: document.getElementById("serverUrlInput"),
    roomCodeInput: document.getElementById("roomCodeInput"),
    onlineStatusValue: document.getElementById("onlineStatusValue"),
    playerEntries: [
      {
        card: document.getElementById("player1Card"),
        title: document.getElementById("player1Title"),
        badge: document.getElementById("player1Badge"),
        group: document.getElementById("player1Group"),
        target: document.getElementById("player1Target"),
        fouls: document.getElementById("player1Fouls"),
      },
      {
        card: document.getElementById("player2Card"),
        title: document.getElementById("player2Title"),
        badge: document.getElementById("player2Badge"),
        group: document.getElementById("player2Group"),
        target: document.getElementById("player2Target"),
        fouls: document.getElementById("player2Fouls"),
      },
    ],
    spinButtons: Array.from(document.querySelectorAll(".spin-button")),
  };

  const defaultOnlineServerUrl = (function () {
    if (!window.location.host) {
      return "ws://localhost:8080/ws";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const pathname = window.location.pathname || "/";
    const basePath = pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname.slice(0, pathname.lastIndexOf("/"));
    const normalizedBasePath = basePath && basePath !== "/" ? basePath : "";
    return `${protocol}//${window.location.host}${normalizedBasePath}/ws`;
  })();

  const PERSISTENCE_KEY = "velvet-break-progress-v1";
  const AUTO_SAVE_INTERVAL_MS = 1500;
  let lastPersistAt = 0;

  elements.serverUrlInput.value = defaultOnlineServerUrl;

  const MODE_CONFIG = {
    "local-pvp": { label: "同屏双人对战", competitive: true },
    "ai-duel": { label: "人机对决", competitive: true },
    "solo-skill": { label: "单人技巧训练场", competitive: false },
    "solo-battle": { label: "单人实战训练场", competitive: false },
    online: { label: "联机对战", competitive: true },
  };

  const AI_DIFFICULTY = {
    easy: { name: "简单", thinkMs: 950, error: 0.17, powerBias: 0.56 },
    normal: { name: "标准", thinkMs: 700, error: 0.09, powerBias: 0.64 },
    hard: { name: "进阶", thinkMs: 430, error: 0.04, powerBias: 0.72 },
  };

  const SPIN_OPTIONS = {
    neutral: { key: "neutral", label: "无旋", x: 0, y: 0 },
    up: { key: "up", label: "上旋", x: 0, y: 1 },
    down: { key: "down", label: "下旋", x: 0, y: -1 },
    left: { key: "left", label: "左旋", x: -1, y: 0 },
    right: { key: "right", label: "右旋", x: 1, y: 0 },
  };

  const DRILL_PRESETS = {
    straight_stop: {
      name: "直线停球",
      hint: "练正线停球。尽量用中杆或轻微下旋，让白球贴着目标球停住。",
      cue: { x: 338, y: 360 },
      balls: [{ number: 1, x: 810, y: 360 }],
      targets: [1],
    },
    thin_cut: {
      name: "薄球切袋",
      hint: "练薄球切袋。观察入射角，用轻杆和细致瞄准完成切球。",
      cue: { x: 388, y: 442 },
      balls: [{ number: 2, x: 848, y: 318 }],
      targets: [2],
    },
    bank_shot: {
      name: "一库反弹",
      hint: "练一库球。路径预测会帮助你找到首碰点，但最后还是要靠角度感觉。",
      cue: { x: 350, y: 310 },
      balls: [{ number: 3, x: 780, y: 310 }],
      targets: [3],
    },
    draw_back: {
      name: "低杆回拉",
      hint: "练低杆回拉。选下旋后出杆，观察白球首碰后的回拉效果。",
      cue: { x: 410, y: 360 },
      balls: [{ number: 4, x: 790, y: 360 }],
      targets: [4],
    },
    follow_run: {
      name: "高杆跟进",
      hint: "练高杆跟进。选上旋后出杆，让白球碰撞后继续向前走位。",
      cue: { x: 400, y: 410 },
      balls: [{ number: 5, x: 785, y: 350 }],
      targets: [5],
    },
  };

  const TABLE = {
    x: 118,
    y: 88,
    width: 1044,
    height: 544,
    rail: 34,
    pocketRadiusCorner: 27,
    pocketRadiusSide: 23,
  };

  TABLE.playX = TABLE.x + TABLE.rail;
  TABLE.playY = TABLE.y + TABLE.rail;
  TABLE.playWidth = TABLE.width - TABLE.rail * 2;
  TABLE.playHeight = TABLE.height - TABLE.rail * 2;
  TABLE.playRight = TABLE.playX + TABLE.playWidth;
  TABLE.playBottom = TABLE.playY + TABLE.playHeight;

  const BALL_RADIUS = 13;
  const FIXED_STEP = 1 / 120;
  const BALL_STOP_SPEED = 4.5;
  const MAX_SHOT_SPEED = 1220;
  const RESTITUTION = 0.985;
  const FRICTION_BASE = 0.9925;
  const MAX_PULL = 210;
  const ONLINE_BROADCAST_MS = 90;

  const BALL_COLORS = [
    "#f3d252",
    "#2f69c7",
    "#db4e43",
    "#7d49c6",
    "#e07f2f",
    "#208b5b",
    "#7b3c21",
    "#171717",
    "#f3d252",
    "#2f69c7",
    "#db4e43",
    "#7d49c6",
    "#e07f2f",
    "#208b5b",
    "#7b3c21",
  ];

  const pockets = [
    { x: TABLE.playX, y: TABLE.playY, radius: TABLE.pocketRadiusCorner },
    { x: TABLE.playX + TABLE.playWidth / 2, y: TABLE.playY, radius: TABLE.pocketRadiusSide },
    { x: TABLE.playRight, y: TABLE.playY, radius: TABLE.pocketRadiusCorner },
    { x: TABLE.playX, y: TABLE.playBottom, radius: TABLE.pocketRadiusCorner },
    { x: TABLE.playX + TABLE.playWidth / 2, y: TABLE.playBottom, radius: TABLE.pocketRadiusSide },
    { x: TABLE.playRight, y: TABLE.playBottom, radius: TABLE.pocketRadiusCorner },
  ];

  const state = {
    mode: "local-pvp",
    drillId: "straight_stop",
    aiDifficulty: "normal",
    spinKey: "neutral",
    balls: [],
    cueBall: null,
    players: [],
    currentPlayer: 0,
    breaker: 0,
    totalShots: 0,
    bestSpeed: 0,
    tableOpen: true,
    breakShotPending: true,
    phase: "aim",
    shotContext: null,
    dragging: false,
    dragPointer: null,
    pointer: { x: TABLE.playX + TABLE.playWidth * 0.25, y: TABLE.playY + TABLE.playHeight * 0.5 },
    placementPreview: null,
    power: 0,
    aimAssist: { candidateNumbers: [], recommendedNumber: null, prediction: null, hint: "" },
    winner: null,
    challenge: {
      maxShots: 18,
      cleared: 0,
      success: false,
      failed: false,
    },
    ai: {
      pendingAt: null,
    },
    online: {
      socket: null,
      serverUrl: defaultOnlineServerUrl,
      connected: false,
      roomCode: "",
      playerIndex: 0,
      isHost: false,
      clientId: "",
      status: "先运行本地房间服务，再连接服务器创建或加入房间。",
      applyingSnapshot: false,
      lastBroadcastAt: 0,
    },
    lastTimestamp: 0,
    accumulator: 0,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function normalize(vector) {
    const length = Math.hypot(vector.x, vector.y);
    if (length < 0.0001) {
      return null;
    }
    return {
      x: vector.x / length,
      y: vector.y / length,
      length,
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function saveProgress(force) {
    const now = Date.now();
    if (!force && now - lastPersistAt < AUTO_SAVE_INTERVAL_MS) {
      return;
    }

    const payload = {
      version: 1,
      savedAt: now,
      mode: state.mode,
      statusText: elements.statusText.textContent,
      serverUrl: elements.serverUrlInput.value.trim() || defaultOnlineServerUrl,
      roomCode: elements.roomCodeInput.value.trim().toUpperCase(),
      onlineStatus: state.online.status,
      snapshot: state.mode === "online" ? null : getSnapshot(),
    };

    try {
      window.localStorage.setItem(PERSISTENCE_KEY, JSON.stringify(payload));
      lastPersistAt = now;
    } catch (error) {
      // Ignore storage failures so gameplay never gets blocked by quota or privacy settings.
    }
  }

  function restoreProgress() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(PERSISTENCE_KEY);
    } catch (error) {
      return false;
    }

    if (!raw) {
      return false;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      return false;
    }

    elements.serverUrlInput.value = payload.serverUrl || defaultOnlineServerUrl;
    elements.roomCodeInput.value = payload.roomCode || "";
    state.online.serverUrl = elements.serverUrlInput.value.trim() || defaultOnlineServerUrl;
    state.online.roomCode = "";
    state.online.connected = false;
    state.online.isHost = false;
    state.online.playerIndex = 0;
    state.online.clientId = "";
    state.online.socket = null;

    if (payload.snapshot && payload.snapshot.mode && payload.snapshot.mode !== "online") {
      state.breaker = typeof payload.snapshot.breaker === "number" ? payload.snapshot.breaker : 0;
      switchMode(payload.snapshot.mode, false);
      resetSession(false);
      applySnapshot(payload.snapshot);
      setStatus(payload.statusText || "已恢复上次进度。");
      updateDashboard();
      return true;
    }

    if (payload.mode === "online") {
      switchMode("online", false);
      resetSession(false);
      setOnlineStatus(payload.onlineStatus || "已恢复上次联机设置，请重新连接服务器。");
      setStatus("已恢复上次联机设置，请重新连接服务器后继续。");
      updateDashboard();
      return true;
    }

    return false;
  }

  function bindPersistenceEvents() {
    window.addEventListener("beforeunload", function () {
      saveProgress(true);
    });

    window.addEventListener("pagehide", function () {
      saveProgress(true);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        saveProgress(true);
      }
    });
  }

  function currentSpin() {
    return SPIN_OPTIONS[state.spinKey] || SPIN_OPTIONS.neutral;
  }

  function setStatus(message) {
    elements.statusText.textContent = message;
  }

  function setOnlineStatus(message) {
    state.online.status = message;
    elements.onlineStatusValue.textContent = message;
  }

  function roundRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function ballGroup(number) {
    if (number >= 1 && number <= 7) {
      return "solid";
    }
    if (number === 8) {
      return "eight";
    }
    if (number >= 9 && number <= 15) {
      return "stripe";
    }
    return "cue";
  }

  function groupLabel(group) {
    if (group === "solid") {
      return "实色";
    }
    if (group === "stripe") {
      return "花色";
    }
    if (group === "eight") {
      return "8 号球";
    }
    if (group === "drill") {
      return "训练";
    }
    return "待定";
  }

  function oppositeGroup(group) {
    return group === "solid" ? "stripe" : "solid";
  }

  function createBall(number, x, y) {
    return {
      number,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      active: true,
      isCue: number === 0,
      stripe: number >= 9,
      color: number === 0 ? "#f7f3eb" : BALL_COLORS[number - 1],
    };
  }

  function createPlayersForMode(mode) {
    if (mode === "local-pvp") {
      return [
        { id: 0, name: "玩家 1", group: null, fouls: 0, isAI: false, isRemote: false },
        { id: 1, name: "玩家 2", group: null, fouls: 0, isAI: false, isRemote: false },
      ];
    }
    if (mode === "ai-duel") {
      return [
        { id: 0, name: "你", group: null, fouls: 0, isAI: false, isRemote: false },
        { id: 1, name: `AI ${AI_DIFFICULTY[state.aiDifficulty].name}`, group: null, fouls: 0, isAI: true, isRemote: false },
      ];
    }
    if (mode === "solo-skill") {
      return [
        { id: 0, name: "练习者", group: "drill", fouls: 0, isAI: false, isRemote: false },
        { id: 1, name: "训练备注", group: "drill", fouls: 0, isAI: false, isRemote: false },
      ];
    }
    if (mode === "solo-battle") {
      return [
        { id: 0, name: "训练者", group: null, fouls: 0, isAI: false, isRemote: false },
        { id: 1, name: "清台目标", group: null, fouls: 0, isAI: false, isRemote: false },
      ];
    }
    return [
      { id: 0, name: state.online.isHost ? "你（主机）" : "主机玩家", group: null, fouls: 0, isAI: false, isRemote: !state.online.isHost },
      { id: 1, name: state.online.isHost ? "客机玩家" : "你（联机）", group: null, fouls: 0, isAI: false, isRemote: state.online.isHost },
    ];
  }

  function currentPlayer() {
    return state.players[state.currentPlayer];
  }

  function otherPlayer() {
    return state.players[1 - state.currentPlayer];
  }

  function getModeLabel() {
    return MODE_CONFIG[state.mode].label;
  }

  function isStandardMatchMode() {
    return state.mode === "local-pvp" || state.mode === "ai-duel" || state.mode === "online";
  }

  function isSoloSkillMode() {
    return state.mode === "solo-skill";
  }

  function isSoloBattleMode() {
    return state.mode === "solo-battle";
  }

  function isOnlineGuest() {
    return state.mode === "online" && state.online.connected && !state.online.isHost;
  }

  function getLocalPlayerIndex() {
    if (state.mode === "online" && state.online.connected) {
      return state.online.playerIndex;
    }
    return 0;
  }

  function canPlayerIndexControlCurrentTurn(playerIndex) {
    if (state.winner !== null) {
      return false;
    }
    return state.currentPlayer === playerIndex;
  }

  function canLocalUserControlCurrentTurn() {
    if (state.mode === "ai-duel") {
      return canPlayerIndexControlCurrentTurn(0);
    }
    if (state.mode === "online") {
      return canPlayerIndexControlCurrentTurn(getLocalPlayerIndex());
    }
    return true;
  }

  function getBallNumberText(number) {
    return `${number} 号球`;
  }

  function setSpin(spinKey) {
    state.spinKey = SPIN_OPTIONS[spinKey] ? spinKey : "neutral";
    elements.spinButtons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.spin === state.spinKey);
    });
    const spin = currentSpin();
    if (spin.key === "neutral") {
      elements.spinHintValue.textContent = "当前无旋。上旋适合跟进，下旋适合回拉，左右旋会让白球在行进与碰库时产生轻微侧偏。";
    } else {
      elements.spinHintValue.textContent = `当前选择${spin.label}。出杆后会对白球在首碰前后的行进路线产生额外影响。`;
    }
  }

  function findBall(number) {
    return state.balls.find(function (ball) {
      return ball.number === number;
    }) || null;
  }

  function getActiveObjectBalls() {
    return state.balls.filter(function (ball) {
      return ball.active && !ball.isCue;
    });
  }

  function countRemainingGroup(group) {
    return state.balls.filter(function (ball) {
      return ball.active && ballGroup(ball.number) === group;
    }).length;
  }

  function countRemainingBattleBalls() {
    return state.balls.filter(function (ball) {
      return ball.active && !ball.isCue && ball.number !== 8;
    }).length;
  }

  function getLegalTargetGroup(player) {
    if (isSoloSkillMode()) {
      return "drill";
    }
    if (isSoloBattleMode()) {
      return countRemainingBattleBalls() === 0 ? "eight" : "battle";
    }
    if (state.tableOpen || !player.group) {
      return "open";
    }
    return countRemainingGroup(player.group) === 0 ? "eight" : player.group;
  }

  function getPlayerTargetText(player, index) {
    if (isSoloSkillMode()) {
      if (index === 0) {
        return DRILL_PRESETS[state.drillId].name;
      }
      return "不限杆数";
    }
    if (isSoloBattleMode()) {
      if (index === 0) {
        return `剩余 ${Math.max(0, state.challenge.maxShots - state.totalShots)} 杆`;
      }
      return countRemainingBattleBalls() === 0 ? "准备收 8" : `剩余彩球 ${countRemainingBattleBalls()} 颗`;
    }

    const target = getLegalTargetGroup(player);
    if (target === "open") {
      return state.breakShotPending ? "先开球" : "开放球台";
    }
    if (target === "eight") {
      return "8 号球";
    }
    return `还剩 ${countRemainingGroup(player.group)} 颗`;
  }

  function getPlayerBadge(index) {
    if (state.phase === "game-over") {
      if (state.winner === null) {
        return "训练结束";
      }
      return state.winner === index ? "本局胜者" : "本局结束";
    }

    if (isSoloSkillMode()) {
      return index === 0 ? "自由训练" : "技巧预设";
    }

    if (isSoloBattleMode()) {
      return index === 0 ? "清台挑战" : "实战轮次";
    }

    if (index === state.currentPlayer) {
      if (state.phase === "ball-in-hand") {
        return "自由球";
      }
      return state.breakShotPending ? "开球方" : "当前回合";
    }

    return "等待回合";
  }

  function getTableStatusLabel() {
    if (isSoloSkillMode()) {
      return `技巧训练 · ${DRILL_PRESETS[state.drillId].name}`;
    }
    if (isSoloBattleMode()) {
      if (state.phase === "game-over") {
        return state.challenge.success ? "实战训练成功" : "实战训练结束";
      }
      return `实战挑战 · 剩余 ${Math.max(0, state.challenge.maxShots - state.totalShots)} 杆`;
    }
    if (state.breakShotPending) {
      return "开球阶段";
    }
    if (state.tableOpen) {
      return "开放球台";
    }
    if (getLegalTargetGroup(currentPlayer()) === "eight") {
      return "8 号决胜";
    }
    return `${groupLabel(state.players[0].group)} / ${groupLabel(state.players[1].group)}`;
  }

  function buildStandardRack() {
    const balls = [];
    const cueBall = createBall(
      0,
      TABLE.playX + TABLE.playWidth * 0.23,
      TABLE.playY + TABLE.playHeight * 0.5
    );
    balls.push(cueBall);

    const rackLayout = [
      [1],
      [9, 2],
      [3, 8, 10],
      [11, 4, 12, 5],
      [6, 13, 7, 14, 15],
    ];

    const rackX = TABLE.playX + TABLE.playWidth * 0.73;
    const rackY = TABLE.playY + TABLE.playHeight * 0.5;
    const horizontalGap = BALL_RADIUS * Math.sqrt(3) * 1.05;
    const verticalGap = BALL_RADIUS * 2.04;

    rackLayout.forEach(function (row, rowIndex) {
      const x = rackX + rowIndex * horizontalGap;
      const startY = rackY - ((row.length - 1) * verticalGap) / 2;
      row.forEach(function (number, slotIndex) {
        const y = startY + slotIndex * verticalGap;
        balls.push(createBall(number, x, y));
      });
    });

    state.balls = balls;
    state.cueBall = cueBall;
  }

  function applyDrillPreset(drillId) {
    const preset = DRILL_PRESETS[drillId] || DRILL_PRESETS.straight_stop;
    const balls = [createBall(0, preset.cue.x, preset.cue.y)];

    preset.balls.forEach(function (ballDef) {
      balls.push(createBall(ballDef.number, ballDef.x, ballDef.y));
    });

    state.balls = balls;
    state.cueBall = balls[0];
  }

  function isInsidePlayArea(point, radius) {
    return (
      point.x >= TABLE.playX + radius &&
      point.x <= TABLE.playRight - radius &&
      point.y >= TABLE.playY + radius &&
      point.y <= TABLE.playBottom - radius
    );
  }

  function isPlacementValid(point, ignoreBall) {
    if (!isInsidePlayArea(point, BALL_RADIUS)) {
      return false;
    }

    for (const pocket of pockets) {
      if (distance(point, pocket) <= pocket.radius + BALL_RADIUS * 0.25) {
        return false;
      }
    }

    return state.balls.every(function (ball) {
      if (!ball.active || ball === ignoreBall) {
        return true;
      }
      return distance(ball, point) >= ball.radius + BALL_RADIUS + 2;
    });
  }

  function clampPointToPlayArea(point) {
    return {
      x: clamp(point.x, TABLE.playX + BALL_RADIUS, TABLE.playRight - BALL_RADIUS),
      y: clamp(point.y, TABLE.playY + BALL_RADIUS, TABLE.playBottom - BALL_RADIUS),
    };
  }

  function findAvailableSpot(preferredX, preferredY, ignoreBall) {
    const candidates = [{ x: preferredX, y: preferredY }];

    for (let ring = 1; ring <= 12; ring += 1) {
      const offset = ring * 22;
      candidates.push(
        { x: preferredX, y: preferredY - offset },
        { x: preferredX, y: preferredY + offset },
        { x: preferredX - offset, y: preferredY },
        { x: preferredX + offset, y: preferredY },
        { x: preferredX - offset * 0.7, y: preferredY - offset * 0.7 },
        { x: preferredX + offset * 0.7, y: preferredY - offset * 0.7 },
        { x: preferredX - offset * 0.7, y: preferredY + offset * 0.7 },
        { x: preferredX + offset * 0.7, y: preferredY + offset * 0.7 }
      );
    }

    for (const candidate of candidates) {
      const clampedCandidate = clampPointToPlayArea(candidate);
      if (isPlacementValid(clampedCandidate, ignoreBall)) {
        return clampedCandidate;
      }
    }

    for (let x = TABLE.playX + 40; x <= TABLE.playRight - 40; x += 20) {
      for (let y = TABLE.playY + 40; y <= TABLE.playBottom - 40; y += 20) {
        if (isPlacementValid({ x, y }, ignoreBall)) {
          return { x, y };
        }
      }
    }

    return clampPointToPlayArea({ x: preferredX, y: preferredY });
  }

  function respotBall(number, preferredX, preferredY) {
    const ball = findBall(number);
    if (!ball) {
      return;
    }
    const spot = findAvailableSpot(preferredX, preferredY, ball);
    ball.active = true;
    ball.x = spot.x;
    ball.y = spot.y;
    ball.vx = 0;
    ball.vy = 0;
  }

  function updatePlacementPreview(pointer) {
    const clamped = clampPointToPlayArea(pointer);
    state.pointer = clamped;
    state.placementPreview = {
      x: clamped.x,
      y: clamped.y,
      valid: isPlacementValid(clamped, state.cueBall),
    };
  }

  function enterBallInHand() {
    state.phase = "ball-in-hand";
    state.dragging = false;
    state.dragPointer = null;
    state.power = 0;
    state.cueBall.active = false;
    state.cueBall.vx = 0;
    state.cueBall.vy = 0;

    const spot = findAvailableSpot(
      TABLE.playX + TABLE.playWidth * 0.25,
      TABLE.playY + TABLE.playHeight * 0.5,
      state.cueBall
    );
    updatePlacementPreview(spot);
  }

  function applyCuePlacement(point, actorPlayerIndex) {
    if (
      state.mode === "online" &&
      state.online.connected &&
      actorPlayerIndex !== undefined &&
      !canPlayerIndexControlCurrentTurn(actorPlayerIndex)
    ) {
      return false;
    }

    state.cueBall.active = true;
    state.cueBall.x = point.x;
    state.cueBall.y = point.y;
    state.cueBall.vx = 0;
    state.cueBall.vy = 0;
    state.phase = "aim";
    state.placementPreview = null;
    setStatus(`${currentPlayer().name} 已摆好白球，可以继续瞄准。`);
    maybeBroadcastOnlineState(true);
    return true;
  }

  function getModeResetStatus() {
    if (state.mode === "local-pvp") {
      return `${currentPlayer().name} 开球。拖动白球后方蓄力，开始同屏双人 8 球对局。`;
    }
    if (state.mode === "ai-duel") {
      return `${currentPlayer().name} 先手。你正在进行人机对决，AI 会在自己的回合自动出杆。`;
    }
    if (state.mode === "solo-skill") {
      return `当前预设：${DRILL_PRESETS[state.drillId].name}。${DRILL_PRESETS[state.drillId].hint}`;
    }
    if (state.mode === "solo-battle") {
      return `单人实战训练开始。你需要在 ${state.challenge.maxShots} 杆内清掉彩球，并最后合法收掉 8 号球。`;
    }
    if (!state.online.connected) {
      return "联机模式已切换。先连接服务器并创建或加入房间。";
    }
    return `${currentPlayer().name} 准备开球。联机对战中由主机同步球桌状态。`;
  }

  function resetSession(swapBreaker) {
    if (swapBreaker && isStandardMatchMode()) {
      state.breaker = 1 - state.breaker;
    }

    state.players = createPlayersForMode(state.mode);
    state.totalShots = 0;
    state.bestSpeed = 0;
    state.winner = null;
    state.phase = "aim";
    state.dragging = false;
    state.dragPointer = null;
    state.power = 0;
    state.pointer = {
      x: TABLE.playX + TABLE.playWidth * 0.23,
      y: TABLE.playY + TABLE.playHeight * 0.5,
    };
    state.placementPreview = null;
    state.shotContext = null;
    state.ai.pendingAt = null;
    state.challenge.cleared = 0;
    state.challenge.success = false;
    state.challenge.failed = false;
    state.challenge.maxShots = 18;
    state.tableOpen = true;
    state.breakShotPending = true;

    if (isStandardMatchMode()) {
      buildStandardRack();
      state.currentPlayer = state.breaker;
    } else if (isSoloSkillMode()) {
      applyDrillPreset(state.drillId);
      state.currentPlayer = 0;
      state.tableOpen = false;
      state.breakShotPending = false;
    } else if (isSoloBattleMode()) {
      buildStandardRack();
      state.currentPlayer = 0;
      state.tableOpen = false;
      state.breakShotPending = false;
    }

    state.players.forEach(function (player) {
      player.fouls = 0;
      if (!isSoloSkillMode()) {
        player.group = null;
      }
    });

    if (isSoloSkillMode()) {
      state.players[0].group = "drill";
      state.players[1].group = "drill";
    }

    state.aimAssist = computeAimAssist();
    setStatus(getModeResetStatus());
    updateDashboard();
    maybeBroadcastOnlineState(true);
  }

  function getLegalTargetNumbers(player, allowSetupPhase) {
    const phaseAllowed = allowSetupPhase
      ? state.phase === "aim" || state.phase === "ball-in-hand"
      : state.phase === "aim";

    if (!player || !phaseAllowed || state.winner !== null || !state.cueBall) {
      return [];
    }

    if (isSoloSkillMode()) {
      const preset = DRILL_PRESETS[state.drillId];
      const preferredTargets = preset.targets.filter(function (number) {
        const ball = findBall(number);
        return ball && ball.active;
      });
      if (preferredTargets.length) {
        return preferredTargets;
      }
      return getActiveObjectBalls().map(function (ball) {
        return ball.number;
      }).sort(function (a, b) {
        return a - b;
      });
    }

    if (isSoloBattleMode()) {
      if (countRemainingBattleBalls() === 0) {
        return findBall(8) && findBall(8).active ? [8] : [];
      }
      return getActiveObjectBalls()
        .filter(function (ball) {
          return ball.number !== 8;
        })
        .map(function (ball) {
          return ball.number;
        })
        .sort(function (a, b) {
          return a - b;
        });
    }

    const targetGroup = getLegalTargetGroup(player);
    return getActiveObjectBalls()
      .filter(function (ball) {
        const group = ballGroup(ball.number);
        if (targetGroup === "open") {
          return group === "solid" || group === "stripe";
        }
        return group === targetGroup;
      })
      .map(function (ball) {
        return ball.number;
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function distancePointToSegment(point, start, end) {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSq < 0.0001) {
      return distance(point, start);
    }

    const projection =
      ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSq;
    const t = clamp(projection, 0, 1);
    const closest = {
      x: start.x + segmentX * t,
      y: start.y + segmentY * t,
    };
    return distance(point, closest);
  }

  function hasClearPathToBall(targetBall) {
    const cue = state.cueBall;
    const start = { x: cue.x, y: cue.y };
    const end = { x: targetBall.x, y: targetBall.y };

    return getActiveObjectBalls().every(function (ball) {
      if (ball === targetBall) {
        return true;
      }
      return distancePointToSegment(ball, start, end) > BALL_RADIUS * 2 - 0.5;
    });
  }

  function isPathClear(start, end, ignoredNumbers) {
    const ignoredSet = new Set(ignoredNumbers || []);
    return getActiveObjectBalls().every(function (ball) {
      if (ignoredSet.has(ball.number)) {
        return true;
      }
      return distancePointToSegment(ball, start, end) > BALL_RADIUS * 2 - 0.5;
    });
  }

  function chooseRecommendedTargetBall(candidateNumbers, direction) {
    if (!candidateNumbers.length || !direction) {
      return null;
    }

    const candidates = candidateNumbers
      .map(function (number) {
        return findBall(number);
      })
      .filter(Boolean);

    const scored = candidates
      .map(function (ball) {
        const rel = {
          x: ball.x - state.cueBall.x,
          y: ball.y - state.cueBall.y,
        };
        const relLength = Math.hypot(rel.x, rel.y);
        if (relLength < 0.0001) {
          return null;
        }
        const facing = dot(direction, { x: rel.x / relLength, y: rel.y / relLength });
        return {
          ball,
          facing,
          distance: relLength,
          clear: hasClearPathToBall(ball),
        };
      })
      .filter(function (entry) {
        return entry && entry.facing > 0;
      })
      .sort(function (a, b) {
        if (a.clear !== b.clear) {
          return a.clear ? -1 : 1;
        }
        if (b.facing !== a.facing) {
          return b.facing - a.facing;
        }
        return a.distance - b.distance;
      });

    return scored.length ? scored[0].ball : null;
  }

  function findFirstBallOnRay(direction) {
    const cue = state.cueBall;
    const collisionRadius = BALL_RADIUS * 2;
    let bestHit = null;

    for (const ball of getActiveObjectBalls()) {
      const relX = ball.x - cue.x;
      const relY = ball.y - cue.y;
      const projection = relX * direction.x + relY * direction.y;

      if (projection <= 0) {
        continue;
      }

      const closestDistanceSq = relX * relX + relY * relY - projection * projection;
      if (closestDistanceSq > collisionRadius * collisionRadius) {
        continue;
      }

      const offset = Math.sqrt(collisionRadius * collisionRadius - closestDistanceSq);
      const travel = projection - offset;
      if (travel < 0) {
        continue;
      }

      if (!bestHit || travel < bestHit.travel) {
        const cueImpact = {
          x: cue.x + direction.x * travel,
          y: cue.y + direction.y * travel,
        };
        const normalVector = normalize({
          x: ball.x - cueImpact.x,
          y: ball.y - cueImpact.y,
        });
        if (!normalVector) {
          continue;
        }

        bestHit = {
          ball,
          travel,
          cueImpact,
          normal: { x: normalVector.x, y: normalVector.y },
          impactPoint: {
            x: cueImpact.x + normalVector.x * BALL_RADIUS,
            y: cueImpact.y + normalVector.y * BALL_RADIUS,
          },
        };
      }
    }

    return bestHit;
  }

  function buildShotPrediction(hit, direction, powerScale) {
    if (!hit) {
      return null;
    }

    const incomingDot = dot(direction, hit.normal);
    if (incomingDot <= 0) {
      return null;
    }

    const tangent = {
      x: direction.x - hit.normal.x * incomingDot,
      y: direction.y - hit.normal.y * incomingDot,
    };
    const tangentVector = normalize(tangent);
    const showSplit = !state.dragging || powerScale >= 0.12;
    const cueLength = 90 + 120 * powerScale;
    const objectLength = 120 + 130 * powerScale;

    return {
      ball: hit.ball,
      impactPoint: hit.impactPoint,
      cueToImpact: {
        from: { x: state.cueBall.x, y: state.cueBall.y },
        to: { x: hit.impactPoint.x, y: hit.impactPoint.y },
      },
      cueAfterImpact:
        showSplit && tangentVector
          ? {
              from: { x: hit.cueImpact.x, y: hit.cueImpact.y },
              to: {
                x: hit.cueImpact.x + tangentVector.x * cueLength,
                y: hit.cueImpact.y + tangentVector.y * cueLength,
              },
            }
          : null,
      objectAfterImpact:
        showSplit
          ? {
              from: { x: hit.ball.x, y: hit.ball.y },
              to: {
                x: hit.ball.x + hit.normal.x * objectLength,
                y: hit.ball.y + hit.normal.y * objectLength,
              },
            }
          : null,
    };
  }

  function computeAimAssist() {
    const assist = {
      candidateNumbers: [],
      recommendedNumber: null,
      prediction: null,
      hint: "",
    };

    if (state.phase !== "aim" || state.winner !== null || !state.cueBall || !state.cueBall.active) {
      return assist;
    }

    const player = currentPlayer();
    const candidateNumbers = getLegalTargetNumbers(player);
    assist.candidateNumbers = candidateNumbers;

    if (!candidateNumbers.length) {
      assist.hint = isSoloSkillMode()
        ? "当前预设球已经清完，按 N 切换到下一组技巧训练。"
        : "当前阶段没有可显示的合法首碰目标。";
      return assist;
    }

    const aim = getAimVector();
    if (!aim) {
      assist.hint = "移动鼠标或拖动球杆，查看合法首碰球和预测路线。";
      return assist;
    }

    const direction = {
      x: aim.dx / aim.length,
      y: aim.dy / aim.length,
    };
    const recommendedBall = chooseRecommendedTargetBall(candidateNumbers, direction);
    assist.recommendedNumber = recommendedBall ? recommendedBall.number : null;

    const firstHit = findFirstBallOnRay(direction);
    if (!firstHit) {
      assist.hint = "当前瞄准线上没有任何目标球。";
      return assist;
    }

    if (!candidateNumbers.includes(firstHit.ball.number)) {
      assist.hint = `当前瞄准线会先碰到 ${getBallNumberText(firstHit.ball.number)}，不属于合法首碰。`;
      return assist;
    }

    const powerScale = state.dragging ? clamp(aim.length / MAX_PULL, 0, 1) : 0.8;
    assist.prediction = buildShotPrediction(firstHit, direction, powerScale);
    if (assist.prediction) {
      assist.recommendedNumber = firstHit.ball.number;
      assist.hint = `当前瞄准线可先碰 ${getBallNumberText(firstHit.ball.number)}，已显示首碰分离路径。`;
    }

    return assist;
  }

  function getFastestBallSpeed() {
    return state.balls.reduce(function (best, ball) {
      if (!ball.active) {
        return best;
      }
      return Math.max(best, Math.hypot(ball.vx, ball.vy));
    }, 0);
  }

  function areAllBallsStopped() {
    return state.balls.every(function (ball) {
      if (!ball.active) {
        return true;
      }
      return Math.hypot(ball.vx, ball.vy) <= BALL_STOP_SPEED;
    });
  }

  function isLegalFirstContact(number, player, targetGroup) {
    const group = ballGroup(number);
    if (targetGroup === "open") {
      return group === "solid" || group === "stripe";
    }
    if (targetGroup === "battle") {
      return number !== 8;
    }
    if (targetGroup === "drill") {
      return true;
    }
    return group === targetGroup;
  }

  function beginShot(direction) {
    const player = currentPlayer();
    state.shotContext = {
      playerIndex: state.currentPlayer,
      legalTarget: getLegalTargetGroup(player),
      breakShot: state.breakShotPending,
      firstContactNumber: null,
      railAfterContact: false,
      pocketedNumbers: [],
      scratched: false,
      spinKey: state.spinKey,
      spin: clone(currentSpin()),
      initialDirection: direction,
      postContactSpinApplied: false,
    };
    state.phase = "animating";
  }

  function applyPostContactSpin() {
    if (!state.shotContext || state.shotContext.postContactSpinApplied || !state.cueBall.active) {
      return;
    }
    state.shotContext.postContactSpinApplied = true;

    const direction = state.shotContext.initialDirection;
    const spin = state.shotContext.spin;
    if (spin.y !== 0) {
      state.cueBall.vx += direction.x * spin.y * 110;
      state.cueBall.vy += direction.y * spin.y * 110;
    }
    if (spin.x !== 0) {
      const side = { x: -direction.y, y: direction.x };
      state.cueBall.vx += side.x * spin.x * 70;
      state.cueBall.vy += side.y * spin.x * 70;
    }
  }

  function pocketBall(ball) {
    ball.active = false;
    ball.vx = 0;
    ball.vy = 0;

    if (!state.shotContext) {
      return;
    }

    if (ball.isCue) {
      state.shotContext.scratched = true;
      return;
    }

    state.shotContext.pocketedNumbers.push(ball.number);
  }

  function resolvePockets(ball) {
    for (const pocket of pockets) {
      if (distance(ball, pocket) <= pocket.radius) {
        pocketBall(ball);
        return true;
      }
    }
    return false;
  }

  function markRailContact() {
    if (state.shotContext && state.shotContext.firstContactNumber !== null) {
      state.shotContext.railAfterContact = true;
    }
  }

  function resolveRails(ball) {
    let hitVerticalRail = false;
    let hitHorizontalRail = false;

    if (ball.x - ball.radius < TABLE.playX) {
      ball.x = TABLE.playX + ball.radius;
      ball.vx *= -RESTITUTION;
      hitVerticalRail = true;
    } else if (ball.x + ball.radius > TABLE.playRight) {
      ball.x = TABLE.playRight - ball.radius;
      ball.vx *= -RESTITUTION;
      hitVerticalRail = true;
    }

    if (ball.y - ball.radius < TABLE.playY) {
      ball.y = TABLE.playY + ball.radius;
      ball.vy *= -RESTITUTION;
      hitHorizontalRail = true;
    } else if (ball.y + ball.radius > TABLE.playBottom) {
      ball.y = TABLE.playBottom - ball.radius;
      ball.vy *= -RESTITUTION;
      hitHorizontalRail = true;
    }

    if ((hitVerticalRail || hitHorizontalRail) && ball.isCue && state.shotContext) {
      const spin = state.shotContext.spin;
      if (spin.x !== 0) {
        if (hitVerticalRail) {
          ball.vy += spin.x * 42;
        }
        if (hitHorizontalRail) {
          ball.vx -= spin.x * 42;
        }
      }
    }

    if (hitVerticalRail || hitHorizontalRail) {
      markRailContact();
    }
  }

  function maybeRecordFirstContact(a, b) {
    if (!state.shotContext || state.shotContext.firstContactNumber !== null) {
      return false;
    }
    if (a.isCue && !b.isCue) {
      state.shotContext.firstContactNumber = b.number;
      return true;
    }
    if (b.isCue && !a.isCue) {
      state.shotContext.firstContactNumber = a.number;
      return true;
    }
    return false;
  }

  function resolveBallCollisions() {
    for (let i = 0; i < state.balls.length; i += 1) {
      const a = state.balls[i];
      if (!a.active) {
        continue;
      }

      for (let j = i + 1; j < state.balls.length; j += 1) {
        const b = state.balls[j];
        if (!b.active) {
          continue;
        }

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist === 0 || dist >= minDist) {
          continue;
        }

        const firstContactRecorded = maybeRecordFirstContact(a, b);

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const correction = overlap / 2;
        a.x -= nx * correction;
        a.y -= ny * correction;
        b.x += nx * correction;
        b.y += ny * correction;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const speedAlongNormal = rvx * nx + rvy * ny;

        if (speedAlongNormal > 0) {
          continue;
        }

        const impulse = -(1 + RESTITUTION) * speedAlongNormal / 2;
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        a.vx -= impulseX;
        a.vy -= impulseY;
        b.vx += impulseX;
        b.vy += impulseY;

        if (firstContactRecorded) {
          applyPostContactSpin();
        }
      }
    }
  }

  function updatePhysics(dt) {
    const damping = Math.pow(FRICTION_BASE, dt * 120);

    for (const ball of state.balls) {
      if (!ball.active) {
        continue;
      }

      if (ball.isCue && state.shotContext && state.shotContext.firstContactNumber === null) {
        const spin = state.shotContext.spin;
        const direction = state.shotContext.initialDirection;
        const speed = Math.hypot(ball.vx, ball.vy);
        if (spin.x !== 0) {
          const side = { x: -direction.y, y: direction.x };
          ball.vx += side.x * spin.x * speed * 0.0018;
          ball.vy += side.y * spin.x * speed * 0.0018;
        }
        if (spin.y !== 0) {
          ball.vx += direction.x * spin.y * speed * 0.001;
          ball.vy += direction.y * spin.y * speed * 0.001;
        }
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.vx *= damping;
      ball.vy *= damping;

      if (resolvePockets(ball)) {
        continue;
      }

      resolveRails(ball);

      if (Math.hypot(ball.vx, ball.vy) < BALL_STOP_SPEED) {
        ball.vx = 0;
        ball.vy = 0;
      }
    }

    resolveBallCollisions();
  }

  function assignGroupsFromBall(number) {
    const group = ballGroup(number);
    if (group !== "solid" && group !== "stripe") {
      return null;
    }

    const player = currentPlayer();
    const opponent = otherPlayer();
    player.group = group;
    opponent.group = oppositeGroup(group);
    state.tableOpen = false;
    return group;
  }

  function evaluateStandardMatchShot() {
    const shot = state.shotContext;
    const shooter = state.players[shot.playerIndex];
    const opponent = state.players[1 - shot.playerIndex];
    const notes = [];
    let foul = false;

    if (!shot.firstContactNumber) {
      foul = true;
      notes.push("白球没有先碰到任何目标球");
    } else if (!isLegalFirstContact(shot.firstContactNumber, shooter, shot.legalTarget)) {
      foul = true;
      notes.push("先碰到了不属于本回合目标的球");
    }

    if (!shot.railAfterContact && shot.pocketedNumbers.length === 0) {
      foul = true;
      notes.push("碰撞后没有进球，也没有球碰库");
    }

    if (shot.scratched) {
      foul = true;
      notes.push("白球落袋");
    }

    if (shot.breakShot && shot.pocketedNumbers.includes(8)) {
      respotBall(8, TABLE.playX + TABLE.playWidth * 0.73, TABLE.playY + TABLE.playHeight * 0.5);
      notes.push("开球阶段 8 号球落袋，已重摆 8 号球");
    }

    if (!foul && !shot.breakShot && state.tableOpen) {
      const firstAssignable = shot.pocketedNumbers.find(function (number) {
        const group = ballGroup(number);
        return group === "solid" || group === "stripe";
      });
      if (firstAssignable !== undefined) {
        const assignedGroup = assignGroupsFromBall(firstAssignable);
        if (assignedGroup) {
          notes.push(`${shooter.name} 获得${groupLabel(assignedGroup)}`);
        }
      }
    }

    const shooterGroup = shooter.group;
    const opponentGroup = opponent.group;
    const ownPocketed = shooterGroup
      ? shot.pocketedNumbers.filter(function (number) {
          return ballGroup(number) === shooterGroup;
        }).length
      : 0;
    const opponentPocketed = opponentGroup
      ? shot.pocketedNumbers.filter(function (number) {
          return ballGroup(number) === opponentGroup;
        }).length
      : 0;
    const pottedAnyRackBall = shot.pocketedNumbers.some(function (number) {
      const group = ballGroup(number);
      return group === "solid" || group === "stripe";
    });

    state.breakShotPending = false;

    if (shot.pocketedNumbers.includes(8) && !shot.breakShot) {
      if (shot.legalTarget !== "eight" || foul) {
        state.winner = opponent.id;
        state.phase = "game-over";
        setStatus(`${shooter.name} 提前或犯规打进 8 号球，${opponent.name} 获胜。`);
        return;
      }

      state.winner = shooter.id;
      state.phase = "game-over";
      setStatus(`${shooter.name} 合法打进 8 号球，赢下本局。`);
      return;
    }

    if (foul) {
      shooter.fouls += 1;
      state.currentPlayer = opponent.id;
      enterBallInHand();
      setStatus(`${shooter.name} 犯规：${notes.join("，")}。${opponent.name} 获得自由球。`);
      return;
    }

    let keepTurn = false;
    if (shot.breakShot) {
      keepTurn = pottedAnyRackBall;
      notes.push(keepTurn ? "开球有进球，继续出杆" : "开球未进球，回合交换");
    } else if (state.tableOpen) {
      keepTurn = pottedAnyRackBall;
      notes.push(keepTurn ? "开放球台合法进球，继续出杆" : "开放球台未进球，回合交换");
    } else {
      keepTurn = ownPocketed > 0;
      if (ownPocketed > 0) {
        notes.push(`打进 ${ownPocketed} 颗本组球，继续出杆`);
      } else if (opponentPocketed > 0) {
        notes.push("只打进了对手的球，回合交换");
      } else {
        notes.push("未打进本组球，回合交换");
      }
    }

    if (keepTurn) {
      state.phase = "aim";
      setStatus(`${notes.join("，")}。仍由 ${shooter.name} 出杆。`);
      return;
    }

    state.currentPlayer = opponent.id;
    state.phase = "aim";
    setStatus(`${notes.join("，")}。轮到 ${opponent.name}。`);
  }

  function evaluateSoloSkillShot() {
    const shot = state.shotContext;
    const drill = DRILL_PRESETS[state.drillId];
    const targetCount = drill.targets.filter(function (number) {
      const ball = findBall(number);
      return !ball || !ball.active;
    }).length;

    if (shot.scratched) {
      enterBallInHand();
      setStatus("白球落袋。你获得自由球，可以继续当前技巧练习。");
      return;
    }

    if (targetCount === drill.targets.length) {
      state.phase = "game-over";
      state.winner = 0;
      setStatus(`已完成 ${drill.name}。按 N 切换到下一组技巧练习，或按 R 重做这一组。`);
      return;
    }

    state.phase = "aim";
    if (shot.pocketedNumbers.length > 0) {
      setStatus(`已打进 ${shot.pocketedNumbers.length} 颗球。${drill.hint}`);
    } else {
      setStatus(drill.hint);
    }
  }

  function evaluateSoloBattleShot() {
    const shot = state.shotContext;
    const notes = [];
    let foul = false;

    if (!shot.firstContactNumber) {
      foul = true;
      notes.push("白球没有碰到目标球");
    } else if (!isLegalFirstContact(shot.firstContactNumber, currentPlayer(), shot.legalTarget)) {
      foul = true;
      notes.push("先碰到非法目标球");
    }

    if (!shot.railAfterContact && shot.pocketedNumbers.length === 0) {
      foul = true;
      notes.push("碰撞后没有进球，也没有球碰库");
    }

    if (shot.scratched) {
      foul = true;
      notes.push("白球落袋");
    }

    state.challenge.cleared = state.balls.filter(function (ball) {
      return !ball.active && !ball.isCue;
    }).length;

    if (shot.pocketedNumbers.includes(8) && countRemainingBattleBalls() > 0) {
      foul = true;
      state.challenge.failed = true;
      state.phase = "game-over";
      setStatus("提前打进 8 号球，单人实战训练失败。按 R 重试。");
      return;
    }

    if (countRemainingBattleBalls() === 0 && shot.pocketedNumbers.includes(8) && !foul) {
      state.challenge.success = true;
      state.winner = 0;
      state.phase = "game-over";
      setStatus(`实战训练完成。你用了 ${state.totalShots} 杆清台成功。`);
      return;
    }

    if (state.totalShots >= state.challenge.maxShots && !state.challenge.success) {
      state.challenge.failed = true;
      state.phase = "game-over";
      setStatus("已达到杆数上限，单人实战训练结束。按 R 重试。");
      return;
    }

    if (foul) {
      state.players[0].fouls += 1;
      enterBallInHand();
      setStatus(`训练判定：${notes.join("，")}。你获得自由球，继续挑战。`);
      return;
    }

    state.phase = "aim";
    if (shot.pocketedNumbers.length > 0) {
      setStatus(`这一杆打进 ${shot.pocketedNumbers.length} 颗球。继续冲击清台。`);
    } else {
      setStatus(`当前还剩 ${Math.max(0, state.challenge.maxShots - state.totalShots)} 杆。继续寻找下一颗球。`);
    }
  }

  function finishShotIfNeeded() {
    if (state.phase !== "animating" || !areAllBallsStopped()) {
      return;
    }

    if (isStandardMatchMode()) {
      evaluateStandardMatchShot();
    } else if (isSoloSkillMode()) {
      evaluateSoloSkillShot();
    } else if (isSoloBattleMode()) {
      evaluateSoloBattleShot();
    }

    state.shotContext = null;
    maybeBroadcastOnlineState(true);
  }

  function getAimVector() {
    if (!state.cueBall.active || state.phase !== "aim") {
      return null;
    }

    const target = state.dragging && state.dragPointer ? state.dragPointer : state.pointer;
    if (!target) {
      return null;
    }

    const dx = state.cueBall.x - target.x;
    const dy = state.cueBall.y - target.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) {
      return null;
    }
    return { dx, dy, length };
  }

  function updatePowerFromPointer() {
    if (!state.dragging || !state.dragPointer || !state.cueBall.active) {
      state.power = 0;
      return;
    }

    const dx = state.cueBall.x - state.dragPointer.x;
    const dy = state.cueBall.y - state.dragPointer.y;
    state.power = clamp(Math.hypot(dx, dy) / MAX_PULL, 0, 1);
  }

  function executeShot(pointer, spinKeyOverride, actorPlayerIndex) {
    if (!state.cueBall.active || state.phase !== "aim" || state.winner !== null) {
      return;
    }

    if (
      state.mode === "online" &&
      state.online.connected &&
      actorPlayerIndex !== undefined &&
      !canPlayerIndexControlCurrentTurn(actorPlayerIndex)
    ) {
      return;
    }

    const spinKey = spinKeyOverride || state.spinKey;
    const previousSpin = state.spinKey;
    if (spinKey !== previousSpin) {
      setSpin(spinKey);
    }

    const cueBall = state.cueBall;
    const dx = cueBall.x - pointer.x;
    const dy = cueBall.y - pointer.y;
    const pullDistance = Math.hypot(dx, dy);

    if (pullDistance < 8) {
      state.power = 0;
      return;
    }

    const direction = {
      x: dx / pullDistance,
      y: dy / pullDistance,
    };
    beginShot(direction);

    const clampedDistance = Math.min(pullDistance, MAX_PULL);
    const speed = (clampedDistance / MAX_PULL) * MAX_SHOT_SPEED;
    cueBall.vx = direction.x * speed;
    cueBall.vy = direction.y * speed;
    state.totalShots += 1;
    state.power = 0;
    state.ai.pendingAt = null;
    setStatus(`${currentPlayer().name} 已出杆，等待本轮球体停止。`);
    maybeBroadcastOnlineState(true);
  }

  function submitShot(pointer) {
    if (!canLocalUserControlCurrentTurn()) {
      setStatus("现在不是你的回合，不能替对方出杆。");
      return;
    }

    if (state.mode === "online" && state.online.connected && !state.online.isHost) {
      sendOnlineMessage({
        type: "relay_action",
        roomCode: state.online.roomCode,
        action: {
          kind: "shoot",
          pointer,
          spinKey: state.spinKey,
        },
      });
      setStatus("出杆指令已发送给主机，等待联机球桌同步。");
      return;
    }

    executeShot(pointer, state.spinKey, getLocalPlayerIndex());
  }

  function submitPlacement(point) {
    if (!canLocalUserControlCurrentTurn()) {
      setStatus("现在不是你的回合，不能替对方摆自由球。");
      return;
    }

    if (state.mode === "online" && state.online.connected && !state.online.isHost) {
      sendOnlineMessage({
        type: "relay_action",
        roomCode: state.online.roomCode,
        action: {
          kind: "place",
          point,
        },
      });
      setStatus("摆球指令已发送给主机。");
      return;
    }

    applyCuePlacement(point, getLocalPlayerIndex());
  }

  function getSnapshot() {
    return {
      mode: state.mode,
      drillId: state.drillId,
      aiDifficulty: state.aiDifficulty,
      spinKey: state.spinKey,
      currentPlayer: state.currentPlayer,
      breaker: state.breaker,
      totalShots: state.totalShots,
      bestSpeed: state.bestSpeed,
      tableOpen: state.tableOpen,
      breakShotPending: state.breakShotPending,
      phase: state.phase,
      power: state.power,
      winner: state.winner,
      players: clone(state.players),
      challenge: clone(state.challenge),
      placementPreview: state.placementPreview ? clone(state.placementPreview) : null,
      shotContext: state.shotContext ? clone({
        playerIndex: state.shotContext.playerIndex,
        legalTarget: state.shotContext.legalTarget,
        breakShot: state.shotContext.breakShot,
        firstContactNumber: state.shotContext.firstContactNumber,
        railAfterContact: state.shotContext.railAfterContact,
        pocketedNumbers: state.shotContext.pocketedNumbers,
        scratched: state.shotContext.scratched,
        spinKey: state.shotContext.spinKey,
        spin: state.shotContext.spin,
        initialDirection: state.shotContext.initialDirection,
        postContactSpinApplied: state.shotContext.postContactSpinApplied,
      }) : null,
      balls: state.balls.map(function (ball) {
        return {
          number: ball.number,
          x: ball.x,
          y: ball.y,
          vx: ball.vx,
          vy: ball.vy,
          active: ball.active,
        };
      }),
    };
  }

  function applySnapshot(snapshot) {
    state.online.applyingSnapshot = true;
    state.mode = snapshot.mode;
    elements.modeSelect.value = snapshot.mode;
    state.drillId = snapshot.drillId;
    elements.drillSelect.value = snapshot.drillId;
    state.aiDifficulty = snapshot.aiDifficulty;
    elements.aiDifficultySelect.value = snapshot.aiDifficulty;
    setSpin(snapshot.spinKey || "neutral");
    state.currentPlayer = snapshot.currentPlayer;
    state.breaker = snapshot.breaker;
    state.totalShots = snapshot.totalShots;
    state.bestSpeed = snapshot.bestSpeed;
    state.tableOpen = snapshot.tableOpen;
    state.breakShotPending = snapshot.breakShotPending;
    state.phase = snapshot.phase;
    state.power = snapshot.power;
    state.winner = snapshot.winner;
    state.players = clone(snapshot.players);
    state.challenge = clone(snapshot.challenge);
    state.placementPreview = snapshot.placementPreview ? clone(snapshot.placementPreview) : null;
    state.shotContext = snapshot.shotContext ? clone(snapshot.shotContext) : null;

    snapshot.balls.forEach(function (ballSnapshot) {
      const ball = findBall(ballSnapshot.number);
      if (ball) {
        ball.x = ballSnapshot.x;
        ball.y = ballSnapshot.y;
        ball.vx = ballSnapshot.vx;
        ball.vy = ballSnapshot.vy;
        ball.active = ballSnapshot.active;
      }
    });

    state.cueBall = findBall(0);
    state.aimAssist = computeAimAssist();
    updateDashboard();
    state.online.applyingSnapshot = false;
  }

  function maybeBroadcastOnlineState(force) {
    if (
      state.mode !== "online" ||
      !state.online.connected ||
      !state.online.isHost ||
      state.online.applyingSnapshot ||
      !state.online.roomCode
    ) {
      return;
    }

    const now = performance.now();
    if (!force && now - state.online.lastBroadcastAt < ONLINE_BROADCAST_MS) {
      return;
    }

    state.online.lastBroadcastAt = now;
    sendOnlineMessage({
      type: "host_snapshot",
      roomCode: state.online.roomCode,
      snapshot: getSnapshot(),
    });
  }

  function sendOnlineMessage(payload) {
    if (!state.online.socket || state.online.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    state.online.socket.send(JSON.stringify(payload));
  }

  function handleOnlineAction(action) {
    if (!state.online.isHost) {
      return;
    }

    const remotePlayerIndex = 1 - getLocalPlayerIndex();
    if (!canPlayerIndexControlCurrentTurn(remotePlayerIndex)) {
      setStatus("已忽略非当前回合的联机动作。");
      return;
    }

    if (action.kind === "place" && state.phase === "ball-in-hand") {
      const point = clampPointToPlayArea(action.point);
      if (isPlacementValid(point, state.cueBall)) {
        applyCuePlacement(point, remotePlayerIndex);
      }
      return;
    }

    if (action.kind === "shoot" && state.phase === "aim") {
      executeShot(action.pointer, action.spinKey || "neutral", remotePlayerIndex);
    }
  }

  function handleSocketMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (error) {
      return;
    }

    if (data.type === "hello") {
      state.online.clientId = data.clientId;
      setOnlineStatus("服务器连接成功，可以创建或加入房间。");
      return;
    }

    if (data.type === "room_created") {
      state.online.roomCode = data.roomCode;
      state.online.playerIndex = 0;
      state.online.isHost = true;
      elements.roomCodeInput.value = data.roomCode;
      elements.modeSelect.value = "online";
      switchMode("online", false);
      setOnlineStatus(`房间 ${data.roomCode} 已创建。把房间号发给另一位玩家。`);
      resetSession(false);
      return;
    }

    if (data.type === "room_joined") {
      state.online.roomCode = data.roomCode;
      state.online.playerIndex = data.isHost ? 0 : 1;
      state.online.isHost = Boolean(data.isHost);
      elements.roomCodeInput.value = data.roomCode;
      elements.modeSelect.value = "online";
      switchMode("online", false);
      if (state.online.isHost) {
        setOnlineStatus(`玩家已加入房间 ${data.roomCode}，联机对局开始。`);
        resetSession(false);
      } else {
        setOnlineStatus(`已加入房间 ${data.roomCode}，等待主机同步球桌。`);
        buildStandardRack();
      }
      return;
    }

    if (data.type === "peer_joined") {
      setOnlineStatus(`房间 ${data.roomCode} 已满，双方都可以开始联机对战。`);
      resetSession(false);
      return;
    }

    if (data.type === "host_snapshot" && !state.online.isHost) {
      applySnapshot(data.snapshot);
      setOnlineStatus(`已连接房间 ${data.roomCode}，当前由 ${currentPlayer().name} 操作。`);
      return;
    }

    if (data.type === "relay_action" && state.online.isHost) {
      handleOnlineAction(data.action);
      return;
    }

    if (data.type === "peer_left") {
      setOnlineStatus("另一位玩家已离开房间。你可以等待重连，或重新创建房间。");
      return;
    }

    if (data.type === "error") {
      setOnlineStatus(`联机服务提示：${data.message}`);
    }
  }

  function connectOnlineServer() {
    const serverUrl = elements.serverUrlInput.value.trim();
    if (!serverUrl) {
      setOnlineStatus("请先输入服务器地址。");
      return;
    }

    if (state.online.socket && state.online.connected && state.online.serverUrl === serverUrl) {
      setOnlineStatus("当前已经连接到服务器。");
      return;
    }

    if (state.online.socket) {
      state.online.socket.close();
    }

    state.online.serverUrl = serverUrl;
    const socket = new WebSocket(serverUrl);
    state.online.socket = socket;
    setOnlineStatus("正在连接联机服务器...");

    socket.addEventListener("open", function () {
      state.online.connected = true;
      sendOnlineMessage({ type: "hello" });
    });

    socket.addEventListener("message", handleSocketMessage);

    socket.addEventListener("close", function () {
      state.online.connected = false;
      if (!state.online.roomCode) {
        setOnlineStatus("服务器连接已关闭。");
      } else {
        setOnlineStatus("联机连接已断开，请重新连接服务器。");
      }
    });

    socket.addEventListener("error", function () {
      setOnlineStatus("连接联机服务器失败，请确认本地房间服务已经启动。");
    });
  }

  function createOnlineRoom() {
    if (!state.online.connected) {
      setOnlineStatus("请先连接服务器，再创建房间。");
      return;
    }
    sendOnlineMessage({ type: "create_room" });
  }

  function joinOnlineRoom() {
    const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
      setOnlineStatus("请输入房间号后再加入。");
      return;
    }
    if (!state.online.connected) {
      setOnlineStatus("请先连接服务器，再加入房间。");
      return;
    }
    sendOnlineMessage({ type: "join_room", roomCode: roomCode });
  }

  function switchMode(nextMode, doReset) {
    state.mode = nextMode;
    state.players = createPlayersForMode(nextMode);
    elements.aiDifficultySelect.disabled = nextMode !== "ai-duel";
    elements.drillSelect.disabled = nextMode !== "solo-skill";
    const isOnline = nextMode === "online";
    elements.connectServerButton.disabled = false;
    elements.createRoomButton.disabled = false;
    elements.joinRoomButton.disabled = false;
    if (doReset !== false) {
      resetSession(false);
    } else {
      updateDashboard();
    }
  }

  function getBestAiShotPlan(allowPlacement) {
    const legalNumbers = getLegalTargetNumbers(currentPlayer(), allowPlacement);
    if (!legalNumbers.length) {
      return null;
    }

    let bestPlan = null;
    for (const number of legalNumbers) {
      const targetBall = findBall(number);
      if (!targetBall || !targetBall.active) {
        continue;
      }

      for (const pocket of pockets) {
        const ballToPocket = normalize({
          x: pocket.x - targetBall.x,
          y: pocket.y - targetBall.y,
        });
        if (!ballToPocket) {
          continue;
        }

        const ghost = {
          x: targetBall.x - ballToPocket.x * BALL_RADIUS * 2,
          y: targetBall.y - ballToPocket.y * BALL_RADIUS * 2,
        };
        if (!isInsidePlayArea(ghost, BALL_RADIUS)) {
          continue;
        }

        const placementPoint = allowPlacement
          ? findAvailableSpot(
              ghost.x - ballToPocket.x * 180,
              ghost.y - ballToPocket.y * 180,
              state.cueBall
            )
          : { x: state.cueBall.x, y: state.cueBall.y };

        const cuePathClear = isPathClear(placementPoint, ghost, [targetBall.number]);
        const objectPathClear = isPathClear(
          { x: targetBall.x, y: targetBall.y },
          { x: pocket.x, y: pocket.y },
          [targetBall.number]
        );

        const cueDistance = distance(placementPoint, ghost);
        const pocketDistance = distance(targetBall, pocket);
        const score =
          cueDistance * 0.72 +
          pocketDistance * 0.46 +
          (cuePathClear ? 0 : 280) +
          (objectPathClear ? 0 : 240);

        if (!bestPlan || score < bestPlan.score) {
          bestPlan = {
            targetBall,
            pocket,
            ghost,
            placementPoint,
            cuePathClear,
            objectPathClear,
            score,
          };
        }
      }
    }

    return bestPlan;
  }

  function performAiTurn() {
    if (state.mode !== "ai-duel" || currentPlayer().isAI !== true || state.winner !== null) {
      return;
    }

    const difficulty = AI_DIFFICULTY[state.aiDifficulty];
    let plan = getBestAiShotPlan(state.phase === "ball-in-hand");
    if (!plan) {
      return;
    }

    if (state.phase === "ball-in-hand") {
      applyCuePlacement(plan.placementPoint);
      plan = getBestAiShotPlan(false);
    }

    if (state.phase !== "aim" || !plan) {
      return;
    }

    const cueBall = state.cueBall;
    const rawDirection = normalize({
      x: plan.ghost.x - cueBall.x,
      y: plan.ghost.y - cueBall.y,
    });
    if (!rawDirection) {
      return;
    }

    const errorAngle = (Math.random() - 0.5) * difficulty.error;
    const cos = Math.cos(errorAngle);
    const sin = Math.sin(errorAngle);
    const direction = {
      x: rawDirection.x * cos - rawDirection.y * sin,
      y: rawDirection.x * sin + rawDirection.y * cos,
    };

    const pull = clamp(
      distance(cueBall, plan.ghost) * difficulty.powerBias + distance(plan.targetBall, plan.pocket) * 0.18,
      95,
      178
    );
    const pointer = {
      x: cueBall.x - direction.x * pull,
      y: cueBall.y - direction.y * pull,
    };
    const spinKey = plan.objectPathClear && Math.random() < 0.25 ? "up" : "neutral";
    executeShot(pointer, spinKey);
  }

  function tickAi(timestamp) {
    if (
      state.mode !== "ai-duel" ||
      currentPlayer().isAI !== true ||
      state.winner !== null ||
      state.online.connected
    ) {
      state.ai.pendingAt = null;
      return;
    }

    if (!areAllBallsStopped()) {
      return;
    }

    if (state.phase !== "aim" && state.phase !== "ball-in-hand") {
      return;
    }

    if (state.ai.pendingAt === null) {
      state.ai.pendingAt = timestamp + AI_DIFFICULTY[state.aiDifficulty].thinkMs;
      setStatus("AI 正在观察球型并计算路线...");
      return;
    }

    if (timestamp >= state.ai.pendingAt) {
      state.ai.pendingAt = null;
      performAiTurn();
    }
  }

  function updateDashboard() {
    elements.currentPlayerValue.textContent = currentPlayer() ? currentPlayer().name : "—";
    elements.shotsValue.textContent = String(state.totalShots);
    elements.tableValue.textContent = getTableStatusLabel();
    elements.speedValue.textContent = String(Math.round(state.bestSpeed));

    const powerPercent = Math.round(state.power * 100);
    elements.powerValue.textContent = `${powerPercent}%`;
    elements.powerFill.style.width = `${powerPercent}%`;

    const assist = state.aimAssist;
    if (state.phase === "aim") {
      elements.targetCandidatesValue.textContent = assist.candidateNumbers.length
        ? assist.candidateNumbers.join(" / ")
        : "—";

      if (assist.candidateNumbers.length === 1 && assist.candidateNumbers[0] === 8) {
        elements.targetRecommendationValue.textContent = "必须先碰 8 号球";
      } else if (assist.recommendedNumber !== null) {
        elements.targetRecommendationValue.textContent = `建议先碰 ${assist.recommendedNumber} 号球`;
      } else {
        elements.targetRecommendationValue.textContent = "沿合法球方向瞄准后显示";
      }

      elements.targetHintValue.textContent =
        assist.hint || "瞄准合法首碰球时，会显示白球与目标球的预测分离路线。";
    } else if (state.phase === "ball-in-hand") {
      elements.targetCandidatesValue.textContent = "—";
      elements.targetRecommendationValue.textContent = "先摆放白球";
      elements.targetHintValue.textContent = "自由球阶段不显示首碰预测，摆好白球后会恢复目标提示。";
    } else if (state.phase === "animating") {
      elements.targetCandidatesValue.textContent = "—";
      elements.targetRecommendationValue.textContent = "本杆进行中";
      elements.targetHintValue.textContent = "球体停止后，会重新计算合法首碰球与预测路径。";
    } else {
      elements.targetCandidatesValue.textContent = "—";
      elements.targetRecommendationValue.textContent = "本轮结束";
      elements.targetHintValue.textContent = isSoloSkillMode()
        ? "按 N 切换下一组训练，或按 R 重置当前训练。"
        : "按 N 开启下一局或下一轮。";
    }

    elements.playerEntries.forEach(function (entry, index) {
      const player = state.players[index];
      entry.card.classList.toggle("active", index === state.currentPlayer && state.phase !== "game-over");
      entry.card.classList.toggle("winner", state.phase === "game-over" && state.winner === index);
      entry.title.textContent = player ? player.name : "—";
      entry.badge.textContent = getPlayerBadge(index);
      entry.group.textContent = player && player.group ? groupLabel(player.group) : "待定";
      entry.target.textContent = player ? getPlayerTargetText(player, index) : "—";
      entry.fouls.textContent = player ? String(player.fouls) : "0";
    });

    elements.onlineStatusValue.textContent = state.online.status;
  }

  function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGradient.addColorStop(0, "#102018");
    bgGradient.addColorStop(1, "#08130f");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    roundRectPath(ctx, TABLE.x - 18, TABLE.y - 18, TABLE.width + 36, TABLE.height + 36, 44);
    const frameGradient = ctx.createLinearGradient(TABLE.x, TABLE.y, TABLE.x + TABLE.width, TABLE.y + TABLE.height);
    frameGradient.addColorStop(0, "#59371c");
    frameGradient.addColorStop(0.5, "#7d5128");
    frameGradient.addColorStop(1, "#3f2410");
    ctx.fillStyle = frameGradient;
    ctx.fill();

    roundRectPath(ctx, TABLE.x, TABLE.y, TABLE.width, TABLE.height, 36);
    ctx.fillStyle = "#4a2f18";
    ctx.fill();

    roundRectPath(ctx, TABLE.playX, TABLE.playY, TABLE.playWidth, TABLE.playHeight, 28);
    const felt = ctx.createLinearGradient(TABLE.playX, TABLE.playY, TABLE.playRight, TABLE.playBottom);
    felt.addColorStop(0, "#24724f");
    felt.addColorStop(0.5, "#16563b");
    felt.addColorStop(1, "#13402d");
    ctx.fillStyle = felt;
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let x = TABLE.playX + 30; x < TABLE.playRight; x += 42) {
      ctx.fillStyle = x % 84 === 0 ? "#ffffff" : "#d8d8d8";
      ctx.fillRect(x, TABLE.playY, 1, TABLE.playHeight);
    }
    ctx.restore();

    for (const pocket of pockets) {
      const holeGlow = ctx.createRadialGradient(pocket.x, pocket.y, 2, pocket.x, pocket.y, pocket.radius * 1.8);
      holeGlow.addColorStop(0, "rgba(0, 0, 0, 0.95)");
      holeGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = holeGlow;
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocket.radius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#020202";
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocket.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const diamondPositions = [
      [TABLE.playX + TABLE.playWidth * 0.25, TABLE.y + 10],
      [TABLE.playX + TABLE.playWidth * 0.5, TABLE.y + 10],
      [TABLE.playX + TABLE.playWidth * 0.75, TABLE.y + 10],
      [TABLE.playX + TABLE.playWidth * 0.25, TABLE.y + TABLE.height - 10],
      [TABLE.playX + TABLE.playWidth * 0.5, TABLE.y + TABLE.height - 10],
      [TABLE.playX + TABLE.playWidth * 0.75, TABLE.y + TABLE.height - 10],
      [TABLE.x + 10, TABLE.playY + TABLE.playHeight * 0.25],
      [TABLE.x + 10, TABLE.playY + TABLE.playHeight * 0.5],
      [TABLE.x + 10, TABLE.playY + TABLE.playHeight * 0.75],
      [TABLE.x + TABLE.width - 10, TABLE.playY + TABLE.playHeight * 0.25],
      [TABLE.x + TABLE.width - 10, TABLE.playY + TABLE.playHeight * 0.5],
      [TABLE.x + TABLE.width - 10, TABLE.playY + TABLE.playHeight * 0.75],
    ];

    ctx.fillStyle = "#ead7a5";
    for (const position of diamondPositions) {
      ctx.save();
      ctx.translate(position[0], position[1]);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
  }

  function drawBall(ball, alpha) {
    const radius = ball.radius;
    const opacity = alpha === undefined ? 1 : alpha;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(ball.x, ball.y);

    ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.isCue ? "#f9f7f0" : ball.color;
    ctx.fill();

    if (ball.stripe) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#fcfaf6";
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.fillStyle = ball.color;
      ctx.fillRect(-radius, -radius * 0.45, radius * 2, radius * 0.9);
      ctx.restore();
    }

    const gloss = ctx.createRadialGradient(-4, -6, 1, 0, 0, radius);
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gloss.addColorStop(0.22, "rgba(255, 255, 255, 0.22)");
    gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    if (!ball.isCue) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.48, 0, Math.PI * 2);
      ctx.fillStyle = "#fffaf1";
      ctx.fill();

      ctx.fillStyle = "#121212";
      ctx.font = "bold 11px 'Noto Sans SC', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(ball.number), 0, 0.5);
    }

    ctx.restore();
  }

  function drawCueBallPreview() {
    if (state.phase !== "ball-in-hand" || !state.placementPreview) {
      return;
    }

    const previewBall = {
      number: 0,
      x: state.placementPreview.x,
      y: state.placementPreview.y,
      radius: BALL_RADIUS,
      isCue: true,
      stripe: false,
      color: "#f7f3eb",
    };

    drawBall(previewBall, state.placementPreview.valid ? 0.82 : 0.35);

    ctx.save();
    ctx.strokeStyle = state.placementPreview.valid ? "rgba(162, 255, 194, 0.9)" : "rgba(255, 106, 106, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(state.placementPreview.x, state.placementPreview.y, BALL_RADIUS + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawAimGuide() {
    if (state.phase !== "aim" || !state.cueBall.active || state.winner !== null) {
      return;
    }

    const aim = getAimVector();
    if (!aim) {
      return;
    }

    const assist = state.aimAssist;
    const prediction = assist.prediction;
    const nx = aim.dx / aim.length;
    const ny = aim.dy / aim.length;
    const guideLength = prediction ? Math.max(170, distance(state.cueBall, prediction.impactPoint)) : 170;

    ctx.save();
    ctx.strokeStyle = state.dragging ? "rgba(245, 219, 163, 0.9)" : "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = state.dragging ? 3 : 2;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(state.cueBall.x, state.cueBall.y);
    ctx.lineTo(state.cueBall.x + nx * guideLength, state.cueBall.y + ny * guideLength);
    ctx.stroke();

    if (prediction) {
      ctx.setLineDash([]);
      ctx.lineCap = "round";

      ctx.strokeStyle = "rgba(255, 241, 188, 0.95)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(prediction.cueToImpact.from.x, prediction.cueToImpact.from.y);
      ctx.lineTo(prediction.cueToImpact.to.x, prediction.cueToImpact.to.y);
      ctx.stroke();

      if (prediction.objectAfterImpact) {
        ctx.strokeStyle = prediction.ball.stripe ? "rgba(244, 203, 123, 0.95)" : "rgba(129, 214, 170, 0.95)";
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(prediction.objectAfterImpact.from.x, prediction.objectAfterImpact.from.y);
        ctx.lineTo(prediction.objectAfterImpact.to.x, prediction.objectAfterImpact.to.y);
        ctx.stroke();
      }

      if (prediction.cueAfterImpact) {
        ctx.strokeStyle = "rgba(245, 247, 251, 0.92)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 7]);
        ctx.beginPath();
        ctx.moveTo(prediction.cueAfterImpact.from.x, prediction.cueAfterImpact.from.y);
        ctx.lineTo(prediction.cueAfterImpact.to.x, prediction.cueAfterImpact.to.y);
        ctx.stroke();
      }
    }

    if (state.dragging) {
      const clampedLength = Math.min(aim.length, MAX_PULL);
      const cueBack = clampedLength + 24;
      const cueFront = cueBack + 170;

      ctx.setLineDash([]);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#d0a766";
      ctx.beginPath();
      ctx.moveTo(state.cueBall.x - nx * cueBack, state.cueBall.y - ny * cueBack);
      ctx.lineTo(state.cueBall.x - nx * cueFront, state.cueBall.y - ny * cueFront);
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#4b2b0f";
      ctx.beginPath();
      ctx.moveTo(state.cueBall.x - nx * (cueBack + 24), state.cueBall.y - ny * (cueBack + 24));
      ctx.lineTo(state.cueBall.x - nx * cueFront, state.cueBall.y - ny * cueFront);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPredictionMarkers() {
    if (state.phase !== "aim" || !state.aimAssist.prediction) {
      return;
    }

    const prediction = state.aimAssist.prediction;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 233, 164, 0.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(prediction.ball.x, prediction.ball.y, prediction.ball.radius + 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 245, 209, 0.96)";
    ctx.beginPath();
    ctx.arc(prediction.impactPoint.x, prediction.impactPoint.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(69, 42, 16, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(prediction.impactPoint.x, prediction.impactPoint.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay() {
    ctx.save();
    ctx.fillStyle = "rgba(247, 235, 205, 0.94)";
    ctx.font = "600 24px 'Cormorant Garamond', serif";
    ctx.textAlign = "left";
    ctx.fillText("Velvet Break", TABLE.x + 10, 44);
    ctx.font = "14px 'Noto Sans SC', sans-serif";
    ctx.fillStyle = "rgba(247, 235, 205, 0.72)";
    ctx.fillText(`${getModeLabel()} · ${getTableStatusLabel()}`, TABLE.x + 12, 68);

    if (state.phase === "ball-in-hand") {
      ctx.fillStyle = "rgba(6, 17, 13, 0.42)";
      ctx.fillRect(0, canvas.height - 78, canvas.width, 78);
      ctx.fillStyle = "#f7f4ec";
      ctx.font = "22px 'Noto Sans SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("自由球：先点击合法位置摆放白球，再进行瞄准。", canvas.width / 2, canvas.height - 30);
    }

    if (state.phase === "game-over") {
      ctx.fillStyle = "rgba(6, 17, 13, 0.62)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f2dfb6";
      ctx.font = "700 64px 'Cormorant Garamond', serif";
      ctx.textAlign = "center";
      ctx.fillText("Velvet Break", canvas.width / 2, canvas.height / 2 - 18);
      ctx.font = "24px 'Noto Sans SC', sans-serif";
      ctx.fillStyle = "#f7f4ec";
      ctx.fillText(elements.statusText.textContent, canvas.width / 2, canvas.height / 2 + 28);
    }

    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawAimGuide();

    for (const ball of state.balls) {
      if (ball.active) {
        drawBall(ball);
      }
    }

    drawCueBallPreview();
    drawPredictionMarkers();
    drawOverlay();
  }

  function frame(timestamp) {
    if (!state.lastTimestamp) {
      state.lastTimestamp = timestamp;
    }

    const elapsed = Math.min((timestamp - state.lastTimestamp) / 1000, 0.03);
    state.lastTimestamp = timestamp;
    state.accumulator += elapsed;

    while (state.accumulator >= FIXED_STEP) {
      if (state.phase === "animating") {
        updatePhysics(FIXED_STEP);
      }
      state.accumulator -= FIXED_STEP;
    }

    state.bestSpeed = Math.max(state.bestSpeed, getFastestBallSpeed());
    finishShotIfNeeded();
    tickAi(timestamp);
    state.aimAssist = computeAimAssist();
    updateDashboard();
    maybeBroadcastOnlineState(false);
    saveProgress(false);
    draw();
    requestAnimationFrame(frame);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const pointer = getPointerPosition(event);

    if (!canLocalUserControlCurrentTurn()) {
      return;
    }

    if (state.phase === "ball-in-hand") {
      updatePlacementPreview(pointer);
      if (state.placementPreview && state.placementPreview.valid) {
        submitPlacement({ x: state.placementPreview.x, y: state.placementPreview.y });
      } else {
        setStatus("这里不能摆放白球，请换一个不与其他球重叠的位置。");
      }
      updateDashboard();
      return;
    }

    if (state.phase !== "aim" || !areAllBallsStopped() || state.winner !== null || !state.cueBall.active) {
      return;
    }

    if (!isInsidePlayArea(pointer, 0)) {
      return;
    }

    state.dragging = true;
    state.dragPointer = pointer;
    state.pointer = pointer;
    canvas.setPointerCapture(event.pointerId);
    updatePowerFromPointer();
  }

  function handlePointerMove(event) {
    const pointer = getPointerPosition(event);
    state.pointer = pointer;

    if (state.phase === "ball-in-hand") {
      updatePlacementPreview(pointer);
      return;
    }

    if (!state.dragging) {
      return;
    }

    state.dragPointer = pointer;
    updatePowerFromPointer();
  }

  function handlePointerUp(event) {
    if (!state.dragging) {
      return;
    }

    state.dragging = false;
    state.dragPointer = getPointerPosition(event);
    submitShot(state.dragPointer);
    state.dragPointer = null;

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerCancel(event) {
    state.dragging = false;
    state.dragPointer = null;
    state.power = 0;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeydown(event) {
    if (event.code === "ArrowUp") {
      setSpin("up");
      return;
    }
    if (event.code === "ArrowDown") {
      setSpin("down");
      return;
    }
    if (event.code === "ArrowLeft") {
      setSpin("left");
      return;
    }
    if (event.code === "ArrowRight") {
      setSpin("right");
      return;
    }
    if (event.code === "Space") {
      setSpin("neutral");
      return;
    }
    if (event.code === "KeyR") {
      resetSession(false);
      return;
    }
    if (event.code === "KeyN") {
      if (isSoloSkillMode()) {
        const drillIds = Object.keys(DRILL_PRESETS);
        const index = drillIds.indexOf(state.drillId);
        state.drillId = drillIds[(index + 1) % drillIds.length];
        elements.drillSelect.value = state.drillId;
        resetSession(false);
      } else {
        resetSession(true);
      }
    }
  }

  function bindEvents() {
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeydown);

    elements.modeSelect.addEventListener("change", function () {
      switchMode(elements.modeSelect.value, true);
    });

    elements.aiDifficultySelect.addEventListener("change", function () {
      state.aiDifficulty = elements.aiDifficultySelect.value;
      if (state.mode === "ai-duel") {
        switchMode("ai-duel", true);
      }
    });

    elements.drillSelect.addEventListener("change", function () {
      state.drillId = elements.drillSelect.value;
      if (state.mode === "solo-skill") {
        resetSession(false);
      }
    });

    elements.spinButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        setSpin(button.dataset.spin);
      });
    });

    elements.restartRackButton.addEventListener("click", function () {
      resetSession(false);
    });

    elements.newRoundButton.addEventListener("click", function () {
      if (isSoloSkillMode()) {
        const drillIds = Object.keys(DRILL_PRESETS);
        const index = drillIds.indexOf(state.drillId);
        state.drillId = drillIds[(index + 1) % drillIds.length];
        elements.drillSelect.value = state.drillId;
        resetSession(false);
      } else {
        resetSession(true);
      }
    });

    elements.connectServerButton.addEventListener("click", connectOnlineServer);
    elements.createRoomButton.addEventListener("click", createOnlineRoom);
    elements.joinRoomButton.addEventListener("click", joinOnlineRoom);
  }

  bindEvents();
  bindPersistenceEvents();
  setSpin("neutral");
  if (!restoreProgress()) {
    switchMode("local-pvp", true);
  }
  requestAnimationFrame(frame);
})();
