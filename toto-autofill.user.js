// ==UserScript==
// @name         toto 入力サポート
// @namespace    toto-autofill-helper
// @version      0.3.0
// @description  totoの投票パターンをまとめて入力する補助ツール
// @author       Codex
// @match        https://store.toto-dream.com/dcs/subos/screen/ps01/spsl000/PGSPSL00001MoveSingleVoteSheet.form*
// @match        https://store.toto-dream.com/dcs/subos/screen/ps01/spsl000/PGSPSL00001MoveTotoLoto.form*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'codex-toto-autofill-panel';
  const STYLE_ID = 'codex-toto-autofill-style';
  const BADGE_ID = 'codex-toto-autofill-badge';
  const VALID_VALUES = new Set(['0', '1', '2']);
  const PICK_TO_OUTCOME_INDEX = {
    '1': '0',
    '0': '1',
    '2': '2',
  };
  const PAGE_SINGLE = 'single';
  const PAGE_MULTI = 'multi';

  const state = {
    observer: null,
    status: null,
  };

  function getPageMode() {
    const path = window.location.pathname;
    if (path.includes('PGSPSL00001MoveSingleVoteSheet.form')) {
      return PAGE_SINGLE;
    }
    if (path.includes('PGSPSL00001MoveTotoLoto.form')) {
      return PAGE_MULTI;
    }
    return null;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        width: 360px;
        background: rgba(17, 24, 39, 0.96);
        color: #f9fafb;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
        padding: 12px;
        font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID} * {
        box-sizing: border-box;
      }
      #${PANEL_ID} h2 {
        margin: 0 0 8px;
        font-size: 14px;
      }
      #${PANEL_ID} p {
        margin: 0 0 8px;
        color: #d1d5db;
        font-size: 12px;
      }
      #${PANEL_ID} textarea {
        width: 100%;
        min-height: 156px;
        resize: vertical;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
        font: inherit;
      }
      #${PANEL_ID} textarea::placeholder {
        color: #9ca3af;
      }
      #${PANEL_ID} .codex-toto-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      #${PANEL_ID} button {
        appearance: none;
        border: none;
        border-radius: 8px;
        padding: 9px 10px;
        cursor: pointer;
        font-weight: 600;
      }
      #${PANEL_ID} .codex-toto-primary {
        flex: 1;
        background: #22c55e;
        color: #052e16;
      }
      #${PANEL_ID} .codex-toto-secondary {
        background: #374151;
        color: #f9fafb;
      }
      #${PANEL_ID} .codex-toto-status {
        margin-top: 10px;
        font-size: 12px;
        color: #bfdbfe;
        white-space: pre-wrap;
      }
      #${BADGE_ID} {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 2147483647;
        background: #dc2626;
        color: #ffffff;
        border-radius: 999px;
        padding: 6px 10px;
        font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
      }
    `;

    document.head.appendChild(style);
  }

  function setStatus(message) {
    if (state.status) {
      state.status.textContent = message;
    }
  }

  function createBootBadge(mode) {
    if (!document.body) {
      return;
    }

    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement('div');
      badge.id = BADGE_ID;
      document.body.appendChild(badge);
    }

    badge.textContent = `toto入力サポートを読み込みました（${mode === PAGE_SINGLE ? 'シングル' : 'マルチ'}）`;
  }

  function createPanel(mode) {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      state.status = existing.querySelector('.codex-toto-status');
      return;
    }

    if (!document.body) {
      return;
    }

    const modeLabel = mode === PAGE_SINGLE ? 'シングル' : 'マルチ';
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <h2>toto 投票パターン入力</h2>
      <p>ページ種別：${modeLabel}</p>
      <p>1行に1パターン入力します。試合ごとの選択はカンマで区切ってください。</p>
      <textarea placeholder="2,1,1,2,1,2,1,1,0,2,2,1,1&#10;1,1,0,2,1,2,0,1,2,2,1,1,0"></textarea>
      <div class="codex-toto-actions">
        <button type="button" class="codex-toto-primary">入力する</button>
        <button type="button" class="codex-toto-secondary">クリア</button>
      </div>
      <div class="codex-toto-status">ページを確認しています…</div>
    `;

    const textarea = panel.querySelector('textarea');
    const [applyButton, clearButton] = panel.querySelectorAll('button');
    state.status = panel.querySelector('.codex-toto-status');

    applyButton.addEventListener('click', () => {
      let patterns;
      try {
        patterns = parsePatternLines(textarea.value);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      if (!patterns.length) {
        setStatus('入力が空です。1行に1パターンずつ入力してください。');
        return;
      }

      if (mode === PAGE_SINGLE) {
        applySinglePatterns(patterns);
      } else {
        applyMultiPattern(patterns[0]);
      }
    });

    clearButton.addEventListener('click', () => {
      if (mode === PAGE_SINGLE) {
        clearAllSinglePatterns();
      } else {
        clearMultiPattern();
      }
    });

    document.body.appendChild(panel);
      setStatus('準備完了です。パターンを貼り付けて「入力する」を押してください。');
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, '').trim();
  }

  function parseEntry(token) {
    const normalized = normalizeText(token);
    const uniqueChars = Array.from(new Set(normalized.split('')));
    const values = uniqueChars.filter((char) => VALID_VALUES.has(char));

    if (!values.length || values.length !== uniqueChars.length) {
      throw new Error(`「${token}」は無効です。0・1・2だけを使ってください。`);
    }

    return values;
  }

  function mapPickToOutcomeIndex(pick) {
    return PICK_TO_OUTCOME_INDEX[pick];
  }

  function parsePatternLine(line) {
    return line
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map(parseEntry);
  }

  function parsePatternLines(raw) {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parsePatternLine);
  }

  function clickInput(input, desiredChecked) {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (input.checked !== desiredChecked) {
      input.click();
    }
  }

  function buildSinglePatternMap() {
    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"][name^="chkbox_"]'));
    const patternMap = new Map();

    for (const input of inputs) {
      const match = /^chkbox_(\d+)_(\d+)_(\d+)$/.exec(input.name);
      if (!match) {
        continue;
      }

      const patternIndex = Number(match[1]);
      const matchIndex = Number(match[2]);
      const outcome = match[3];

      if (!patternMap.has(patternIndex)) {
        patternMap.set(patternIndex, new Map());
      }
      if (!patternMap.get(patternIndex).has(matchIndex)) {
        patternMap.get(patternIndex).set(matchIndex, new Map());
      }

      patternMap.get(patternIndex).get(matchIndex).set(outcome, input);
    }

    return patternMap;
  }

  function setPatternCount(patternIndex, count) {
    const select = document.querySelector(`select[name="sameExpectBuyCntList[${patternIndex}]"]`);
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    const targetValue = String(count);
    if (select.value === targetValue) {
      return;
    }

    select.value = targetValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clearSinglePattern(patternIndex, matchMap) {
    for (const outcomeMap of matchMap.values()) {
      for (const input of outcomeMap.values()) {
        clickInput(input, false);
      }
    }
    setPatternCount(patternIndex, 0);
  }

  function applySinglePattern(patternIndex, pattern, matchMap) {
    for (const [matchIndex, outcomeMap] of matchMap.entries()) {
      const values = pattern[matchIndex] || null;
      for (const [outcome, input] of outcomeMap.entries()) {
        const shouldCheck = Boolean(
          values && values.some((pick) => mapPickToOutcomeIndex(pick) === outcome)
        );
        clickInput(input, shouldCheck);
      }
    }
    setPatternCount(patternIndex, 1);
  }

  function clearAllSinglePatterns() {
    const patternMap = buildSinglePatternMap();
    if (!patternMap.size) {
      setStatus('シングルの投票欄が見つかりませんでした。');
      return;
    }

    for (const [patternIndex, matchMap] of patternMap.entries()) {
      clearSinglePattern(patternIndex, matchMap);
    }

    setStatus(`シングルの投票パターンを${patternMap.size}件クリアしました。`);
  }

  function applySinglePatterns(patterns) {
    const patternMap = buildSinglePatternMap();
    const availablePatterns = Array.from(patternMap.keys()).sort((a, b) => a - b);

    if (!availablePatterns.length) {
      setStatus('シングルの投票欄が見つかりませんでした。');
      return;
    }

    const usableCount = Math.min(availablePatterns.length, patterns.length);

    for (const patternIndex of availablePatterns) {
      clearSinglePattern(patternIndex, patternMap.get(patternIndex));
    }

    for (let index = 0; index < usableCount; index += 1) {
      const patternIndex = availablePatterns[index];
      applySinglePattern(patternIndex, patterns[index], patternMap.get(patternIndex));
    }

    const messages = [`${availablePatterns.length}件中${usableCount}件に入力しました。`];

    if (patterns.length > availablePatterns.length) {
      messages.push(`余分な${patterns.length - availablePatterns.length}行は使用しませんでした。`);
    }

    const expectedMatches = Math.max(...Array.from(patternMap.get(availablePatterns[0]).keys())) + 1;
    const shortLines = patterns
      .slice(0, usableCount)
      .map((pattern, index) => ({ index, length: pattern.length }))
      .filter((entry) => entry.length < expectedMatches);

    if (shortLines.length) {
      messages.push(`${expectedMatches}試合分に満たない行は、残りを未選択にしました。`);
    }

    setStatus(messages.join('\n'));
  }

  function buildMultiRows() {
    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"][name^="chkbox_"]'));
    const rowMap = new Map();

    for (const input of inputs) {
      const match = /^chkbox_\d+_(\d+)_(\d+)$/.exec(input.name);
      if (!match) {
        continue;
      }

      const matchIndex = Number(match[1]);
      const outcome = match[2];

      if (!rowMap.has(matchIndex)) {
        rowMap.set(matchIndex, new Map());
      }

      rowMap.get(matchIndex).set(outcome, input);
    }

    return Array.from(rowMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, outcomeMap]) => outcomeMap);
  }

  function clearMultiPattern() {
    const rows = buildMultiRows();
    if (!rows.length) {
      setStatus('マルチの投票欄が見つかりませんでした。');
      return;
    }

    for (const outcomeMap of rows) {
      for (const input of outcomeMap.values()) {
        clickInput(input, false);
      }
    }

    const select = document.querySelector('select[name="sameExpectBuyCntList[0]"]');
    if (select instanceof HTMLSelectElement) {
      select.value = '0';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setStatus(`マルチの投票欄を${rows.length}試合分クリアしました。`);
  }

  function applyMultiPattern(pattern) {
    const rows = buildMultiRows();
    if (!rows.length) {
      setStatus('マルチの投票欄が見つかりませんでした。');
      return;
    }

    for (let matchIndex = 0; matchIndex < rows.length; matchIndex += 1) {
      const outcomeMap = rows[matchIndex];
      const values = pattern[matchIndex] || null;
      for (const [outcome, input] of outcomeMap.entries()) {
        const shouldCheck = Boolean(
          values && values.some((pick) => mapPickToOutcomeIndex(pick) === outcome)
        );
        clickInput(input, shouldCheck);
      }
    }

    const select = document.querySelector('select[name="sameExpectBuyCntList[0]"]');
    if (select instanceof HTMLSelectElement) {
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const messages = [`${rows.length}試合中${Math.min(rows.length, pattern.length)}試合に入力しました。`];
    if (pattern.length < rows.length) {
      messages.push(`残り${rows.length - pattern.length}試合は未選択です。`);
    }
    setStatus(messages.join('\n'));
  }

  function initialize() {
    const mode = getPageMode();
    if (!mode) {
      return;
    }

    injectStyle();
    createBootBadge(mode);
    createPanel(mode);
    ensurePanelPersistence();
  }

  function ensurePanelPersistence() {
    if (state.observer || !document.body) {
      return;
    }

    state.observer = new MutationObserver(() => {
      const mode = getPageMode();
      if (!mode) {
        return;
      }
      if (!document.getElementById(BADGE_ID)) {
        createBootBadge(mode);
      }
      if (!document.getElementById(PANEL_ID)) {
        createPanel(mode);
      }
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function bootstrap() {
    try {
      initialize();
    } catch (error) {
      console.error('toto入力サポートの初期化に失敗しました:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }

  let retryCount = 0;
  const retryTimer = window.setInterval(() => {
    retryCount += 1;
    if (document.getElementById(PANEL_ID) && document.getElementById(BADGE_ID)) {
      window.clearInterval(retryTimer);
      return;
    }
    bootstrap();
    if (retryCount >= 20) {
      window.clearInterval(retryTimer);
    }
  }, 500);
})();
