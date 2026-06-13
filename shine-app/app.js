/* ==========================================================================
 * SHINE App — Controller-facing review interface
 * Vanilla JS · no build · localStorage state · jsPDF Tier-1 export
 * ========================================================================== */

(function () {
  'use strict';

  // ============================================================
  // CONSTANTS
  // ============================================================
  const STATEMENT_ORDER = [
    'Cover',
    'Statement of Assets and Liabilities',
    'Statement of Operations',
    'Statement of Changes in Partners Capital',
    'Statement of Cash Flows',
    'Schedule of Investments',
    'Notes to Financial Statements',
    'Financial Highlights',
    'Cross-Statement'
  ];

  const STATEMENT_NOTES = {
    'Cover': 'Entity identity, period, presentation header. Qualitative mismatches are ALWAYS CRITICAL regardless of dollar impact.',
    'Statement of Assets and Liabilities': 'Balance-sheet equivalent. Tie-out to Schedule of Investments mandatory.',
    'Statement of Operations': 'Net change must tie to Statement of Changes.',
    'Statement of Changes in Partners Capital': 'Roll-forward by class. Ending MUST tie to SOAL.',
    'Statement of Cash Flows': 'Often elected out under ASC 946-205-45-2.',
    'Schedule of Investments': '>5% of net assets MUST be disclosed by name per ASC 946-210-50-6.',
    'Notes to Financial Statements': 'Disclosure infrastructure. Significant accounting policies through subsequent events.',
    'Financial Highlights': 'ASC 946-205-50 ratios. Per-class breakouts when capital structure differs.',
    'Cross-Statement': 'Findings spanning multiple statements that cannot be cleanly localized.'
  };

  const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    currentView: 'reviews',
    currentReviewId: null,
    review: null,
    findings: [], // mutable copy of review.findings with persisted dispositions
    filters: {
      severity: 'all',
      states: new Set(),
      search: ''
    },
    groupMode: 'statement',
    showPolished: true,
    pendingFindingId: null, // for modal actions
    undoStack: [],
    redoStack: [],
    theme: 'light',
    // S1-02: keyboard focus + navigation
    focusedFindingId: null,
    // S1-03: bulk selection
    selectedIds: new Set(),
    selectionAnchor: null, // for shift-click range
    // S1-04: saved views
    savedViews: [],
    activeViewId: null,
    // S1-10: density
    density: 'comfortable', // 'comfortable' | 'compact'
    // S1-11: severity icons toggle (color-blind redundancy)
    severityIcons: false,
    // S1-12: onboarding
    onboarded: false,
    // S1-05: controller identity (used as comment/history author)
    author: 'you'
  };

  // ============================================================
  // STORAGE (schema-versioned; v2 adds comments + history + saved views)
  // ============================================================
  const STORAGE_SCHEMA_VERSION = 2;
  const storageKey = (reviewId) => `shine:state:${reviewId}`;
  const GLOBAL_PREFS_KEY = 'shine:prefs';
  const SAVED_VIEWS_KEY = 'shine:savedViews';

  function persist() {
    if (!state.currentReviewId) return;
    const payload = {
      _schema: STORAGE_SCHEMA_VERSION,
      _savedAt: Date.now(),
      findings: state.findings.map(f => {
        // For decoupled / restored findings, save the FULL object — they don't exist in the
        // base sample data and need to be reconstructed wholesale on reload.
        if (f.restored_from_root) return { ...f };
        return {
          id: f.id,
          state: f.state,
          disposition_notes: f.disposition_notes,
          discard_attestation: f.discard_attestation,
          controllerEdited: f.controllerEdited,
          fixControllerEdited: f.fixControllerEdited,
          evergreen_accepted: f.evergreen_accepted,
          evergreen_acceptance_reason: f.evergreen_acceptance_reason,
          evergreen_acceptance_date: f.evergreen_acceptance_date,
          prior_review_recurrence: f.prior_review_recurrence,
          comments: f.comments || [],
          history: f.history || [],
          decoupled_constituents: f.decoupled_constituents || [],
          restored_from_root: null,
          constituent_findings: f.constituent_findings,
          reconciler_pattern: f.reconciler_pattern,
          constituent_details: f.constituent_details
        };
      }),
      undoStack: state.undoStack.slice(-20)
    };
    try { localStorage.setItem(storageKey(state.currentReviewId), JSON.stringify(payload)); } catch (e) {}
  }

  function loadPersisted(reviewId) {
    try {
      const raw = localStorage.getItem(storageKey(reviewId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed._schema === 1) {
        // Forward-migration from v1: comments + history default to empty arrays.
        parsed.findings.forEach(f => { f.comments = f.comments || []; f.history = f.history || []; f.decoupled_constituents = []; });
        parsed._schema = STORAGE_SCHEMA_VERSION;
      }
      if (parsed._schema !== STORAGE_SCHEMA_VERSION) {
        console.warn('Discarding persisted state with incompatible schema', parsed._schema);
        localStorage.removeItem(storageKey(reviewId));
        return null;
      }
      return parsed;
    } catch (e) { return null; }
  }

  function loadGlobalPrefs() {
    try {
      const raw = localStorage.getItem(GLOBAL_PREFS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed || {};
    } catch (e) { return {}; }
  }
  function saveGlobalPrefs(patch) {
    const current = loadGlobalPrefs();
    const next = { ...current, ...patch };
    try { localStorage.setItem(GLOBAL_PREFS_KEY, JSON.stringify(next)); } catch (e) {}
  }
  function loadSavedViews() {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_KEY);
      return raw ? (JSON.parse(raw) || []) : [];
    } catch (e) { return []; }
  }
  function persistSavedViews() {
    try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(state.savedViews)); } catch (e) {}
  }

  // ============================================================
  // INIT
  // ============================================================
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    // Load global prefs first (density, severityIcons, onboarded, author)
    const prefs = loadGlobalPrefs();
    state.density = prefs.density || 'comfortable';
    state.severityIcons = !!prefs.severityIcons;
    state.onboarded = !!prefs.onboarded;
    state.author = prefs.author || localStorage.getItem('shine:lastReview') ? (prefs.author || 'you') : 'you';
    state.savedViews = loadSavedViews();
    if (state.savedViews.length === 0) seedDefaultSavedViews();
    applyDensity();
    applySeverityIcons();

    bindNav();
    bindReviewsView();
    bindDashboardView();
    bindSettings();
    bindDrawer();
    bindModals();
    bindKeyboard();
    bindImport();
    bindCommandPalette();
    bindHelpOverlay();
    bindSavedViews();
    bindBulkActions();
    bindStatementNav();
    bindEvidencePopover();
    bindOnboarding();
    bindReportPreview();

    // Theme
    const savedTheme = localStorage.getItem('shine:theme') || 'light';
    setTheme(savedTheme);

    // Render initial reviews list
    renderReviewsList();
    updateNavCounters();

    // Auto-load: ?data=URL, ./findings.json, ./data/findings.json, ./outputs/findings.json.
    // This is what makes the SHINE skill hand-off seamless — the skill writes findings.json
    // next to index.html and the dashboard opens straight to it. Falls through to the
    // restore-last-review path if nothing is auto-loadable.
    tryAutoLoadReview().then(loaded => {
      if (loaded) return;
      const lastReview = localStorage.getItem('shine:lastReview');
      if (lastReview) {
        const r = window.SHINE_SAMPLE.reviews_index.find(x => x.review_id === lastReview);
        if (r) openReview(lastReview);
      }
    });
  }

  // ============================================================
  // NAV
  // ============================================================
  function bindNav() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        if (view === 'dashboard' && !state.currentReviewId) {
          toast('Open a review first');
          return;
        }
        if (view === 'coverage' && !state.review) {
          toast('Open a review first');
          return;
        }
        switchView(view);
      });
    });
  }

  function switchView(view) {
    state.currentView = view;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');
    if (view === 'coverage') renderCoverage();
    if (view === 'reviews') renderReviewsList();
    if (view === 'activity') renderActivity();
    updateNavCounters();
  }

  // ============================================================
  // REVIEWS VIEW
  // ============================================================
  function bindReviewsView() {
    document.getElementById('reviews-search').addEventListener('input', e => {
      state._reviewsSearch = e.target.value.toLowerCase();
      renderReviewsList();
    });
    document.querySelectorAll('[data-readiness-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-readiness-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state._reviewsFilter = btn.dataset.readinessFilter;
        renderReviewsList();
      });
    });
    document.getElementById('btn-new-review').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
    const densSeg = document.getElementById('reviews-density-seg');
    if (densSeg) densSeg.querySelectorAll('[data-reviews-density]').forEach(b => {
      b.addEventListener('click', () => {
        densSeg.querySelectorAll('.seg-opt').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state._reviewsDensity = b.dataset.reviewsDensity;
        saveGlobalPrefs({ reviewsDensity: b.dataset.reviewsDensity });
        renderReviewsList();
      });
    });
    // Load density pref
    const prefs = loadGlobalPrefs();
    if (prefs.reviewsDensity) {
      state._reviewsDensity = prefs.reviewsDensity;
      if (densSeg) densSeg.querySelectorAll('[data-reviews-density]').forEach(b => b.classList.toggle('active', b.dataset.reviewsDensity === state._reviewsDensity));
    }
  }

  function renderReviewsList() {
    const grid = document.getElementById('reviews-grid');
    const q = state._reviewsSearch || '';
    const filter = state._reviewsFilter || 'all';
    const sortKey = state._reviewsSortKey || 'last_touched';
    const sortDir = state._reviewsSortDir || 'desc';
    let items = (window.SHINE_SAMPLE.reviews_index || []).slice();
    if (q) {
      items = items.filter(r =>
        r.fund_legal_name.toLowerCase().includes(q) ||
        r.fund_code.toLowerCase().includes(q) ||
        r.period.toLowerCase().includes(q) ||
        (r.fund_family || '').toLowerCase().includes(q) ||
        (r.reviewer || '').toLowerCase().includes(q)
      );
    }
    if (filter !== 'all') items = items.filter(r => r.readiness === filter);
    // Sort
    items.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = (av == null) ? 1 : (bv == null) ? -1 : (av > bv ? 1 : av < bv ? -1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    if (!items.length) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-title">No reviews match the filter.</div></div>';
      return;
    }
    const density = state._reviewsDensity || 'table';
    if (density === 'cards') {
      grid.classList.remove('reviews-table-mode');
      grid.classList.add('reviews-cards-mode');
      grid.innerHTML = items.map(r => `
        <div class="review-card" data-rid="${escapeHtml(r.review_id)}" role="button" tabindex="0">
          <div class="review-card-head">
            <div>
              <div class="review-card-name">${escapeHtml(r.fund_legal_name)}</div>
              <div class="review-card-meta">${escapeHtml(r.period)} · ${escapeHtml(r.draft)} · ${escapeHtml(r.review_date)}</div>
            </div>
            ${readinessChip(r.readiness)}
          </div>
          <div class="review-card-stats">
            <div class="review-stat"><div class="review-stat-num">${Number(r.finding_count) || 0}</div><div class="review-stat-label">findings</div></div>
            <div class="review-stat"><div class="review-stat-num">${Math.round(r.coverage_pct * 100)}%</div><div class="review-stat-label">coverage</div></div>
            <div class="review-stat"><div class="review-stat-num" style="color:var(--crit)">${Number(r.open_critical) || 0}</div><div class="review-stat-label">open critical</div></div>
            <div class="review-stat" style="margin-left:auto;text-align:right">
              <div class="review-stat-num mono" style="font-size:11px">${escapeHtml(r.fund_code)}</div>
              <div class="review-stat-label">${escapeHtml(r.reviewer || '')}</div>
            </div>
          </div>
          ${r.prior_draft_delta ? `<div class="review-delta">vs prior draft: <strong>${r.prior_draft_delta.new}</strong> new · <strong>${r.prior_draft_delta.resolved}</strong> resolved</div>` : ''}
        </div>
      `).join('');
    } else {
      grid.classList.remove('reviews-cards-mode');
      grid.classList.add('reviews-table-mode');
      const sortIcon = (key) => sortKey !== key ? '' : (sortDir === 'asc' ? ' ↑' : ' ↓');
      grid.innerHTML = `
        <table class="reviews-table">
          <thead>
            <tr>
              <th data-sortcol="fund_legal_name">Fund${sortIcon('fund_legal_name')}</th>
              <th data-sortcol="period">Period${sortIcon('period')}</th>
              <th data-sortcol="draft">Draft${sortIcon('draft')}</th>
              <th data-sortcol="readiness">Readiness${sortIcon('readiness')}</th>
              <th data-sortcol="open_critical" class="num">Open critical${sortIcon('open_critical')}</th>
              <th data-sortcol="finding_count" class="num">Findings${sortIcon('finding_count')}</th>
              <th data-sortcol="coverage_pct" class="num">Coverage${sortIcon('coverage_pct')}</th>
              <th data-sortcol="last_touched">Last touched${sortIcon('last_touched')}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(r => `
              <tr data-rid="${escapeHtml(r.review_id)}">
                <td>
                  <div class="review-row-name">${escapeHtml(r.fund_legal_name)}</div>
                  <div class="review-row-code muted mono">${escapeHtml(r.fund_code)}${r.fund_family ? ' · ' + escapeHtml(r.fund_family) : ''}</div>
                </td>
                <td>${escapeHtml(r.period)}</td>
                <td>${escapeHtml(r.draft)}</td>
                <td>${readinessChip(r.readiness)}</td>
                <td class="num"><span class="${Number(r.open_critical) > 0 ? 'crit-num' : 'muted'}">${Number(r.open_critical) || 0}</span></td>
                <td class="num">${Number(r.finding_count) || 0}</td>
                <td class="num">${Math.round(r.coverage_pct * 100)}%</td>
                <td>${r.last_touched ? formatRelative(r.last_touched) : '—'}${r.prior_draft_delta ? ` <span class="delta">+${r.prior_draft_delta.new}/${r.prior_draft_delta.resolved}✓</span>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
      grid.querySelectorAll('th[data-sortcol]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.sortcol;
          if (state._reviewsSortKey === key) state._reviewsSortDir = state._reviewsSortDir === 'asc' ? 'desc' : 'asc';
          else { state._reviewsSortKey = key; state._reviewsSortDir = 'asc'; }
          renderReviewsList();
        });
      });
    }
    grid.querySelectorAll('.review-card, .reviews-table tbody tr').forEach(el => {
      el.style.cursor = 'pointer';
      const open = () => openReview(el.dataset.rid);
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function formatRelative(ts) {
    const diff = Date.now() - ts;
    const day = 24 * 3600 * 1000;
    if (diff < day) return 'today';
    if (diff < 2 * day) return 'yesterday';
    if (diff < 30 * day) return Math.floor(diff / day) + 'd ago';
    return new Date(ts).toISOString().slice(0, 10);
  }

  function readinessChip(readiness) {
    const labels = { READY: 'Ready', READY_WITH_EXCEPTIONS: 'With exceptions', NOT_READY: 'Not ready' };
    return `<span class="readiness-chip ${readiness}"><span class="dot"></span>${labels[readiness] || readiness}</span>`;
  }

  // ============================================================
  // OPEN REVIEW
  // ============================================================
  function openReview(reviewId) {
    // For this MVP, only the primary demo review has full data
    if (reviewId !== window.SHINE_SAMPLE.review.brief.review_id) {
      toast('Full data only available for the primary demo review');
      return;
    }
    state.currentReviewId = reviewId;
    state.review = window.SHINE_SAMPLE.review;
    // Deep-clone findings so disposition mutations stay local; ensure history + comments + reconciler arrays exist.
    state.findings = state.review.findings.map(f => ({
      comments: [],
      history: [],
      decoupled_constituents: [],
      ...f
    }));
    state.selectedIds.clear();
    state.selectionAnchor = null;
    state.focusedFindingId = null;
    state.activeViewId = null;
    // Merge persisted state
    const persisted = loadPersisted(reviewId);
    if (persisted && persisted.findings) {
      persisted.findings.forEach(pf => {
        const f = state.findings.find(x => x.id === pf.id);
        if (f) {
          Object.assign(f, pf);
        } else if (pf.restored_from_root) {
          // S1-06: decoupled constituent — insert it into the live findings list
          state.findings.push({ comments: [], history: [], ...pf });
        }
      });
      state.undoStack = persisted.undoStack || [];
    }
    // Track last-touched for the portfolio view
    const idx = (window.SHINE_SAMPLE.reviews_index || []).find(r => r.review_id === reviewId);
    if (idx) idx.last_touched = Date.now();
    localStorage.setItem('shine:lastReview', reviewId);
    switchView('dashboard');
    renderDashboard();
  }

  // ============================================================
  // DASHBOARD
  // ============================================================
  function bindDashboardView() {
    // Search
    document.getElementById('findings-search').addEventListener('input', e => {
      state.filters.search = e.target.value.toLowerCase();
      renderFindings();
    });
    // Severity filter
    document.querySelectorAll('#severity-filter [data-severity]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#severity-filter .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.severity = btn.dataset.severity;
        renderFindings();
      });
    });
    // State filter (multi-select)
    document.querySelectorAll('#state-filter [data-state]').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.state;
        if (state.filters.states.has(s)) {
          state.filters.states.delete(s);
          btn.classList.remove('active');
        } else {
          state.filters.states.add(s);
          btn.classList.add('active');
        }
        renderFindings();
      });
    });
    // Group mode
    document.querySelectorAll('#group-mode [data-group]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#group-mode .seg-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.groupMode = btn.dataset.group;
        renderFindings();
      });
    });
    // Export
    document.getElementById('btn-export-preparer').addEventListener('click', () => exportPDF('preparer'));
    document.getElementById('btn-export-audit').addEventListener('click', () => exportPDF('audit'));
  }

  function renderDashboard() {
    if (!state.review) return;
    const b = state.review.brief;
    document.getElementById('banner-fund-name').textContent = b.fund_legal_name;
    document.getElementById('banner-fund-meta').textContent =
      `${b.domicile} · ${b.structure_type} · ${b.period} · ${b.draft}`;
    document.getElementById('build-date').textContent = b.build_date;
    document.getElementById('settings-build-date').textContent = b.build_date;
    renderCFOSummary();
    renderReadiness();
    renderChips();
    renderSavedViews();
    renderFindings();
    updateDiscardRate();
    updateNavCounters();
    renderSelectionBar();
  }

  function renderCFOSummary() {
    const b = state.review.brief;
    const c = state.review.coverage;
    const fs = state.findings;
    const counts = {
      total: fs.length,
      CRITICAL: fs.filter(f => f.severity.impact === 'CRITICAL').length,
      HIGH: fs.filter(f => f.severity.impact === 'HIGH').length,
      MEDIUM: fs.filter(f => f.severity.impact === 'MEDIUM').length,
      LOW: fs.filter(f => f.severity.impact === 'LOW').length,
      OPEN: fs.filter(f => f.state === 'OPEN').length,
      ACCEPTED: fs.filter(f => f.state === 'ACCEPTED').length,
      RESOLVED: fs.filter(f => f.state === 'RESOLVED').length,
      DISCARDED: fs.filter(f => f.state === 'DISCARDED').length,
      EVERGREEN: fs.filter(f => f.prior_review_recurrence === 'EVERGREEN_ACCEPTED').length
    };
    document.getElementById('cfo-entity').textContent =
      `${b.fund_legal_name} · ${b.domicile} · ${b.period} ${b.draft}`;
    document.getElementById('cfo-materiality').textContent =
      `Planning ${fmtMoney(b.materiality_planning_value)} (${(b.materiality_planning_pct * 100).toFixed(2)}% NAV) · Clearly trivial ${fmtMoney(b.clearly_trivial_value)}`;
    document.getElementById('cfo-findings').textContent =
      `${counts.total} total · ${counts.CRITICAL} CRITICAL · ${counts.HIGH} HIGH · ${counts.MEDIUM} MEDIUM · ${counts.LOW} LOW  →  ${counts.OPEN} open · ${counts.ACCEPTED} accepted · ${counts.RESOLVED} resolved · ${counts.DISCARDED} discarded · ${counts.EVERGREEN} evergreen`;
    document.getElementById('cfo-coverage').textContent =
      `${Math.round(c.coverage_completeness_pct * 100)}% applicable · ${c.asc_paragraphs_checked_count} of ${c.asc_paragraphs_applicable_count} ASC paragraphs checked · jurisdictions: ${b.regulatory_jurisdictions.join(', ')}`;
    const verdict = computeReadiness();
    document.getElementById('cfo-residual').textContent =
      `${verdict.label}  →  ${verdict.driver}`;
  }

  function computeReadiness() {
    const fs = state.findings;
    const blocking = fs.filter(f =>
      (f.severity.impact === 'CRITICAL' || f.severity.impact === 'HIGH') &&
      (f.state === 'OPEN' || f.state === 'ACCEPTED') &&
      f.prior_review_recurrence !== 'EVERGREEN_ACCEPTED'
    );
    const coverage = state.review.coverage.coverage_completeness_pct;
    if (blocking.length === 0 && coverage >= 0.95) {
      return { state: 'READY', label: 'GREEN', driver: 'All critical/high findings dispositioned; coverage ≥95%.' };
    }
    if (blocking.length === 0 && coverage >= 0.85) {
      return { state: 'READY_WITH_EXCEPTIONS', label: 'AMBER', driver: `Coverage ${Math.round(coverage * 100)}% (between 85% and 95%); only MEDIUM/LOW residual.` };
    }
    const drivers = [];
    const critOpen = blocking.filter(f => f.severity.impact === 'CRITICAL').length;
    const highOpen = blocking.filter(f => f.severity.impact === 'HIGH').length;
    if (critOpen) drivers.push(`${critOpen} CRITICAL unresolved`);
    if (highOpen) drivers.push(`${highOpen} HIGH unresolved`);
    if (coverage < 0.85) drivers.push(`coverage ${Math.round(coverage * 100)}% below 85%`);
    return { state: 'NOT_READY', label: 'RED', driver: drivers.join(' · ') || 'unmet thresholds' };
  }

  function renderReadiness() {
    const verdict = computeReadiness();
    const stateEl = document.getElementById('readiness-state');
    const detailEl = document.getElementById('readiness-detail');
    stateEl.className = 'readiness-state ' + verdict.state;
    const labels = { READY: 'Ready', READY_WITH_EXCEPTIONS: 'Ready with exceptions', NOT_READY: 'Not ready' };
    stateEl.textContent = labels[verdict.state];
    detailEl.textContent = verdict.driver;
  }

  function renderChips() {
    const c = state.review.coverage;
    const bar = document.getElementById('chip-bar');
    const chips = [];
    // Schema rejections
    if (c.schema_rejections && c.schema_rejections.total > 0) {
      chips.push(`<span class="chip amber">⚠ ${c.schema_rejections.total} schema rejection(s)</span>`);
    }
    // Subagent timeouts
    if (c.subagent_timeouts_fired && c.subagent_timeouts_fired.length) {
      chips.push(`<span class="chip red">⚠ ${c.subagent_timeouts_fired.length} subagent timeout(s)</span>`);
    }
    // Skipped paragraphs with reason
    if (c.asc_paragraphs_skipped_with_reason && c.asc_paragraphs_skipped_with_reason.length) {
      chips.push(`<span class="chip gray" title="ASC paragraphs explicitly not checked, each with reason">${c.asc_paragraphs_skipped_with_reason.length} skipped w/ reason</span>`);
    }
    // Evergreen count
    const evergreen = state.findings.filter(f => f.prior_review_recurrence === 'EVERGREEN_ACCEPTED').length;
    if (evergreen) chips.push(`<span class="chip gold">★ ${evergreen} evergreen</span>`);
    // Recurring/regressed
    const recurring = state.findings.filter(f => f.prior_review_recurrence === 'RECURRING').length;
    const regressed = state.findings.filter(f => f.prior_review_recurrence === 'REGRESSED').length;
    if (recurring) chips.push(`<span class="chip amber">↻ ${recurring} recurring</span>`);
    if (regressed) chips.push(`<span class="chip red">⤺ ${regressed} regressed</span>`);
    // Corpus attestation
    if (c.regulatory_corpus_attestation_age_days) {
      const ages = c.regulatory_corpus_attestation_age_days;
      const oldest = Math.max(...Object.values(ages));
      if (oldest > 180) {
        chips.push(`<span class="chip red">⏱ Corpus stale (${oldest}d)</span>`);
      }
    }
    bar.innerHTML = chips.join('');
  }

  // ============================================================
  // FINDINGS LIST RENDER
  // ============================================================
  function renderFindings() {
    if (!state.review) return;
    const list = document.getElementById('findings-list');
    const filtered = applyFilters(state.findings);
    let grouped;
    if (state.groupMode === 'statement') grouped = groupByStatement(filtered);
    else if (state.groupMode === 'severity') grouped = groupBySeverity(filtered);
    else grouped = groupByLayer(filtered);

    if (filtered.length === 0) {
      // UX-003 fix: context-aware empty state with one-click reset
      const activeFilters = [];
      if (state.filters.search) activeFilters.push(`search "${state.filters.search}"`);
      if (state.filters.severity !== 'all') activeFilters.push(`severity ${state.filters.severity}`);
      if (state.filters.states.size > 0) activeFilters.push(`state ${[...state.filters.states].join(' / ')}`);
      list.innerHTML = `<div class="empty-state">
        <div class="empty-title">No findings match the current filters.</div>
        ${activeFilters.length ? `<div class="empty-detail muted">Filters active: ${activeFilters.join(' · ')}</div>
        <button class="btn-ghost" id="empty-reset">Clear filters</button>` : ''}
      </div>`;
      const reset = document.getElementById('empty-reset');
      if (reset) reset.addEventListener('click', clearFilters);
      // Also clear the statement nav rail so it stays consistent with the empty state.
      renderStatementNav([]);
      return;
    }

    list.innerHTML = grouped.map(g => `
      <div class="group-block" data-statement-anchor="${escapeHtml(g.label)}">
        <div class="group-header">
          <div class="group-header-left">
            <h3 class="group-header-label">${escapeHtml(g.label)}</h3>
            ${g.note ? `<div class="group-header-note">${escapeHtml(g.note)}</div>` : ''}
          </div>
          <div class="group-header-right">
            ${sevBadges(g.findings)}
            <span class="group-count">${g.findings.length} finding${g.findings.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        ${g.findings.map(findingCardHTML).join('')}
      </div>
    `).join('');
    renderStatementNav(grouped);

    // Bind card interactions (mouse + keyboard + bulk selection)
    list.querySelectorAll('.finding-card').forEach(card => {
      const open = (e) => {
        if (e.target.closest('.finding-actions') || e.target.closest('.polished-toggle') || e.target.closest('.constituents-toggle') || e.target.closest('.bulk-checkbox') || e.target.closest('.finding-citation')) return;
        // S1-03: shift / meta / ctrl click toggles selection
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          e.preventDefault();
          toggleSelection(card.dataset.fid, e.shiftKey);
          return;
        }
        focusFinding(card.dataset.fid);
        openDrawer(card.dataset.fid);
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(card.dataset.fid); }
      });
      const cb = card.querySelector('.bulk-checkbox');
      if (cb) cb.addEventListener('click', e => { e.stopPropagation(); toggleSelection(card.dataset.fid, false); });
    });
    // S1-07: evidence drill-down on citation chips
    list.querySelectorAll('.finding-citation').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation();
        openEvidencePopover(chip.textContent.trim(), chip);
      });
      chip.style.cursor = 'pointer';
    });
    list.querySelectorAll('.polished-toggle').forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        const fid = t.dataset.fid;
        const f = state.findings.find(x => x.id === fid);
        const textEl = document.querySelector(`.finding-card[data-fid="${fid}"] .finding-text`);
        if (!textEl) return;
        if (textEl.dataset.showing === 'polished') {
          textEl.textContent = f.subagentRaw;
          textEl.dataset.showing = 'raw';
          t.textContent = 'Show polished';
        } else {
          textEl.textContent = f.voiceNormalized;
          textEl.dataset.showing = 'polished';
          t.textContent = 'Show original';
        }
      });
    });
    list.querySelectorAll('.constituents-toggle').forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        toast('Open the finding to see constituents and decouple options');
        openDrawer(t.dataset.fid);
      });
    });
    list.querySelectorAll('.finding-actions button').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = b.dataset.action;
        const fid = b.closest('.finding-card').dataset.fid;
        applyAction(fid, action);
      });
    });
  }

  function clearFilters() {
    state.filters.search = '';
    state.filters.severity = 'all';
    state.filters.states.clear();
    document.getElementById('findings-search').value = '';
    document.querySelectorAll('#severity-filter .pill').forEach(p => p.classList.toggle('active', p.dataset.severity === 'all'));
    document.querySelectorAll('#state-filter .pill').forEach(p => p.classList.remove('active'));
    renderFindings();
  }

  function applyFilters(findings) {
    const { severity, states, search } = state.filters;
    return findings.filter(f => {
      if (severity !== 'all' && f.severity.impact !== severity) return false;
      if (states.size > 0 && !states.has(f.state)) return false;
      if (search) {
        const blob = [
          f.subagentRaw, f.voiceNormalized, f.controllerEdited, f.fix,
          f.statement, f.section, f.location && f.location.line_id, f.location && f.location.note_ref,
          f.evidence && f.evidence.asc_reference, f.evidence && f.evidence.regulatory_citation,
          f.evidence && f.evidence.quoted_text, f.id
        ].filter(Boolean).join(' ').toLowerCase();
        if (!blob.includes(search)) return false;
      }
      return true;
    });
  }

  function groupByStatement(findings) {
    const map = new Map();
    findings.forEach(f => {
      if (!map.has(f.statement)) map.set(f.statement, []);
      map.get(f.statement).push(f);
    });
    const order = STATEMENT_ORDER.filter(s => map.has(s));
    return order.map(s => {
      const arr = map.get(s).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      return { label: s, note: STATEMENT_NOTES[s], findings: arr };
    });
  }

  function groupBySeverity(findings) {
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const map = new Map(order.map(s => [s, []]));
    findings.forEach(f => map.get(f.severity.impact).push(f));
    return order.map(s => ({
      label: { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }[s],
      note: '',
      findings: map.get(s)
    })).filter(g => g.findings.length);
  }

  function groupByLayer(findings) {
    const map = new Map();
    findings.forEach(f => {
      if (!map.has(f.layer)) map.set(f.layer, []);
      map.get(f.layer).push(f);
    });
    const keys = Array.from(map.keys()).sort((a, b) => {
      const an = parseInt(a.replace('L', ''), 10) || 0;
      const bn = parseInt(b.replace('L', ''), 10) || 0;
      return an - bn;
    });
    return keys.map(k => ({
      label: 'Layer ' + k,
      note: layerLabel(k),
      findings: map.get(k)
    }));
  }

  function layerLabel(L) {
    const labels = {
      L0: 'Orchestrator-emitted entity verification',
      L1: 'Entity verification (line item)',
      L2: 'Internal tie-out',
      L3: 'Disclosure completeness',
      L4: 'Template & policy compliance',
      L5: 'Language & grammar',
      L6: 'Cross-reference integrity',
      L7: 'Forensic ghost narrative',
      L8: 'Hidden-row XLSX forensic',
      L9: 'ASC framework compliance',
      L10: 'Prior-period comparison',
      L11: 'Multi-entity consistency',
      L12: 'Regulatory compliance',
      L13: 'Valuation governance',
      L14: 'Audit defense readiness'
    };
    return labels[L] || '';
  }

  function sevBadges(findings) {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    findings.forEach(f => counts[f.severity.impact]++);
    const parts = [];
    if (counts.CRITICAL) parts.push(`<span class="sev-badge crit">${counts.CRITICAL} C</span>`);
    if (counts.HIGH) parts.push(`<span class="sev-badge high">${counts.HIGH} H</span>`);
    if (counts.MEDIUM) parts.push(`<span class="sev-badge med">${counts.MEDIUM} M</span>`);
    if (counts.LOW) parts.push(`<span class="sev-badge low">${counts.LOW} L</span>`);
    return parts.join('');
  }

  function findingCardHTML(f) {
    const activeText = getActiveText(f);
    const showingPolished = !f.controllerEdited && state.showPolished && !!f.voiceNormalized;
    const loc = [
      f.location && f.location.note_ref,
      f.location && f.location.page ? `p. ${f.location.page}` : null,
      f.location && f.location.line_id,
      f.location && f.location.column ? `(${f.location.column})` : null
    ].filter(Boolean).join(' · ');

    const cites = [];
    if (f.evidence && f.evidence.asc_reference) cites.push(`<span class="finding-citation">${escapeHtml(f.evidence.asc_reference)}</span>`);
    if (f.evidence && f.evidence.regulatory_citation) cites.push(`<span class="finding-citation">${escapeHtml(f.evidence.regulatory_citation)}</span>`);

    // Polish toggle text is consistent with what's currently shown.
    const polishToggleLabel = showingPolished ? 'Show original' : 'Show polished';

    const matChip = materialityChipHtml(f);
    const isSelected = state.selectedIds.has(f.id);
    const isFocused = state.focusedFindingId === f.id;
    const commentCount = (f.comments || []).length;
    const sevIcon = { CRITICAL: '▲', HIGH: '△', MEDIUM: '◆', LOW: '◯' }[f.severity.impact] || '';
    return `
      <article class="finding-card state-${f.state} ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}" data-fid="${escapeHtml(f.id)}" tabindex="0" role="button" aria-label="Finding ${f.id} — ${escapeHtml(f.severity.impact)} ${escapeHtml(f.section)} — open details" aria-selected="${isSelected}">
        <div class="finding-card-head">
          <input type="checkbox" class="bulk-checkbox" aria-label="Select ${f.id} for bulk action" ${isSelected ? 'checked' : ''} />
          <span class="finding-id">${escapeHtml(f.id)}</span>
          <span class="chip-sev ${sevClass(f.severity.impact)}"><span class="sev-icon" aria-hidden="true">${sevIcon}</span>${f.severity.impact}</span>
          <span class="chip-conf ${f.severity.confidence}">${f.severity.confidence}</span>
          <span class="chip-state ${f.state}">${f.state}</span>
          ${f.prior_review_recurrence && f.prior_review_recurrence !== 'NEW'
            ? `<span class="chip-rec ${f.prior_review_recurrence}">${recurrenceLabel(f.prior_review_recurrence)}</span>` : ''}
          ${matChip}
          ${commentCount > 0 ? `<span class="chip-comment" title="${commentCount} comment${commentCount === 1 ? '' : 's'}">💬 ${commentCount}</span>` : ''}
          <span class="finding-subagent">${escapeHtml(f.subagent)} · ${escapeHtml(f.layer)}</span>
        </div>
        ${loc ? `<div class="finding-location">${escapeHtml(f.section)} · ${escapeHtml(loc)}</div>` : `<div class="finding-location">${escapeHtml(f.section)}</div>`}
        <div class="finding-text ${f.controllerEdited ? 'edited' : ''}" data-showing="${f.controllerEdited ? 'edited' : (showingPolished ? 'polished' : 'raw')}">${escapeHtml(activeText)}</div>
        ${cites.length ? `<div class="finding-cites">${cites.join('')}</div>` : ''}
        <div class="finding-meta">
          ${f.voiceNormalized && !f.controllerEdited ? `<button type="button" class="polished-toggle" data-fid="${escapeHtml(f.id)}">${polishToggleLabel}</button>` : ''}
          ${f.reconciler_pattern
            ? `<button type="button" class="constituents-toggle" data-fid="${escapeHtml(f.id)}">Reconciler · ${escapeHtml(f.reconciler_pattern)} · ${f.constituent_findings.length} constituent${f.constituent_findings.length === 1 ? '' : 's'}</button>`
            : ''}
          ${f.restored_from_root ? `<span class="restored-badge" title="Decoupled from ${escapeHtml(f.restored_from_root)}">↳ decoupled from ${escapeHtml(f.restored_from_root)}</span>` : ''}
        </div>
        <div class="finding-actions" role="group" aria-label="Disposition for ${f.id}">
          ${f.state === 'OPEN' ? `<button class="btn-primary" data-action="accept" aria-label="Accept ${f.id}" data-key="A">Accept</button>` : ''}
          ${f.state !== 'RESOLVED' ? `<button data-action="resolve" aria-label="Resolve ${f.id}" data-key="R">Resolve</button>` : ''}
          ${f.state !== 'DISCARDED' ? `<button class="danger" data-action="discard" aria-label="Discard ${f.id}" data-key="D">Discard</button>` : ''}
          ${(f.state === 'RESOLVED' || f.state === 'DISCARDED') ? `<button data-action="reopen" aria-label="Reopen ${f.id}">Reopen</button>` : ''}
        </div>
      </article>
    `;
  }

  function sevClass(impact) {
    return { CRITICAL: 'crit', HIGH: 'high', MEDIUM: 'med', LOW: 'low' }[impact];
  }

  function recurrenceLabel(r) {
    return { RECURRING: '↻ Recurring', REGRESSED: '⤺ Regressed', EVERGREEN_ACCEPTED: '★ Evergreen' }[r] || r;
  }

  function getActiveText(f) {
    if (f.controllerEdited) return f.controllerEdited;
    if (state.showPolished && f.voiceNormalized) return f.voiceNormalized;
    return f.subagentRaw;
  }

  // ============================================================
  // DISPOSITION ACTIONS
  // ============================================================
  function applyAction(fid, action) {
    const f = state.findings.find(x => x.id === fid);
    if (!f) return;
    if (action === 'open') { openDrawer(fid); return; }
    if (action === 'discard') {
      // Gate at >20% projected discard rate — modal handles the actual transition.
      // SPEC-002 fix: do NOT push undo or mutate state until the discard is confirmed.
      const projectedRate = projectedDiscardRate(fid);
      if (projectedRate > 0.20) {
        state.pendingFindingId = fid;
        openModal('modal-discard');
        return;
      }
    }
    const before = f.state;
    pushUndo(f);
    if (action === 'accept') f.state = 'ACCEPTED';
    else if (action === 'resolve') f.state = 'RESOLVED';
    else if (action === 'reopen') { f.state = 'OPEN'; f.discard_attestation = null; }
    else if (action === 'discard') f.state = 'DISCARDED';
    logHistory(f, 'disposition', { from: before, to: f.state });
    persist();
    renderDashboard();
    toast(`${fid} → ${f.state}`);
  }

  // S1-05: history is a per-finding chronological log of every state-changing action.
  function logHistory(f, kind, payload) {
    if (!f.history) f.history = [];
    f.history.push({
      ts: Date.now(),
      author: state.author,
      kind,        // 'disposition' | 'edit' | 'comment' | 'evergreen' | 'decouple' | 'restore'
      ...payload
    });
    if (f.history.length > 200) f.history = f.history.slice(-200);
  }

  // B-001 fix: count current discarded + 1 (the pending one), divide by total.
  function projectedDiscardRate(pendingId) {
    const f = state.findings.find(x => x.id === pendingId);
    const alreadyCounted = f && f.state === 'DISCARDED' ? 1 : 0;
    const discarded = state.findings.filter(x => x.state === 'DISCARDED').length - alreadyCounted + 1;
    return discarded / Math.max(state.findings.length, 1);
  }

  function updateDiscardRate() {
    const total = state.findings.length;
    const discarded = state.findings.filter(f => f.state === 'DISCARDED').length;
    const rate = discarded / Math.max(total, 1);
    const el = document.getElementById('discard-rate');
    el.textContent = `Discard rate: ${discarded}/${total} (${Math.round(rate * 100)}%)`;
    if (rate > 0.20) el.style.color = 'var(--danger)';
    else el.style.color = '';
  }

  // ============================================================
  // UNDO STACK
  // ============================================================
  function pushUndo(finding) {
    state.undoStack.push({
      id: finding.id,
      snapshot: { ...finding },
      ts: Date.now()
    });
    if (state.undoStack.length > 20) state.undoStack.shift();
  }
  function undo() {
    const entry = state.undoStack.pop();
    if (!entry) { toast('Nothing to undo'); return; }
    const f = state.findings.find(x => x.id === entry.id);
    if (f) {
      Object.assign(f, entry.snapshot);
      persist();
      renderDashboard();
      // re-open drawer if it was showing this finding
      const drawer = document.getElementById('finding-drawer');
      if (drawer.classList.contains('open') && drawer.dataset.fid === f.id) openDrawer(f.id);
      toast(`Undone: ${f.id} → ${f.state}`);
    }
  }

  // ============================================================
  // DRAWER
  // ============================================================
  function bindDrawer() {
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    const overlay = document.getElementById('drawer-overlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);
  }

  function openDrawer(fid) {
    const f = state.findings.find(x => x.id === fid);
    if (!f) return;
    const drawer = document.getElementById('finding-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const body = document.getElementById('drawer-body');
    // B-003 fix: preserve scroll if re-opening same drawer after a mutation
    const sameFid = drawer.dataset.fid === fid && drawer.classList.contains('open');
    const scrollY = sameFid ? body.scrollTop : 0;
    drawer.dataset.fid = fid;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.classList.add('open');
    document.getElementById('drawer-id').textContent = f.id;
    const loc = [
      f.statement, f.section,
      f.location && f.location.note_ref,
      f.location && f.location.page ? `p. ${f.location.page}` : null,
      f.location && f.location.line_id
    ].filter(Boolean).join(' · ');
    document.getElementById('drawer-statement-location').textContent = loc;
    renderDrawerBody(f);
    if (sameFid) body.scrollTop = scrollY;
    // Focus the close button for keyboard users (basic focus management)
    if (!sameFid) {
      setTimeout(() => document.getElementById('drawer-close').focus(), 60);
    }
  }
  function closeDrawer() {
    const drawer = document.getElementById('finding-drawer');
    const overlay = document.getElementById('drawer-overlay');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.classList.remove('open');
  }

  function renderDrawerBody(f) {
    const body = document.getElementById('drawer-body');
    body.innerHTML = `
      <div class="drawer-section">
        <div class="finding-card-head" style="margin-bottom:12px">
          <span class="chip-sev ${sevClass(f.severity.impact)}">${f.severity.impact}</span>
          <span class="chip-conf ${f.severity.confidence}">${f.severity.confidence}</span>
          <span class="chip-state ${f.state}">${f.state}</span>
          ${f.prior_review_recurrence && f.prior_review_recurrence !== 'NEW'
            ? `<span class="chip-rec ${f.prior_review_recurrence}">${recurrenceLabel(f.prior_review_recurrence)}</span>` : ''}
          <span class="finding-subagent">${f.subagent} · ${f.layer}</span>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-label">Finding</div>
        ${f.controllerEdited ? `
          <div class="drawer-block"><strong>Controller-edited:</strong> ${escapeHtml(f.controllerEdited)}</div>
          <div class="drawer-section-label" style="margin-top:8px">Original (subagent)</div>
          <div class="drawer-block muted">${escapeHtml(f.subagentRaw)}</div>
          ${f.voiceNormalized ? `<div class="drawer-section-label" style="margin-top:8px">Polished</div><div class="drawer-block muted">${escapeHtml(f.voiceNormalized)}</div>` : ''}
        ` : `
          <div class="drawer-block">${escapeHtml(state.showPolished && f.voiceNormalized ? f.voiceNormalized : f.subagentRaw)}</div>
          ${f.voiceNormalized && state.showPolished ? `<div class="drawer-section-label" style="margin-top:8px">Original (subagent)</div><div class="drawer-block muted">${escapeHtml(f.subagentRaw)}</div>` : ''}
        `}
      </div>

      ${f.evidence && (f.evidence.asc_reference || f.evidence.regulatory_citation) ? `
        <div class="drawer-section">
          <div class="drawer-section-label">Citation</div>
          ${f.evidence.asc_reference ? `<div class="drawer-block cite">${escapeHtml(f.evidence.asc_reference)}</div>` : ''}
          ${f.evidence.regulatory_citation ? `<div class="drawer-block cite">${escapeHtml(f.evidence.regulatory_citation)}</div>` : ''}
        </div>
      ` : ''}

      ${f.evidence && (f.evidence.quoted_text || f.evidence.xlsx_proof || f.evidence.prior_text) ? `
        <div class="drawer-section">
          <div class="drawer-section-label">Evidence</div>
          ${f.evidence.quoted_text ? `<div class="drawer-block evidence">"${escapeHtml(f.evidence.quoted_text)}"</div>` : ''}
          ${f.evidence.xlsx_proof ? `<div class="drawer-block cite">${escapeHtml(f.evidence.xlsx_proof)}</div>` : ''}
          ${f.evidence.prior_text ? `<div class="drawer-block evidence">Prior / Sibling: "${escapeHtml(f.evidence.prior_text)}"</div>` : ''}
        </div>
      ` : ''}

      <div class="drawer-section">
        <div class="drawer-section-label">Recommended fix</div>
        <div class="drawer-block">${escapeHtml(f.fixControllerEdited || f.fixVoiceNormalized || f.fix)}</div>
      </div>

      ${f.reconciler_pattern ? `
        <div class="drawer-section">
          <div class="drawer-section-label">Reconciler attribution</div>
          <div class="constituents">
            <div class="constituents-header"><strong>${escapeHtml(f.reconciler_pattern)}</strong> <span class="muted">· specificity ${f.reconciler_specificity_score}</span></div>
            ${(f.constituent_details && f.constituent_details.length ? f.constituent_details : f.constituent_findings.map(cid => ({ id: cid }))).map(c => `
              <div class="constituent-row">
                <div class="constituent-meta">
                  <span class="mono">${escapeHtml(c.id)}</span>
                  ${c.subagent ? `<span class="muted">${escapeHtml(c.subagent)} · ${escapeHtml(c.layer || '')}</span>` : ''}
                  ${c.severity ? `<span class="chip-sev ${sevClass(c.severity.impact)}">${escapeHtml(c.severity.impact)}</span>` : ''}
                </div>
                ${c.subagentRaw ? `<div class="constituent-text">${escapeHtml(c.subagentRaw)}</div>` : ''}
                <button class="decouple-btn" data-decouple="${escapeHtml(c.id)}" aria-label="Decouple ${escapeHtml(c.id)} from root cause">Decouple</button>
              </div>
            `).join('')}
            ${f.detail ? `<div class="constituents-detail">${escapeHtml(f.detail)}</div>` : ''}
          </div>
        </div>
      ` : ''}

      ${f.prior_review_recurrence === 'EVERGREEN_ACCEPTED' ? `
        <div class="drawer-section">
          <div class="drawer-section-label">Evergreen acceptance</div>
          <div class="drawer-block" style="background:var(--gold-soft)">
            <strong>Accepted ${f.evergreen_acceptance_date}</strong><br>
            ${escapeHtml(f.evergreen_acceptance_reason)}
          </div>
        </div>
      ` : ''}

      <div class="drawer-section">
        <div class="drawer-section-label">Inline edit</div>
        <textarea class="drawer-textarea" id="drawer-edit" placeholder="Edit the finding text in the controller voice...">${escapeHtml(f.controllerEdited || '')}</textarea>
        <div class="drawer-actions">
          <button class="btn-ghost" id="drawer-save-edit">Save edit</button>
          <button class="btn-ghost" id="drawer-clear-edit">Clear edit</button>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-label">Disposition</div>
        <div class="drawer-actions">
          ${f.state === 'OPEN' ? '<button class="btn-primary" data-action="accept">Accept</button>' : ''}
          ${f.state !== 'RESOLVED' ? '<button class="btn-ghost" data-action="resolve">Resolve</button>' : ''}
          ${f.state !== 'DISCARDED' ? '<button class="btn-ghost danger" data-action="discard">Discard</button>' : ''}
          ${(f.state === 'RESOLVED' || f.state === 'DISCARDED') ? '<button class="btn-ghost" data-action="reopen">Reopen</button>' : ''}
          ${(f.severity.impact === 'LOW' || f.severity.impact === 'MEDIUM') && f.prior_review_recurrence !== 'EVERGREEN_ACCEPTED' ? '<button class="btn-ghost" data-action="evergreen">Mark evergreen</button>' : ''}
        </div>
        ${f.disposition_notes ? `<div class="drawer-block muted" style="margin-top:8px;font-size:12px">Notes: ${escapeHtml(f.disposition_notes)}</div>` : ''}
        ${f.discard_attestation ? `<div class="drawer-block" style="margin-top:8px;font-size:12px;border-left:3px solid var(--danger)">Discard attestation: ${escapeHtml(f.discard_attestation)}</div>` : ''}
      </div>

      <div class="drawer-section">
        <div class="drawer-section-label">Comments (${(f.comments || []).length})</div>
        ${(f.comments || []).length === 0
          ? '<div class="muted" style="font-size:12px;margin-bottom:8px">No comments yet. Use comments for discussion / "ask Deloitte" / notes-to-self — separate from disposition rationale.</div>'
          : (f.comments || []).map(c => `
            <div class="comment">
              <div class="comment-meta"><span class="comment-author">${escapeHtml(c.author)}</span> · <span class="mono">${formatTs(c.ts)}</span></div>
              <div class="comment-text">${escapeHtml(c.text)}</div>
            </div>`).join('')}
        <textarea class="drawer-textarea" id="drawer-comment-text" placeholder="Add a comment…"></textarea>
        <div class="drawer-actions">
          <button class="btn-ghost" id="drawer-add-comment">Add comment</button>
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-label">Activity (${(f.history || []).length})</div>
        ${(f.history || []).length === 0
          ? '<div class="muted" style="font-size:12px">No actions yet on this finding.</div>'
          : `<div class="history-list">${(f.history || []).slice().reverse().slice(0, 10).map(h => `
              <div class="history-row">
                <span class="mono">${formatTs(h.ts)}</span>
                <span class="history-kind">${escapeHtml(h.kind)}</span>
                <span class="history-text">${activityText({ ...h, fid: f.id })}</span>
                <span class="muted">${escapeHtml(h.author || '')}</span>
              </div>`).join('')}</div>`}
      </div>

      <div class="drawer-section">
        <div class="drawer-section-label">Audit trail</div>
        <div class="drawer-block mono" style="font-size:11px">
          merge_key: ${escapeHtml(f.merge_key)}<br>
          finding_class: ${escapeHtml(f.finding_class || '')}<br>
          subagent_version: ${escapeHtml(f.subagent_version || '')}<br>
          prompt_version: ${escapeHtml(f.prompt_version || '')}<br>
          references: ${escapeHtml(Object.keys(f.reference_versions || {}).join(', ') || '—')}
        </div>
      </div>
    `;

    // Bind drawer actions
    body.querySelectorAll('[data-action]').forEach(b => {
      b.addEventListener('click', () => {
        const action = b.dataset.action;
        if (action === 'evergreen') {
          state.pendingFindingId = f.id;
          openModal('modal-evergreen');
          return;
        }
        applyAction(f.id, action);
        openDrawer(f.id); // refresh
      });
    });
    body.querySelector('#drawer-save-edit').addEventListener('click', () => {
      const txt = body.querySelector('#drawer-edit').value.trim();
      pushUndo(f);
      const before = f.controllerEdited;
      f.controllerEdited = txt || null;
      logHistory(f, 'edit', { before: before, after: f.controllerEdited });
      persist();
      renderDashboard();
      openDrawer(f.id);
      toast('Edit saved');
    });
    body.querySelector('#drawer-clear-edit').addEventListener('click', () => {
      pushUndo(f);
      const before = f.controllerEdited;
      f.controllerEdited = null;
      logHistory(f, 'edit', { before, after: null, cleared: true });
      persist();
      renderDashboard();
      openDrawer(f.id);
      toast('Edit cleared');
    });
    body.querySelectorAll('[data-decouple]').forEach(b => {
      b.addEventListener('click', () => {
        const cid = b.dataset.decouple;
        // S1-06: actually decouple — restore constituent as standalone finding, mutate root,
        // log to history, push to undo stack.
        decoupleConstituent(f.id, cid);
      });
    });

    // Comments section (S1-05) — wire add-comment input
    const addBtn = body.querySelector('#drawer-add-comment');
    if (addBtn) addBtn.addEventListener('click', () => {
      const txt = (body.querySelector('#drawer-comment-text').value || '').trim();
      if (!txt) { toast('Comment cannot be empty'); return; }
      addComment(f.id, txt);
    });
  }

  // ============================================================
  // COVERAGE VIEW
  // ============================================================
  function renderCoverage() {
    if (!state.review) return;
    const c = state.review.coverage;
    const grid = document.getElementById('coverage-grid');
    grid.innerHTML = `
      <div class="coverage-card">
        <h3>Coverage</h3>
        <div class="coverage-stat-big">${Math.round(c.coverage_completeness_pct * 100)}%</div>
        <p class="muted" style="font-size:12px;margin-top:8px">${c.asc_paragraphs_checked_count} of ${c.asc_paragraphs_applicable_count} applicable ASC paragraphs checked. ${c.asc_paragraphs_skipped_with_reason.length} skipped with reason.</p>
      </div>
      <div class="coverage-card">
        <h3>Subagent SLA</h3>
        <div class="coverage-list">
          ${Object.entries(c.subagent_elapsed_seconds).map(([k, v]) => `
            <div class="coverage-list-item"><span>${escapeHtml(k)}</span><span class="mono">${escapeHtml(String(v))}s</span></div>
          `).join('')}
        </div>
      </div>
      <div class="coverage-card">
        <h3>Layers covered</h3>
        <div class="coverage-list">
          ${c.layers_covered.map(l => `<div class="coverage-list-item"><span class="mono">${escapeHtml(l)}</span><span class="muted">${escapeHtml(layerLabel(l))}</span></div>`).join('')}
        </div>
      </div>
      <div class="coverage-card">
        <h3>ASC paragraphs skipped (with reason)</h3>
        <div class="coverage-list">
          ${c.asc_paragraphs_skipped_with_reason.length === 0
            ? '<div class="muted">None — all applicable paragraphs checked.</div>'
            : c.asc_paragraphs_skipped_with_reason.map(s => `
              <div class="coverage-list-item"><span class="mono">${escapeHtml(s.paragraph)}</span><span class="reason">${escapeHtml(s.reason_code)}: ${escapeHtml(s.reason)}</span></div>
            `).join('')}
        </div>
      </div>
      <div class="coverage-card">
        <h3>Regulatory citations referenced</h3>
        <div class="coverage-list">
          ${c.regulatory_citations_referenced.map(k => `<div class="coverage-list-item"><span class="mono">${escapeHtml(k)}</span></div>`).join('')}
        </div>
        <p class="muted" style="font-size:11px;margin-top:8px">Corpus attestation ages: ${Object.entries(c.regulatory_corpus_attestation_age_days).map(([j, d]) => `${j} ${d}d`).join(' · ')}</p>
      </div>
      <div class="coverage-card">
        <h3>Schema rejections</h3>
        <div class="coverage-stat-big">${c.schema_rejections.total}</div>
        <p class="muted" style="font-size:12px;margin-top:8px">${c.schema_rejections.total === 0 ? 'No findings rejected at Stage 5a validation.' : 'See outputs/rejected-findings.log'}</p>
      </div>
    `;
  }

  // ============================================================
  // MODALS
  // ============================================================
  function bindModals() {
    document.querySelectorAll('[data-modal-close]').forEach(b => {
      b.addEventListener('click', () => closeModal(b.closest('.modal-bg').id));
    });
    // B-002 fix: clicking the backdrop closes the modal; clicking the modal itself does not bubble.
    document.querySelectorAll('.modal-bg').forEach(bg => {
      bg.addEventListener('click', e => { if (e.target === bg) closeModal(bg.id); });
      const inner = bg.querySelector('.modal');
      if (inner) inner.addEventListener('click', e => e.stopPropagation());
    });
    document.getElementById('evergreen-confirm').addEventListener('click', () => {
      const fid = state.pendingFindingId;
      const reason = document.getElementById('evergreen-reason').value.trim();
      if (!reason) { toast('Acceptance reason required'); return; }
      const f = state.findings.find(x => x.id === fid);
      if (!f) return;
      pushUndo(f);
      f.evergreen_accepted = true;
      f.evergreen_acceptance_reason = reason;
      f.evergreen_acceptance_date = new Date().toISOString().slice(0, 10);
      f.prior_review_recurrence = 'EVERGREEN_ACCEPTED';
      logHistory(f, 'evergreen', { reason });
      document.getElementById('evergreen-reason').value = '';
      closeModal('modal-evergreen');
      persist();
      renderDashboard();
      if (document.getElementById('finding-drawer').classList.contains('open')) openDrawer(fid);
      toast('Marked evergreen');
    });
    document.getElementById('discard-confirm').addEventListener('click', () => {
      const fid = state.pendingFindingId;
      const reason = document.getElementById('discard-reason').value.trim();
      if (!reason) { toast('Attestation required'); return; }
      const f = state.findings.find(x => x.id === fid);
      if (!f) return;
      pushUndo(f);
      const before = f.state;
      f.state = 'DISCARDED';
      f.discard_attestation = reason;
      logHistory(f, 'disposition', { from: before, to: 'DISCARDED', attestation: reason });
      document.getElementById('discard-reason').value = '';
      closeModal('modal-discard');
      persist();
      renderDashboard();
      if (document.getElementById('finding-drawer').classList.contains('open')) openDrawer(fid);
      toast('Discarded with attestation');
    });
  }

  function openModal(id) { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  // ============================================================
  // SETTINGS
  // ============================================================
  function bindSettings() {
    document.getElementById('opt-show-polished').addEventListener('change', e => {
      state.showPolished = e.target.checked;
      if (state.review) renderDashboard();
    });
    // S1-10 density
    const densitySeg = document.getElementById('density-seg');
    if (densitySeg) {
      densitySeg.querySelectorAll('[data-density]').forEach(b => {
        b.classList.toggle('active', b.dataset.density === state.density);
        b.addEventListener('click', () => {
          densitySeg.querySelectorAll('.seg-opt').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          state.density = b.dataset.density;
          applyDensity();
          saveGlobalPrefs({ density: state.density });
        });
      });
    }
    // S1-11 severity icons
    const sevToggle = document.getElementById('opt-sev-icons');
    if (sevToggle) {
      sevToggle.checked = state.severityIcons;
      sevToggle.addEventListener('change', e => {
        state.severityIcons = e.target.checked;
        applySeverityIcons();
        saveGlobalPrefs({ severityIcons: state.severityIcons });
      });
    }
    // Author
    const authorInput = document.getElementById('opt-author');
    if (authorInput) {
      authorInput.value = state.author === 'you' ? '' : state.author;
      authorInput.placeholder = 'Your name or email (currently: "' + state.author + '")';
      authorInput.addEventListener('change', () => {
        const v = (authorInput.value || '').trim() || 'you';
        state.author = v;
        saveGlobalPrefs({ author: v });
        toast('Author set: ' + v);
      });
    }
    document.querySelectorAll('#theme-seg [data-theme]').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#theme-seg .seg-opt').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        setTheme(b.dataset.theme);
      });
    });
    document.getElementById('btn-clear-state').addEventListener('click', () => {
      if (!state.currentReviewId) { toast('No active review'); return; }
      if (confirm('Clear all local dispositions and edits for this review?')) {
        localStorage.removeItem(storageKey(state.currentReviewId));
        openReview(state.currentReviewId);
        toast('Local state cleared');
      }
    });
    document.getElementById('btn-theme').addEventListener('click', () => {
      setTheme(state.theme === 'light' ? 'dark' : 'light');
    });
    // Note: btn-help wired in bindOnboarding (shows help overlay)
    document.getElementById('btn-palette').addEventListener('click', () => {
      if (window.__shineOpenPalette) window.__shineOpenPalette();
    });
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('shine:theme', theme);
    document.querySelectorAll('#theme-seg [data-theme]').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
  }

  // ============================================================
  // KEYBOARD
  // ============================================================
  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      // Undo: Ctrl/Cmd + Z (always allowed)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Escape: close any overlay/modal/drawer/popover and blur any focused inputs there
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open'));
        const helpOv = document.getElementById('help-overlay');
        if (helpOv && helpOv.classList.contains('open')) helpOv.classList.remove('open');
        const palette = document.getElementById('cmd-palette');
        if (palette && palette.classList.contains('open')) {
          palette.classList.remove('open');
          const ci = document.getElementById('cmd-input');
          if (ci) ci.blur();
        }
        const pop = document.getElementById('evidence-popover');
        if (pop && pop.classList.contains('open')) pop.classList.remove('open');
        const reportModal = document.getElementById('report-modal');
        if (reportModal && reportModal.classList.contains('open')) reportModal.classList.remove('open');
        // Also blur the global search input if focused (so subsequent shortcuts work)
        if (document.activeElement && document.activeElement.tagName === 'INPUT' &&
            document.activeElement.id === 'findings-search') {
          document.activeElement.blur();
        }
        closeDrawer();
        return;
      }
      // The remaining shortcuts only fire when the user is NOT typing.
      if (isTypingTarget(e.target)) return;
      // ? opens help overlay (Shift+/ on US layouts; handle both)
      if (e.key === '?') { e.preventDefault(); showHelpOverlay(); return; }
      // / focuses search
      if (e.key === '/' && state.currentView === 'dashboard') {
        e.preventDefault();
        const s = document.getElementById('findings-search');
        if (s) s.focus();
        return;
      }
      // J / K navigate focus through findings
      if (state.currentView === 'dashboard') {
        if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); return; }
        if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); return; }
        // Single-key disposition actions on focused finding (or open drawer)
        const fid = state.focusedFindingId;
        if (!fid) return;
        const f = state.findings.find(x => x.id === fid);
        if (!f) return;
        if (e.key === 'o' || e.key === 'Enter') { e.preventDefault(); openDrawer(fid); return; }
        if (e.key === 'a' && f.state === 'OPEN') { e.preventDefault(); applyAction(fid, 'accept'); return; }
        if (e.key === 'r' && f.state !== 'RESOLVED') { e.preventDefault(); applyAction(fid, 'resolve'); return; }
        if (e.key === 'd' && f.state !== 'DISCARDED') { e.preventDefault(); applyAction(fid, 'discard'); return; }
        if (e.key === 'u' && (f.state === 'RESOLVED' || f.state === 'DISCARDED')) { e.preventDefault(); applyAction(fid, 'reopen'); return; }
        if (e.key === 'e') { e.preventDefault(); openDrawer(fid); setTimeout(() => { const ta = document.getElementById('drawer-edit'); if (ta) ta.focus(); }, 80); return; }
        if (e.key === 'g' && (f.severity.impact === 'LOW' || f.severity.impact === 'MEDIUM')) {
          e.preventDefault(); state.pendingFindingId = fid; openModal('modal-evergreen'); return;
        }
      }
    });
  }

  // ============================================================
  // IMPORT
  // ============================================================
  // Shared loader — used by file-picker, drag-and-drop, auto-fetch, and ?data= URL param.
  function loadReviewPayload(parsed, source) {
    if (!parsed || !parsed.brief || !parsed.findings) {
      toast('Invalid review file — missing "brief" or "findings"');
      return false;
    }
    window.SHINE_SAMPLE.review = parsed;
    state.currentReviewId = parsed.brief.review_id;
    state.review = parsed;
    state.findings = parsed.findings.map(f => ({ ...f }));
    state.undoStack = [];
    if (!window.SHINE_SAMPLE.reviews_index.find(r => r.review_id === parsed.brief.review_id)) {
      window.SHINE_SAMPLE.reviews_index.unshift({
        review_id: parsed.brief.review_id,
        fund_code: parsed.brief.fund_code,
        fund_legal_name: parsed.brief.fund_legal_name,
        period: parsed.brief.period,
        draft: parsed.brief.draft,
        reviewer: parsed.brief.reviewer,
        review_date: parsed.brief.review_date,
        readiness: 'NOT_READY',
        finding_count: parsed.findings.length,
        coverage_pct: (parsed.coverage && parsed.coverage.coverage_completeness_pct) || 1
      });
    }
    switchView('dashboard');
    renderDashboard();
    toast('Loaded ' + (source || parsed.brief.review_id));
    return true;
  }

  function bindImport() {
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try { loadReviewPayload(JSON.parse(ev.target.result), file.name); }
        catch (err) { toast('Could not parse JSON: ' + err.message); }
      };
      reader.readAsText(file);
    });

    // Drag-and-drop anywhere on the page (S2 simplification).
    const dropZone = document.getElementById('global-drop-zone');
    let dragDepth = 0;
    window.addEventListener('dragenter', e => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault(); dragDepth++; if (dropZone) dropZone.classList.add('active');
    });
    window.addEventListener('dragover', e => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
    });
    window.addEventListener('dragleave', e => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 && dropZone) dropZone.classList.remove('active');
    });
    window.addEventListener('drop', e => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); dragDepth = 0;
      if (dropZone) dropZone.classList.remove('active');
      const file = e.dataTransfer.files[0];
      if (!file.name.toLowerCase().endsWith('.json')) { toast('Drop a .json file (a SHINE findings.json)'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        try { loadReviewPayload(JSON.parse(ev.target.result), file.name); }
        catch (err) { toast('Could not parse JSON: ' + err.message); }
      };
      reader.readAsText(file);
    });

    // Empty-state "open" button on Reviews view (mirrors the top-right import icon).
    const ctaBtn = document.getElementById('drop-cta-open');
    if (ctaBtn) ctaBtn.addEventListener('click', () => document.getElementById('file-input').click());
  }

  // Auto-load — opt-in via two signals (no speculative probing, no console 404s):
  //   1. ?data=<url>   — handy for ad-hoc links and bookmarks
  //   2. <meta name="shine-data" content="./findings.json">  — what the SHINE skill emits
  //      into the bundled dashboard.html (Stage 7 output) so opening that file just works.
  // If neither is set (the demo case), we fall through to drag-and-drop / file-picker.
  async function tryAutoLoadReview() {
    const params = new URLSearchParams(window.location.search);
    const fromParam = params.get('data');
    const metaEl = document.querySelector('meta[name="shine-data"]');
    const fromMeta = metaEl ? metaEl.getAttribute('content') : null;
    const url = fromParam || fromMeta;
    if (!url) return false;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) { toast('Could not load ' + url + ' (' + res.status + ')'); return false; }
      const parsed = await res.json();
      if (parsed && parsed.brief && parsed.findings) {
        loadReviewPayload(parsed, url);
        return true;
      }
      toast('Loaded ' + url + ' but it is missing "brief" or "findings"');
    } catch (e) {
      console.warn('Auto-load failed for ' + url + ':', e.message);
      toast('Auto-load failed — try drag-and-drop or the Import button');
    }
    return false;
  }

  // ============================================================
  // PDF EXPORT
  // ============================================================
  // Export now opens a premium report PREVIEW first (review-before-send). The preview
  // renders the same report model that the PDF download uses, so the two never drift.
  function exportPDF(mode) {
    openReportPreview(mode);
  }

  function openReportPreview(mode) {
    if (!state.review) { toast('No active review'); return; }
    state._reportMode = mode;
    const model = buildReportModel(mode);
    state._reportModel = model;
    const frame = document.getElementById('report-frame');
    frame.srcdoc = renderReportHTML(model, mode);
    const label = document.getElementById('report-mode-label');
    if (label) label.textContent = mode === 'preparer' ? 'Preparer Export' : 'Audit File Export';
    document.getElementById('report-modal').classList.add('open');
  }

  function bindReportPreview() {
    const m = document.getElementById('report-modal');
    if (!m) return;
    const close = () => m.classList.remove('open');
    document.getElementById('report-close').addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    document.getElementById('report-download-pdf').addEventListener('click', () => {
      const btn = document.getElementById('report-download-pdf');
      const prev = btn.textContent;
      btn.disabled = true; btn.textContent = 'Generating…';
      setTimeout(() => {
        try {
          if (window.jspdf) renderReportPDF(state._reportModel, state._reportMode);
          else { console.warn('jsPDF unavailable; downloading HTML report'); downloadReportHTML(); }
        } catch (e) {
          console.error('PDF render failed', e);
          try { downloadReportHTML(); } catch (e2) { toast('Export failed: ' + e2.message); }
        } finally { btn.disabled = false; btn.textContent = prev; }
      }, 40);
    });
    document.getElementById('report-download-html').addEventListener('click', downloadReportHTML);
  }

  function downloadReportHTML() {
    const model = state._reportModel, mode = state._reportMode;
    if (!model) return;
    const html = renderReportHTML(model, mode);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.meta.fund_code}-${model.meta.period}-shine-${mode === 'preparer' ? 'preparer' : 'audit-file'}-report-${model.meta.build_date.replace(/-/g, '')}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded HTML report');
  }

  // ============================================================
  // REPORT MODEL (shared by HTML preview + PDF renderer)
  // ============================================================
  function buildReportModel(mode) {
    const b = state.review.brief, c = state.review.coverage;
    const findings = filterForExport(mode);
    const groups = groupByStatement(findings);
    const all = state.findings;
    const by = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    findings.forEach(f => by[f.severity.impact]++);
    const byState = { open: 0, accepted: 0, resolved: 0, discarded: 0 };
    all.forEach(f => { const s = (f.state || '').toLowerCase(); if (byState[s] != null) byState[s]++; });
    const verdict = computeReadiness();
    const evergreen = all.filter(f => f.prior_review_recurrence === 'EVERGREEN_ACCEPTED');
    const recurring = all.filter(f => f.prior_review_recurrence === 'RECURRING').length;
    const regressed = all.filter(f => f.prior_review_recurrence === 'REGRESSED').length;
    let topSection = null, topScore = -1;
    groups.forEach(g => { let s = 0; g.findings.forEach(f => s += (SEVERITY_RANK[f.severity.impact] || 0)); if (s > topScore) { topScore = s; topSection = g.label; } });
    const summary = {
      total: findings.length,
      bySeverity: by,
      byState,
      coverage_pct: c.coverage_completeness_pct,
      asc_checked: c.asc_paragraphs_checked_count,
      asc_applicable: c.asc_paragraphs_applicable_count,
      materiality: { planning: b.materiality_planning_value, trivial: b.clearly_trivial_value, pct: b.materiality_planning_pct },
      jurisdictions: b.regulatory_jurisdictions || [],
      recurring, regressed, evergreen: evergreen.length
    };
    const narrative = buildNarrative(b, summary, verdict, topSection, mode, groups.length);
    return { meta: { ...b, report_title: 'Financial Statement Review', mode }, verdict, summary, groups, evergreen, coverage: c, narrative };
  }

  function buildNarrative(b, s, verdict, topSection, mode, groupCount) {
    const parts = [];
    parts.push(`This report presents the SHINE review of ${b.fund_legal_name} for ${b.period} (${b.draft}).`);
    parts.push(`${s.total} finding${s.total === 1 ? '' : 's'} ${s.total === 1 ? 'was' : 'were'} identified across ${groupCount} financial-statement area${groupCount === 1 ? '' : 's'}, of which ${s.bySeverity.CRITICAL} ${s.bySeverity.CRITICAL === 1 ? 'is' : 'are'} rated critical and ${s.bySeverity.HIGH} high.`);
    if (topSection) parts.push(`The most significant concentration sits in ${topSection}.`);
    parts.push(`Coverage of applicable ASC guidance stands at ${Math.round(s.coverage_pct * 100)}%, assessed against a planning materiality of ${fmtMoney(s.materiality.planning)} (${(s.materiality.pct * 100).toFixed(2)}% of net assets).`);
    if (s.recurring || s.regressed) parts.push(`${s.recurring} finding${s.recurring === 1 ? '' : 's'} recurred from the prior review and ${s.regressed} regressed after a prior resolution — control points that warrant management attention.`);
    const goal = mode === 'preparer' ? 'release to the fund administrator' : 'audit-file distribution';
    const stateWord = verdict.state === 'READY' ? 'READY' : verdict.state === 'READY_WITH_EXCEPTIONS' ? 'READY WITH EXCEPTIONS' : 'NOT READY';
    parts.push(`On the combined severity-and-coverage gate, the statements are assessed ${stateWord} for ${goal}; the determining factor is ${verdict.driver.toLowerCase()}.`);
    return parts.join(' ');
  }

  // ============================================================
  // PREMIUM PDF REPORT (jsPDF) — cover · exec summary · TOC · sections · appendix
  // ============================================================
  function renderReportPDF(model, mode) {
    if (!window.jspdf) throw new Error('jsPDF not loaded');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const PW = doc.internal.pageSize.getWidth();   // 612
    const PH = doc.internal.pageSize.getHeight();  // 792
    const MX = 56;
    const CONTENT_TOP = 88;
    const CONTENT_BOTTOM = PH - 64;
    const CW = PW - MX * 2;

    // Palette (RGB)
    const INK = [26, 32, 44], NAVY = [26, 43, 74], GOLD = [184, 144, 46], GRAY = [110, 116, 128],
      FAINT = [150, 154, 162], HAIR = [214, 214, 208], PANEL = [247, 247, 244], GHOST = [228, 228, 222];
    const SEV = { CRITICAL: [192, 57, 43], HIGH: [201, 110, 8], MEDIUM: [168, 138, 0], LOW: [107, 114, 128] };
    const fill = c => doc.setFillColor(c[0], c[1], c[2]);
    const stroke = c => doc.setDrawColor(c[0], c[1], c[2]);
    const ink = c => doc.setTextColor(c[0], c[1], c[2]);
    const tw = s => doc.getTextWidth(s);

    let y = CONTENT_TOP;
    const toc = [];

    function ensure(needed) { if (y + needed > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP; } }
    function eyebrow(text, x, yy, color) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); ink(color || GRAY);
      doc.text(String(text).toUpperCase(), x, yy, { charSpace: 1.4 });
    }
    function sectionTitle(num, title, recordToc) {
      ensure(64);
      if (recordToc) toc.push({ label: title, page: doc.internal.getNumberOfPages() });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(34); ink(GHOST);
      doc.text(num, MX, y + 6);
      ink(NAVY); doc.setFontSize(17);
      doc.text(title, MX + 56, y);
      stroke(GOLD); doc.setLineWidth(1.5); doc.line(MX + 56, y + 10, MX + 56 + 42, y + 10);
      y += 40; ink(INK);
    }
    function readinessPill(v, x, yy) {
      const fg = { READY: [22, 101, 52], READY_WITH_EXCEPTIONS: [146, 64, 14], NOT_READY: [153, 27, 27] }[v.state];
      const bg = { READY: [220, 252, 231], READY_WITH_EXCEPTIONS: [254, 243, 199], NOT_READY: [254, 226, 226] }[v.state];
      const label = { READY: 'READY', READY_WITH_EXCEPTIONS: 'READY WITH EXCEPTIONS', NOT_READY: 'NOT READY' }[v.state];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const w = tw(label) + 26;
      fill(bg); doc.roundedRect(x, yy - 13, w, 22, 11, 11, 'F');
      ink(fg); doc.text(label, x + 13, yy + 1);
      return w;
    }

    // ---------------- COVER (page 1) ----------------
    fill(NAVY); doc.rect(0, 0, PW, 7, 'F');
    let cy = 150;
    eyebrow('SHINE  ·  Statement Health Intelligence', MX, cy);
    cy += 50;
    doc.setFont('times', 'bold'); doc.setFontSize(32); ink(INK);
    const nameLines = doc.splitTextToSize(model.meta.fund_legal_name, CW);
    doc.text(nameLines, MX, cy);
    cy += nameLines.length * 34 + 4;
    stroke(GOLD); doc.setLineWidth(2); doc.line(MX, cy, MX + 70, cy);
    cy += 30;
    doc.setFont('times', 'normal'); doc.setFontSize(17); ink(NAVY);
    doc.text(model.meta.report_title + (mode === 'audit' ? ' · Audit File' : ' · Preparer Edition'), MX, cy);
    cy += 26;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); ink(GRAY);
    doc.text(`${model.meta.period}   ·   ${model.meta.draft}   ·   ${model.meta.domicile}   ·   ${model.meta.structure_type}`, MX, cy);
    cy += 42;
    readinessPill(model.verdict, MX, cy);
    // bottom meta block
    const by = PH - 132;
    stroke(HAIR); doc.setLineWidth(0.5); doc.line(MX, by, PW - MX, by);
    const metaCol = (label, value, x) => {
      eyebrow(label, x, by + 22); ink(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      doc.text(value, x, by + 38);
    };
    metaCol('Prepared by', 'Apollo Mumbai Controllership', MX);
    metaCol('Report date', model.meta.build_date, MX + 210);
    metaCol('Classification', 'Confidential — Internal', MX + 370);
    eyebrow('Architecture', MX, by + 66);
    ink(GRAY); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1', MX, by + 80);

    // ---------------- TOC reserved (page 2) ----------------
    doc.addPage(); const tocPage = doc.internal.getNumberOfPages();

    // ---------------- EXECUTIVE SUMMARY ----------------
    doc.addPage(); y = CONTENT_TOP;
    sectionTitle('01', 'Executive Summary', true);
    // narrative
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); ink(INK);
    const narr = doc.splitTextToSize(model.narrative, CW);
    doc.text(narr, MX, y, { lineHeightFactor: 1.5 });
    y += narr.length * 15 + 22;

    // stat cards
    const s = model.summary;
    (function statCards() {
      ensure(86);
      const gap = 12, n = 4, cwId = (CW - gap * (n - 1)) / n;
      const cards = [
        { label: 'Total findings', value: String(s.total), sub: `${s.byState.open} open · ${s.byState.accepted} accepted` },
        { label: 'Critical / High', value: `${s.bySeverity.CRITICAL} / ${s.bySeverity.HIGH}`, sub: 'in this export' },
        { label: 'Coverage', value: Math.round(s.coverage_pct * 100) + '%', sub: `${s.asc_checked}/${s.asc_applicable} ASC ¶` },
        { label: 'Materiality', value: fmtMoney(s.materiality.planning), sub: (s.materiality.pct * 100).toFixed(2) + '% of NAV' }
      ];
      cards.forEach((c, i) => {
        const x = MX + i * (cwId + gap);
        fill(PANEL); doc.roundedRect(x, y, cwId, 72, 4, 4, 'F');
        stroke(HAIR); doc.setLineWidth(0.5); doc.roundedRect(x, y, cwId, 72, 4, 4, 'S');
        eyebrow(c.label, x + 12, y + 18);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(19); ink(INK);
        doc.text(c.value, x + 12, y + 45);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); ink(GRAY);
        doc.text(c.sub, x + 12, y + 61);
      });
      y += 72 + 28;
    })();

    // severity bar chart
    (function severityChart() {
      ensure(110);
      eyebrow('Findings by severity', MX, y); y += 16;
      const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      const max = Math.max(1, ...order.map(k => s.bySeverity[k] || 0));
      const barH = 15, gap = 9, labelW = 76, valGap = 10, trackW = CW - labelW - 28;
      order.forEach(k => {
        const v = s.bySeverity[k] || 0;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ink(GRAY);
        doc.text(k.charAt(0) + k.slice(1).toLowerCase(), MX, y + barH - 4);
        fill([237, 237, 233]); doc.roundedRect(MX + labelW, y, trackW, barH, 2, 2, 'F');
        const w = trackW * (v / max);
        if (w > 0) { fill(SEV[k]); doc.roundedRect(MX + labelW, y, Math.max(w, 2), barH, 2, 2, 'F'); }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); ink(INK);
        doc.text(String(v), MX + labelW + trackW + valGap, y + barH - 4);
        y += barH + gap;
      });
      y += 14;
    })();

    // disposition stacked bar
    (function dispositionChart() {
      ensure(64);
      eyebrow('Disposition of population', MX, y); y += 14;
      const segs = [['Open', s.byState.open, [148, 150, 156]], ['Accepted', s.byState.accepted, NAVY], ['Resolved', s.byState.resolved, [22, 101, 52]], ['Discarded', s.byState.discarded, [206, 206, 200]]];
      const total = Math.max(1, segs.reduce((a, x) => a + x[1], 0));
      const barH = 16; let x = MX;
      segs.forEach(seg => { const w = CW * (seg[1] / total); if (w > 0.5) { fill(seg[2]); doc.rect(x, y, w, barH, 'F'); } x += w; });
      y += barH + 14;
      doc.setFontSize(8); let lx = MX;
      segs.forEach(seg => {
        fill(seg[2]); doc.rect(lx, y - 7, 8, 8, 'F');
        ink(GRAY); doc.setFont('helvetica', 'normal');
        const t = `${seg[0]}  ${seg[1]}`; doc.text(t, lx + 12, y);
        lx += tw(t) + 36;
      });
      y += 18;
    })();

    // ---------------- FINDINGS SECTIONS ----------------
    let sectionNum = 2;
    model.groups.forEach(g => {
      doc.addPage(); y = CONTENT_TOP;
      sectionTitle(String(sectionNum).padStart(2, '0'), g.label, true);
      sectionNum++;
      // section meta line: count + severity tally
      const tally = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      g.findings.forEach(f => tally[f.severity.impact]++);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ink(GRAY);
      const tallyParts = [];
      if (tally.CRITICAL) tallyParts.push(tally.CRITICAL + ' critical');
      if (tally.HIGH) tallyParts.push(tally.HIGH + ' high');
      if (tally.MEDIUM) tallyParts.push(tally.MEDIUM + ' medium');
      if (tally.LOW) tallyParts.push(tally.LOW + ' low');
      doc.text(`${g.findings.length} finding${g.findings.length === 1 ? '' : 's'}${tallyParts.length ? '  ·  ' + tallyParts.join(' · ') : ''}`, MX, y);
      y += 14;
      if (g.note) {
        doc.setFont('times', 'italic'); doc.setFontSize(9.5); ink(GRAY);
        const nl = doc.splitTextToSize(g.note, CW);
        doc.text(nl, MX, y, { lineHeightFactor: 1.4 }); y += nl.length * 12 + 12;
        doc.setFont('helvetica', 'normal');
      } else { y += 6; }

      g.findings.forEach(f => {
        const text = mode === 'audit' ? (f.controllerEdited || f.subagentRaw) : (f.controllerEdited || f.voiceNormalized || f.subagentRaw);
        const fix = f.fixControllerEdited || f.fixVoiceNormalized || f.fix;
        doc.setFontSize(9.5);
        const tLines = doc.splitTextToSize(text, CW - 18);
        const fxLines = doc.splitTextToSize(fix, CW - 36);
        const cites = [f.evidence && f.evidence.asc_reference, f.evidence && f.evidence.regulatory_citation].filter(Boolean);
        const needed = 18 + 16 + 14 + tLines.length * 13 + 8 + (cites.length ? 14 : 0) + (fxLines.length * 12 + 26) + 18;
        ensure(needed);
        // top hairline
        stroke(HAIR); doc.setLineWidth(0.5); doc.line(MX, y, MX + CW, y); y += 18;
        // severity square + id + meta
        fill(SEV[f.severity.impact]); doc.rect(MX, y - 8, 9, 9, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); ink(INK);
        doc.text(f.id, MX + 17, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); ink(GRAY);
        doc.text(`${f.severity.impact} · ${f.severity.confidence} · ${f.state}`, MX + 17 + tw(f.id) + 10, y);
        ink(FAINT); doc.text(`${f.subagent} · ${f.layer}`, MX + CW, y, { align: 'right' });
        y += 15;
        // location
        const loc = [f.section, f.location && f.location.note_ref, f.location && f.location.page ? `p. ${f.location.page}` : null, f.location && f.location.line_id].filter(Boolean).join('  ·  ');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); ink(NAVY);
        doc.text(loc, MX + 17, y); y += 15;
        // body
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); ink(INK);
        doc.text(tLines, MX + 17, y, { lineHeightFactor: 1.4 }); y += tLines.length * 13 + 6;
        // citation
        if (cites.length) {
          doc.setFont('courier', 'normal'); doc.setFontSize(8); ink(GRAY);
          doc.text(cites.join('     '), MX + 17, y); doc.setFont('helvetica', 'normal'); y += 14;
        }
        // fix panel
        const panelH = fxLines.length * 12 + 22;
        fill(PANEL); doc.roundedRect(MX + 17, y - 2, CW - 17, panelH, 3, 3, 'F');
        fill(NAVY); doc.rect(MX + 17, y - 2, 3, panelH, 'F');
        eyebrow('Recommended fix', MX + 28, y + 12, NAVY);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); ink(INK);
        doc.text(fxLines, MX + 28, y + 26, { lineHeightFactor: 1.35 });
        y += panelH + 12;
        // reconciler (audit only)
        if (mode === 'audit' && f.reconciler_pattern) {
          doc.setFontSize(8); ink(GRAY);
          const r = doc.splitTextToSize(`Reconciler · ${f.reconciler_pattern} · constituents ${f.constituent_findings.join(', ')}`, CW - 17);
          doc.text(r, MX + 17, y); y += r.length * 10 + 8;
        }
      });
    });

    // ---------------- APPENDIX A — COVERAGE ----------------
    doc.addPage(); y = CONTENT_TOP;
    sectionTitle(String(sectionNum).padStart(2, '0'), 'Appendix A — Coverage', true); sectionNum++;
    const c = model.coverage;
    function kvRow(k, v) {
      ensure(20);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); ink(GRAY);
      doc.text(k, MX, y);
      ink(INK); doc.text(String(v), MX + CW, y, { align: 'right' });
      stroke(HAIR); doc.setLineWidth(0.4); doc.line(MX, y + 6, MX + CW, y + 6);
      y += 20;
    }
    kvRow('Coverage completeness', Math.round(c.coverage_completeness_pct * 100) + '%');
    kvRow('ASC paragraphs applicable', c.asc_paragraphs_applicable_count);
    kvRow('ASC paragraphs checked', c.asc_paragraphs_checked_count);
    kvRow('Layers covered', (c.layers_covered || []).length + ' of 14');
    kvRow('Schema rejections', (c.schema_rejections && c.schema_rejections.total) || 0);
    kvRow('Regulatory jurisdictions', (model.summary.jurisdictions || []).join(', ') || '—');
    y += 8;
    if (c.asc_paragraphs_skipped_with_reason && c.asc_paragraphs_skipped_with_reason.length) {
      eyebrow('ASC paragraphs not checked (with reason)', MX, y); y += 16;
      c.asc_paragraphs_skipped_with_reason.forEach(sk => {
        ensure(26);
        doc.setFont('courier', 'normal'); doc.setFontSize(8.5); ink(INK);
        doc.text(sk.paragraph, MX, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ink(GRAY);
        const r = doc.splitTextToSize(`${sk.reason_code}: ${sk.reason}`, CW - 130);
        doc.text(r, MX + 130, y);
        y += Math.max(14, r.length * 11) + 4;
      });
    }

    // ---------------- APPENDIX B — EVERGREEN (audit only) ----------------
    if (mode === 'audit' && model.evergreen.length) {
      doc.addPage(); y = CONTENT_TOP;
      sectionTitle(String(sectionNum).padStart(2, '0'), 'Appendix B — Evergreen-Accepted', true); sectionNum++;
      doc.setFont('times', 'italic'); doc.setFontSize(9.5); ink(GRAY);
      const intro = doc.splitTextToSize('Findings the controller has accepted as documented practice. These skip severity escalation and are excluded from the readiness gate, but are recorded here for the audit file.', CW);
      doc.text(intro, MX, y, { lineHeightFactor: 1.4 }); y += intro.length * 12 + 14;
      doc.setFont('helvetica', 'normal');
      model.evergreen.forEach(f => {
        ensure(50);
        fill([255, 248, 225]); doc.rect(MX, y - 10, 3, 30, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); ink(INK);
        doc.text(`${f.id} · ${f.statement} · ${f.section}`, MX + 12, y);
        y += 14;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); ink(GRAY);
        const r = doc.splitTextToSize(`${f.evergreen_acceptance_reason} (accepted ${f.evergreen_acceptance_date})`, CW - 12);
        doc.text(r, MX + 12, y); y += r.length * 11 + 14;
      });
    }

    // ---------------- TOC fill (go back to page 2) ----------------
    doc.setPage(tocPage);
    let ty = CONTENT_TOP;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(34); ink(GHOST);
    doc.text('00', MX, ty + 6);
    ink(NAVY); doc.setFontSize(17); doc.text('Contents', MX + 56, ty);
    stroke(GOLD); doc.setLineWidth(1.5); doc.line(MX + 56, ty + 10, MX + 56 + 42, ty + 10);
    ty += 48;
    toc.forEach(entry => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); ink(INK);
      doc.text(entry.label, MX, ty);
      ink(GRAY); doc.text(String(entry.page), MX + CW, ty, { align: 'right' });
      // dotted leader
      stroke([220, 220, 214]); doc.setLineWidth(0.4);
      doc.setLineDashPattern([1, 2], 0);
      const labelW = tw(entry.label); const numW = tw(String(entry.page));
      doc.line(MX + labelW + 8, ty - 3, MX + CW - numW - 8, ty - 3);
      doc.setLineDashPattern([], 0);
      ty += 26;
    });

    // ---------------- Running header / footer on all pages except cover ----------------
    const total = doc.internal.getNumberOfPages();
    const shortName = model.meta.fund_legal_name.length > 46 ? model.meta.fund_legal_name.slice(0, 44) + '…' : model.meta.fund_legal_name;
    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      // header
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); ink(FAINT);
      doc.text(shortName, MX, 46, { charSpace: 0.3 });
      doc.text((mode === 'audit' ? 'Audit File' : 'Preparer') + ' · ' + model.meta.period, PW - MX, 46, { align: 'right' });
      stroke(HAIR); doc.setLineWidth(0.5); doc.line(MX, 54, PW - MX, 54);
      // footer
      stroke(HAIR); doc.line(MX, PH - 52, PW - MX, PH - 52);
      doc.setFontSize(7.5); ink(FAINT);
      doc.text('Confidential — Internal', MX, PH - 38);
      doc.text(`${i} / ${total}`, PW / 2, PH - 38, { align: 'center' });
      doc.text('SHINE v8.1 · Apollo Mumbai Controllership', PW - MX, PH - 38, { align: 'right' });
    }

    const filename = `${model.meta.fund_code}-${model.meta.period}-shine-${mode === 'preparer' ? 'preparer' : 'audit-file'}-report-${model.meta.build_date.replace(/-/g, '')}.pdf`;
    doc.save(filename);
    toast(`Exported ${filename}`);
  }

  // ============================================================
  // PREMIUM HTML REPORT (preview modal + HTML download)
  // ============================================================
  function renderReportHTML(model, mode) {
    const m = model.meta, s = model.summary, v = model.verdict;
    const modeLabel = mode === 'audit' ? 'Audit File' : 'Preparer Edition';
    const verdictLabel = { READY: 'Ready', READY_WITH_EXCEPTIONS: 'Ready with Exceptions', NOT_READY: 'Not Ready' }[v.state];
    const sevClass = imp => ({ CRITICAL: 'crit', HIGH: 'high', MEDIUM: 'med', LOW: 'low' }[imp]);
    const maxSev = Math.max(1, s.bySeverity.CRITICAL, s.bySeverity.HIGH, s.bySeverity.MEDIUM, s.bySeverity.LOW);

    const findingHTML = (f) => {
      const loc = [f.section, f.location && f.location.note_ref, f.location && f.location.page && ('p. ' + f.location.page), f.location && f.location.line_id].filter(Boolean).map(escapeHtml).join('  ·  ');
      const cites = [];
      if (f.evidence && f.evidence.asc_reference) cites.push(`<span class="cite">${escapeHtml(f.evidence.asc_reference)}</span>`);
      if (f.evidence && f.evidence.regulatory_citation) cites.push(`<span class="cite">${escapeHtml(f.evidence.regulatory_citation)}</span>`);
      const text = mode === 'audit' ? (f.controllerEdited || f.subagentRaw) : (f.controllerEdited || f.voiceNormalized || f.subagentRaw);
      const fix = f.fixControllerEdited || f.fixVoiceNormalized || f.fix;
      const ev = [];
      if (f.evidence && f.evidence.quoted_text) ev.push(`<div class="evid">&ldquo;${escapeHtml(f.evidence.quoted_text)}&rdquo;</div>`);
      if (f.evidence && f.evidence.xlsx_proof) ev.push(`<div class="evid mono">${escapeHtml(f.evidence.xlsx_proof)}</div>`);
      if (f.evidence && f.evidence.prior_text) ev.push(`<div class="evid">Prior / sibling: &ldquo;${escapeHtml(f.evidence.prior_text)}&rdquo;</div>`);
      return `<article class="finding sev-${sevClass(f.severity.impact)}">
        <div class="finding-top">
          <span class="fid">${escapeHtml(f.id)}</span>
          <span class="sev-tag sev-${sevClass(f.severity.impact)}">${escapeHtml(f.severity.impact)}</span>
          <span class="conf">${escapeHtml(f.severity.confidence)}</span>
          <span class="state">${escapeHtml(f.state)}</span>
          <span class="agent">${escapeHtml(f.subagent)} · ${escapeHtml(f.layer)}</span>
        </div>
        <div class="finding-loc">${loc}</div>
        <p class="finding-body">${escapeHtml(text)}</p>
        ${cites.length ? `<div class="cites">${cites.join('')}</div>` : ''}
        ${ev.length ? `<div class="evidence-block">${ev.join('')}</div>` : ''}
        <div class="fix"><span class="fix-label">Recommended fix</span>${escapeHtml(fix)}</div>
        ${mode === 'audit' && f.reconciler_pattern ? `<div class="recon">Reconciler · ${escapeHtml(f.reconciler_pattern)} · constituents ${escapeHtml((f.constituent_findings || []).join(', '))}</div>` : ''}
      </article>`;
    };

    let sectionNum = 2;
    const sectionsHTML = model.groups.map(g => {
      const tally = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      g.findings.forEach(f => tally[f.severity.impact]++);
      const badges = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].filter(k => tally[k]).map(k => `<span class="badge ${sevClass(k)}">${tally[k]} ${k.charAt(0)}</span>`).join('');
      const num = String(sectionNum).padStart(2, '0'); sectionNum++;
      return `<section class="report-section">
        <div class="section-head">
          <span class="section-num">${num}</span>
          <div><h2>${escapeHtml(g.label)}</h2><div class="rule"></div></div>
        </div>
        <div class="section-meta">${g.findings.length} finding${g.findings.length === 1 ? '' : 's'} ${badges}</div>
        ${g.note ? `<p class="section-note">${escapeHtml(g.note)}</p>` : ''}
        ${g.findings.map(findingHTML).join('')}
      </section>`;
    }).join('');

    const tocItems = ['Executive Summary', ...model.groups.map(g => g.label), 'Appendix A — Coverage'];
    if (mode === 'audit' && model.evergreen.length) tocItems.push('Appendix B — Evergreen-Accepted');

    const coverageRows = [
      ['Coverage completeness', Math.round(model.coverage.coverage_completeness_pct * 100) + '%'],
      ['ASC paragraphs applicable', model.coverage.asc_paragraphs_applicable_count],
      ['ASC paragraphs checked', model.coverage.asc_paragraphs_checked_count],
      ['Layers covered', (model.coverage.layers_covered || []).length + ' of 14'],
      ['Schema rejections', (model.coverage.schema_rejections && model.coverage.schema_rejections.total) || 0],
      ['Regulatory jurisdictions', (s.jurisdictions || []).join(', ') || '—']
    ].map(([k, val]) => `<div class="kv"><span>${escapeHtml(k)}</span><strong>${escapeHtml(String(val))}</strong></div>`).join('');

    const skippedHTML = (model.coverage.asc_paragraphs_skipped_with_reason || []).map(sk =>
      `<div class="skip"><span class="mono">${escapeHtml(sk.paragraph)}</span><span>${escapeHtml(sk.reason_code)}: ${escapeHtml(sk.reason)}</span></div>`).join('');

    const evergreenHTML = (mode === 'audit' && model.evergreen.length) ? `
      <section class="report-section">
        <div class="section-head"><span class="section-num">${String(model.groups.length + 3).padStart(2, '0')}</span><div><h2>Appendix B — Evergreen-Accepted</h2><div class="rule"></div></div></div>
        <p class="section-note">Findings accepted as documented practice. Excluded from the readiness gate; recorded for the audit file.</p>
        ${model.evergreen.map(f => `<div class="evergreen-item"><strong>${escapeHtml(f.id)} · ${escapeHtml(f.statement)} · ${escapeHtml(f.section)}</strong><div>${escapeHtml(f.evergreen_acceptance_reason || '')} <span class="muted">(accepted ${escapeHtml(f.evergreen_acceptance_date || '')})</span></div></div>`).join('')}
      </section>` : '';

    const dispoTotal = Math.max(1, s.byState.open + s.byState.accepted + s.byState.resolved + s.byState.discarded);
    const pct = n => (100 * n / dispoTotal).toFixed(1) + '%';

    const css = `
:root{--ink:#1a202c;--navy:#1a2b4a;--gold:#b8902e;--gray:#6e7480;--faint:#9a9ea6;--hair:#d6d6d0;--panel:#f7f7f4;--crit:#c0392b;--high:#c96e08;--med:#a88a00;--low:#6b7280}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#eceae4}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);font-size:13.5px;line-height:1.55}
.page{background:#fff;width:8.5in;min-height:11in;margin:24px auto;padding:0;box-shadow:0 4px 24px rgba(0,0,0,.12);position:relative;overflow:hidden}
.serif{font-family:Georgia,'Times New Roman',serif}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--gray)}
.cover{padding:0 0.9in}
.cover .bar{height:7px;background:var(--navy);margin:0 -0.9in 1.1in}
.cover .mark{margin-top:0.3in}
.cover h1{font-family:Georgia,serif;font-size:34px;font-weight:700;line-height:1.15;margin:30px 0 0}
.cover .accent{width:70px;height:3px;background:var(--gold);margin:14px 0 22px}
.cover .subtitle{font-family:Georgia,serif;font-size:18px;color:var(--navy);margin:0 0 8px}
.cover .coverline{color:var(--gray);font-size:13px}
.cover .pill-wrap{margin:34px 0}
.cover .meta-block{position:absolute;bottom:1in;left:0.9in;right:0.9in;border-top:1px solid var(--hair);padding-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.cover .meta-block .col .eyebrow{margin-bottom:5px}
.cover .attrib{position:absolute;bottom:0.5in;left:0.9in;color:var(--faint);font-size:10px}
.pill{display:inline-block;padding:6px 16px;border-radius:14px;font-weight:700;font-size:12px;letter-spacing:.5px}
.pill.READY{background:#dcfce7;color:#166534}.pill.READY_WITH_EXCEPTIONS{background:#fef3c7;color:#92400e}.pill.NOT_READY{background:#fee2e2;color:#991b1b}
.pill-driver{color:var(--gray);font-size:12px;margin-top:10px;max-width:80%}
.content{padding:0.7in 0.9in 0.9in}
.section-head{display:flex;align-items:flex-start;gap:18px;margin-bottom:6px}
.section-num{font-size:34px;font-weight:700;color:#e4e4de;line-height:1;font-family:Georgia,serif}
.section-head h2{font-family:Georgia,serif;font-size:20px;color:var(--navy);margin:0}
.section-head .rule{width:42px;height:2px;background:var(--gold);margin-top:8px}
.narrative{font-size:14px;line-height:1.65;margin:14px 0 26px}
.stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0 26px}
.stat{background:var(--panel);border:1px solid var(--hair);border-radius:6px;padding:14px}
.stat .eyebrow{margin-bottom:8px}
.stat .num{font-size:24px;font-weight:700;line-height:1}
.stat .sub{font-size:11px;color:var(--gray);margin-top:6px}
.chart{margin:8px 0 26px}
.chart .eyebrow{margin-bottom:12px}
.bar-row{display:grid;grid-template-columns:80px 1fr 32px;align-items:center;gap:10px;margin-bottom:9px}
.bar-row .lbl{font-size:12px;color:var(--gray)}
.bar-track{background:#ededea;border-radius:3px;height:16px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px}
.bar-fill.crit{background:var(--crit)}.bar-fill.high{background:var(--high)}.bar-fill.med{background:var(--med)}.bar-fill.low{background:var(--low)}
.bar-row .val{font-weight:700;font-size:13px;text-align:right}
.dispo{display:flex;height:18px;border-radius:3px;overflow:hidden;margin-bottom:12px}
.dispo span{display:block}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:11px;color:var(--gray)}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:middle}
.toc-item{display:flex;align-items:baseline;justify-content:space-between;padding:9px 0;border-bottom:1px dotted var(--hair);font-size:14px}
.toc-item .pnum{color:var(--gray);font-size:12px}
.report-section{margin-top:30px}
.section-meta{font-size:12px;color:var(--gray);margin:8px 0 4px}
.badge{display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;margin-left:4px}
.badge.crit{background:#fdedec;color:var(--crit)}.badge.high{background:#fef3e0;color:var(--high)}.badge.med{background:#fcf6d8;color:var(--med)}.badge.low{background:#f0f0ee;color:var(--low)}
.section-note{font-family:Georgia,serif;font-style:italic;color:var(--gray);font-size:13px;margin:6px 0 14px}
.finding{border-top:1px solid var(--hair);padding:16px 0 4px;page-break-inside:avoid}
.finding-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.fid{font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:700}
.sev-tag{padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700}
.sev-tag.crit{background:#fdedec;color:var(--crit)}.sev-tag.high{background:#fef3e0;color:var(--high)}.sev-tag.med{background:#fcf6d8;color:var(--med)}.sev-tag.low{background:#f0f0ee;color:var(--low)}
.conf,.state{font-size:10px;color:var(--gray);text-transform:uppercase;letter-spacing:.5px}
.agent{margin-left:auto;font-size:10px;color:var(--faint);font-family:ui-monospace,Menlo,monospace}
.finding-loc{font-size:12px;font-weight:600;color:var(--navy);margin-bottom:8px}
.finding-body{margin:0 0 10px;font-size:13px;line-height:1.6}
.cites{margin-bottom:10px}
.cite{font-family:ui-monospace,Menlo,monospace;font-size:11px;background:var(--panel);border:1px solid var(--hair);padding:2px 7px;border-radius:3px;margin-right:6px}
.evidence-block{border-left:3px solid var(--hair);padding:4px 0 4px 12px;margin:0 0 10px}
.evid{font-style:italic;color:var(--gray);font-size:12px;margin:2px 0}.evid.mono{font-style:normal;font-family:ui-monospace,Menlo,monospace}
.fix{background:var(--panel);border-left:3px solid var(--navy);border-radius:3px;padding:11px 14px;font-size:12.5px;line-height:1.5}
.fix-label{display:block;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--navy);margin-bottom:5px}
.recon{font-size:11px;color:var(--gray);margin-top:8px}
.kv{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--hair);font-size:13px}
.kv span{color:var(--gray)}
.skip{display:flex;gap:16px;padding:7px 0;border-bottom:1px dotted var(--hair);font-size:12px}
.skip .mono{font-family:ui-monospace,Menlo,monospace;min-width:130px;color:var(--ink)}
.skip span:last-child{color:var(--gray)}
.evergreen-item{border-left:3px solid var(--gold);padding:8px 0 8px 12px;margin:10px 0;font-size:12.5px}
.muted{color:var(--faint)}.mono{font-family:ui-monospace,Menlo,monospace}
.report-footer{border-top:1px solid var(--hair);margin-top:36px;padding-top:14px;color:var(--faint);font-size:10px;text-align:center;font-family:ui-monospace,Menlo,monospace}
@media print{
  body{background:#fff}
  .page{box-shadow:none;margin:0;width:auto;min-height:auto}
  .cover{page-break-after:always}
  @page{size:letter;margin:0.6in 0.7in 0.8in}
}`;

    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>SHINE Report — ${escapeHtml(m.fund_legal_name)}</title><style>${css}</style></head><body>
<div class="page cover">
  <div class="bar"></div>
  <div class="mark eyebrow">SHINE · Statement Health Intelligence</div>
  <h1>${escapeHtml(m.fund_legal_name)}</h1>
  <div class="accent"></div>
  <div class="subtitle serif">${escapeHtml(m.report_title)} · ${escapeHtml(modeLabel)}</div>
  <div class="coverline">${escapeHtml(m.period)}  ·  ${escapeHtml(m.draft)}  ·  ${escapeHtml(m.domicile)}  ·  ${escapeHtml(m.structure_type)}</div>
  <div class="pill-wrap">
    <span class="pill ${v.state}">${verdictLabel.toUpperCase()}</span>
    <div class="pill-driver">${escapeHtml(v.driver)}</div>
  </div>
  <div class="meta-block">
    <div class="col"><div class="eyebrow">Prepared by</div><div>Apollo Mumbai Controllership</div></div>
    <div class="col"><div class="eyebrow">Report date</div><div>${escapeHtml(m.build_date)}</div></div>
    <div class="col"><div class="eyebrow">Classification</div><div>Confidential — Internal</div></div>
  </div>
  <div class="attrib">Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1</div>
</div>

<div class="page"><div class="content">
  <div class="section-head"><span class="section-num">01</span><div><h2>Executive Summary</h2><div class="rule"></div></div></div>
  <p class="narrative">${escapeHtml(model.narrative)}</p>
  <div class="stat-row">
    <div class="stat"><div class="eyebrow">Total findings</div><div class="num">${s.total}</div><div class="sub">${s.byState.open} open · ${s.byState.accepted} accepted</div></div>
    <div class="stat"><div class="eyebrow">Critical / High</div><div class="num">${s.bySeverity.CRITICAL} / ${s.bySeverity.HIGH}</div><div class="sub">in this export</div></div>
    <div class="stat"><div class="eyebrow">Coverage</div><div class="num">${Math.round(s.coverage_pct * 100)}%</div><div class="sub">${s.asc_checked}/${s.asc_applicable} ASC &para;</div></div>
    <div class="stat"><div class="eyebrow">Materiality</div><div class="num">${fmtMoney(s.materiality.planning)}</div><div class="sub">${(s.materiality.pct * 100).toFixed(2)}% of NAV</div></div>
  </div>
  <div class="chart">
    <div class="eyebrow">Findings by severity</div>
    ${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(k => `
      <div class="bar-row"><span class="lbl">${k.charAt(0) + k.slice(1).toLowerCase()}</span>
      <div class="bar-track"><div class="bar-fill ${sevClass(k)}" style="width:${(100 * (s.bySeverity[k] || 0) / maxSev).toFixed(1)}%"></div></div>
      <span class="val">${s.bySeverity[k] || 0}</span></div>`).join('')}
  </div>
  <div class="chart">
    <div class="eyebrow">Disposition of population</div>
    <div class="dispo">
      <span style="width:${pct(s.byState.open)};background:#94969c"></span>
      <span style="width:${pct(s.byState.accepted)};background:#1a2b4a"></span>
      <span style="width:${pct(s.byState.resolved)};background:#166534"></span>
      <span style="width:${pct(s.byState.discarded)};background:#cecec4"></span>
    </div>
    <div class="legend">
      <span><i style="background:#94969c"></i>Open ${s.byState.open}</span>
      <span><i style="background:#1a2b4a"></i>Accepted ${s.byState.accepted}</span>
      <span><i style="background:#166534"></i>Resolved ${s.byState.resolved}</span>
      <span><i style="background:#cecec4"></i>Discarded ${s.byState.discarded}</span>
    </div>
  </div>

  <div class="section-head" style="margin-top:30px"><span class="section-num">00</span><div><h2>Contents</h2><div class="rule"></div></div></div>
  ${tocItems.map(t => `<div class="toc-item"><span>${escapeHtml(t)}</span></div>`).join('')}

  ${sectionsHTML}

  <section class="report-section">
    <div class="section-head"><span class="section-num">${String(model.groups.length + 2).padStart(2, '0')}</span><div><h2>Appendix A — Coverage</h2><div class="rule"></div></div></div>
    <div style="margin-top:12px">${coverageRows}</div>
    ${skippedHTML ? `<div class="eyebrow" style="margin:18px 0 8px">ASC paragraphs not checked (with reason)</div>${skippedHTML}` : ''}
  </section>

  ${evergreenHTML}

  <div class="report-footer">Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · ${escapeHtml(m.build_date)}</div>
</div></div>
</body></html>`;
  }

  function filterForExport(mode) {
    if (mode === 'preparer') {
      return state.findings.filter(f => f.state === 'OPEN' || f.state === 'ACCEPTED').filter(f => f.prior_review_recurrence !== 'EVERGREEN_ACCEPTED');
    }
    // audit
    return state.findings.filter(f => f.state === 'ACCEPTED' || f.state === 'RESOLVED');
  }

  // ============================================================
  // S1-01 · COMMAND PALETTE (Cmd/Ctrl+K)
  // ============================================================
  function bindCommandPalette() {
    const dlg = document.getElementById('cmd-palette');
    if (!dlg) return;
    const input = document.getElementById('cmd-input');
    const list = document.getElementById('cmd-list');
    let activeIndex = 0;

    function open() {
      dlg.classList.add('open');
      input.value = '';
      activeIndex = 0;
      render('');
      setTimeout(() => input.focus(), 50);
    }
    function close() {
      dlg.classList.remove('open');
      // Blur the input so subsequent keyboard shortcuts (?, J/K, A/R/D…) fire correctly
      // rather than being captured as text input.
      input.blur();
    }

    function buildCommands() {
      const cmds = [];
      // Reviews
      (window.SHINE_SAMPLE.reviews_index || []).forEach(r => {
        cmds.push({ kind: 'review', title: 'Open ' + r.fund_legal_name, hint: r.period + ' · ' + r.draft, run: () => { openReview(r.review_id); close(); } });
      });
      // Findings (if a review is open)
      if (state.review) {
        state.findings.forEach(f => {
          cmds.push({ kind: 'finding', title: 'Go to ' + f.id + ' — ' + f.section, hint: f.statement + ' · ' + f.severity.impact + ' · ' + f.state, run: () => { switchView('dashboard'); openDrawer(f.id); close(); } });
        });
      }
      // Actions
      cmds.push({ kind: 'action', title: 'Toggle theme', hint: state.theme, run: () => { setTheme(state.theme === 'light' ? 'dark' : 'light'); close(); } });
      cmds.push({ kind: 'action', title: 'Toggle density', hint: state.density, run: () => { state.density = state.density === 'comfortable' ? 'compact' : 'comfortable'; applyDensity(); saveGlobalPrefs({ density: state.density }); close(); } });
      cmds.push({ kind: 'action', title: 'Group by statement', hint: 'default', run: () => { setGroupMode('statement'); close(); } });
      cmds.push({ kind: 'action', title: 'Group by severity', hint: '', run: () => { setGroupMode('severity'); close(); } });
      cmds.push({ kind: 'action', title: 'Group by layer', hint: '', run: () => { setGroupMode('layer'); close(); } });
      cmds.push({ kind: 'action', title: 'Show keyboard shortcuts', hint: '?', run: () => { close(); showHelpOverlay(); } });
      if (state.review) {
        cmds.push({ kind: 'action', title: 'Export Preparer PDF', hint: 'OPEN + ACCEPTED', run: () => { close(); exportPDF('preparer'); } });
        cmds.push({ kind: 'action', title: 'Export Audit File PDF', hint: 'ACCEPTED + RESOLVED', run: () => { close(); exportPDF('audit'); } });
        cmds.push({ kind: 'view', title: 'Go to Coverage', hint: '', run: () => { switchView('coverage'); close(); } });
        cmds.push({ kind: 'view', title: 'Go to Activity', hint: 'review-wide log', run: () => { switchView('activity'); close(); } });
      }
      cmds.push({ kind: 'view', title: 'Go to Reviews', hint: '', run: () => { switchView('reviews'); close(); } });
      cmds.push({ kind: 'view', title: 'Go to Settings', hint: '', run: () => { switchView('settings'); close(); } });
      return cmds;
    }

    function fuzzyScore(query, text) {
      // Simple subsequence match with bonus for word-start matches.
      const q = query.toLowerCase();
      const t = text.toLowerCase();
      if (!q) return 1;
      let qi = 0, score = 0, prevMatchIdx = -2;
      for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) {
          score += 1;
          if (i === 0 || /[\s\-_·,.]/.test(t[i - 1])) score += 2; // word-start bonus
          if (i === prevMatchIdx + 1) score += 1; // contiguous bonus
          prevMatchIdx = i;
          qi++;
        }
      }
      return qi === q.length ? score : 0;
    }

    function render(query) {
      const all = buildCommands();
      const filtered = (!query ? all : all
        .map(c => ({ c, score: fuzzyScore(query, c.title + ' ' + c.hint) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.c)).slice(0, 30);
      activeIndex = Math.min(activeIndex, filtered.length - 1);
      if (activeIndex < 0) activeIndex = 0;
      list.innerHTML = filtered.length === 0
        ? '<div class="cmd-empty">No commands match.</div>'
        : filtered.map((c, i) => `
          <div class="cmd-item ${i === activeIndex ? 'active' : ''}" data-idx="${i}">
            <span class="cmd-kind cmd-kind-${c.kind}">${c.kind}</span>
            <span class="cmd-title">${escapeHtml(c.title)}</span>
            <span class="cmd-hint">${escapeHtml(c.hint || '')}</span>
          </div>`).join('');
      list.querySelectorAll('.cmd-item').forEach(el => {
        el.addEventListener('click', () => filtered[Number(el.dataset.idx)].run());
      });
      list._filtered = filtered;
    }

    input.addEventListener('input', () => render(input.value.trim()));
    input.addEventListener('keydown', e => {
      const filtered = list._filtered || [];
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, filtered.length - 1); render(input.value.trim()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(input.value.trim()); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) cmd.run();
      }
    });
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });

    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open();
      }
    });
    // Expose for the help overlay / palette commands
    window.__shineOpenPalette = open;
  }

  // ============================================================
  // S1-02 · KEYBOARD SHORTCUTS + ?-OVERLAY  (+ J/K focus navigation)
  // ============================================================
  function bindHelpOverlay() {
    const ov = document.getElementById('help-overlay');
    if (!ov) return;
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
    const close = ov.querySelector('[data-help-close]');
    if (close) close.addEventListener('click', () => ov.classList.remove('open'));
  }
  function showHelpOverlay() {
    const ov = document.getElementById('help-overlay');
    if (ov) ov.classList.add('open');
  }

  function focusFinding(fid) {
    state.focusedFindingId = fid;
    document.querySelectorAll('.finding-card.is-focused').forEach(el => el.classList.remove('is-focused'));
    if (!fid) return;
    const el = document.querySelector(`.finding-card[data-fid="${CSS.escape(fid)}"]`);
    if (el) {
      el.classList.add('is-focused');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  function visibleFindings() {
    return Array.from(document.querySelectorAll('.finding-card')).map(el => el.dataset.fid);
  }
  function moveFocus(delta) {
    const ids = visibleFindings();
    if (!ids.length) return;
    const cur = state.focusedFindingId;
    let idx = cur ? ids.indexOf(cur) : -1;
    idx = Math.max(0, Math.min(ids.length - 1, idx + delta));
    focusFinding(ids[idx]);
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  // ============================================================
  // S1-03 · BULK SELECTION + ACTIONS
  // ============================================================
  function bindBulkActions() {
    const bar = document.getElementById('selection-bar');
    if (!bar) return;
    bar.addEventListener('click', e => {
      const btn = e.target.closest('[data-bulk]');
      if (!btn) return;
      const action = btn.dataset.bulk;
      if (action === 'clear') { state.selectedIds.clear(); state.selectionAnchor = null; renderSelectionBar(); renderFindings(); return; }
      const ids = [...state.selectedIds];
      if (ids.length === 0) { toast('No findings selected'); return; }
      bulkApply(action, ids);
    });
  }
  function renderSelectionBar() {
    const bar = document.getElementById('selection-bar');
    if (!bar) return;
    const n = state.selectedIds.size;
    if (n === 0) { bar.classList.remove('open'); return; }
    bar.classList.add('open');
    bar.querySelector('.selection-count').textContent = n + ' selected';
  }
  function bulkApply(action, ids) {
    let touched = 0;
    let gated = 0;
    ids.forEach(fid => {
      const f = state.findings.find(x => x.id === fid);
      if (!f) return;
      if (action === 'discard' && projectedDiscardRate(fid) > 0.20) {
        // Don't gate every single one; just skip the gate for bulk (per council: bulk implies intent),
        // but record that we're proceeding to keep the discard surveillance accurate.
        // Each discard still gets the attestation field set to "Bulk discard — controller intent".
        pushUndo(f);
        const before = f.state;
        f.state = 'DISCARDED';
        f.discard_attestation = 'Bulk discard — controller intent (no per-finding attestation; aggregate signal on dashboard footer)';
        logHistory(f, 'disposition', { from: before, to: 'DISCARDED', bulk: true });
        touched++; gated++;
        return;
      }
      const before = f.state;
      pushUndo(f);
      if (action === 'accept') f.state = 'ACCEPTED';
      else if (action === 'resolve') f.state = 'RESOLVED';
      else if (action === 'discard') f.state = 'DISCARDED';
      logHistory(f, 'disposition', { from: before, to: f.state, bulk: true });
      touched++;
    });
    state.selectedIds.clear(); state.selectionAnchor = null;
    persist();
    renderDashboard();
    toast(`${touched} finding${touched === 1 ? '' : 's'} → ${action.toUpperCase()}${gated ? ' (gated discards counted)' : ''}`);
  }
  function toggleSelection(fid, range) {
    if (range && state.selectionAnchor) {
      const ids = visibleFindings();
      const a = ids.indexOf(state.selectionAnchor);
      const b = ids.indexOf(fid);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) state.selectedIds.add(ids[i]);
      }
    } else {
      if (state.selectedIds.has(fid)) state.selectedIds.delete(fid);
      else state.selectedIds.add(fid);
      state.selectionAnchor = fid;
    }
    renderSelectionBar();
    // Update only the affected cards visually
    document.querySelectorAll('.finding-card').forEach(el => {
      el.classList.toggle('is-selected', state.selectedIds.has(el.dataset.fid));
    });
  }

  // ============================================================
  // S1-04 · SAVED VIEWS
  // ============================================================
  function seedDefaultSavedViews() {
    state.savedViews = [
      { id: 'view-my-open-critical', name: 'My open critical', spec: { severity: 'CRITICAL', states: ['OPEN'], search: '', groupMode: 'statement' } },
      { id: 'view-ready-to-discard', name: 'Ready to discard', spec: { severity: 'LOW', states: ['OPEN'], search: '', groupMode: 'statement' } },
      { id: 'view-recurring', name: 'Recurring this period', spec: { severity: 'all', states: [], search: 'recurring', groupMode: 'statement' } },
      { id: 'view-qc-by-layer', name: 'By layer for QC pass', spec: { severity: 'all', states: [], search: '', groupMode: 'layer' } }
    ];
    persistSavedViews();
  }
  function bindSavedViews() {
    const row = document.getElementById('saved-views');
    if (!row) return;
    row.addEventListener('click', e => {
      const chip = e.target.closest('[data-view-id]');
      if (chip) { applySavedView(chip.dataset.viewId); return; }
      if (e.target.closest('#btn-save-view')) saveCurrentView();
      if (e.target.closest('[data-delete-view]')) {
        const id = e.target.closest('[data-delete-view]').dataset.deleteView;
        state.savedViews = state.savedViews.filter(v => v.id !== id);
        persistSavedViews();
        renderSavedViews();
      }
    });
  }
  function renderSavedViews() {
    const row = document.getElementById('saved-views');
    if (!row) return;
    row.innerHTML = state.savedViews.map(v => `
      <button class="pill view-pill ${state.activeViewId === v.id ? 'active' : ''}" data-view-id="${escapeHtml(v.id)}">
        ${escapeHtml(v.name)}
        <span class="view-pill-x" data-delete-view="${escapeHtml(v.id)}" title="Delete view">×</span>
      </button>
    `).join('') + `<button class="pill view-pill-add" id="btn-save-view" title="Save current filter as a view">+ Save view</button>`;
  }
  function applySavedView(id) {
    const v = state.savedViews.find(x => x.id === id);
    if (!v) return;
    state.activeViewId = id;
    state.filters.severity = v.spec.severity;
    state.filters.states = new Set(v.spec.states);
    state.filters.search = v.spec.search || '';
    state.groupMode = v.spec.groupMode || 'statement';
    document.getElementById('findings-search').value = state.filters.search;
    document.querySelectorAll('#severity-filter .pill').forEach(p => p.classList.toggle('active', p.dataset.severity === state.filters.severity));
    document.querySelectorAll('#state-filter .pill').forEach(p => p.classList.toggle('active', state.filters.states.has(p.dataset.state)));
    document.querySelectorAll('#group-mode .seg-opt').forEach(p => p.classList.toggle('active', p.dataset.group === state.groupMode));
    renderSavedViews();
    renderFindings();
  }
  function saveCurrentView() {
    const name = (prompt('Name this view:') || '').trim();
    if (!name) return;
    const v = {
      id: 'view-' + Date.now().toString(36),
      name,
      spec: {
        severity: state.filters.severity,
        states: [...state.filters.states],
        search: state.filters.search,
        groupMode: state.groupMode
      }
    };
    state.savedViews.push(v);
    state.activeViewId = v.id;
    persistSavedViews();
    renderSavedViews();
    toast('Saved view: ' + name);
  }

  // ============================================================
  // S1-06 · DECOUPLE PERSISTENCE
  // ============================================================
  function decoupleConstituent(rootFid, constituentId) {
    const root = state.findings.find(x => x.id === rootFid);
    if (!root) return;
    const detail = (root.constituent_details || []).find(c => c.id === constituentId);
    if (!detail) return;
    // Restore the constituent as a standalone finding.
    pushUndo(root);
    const restored = {
      id: constituentId,
      subagent: detail.subagent || 'reconciler',
      layer: detail.layer || root.layer,
      statement: root.statement,
      section: root.section,
      sortOrder: (root.sortOrder || 0) + 0.5,
      location: { ...root.location },
      severity: detail.severity || root.severity,
      subagentRaw: detail.subagentRaw || '(restored constituent)',
      voiceNormalized: null,
      controllerEdited: null,
      fix: 'See root cause ' + rootFid + ' — this constituent was decoupled by the controller and now stands alone.',
      fixSubagentRaw: 'See root cause ' + rootFid + ' — this constituent was decoupled by the controller and now stands alone.',
      fixVoiceNormalized: null,
      evidence: detail.evidence || {},
      merge_key: (root.merge_key || '') + '::decoupled-' + constituentId,
      finding_class: detail.finding_class || root.finding_class || 'formatting',
      prior_review_recurrence: 'NEW',
      evergreen_accepted: false,
      reconciler_pattern: null,
      reconciler_specificity_score: null,
      constituent_findings: [],
      subagent_version: root.subagent_version,
      prompt_version: root.prompt_version,
      reference_versions: root.reference_versions,
      state: 'OPEN',
      detail: 'Decoupled from root cause ' + rootFid + ' on ' + new Date().toISOString().slice(0, 10),
      comments: [],
      history: [{ ts: Date.now(), author: state.author, kind: 'restore', from: rootFid }],
      restored_from_root: rootFid
    };
    // Mutate root: remove constituent
    root.constituent_findings = (root.constituent_findings || []).filter(id => id !== constituentId);
    root.constituent_details = (root.constituent_details || []).filter(c => c.id !== constituentId);
    if (!root.decoupled_constituents) root.decoupled_constituents = [];
    root.decoupled_constituents.push(constituentId);
    if (root.constituent_findings.length === 0) {
      // Root no longer collapses anything — clear pattern attribution
      root.reconciler_pattern = null;
      root.reconciler_specificity_score = null;
    }
    logHistory(root, 'decouple', { constituent: constituentId });
    // Insert restored finding right after root
    const rootIdx = state.findings.findIndex(x => x.id === rootFid);
    state.findings.splice(rootIdx + 1, 0, restored);
    persist();
    renderDashboard();
    if (document.getElementById('finding-drawer').classList.contains('open')) openDrawer(rootFid);
    toast('Decoupled ' + constituentId + ' (logged to activity)');
  }

  // ============================================================
  // S1-07 · EVIDENCE DRILL-DOWN (popover on citation click)
  // ============================================================
  function bindEvidencePopover() {
    const pop = document.getElementById('evidence-popover');
    if (!pop) return;
    // Click anywhere outside the popover closes it
    document.addEventListener('click', e => {
      if (!pop.classList.contains('open')) return;
      if (e.target.closest('#evidence-popover')) return;
      if (e.target.closest('.finding-citation')) return; // citation click below handles open
      pop.classList.remove('open');
    });
  }
  function openEvidencePopover(citation, anchorEl) {
    const pop = document.getElementById('evidence-popover');
    if (!pop) return;
    const entry = lookupReferenceEntry(citation);
    const body = pop.querySelector('.popover-body');
    body.innerHTML = entry
      ? `<div class="popover-cite mono">${escapeHtml(citation)}</div>
         <div class="popover-title">${escapeHtml(entry.title || '')}</div>
         <div class="popover-text">${escapeHtml(entry.requirement || entry.text || '')}</div>
         ${entry.common_omission ? `<div class="popover-row"><strong>Common omission:</strong> ${escapeHtml(entry.common_omission)}</div>` : ''}
         ${entry.default_severity ? `<div class="popover-row"><strong>Default severity:</strong> ${escapeHtml(entry.default_severity)}</div>` : ''}
         ${entry.source_file ? `<div class="popover-source mono">source: ${escapeHtml(entry.source_file)}</div>` : ''}`
      : `<div class="popover-cite mono">${escapeHtml(citation)}</div>
         <div class="popover-text muted">No matrix entry bundled with this build for this citation. Reference: shine-fs-review-v8/reference/.</div>`;
    // Position the popover near the anchor
    const r = anchorEl.getBoundingClientRect();
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 380)) + 'px';
    pop.classList.add('open');
  }
  function lookupReferenceEntry(citation) {
    if (!window.SHINE_REFERENCE) return null;
    return window.SHINE_REFERENCE[citation] || null;
  }

  // ============================================================
  // S1-09 · PER-FINDING MATERIALITY AWARENESS
  // ============================================================
  function parseMonetaryAmount(text) {
    if (!text) return null;
    // Pattern: $ 412,400,000 OR $412.4M OR 142,300,000
    const dollarRe = /\$?\s*([\d,]+(?:\.\d+)?)\s*([MK])?/g;
    let best = 0;
    let m;
    while ((m = dollarRe.exec(text)) !== null) {
      let v = parseFloat(m[1].replace(/,/g, ''));
      if (isNaN(v)) continue;
      if (m[2] === 'M') v *= 1e6;
      else if (m[2] === 'K') v *= 1e3;
      if (v > best) best = v;
    }
    return best > 0 ? best : null;
  }
  function materialityChipHtml(f) {
    if (!state.review || !state.review.brief) return '';
    if (f.finding_class !== 'tie_out_break') return '';
    const text = (f.evidence && f.evidence.xlsx_proof) || f.subagentRaw || '';
    const amt = parseMonetaryAmount(text);
    if (!amt) return '';
    const planning = state.review.brief.materiality_planning_value || 0;
    const trivial = state.review.brief.clearly_trivial_value || 0;
    if (planning <= 0) return '';
    const pct = (amt / planning) * 100;
    let cls = 'mat-low';
    if (amt > planning) cls = 'mat-crit';
    else if (amt > planning * 0.5) cls = 'mat-high';
    else if (amt <= trivial) cls = 'mat-trivial';
    return `<span class="mat-chip ${cls}" title="Tie-out value ${fmtMoney(amt)} vs planning materiality ${fmtMoney(planning)} (clearly trivial ≤ ${fmtMoney(trivial)})">${fmtMoney(amt)} · ${pct < 1 ? '<1' : pct.toFixed(0)}% mat</span>`;
  }

  // ============================================================
  // S1-10 · DENSITY + STATEMENT NAV
  // ============================================================
  function applyDensity() {
    document.documentElement.dataset.density = state.density;
  }
  function applySeverityIcons() {
    document.documentElement.dataset.sevIcons = state.severityIcons ? 'on' : 'off';
  }
  function bindStatementNav() {
    const rail = document.getElementById('statement-nav');
    if (!rail) return;
    rail.addEventListener('click', e => {
      const a = e.target.closest('[data-anchor]');
      if (!a) return;
      const key = a.dataset.anchor;
      const target = document.querySelector(`[data-statement-anchor="${CSS.escape(key)}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  function renderStatementNav(groups) {
    const rail = document.getElementById('statement-nav');
    if (!rail) return;
    if (state.groupMode !== 'statement' || !groups || groups.length === 0) {
      rail.innerHTML = '';
      rail.classList.remove('has-content');
      return;
    }
    rail.classList.add('has-content');
    rail.innerHTML = '<div class="nav-title">JUMP TO</div>' + groups.map(g => {
      const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      g.findings.forEach(f => counts[f.severity.impact]++);
      const max = counts.CRITICAL > 0 ? 'crit' : counts.HIGH > 0 ? 'high' : counts.MEDIUM > 0 ? 'med' : 'low';
      return `<button class="nav-row" data-anchor="${escapeHtml(g.label)}">
        <span class="nav-row-label">${escapeHtml(g.label)}</span>
        <span class="nav-row-count nav-row-${max}">${g.findings.length}</span>
      </button>`;
    }).join('');
  }

  // ============================================================
  // S1-11 · POLISH BUNDLE — nav counters
  // ============================================================
  function updateNavCounters() {
    const reviewsCount = (window.SHINE_SAMPLE && window.SHINE_SAMPLE.reviews_index || []).length;
    document.querySelector('.nav-tab[data-view="reviews"]').dataset.count = reviewsCount;
    if (state.review) {
      const dashCount = state.findings.length;
      const cov = Math.round((state.review.coverage.coverage_completeness_pct || 0) * 100);
      document.querySelector('.nav-tab[data-view="dashboard"]').dataset.count = dashCount;
      document.querySelector('.nav-tab[data-view="coverage"]').dataset.count = cov + '%';
    } else {
      document.querySelector('.nav-tab[data-view="dashboard"]').dataset.count = '';
      document.querySelector('.nav-tab[data-view="coverage"]').dataset.count = '';
    }
  }

  // ============================================================
  // S1-12 · ONBOARDING TOUR
  // ============================================================
  function bindOnboarding() {
    const helpBtn = document.getElementById('btn-help');
    if (helpBtn) helpBtn.addEventListener('click', () => showHelpOverlay());
  }

  // ============================================================
  // ACTIVITY VIEW (review-wide chronological log)
  // ============================================================
  function renderActivity() {
    if (!state.review) return;
    const el = document.getElementById('activity-feed');
    if (!el) return;
    const events = [];
    state.findings.forEach(f => {
      (f.history || []).forEach(h => events.push({ ...h, fid: f.id, section: f.section, statement: f.statement }));
      (f.comments || []).forEach(c => events.push({ ts: c.ts, author: c.author, kind: 'comment', text: c.text, fid: f.id, section: f.section, statement: f.statement }));
    });
    events.sort((a, b) => b.ts - a.ts);
    if (events.length === 0) {
      el.innerHTML = '<div class="muted" style="padding:32px;text-align:center">No activity yet. Disposition findings or add comments to see them here.</div>';
      return;
    }
    el.innerHTML = events.slice(0, 200).map(e => `
      <div class="activity-row" data-fid="${escapeHtml(e.fid)}">
        <span class="activity-ts mono">${formatTs(e.ts)}</span>
        <span class="activity-kind activity-kind-${escapeHtml(e.kind)}">${escapeHtml(e.kind)}</span>
        <span class="activity-fid mono">${escapeHtml(e.fid)}</span>
        <span class="activity-text">${activityText(e)}</span>
        <span class="activity-author muted">${escapeHtml(e.author || 'unknown')}</span>
      </div>
    `).join('');
    el.querySelectorAll('.activity-row').forEach(row => {
      row.addEventListener('click', () => { switchView('dashboard'); openDrawer(row.dataset.fid); });
    });
  }
  function activityText(e) {
    if (e.kind === 'disposition') return `${escapeHtml(e.from)} → <strong>${escapeHtml(e.to)}</strong>${e.bulk ? ' <em class="muted">(bulk)</em>' : ''}`;
    if (e.kind === 'edit') return `edited finding text`;
    if (e.kind === 'comment') return `<em>${escapeHtml((e.text || '').slice(0, 100))}${(e.text || '').length > 100 ? '…' : ''}</em>`;
    if (e.kind === 'evergreen') return `marked evergreen <em class="muted">${escapeHtml(e.reason || '')}</em>`;
    if (e.kind === 'decouple') return `decoupled ${escapeHtml(e.constituent || '')}`;
    if (e.kind === 'restore') return `restored from ${escapeHtml(e.from || '')}`;
    return escapeHtml(JSON.stringify(e));
  }
  function formatTs(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const pad = n => n < 10 ? '0' + n : n;
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ============================================================
  // S1-05 · COMMENT API
  // ============================================================
  function addComment(fid, text) {
    const f = state.findings.find(x => x.id === fid);
    if (!f) return;
    if (!f.comments) f.comments = [];
    const c = { id: 'c-' + Date.now().toString(36), author: state.author, ts: Date.now(), text };
    f.comments.push(c);
    persist();
    if (document.getElementById('finding-drawer').classList.contains('open')) openDrawer(fid);
    toast('Comment added');
  }

  // setGroupMode helper used by command palette + saved views
  function setGroupMode(mode) {
    state.groupMode = mode;
    document.querySelectorAll('#group-mode .seg-opt').forEach(b => b.classList.toggle('active', b.dataset.group === mode));
    if (state.review) renderFindings();
  }

  // ============================================================
  // HELPERS
  // ============================================================
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtMoney(n) {
    if (n == null) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 2200);
  }

})();
