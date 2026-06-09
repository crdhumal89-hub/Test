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

    // Theme
    const savedTheme = localStorage.getItem('shine:theme') || 'light';
    setTheme(savedTheme);

    // Render initial reviews list
    renderReviewsList();
    updateNavCounters();

    // If a review was previously active, restore it
    const lastReview = localStorage.getItem('shine:lastReview');
    if (lastReview) {
      const r = window.SHINE_SAMPLE.reviews_index.find(x => x.review_id === lastReview);
      if (r) openReview(lastReview);
    }
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
  function bindImport() {
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed.brief && parsed.findings) {
            window.SHINE_SAMPLE.review = parsed;
            state.currentReviewId = parsed.brief.review_id;
            state.review = parsed;
            state.findings = parsed.findings.map(f => ({ ...f }));
            // B-005 fix: clear undo across review boundaries to prevent cross-review state contamination
            state.undoStack = [];
            // Add to reviews index if missing
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
            toast(`Imported ${file.name}`);
          } else {
            toast('Invalid review file (missing brief or findings)');
          }
        } catch (err) {
          toast('Could not parse JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // ============================================================
  // PDF EXPORT
  // ============================================================
  function exportPDF(mode) {
    if (!state.review) { toast('No active review'); return; }
    // POL-002 fix: loading state during export
    const btn = document.getElementById(mode === 'preparer' ? 'btn-export-preparer' : 'btn-export-audit');
    const prevLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';
    setTimeout(() => {
      try {
        if (window.jspdf) {
          tier1PDF(mode);
        } else {
          // jsPDF didn't load (CDN blocked / offline). Skip Tier 2 (browser print is not a true
          // PDF download) and go straight to Tier 3 (Blob HTML), which always produces a file.
          console.warn('jsPDF unavailable; using Tier 3 Blob fallback');
          tier3Blob(mode);
        }
      } catch (e) {
        console.error('Tier 1 failed', e);
        try { tier3Blob(mode); }
        catch (e2) { console.error('Tier 3 failed', e2); toast('Export failed: ' + e2.message); }
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    }, 50);
  }

  // Tier 2 (`window.print()`) is intentionally not part of the automatic fallback chain.
  // It does not produce a file download (it opens a dialog) so it can't satisfy the export
  // contract automatically; users who prefer print can use browser Ctrl+P directly.
  function tier1PDF(mode) {
    if (!window.jspdf) throw new Error('jsPDF not loaded');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 36;
    const marginY = 48;
    const usableW = pageW - marginX * 2;
    let y = marginY;

    const findings = filterForExport(mode);
    const groups = groupByStatement(findings);
    const b = state.review.brief;

    // Header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(b.fund_legal_name, marginX, y);
    y += 18;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(110);
    pdf.text(`${b.period} · ${b.draft} · ${b.domicile} · ${b.structure_type}`, marginX, y);
    y += 14;
    pdf.text(`${mode === 'preparer' ? 'Preparer export' : 'Audit file export'} · Build ${b.build_date}`, marginX, y);
    y += 18;
    pdf.setTextColor(0);

    // Readiness
    const verdict = computeReadiness();
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Readiness: ${verdict.label}`, marginX, y);
    pdf.setFont('helvetica', 'normal');
    y += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(110);
    pdf.text(verdict.driver, marginX, y, { maxWidth: usableW });
    y += 22;
    pdf.setTextColor(0);

    // Groups
    groups.forEach(g => {
      if (y > pageH - 100) { pdf.addPage(); y = marginY; }
      // Gold-tinted statement header
      pdf.setFillColor(255, 248, 225);
      pdf.setDrawColor(212, 175, 55);
      pdf.rect(marginX, y - 12, usableW, 24, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(g.label, marginX + 8, y + 4);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`${g.findings.length} finding${g.findings.length === 1 ? '' : 's'}`, pageW - marginX - 8, y + 4, { align: 'right' });
      y += 26;
      if (g.note) {
        pdf.setFontSize(8);
        pdf.setTextColor(110);
        pdf.setFont('helvetica', 'italic');
        const lines = pdf.splitTextToSize(g.note, usableW);
        pdf.text(lines, marginX, y);
        y += lines.length * 10 + 4;
        pdf.setTextColor(0);
        pdf.setFont('helvetica', 'normal');
      }

      g.findings.forEach(f => {
        const minRoom = 90;
        if (y > pageH - minRoom) { pdf.addPage(); y = marginY; }
        // ID + severity
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(`${f.id}  ${f.severity.impact}/${f.severity.confidence}  ${f.state}`, marginX, y);
        y += 12;
        // Location
        const loc = [
          f.section,
          f.location && f.location.note_ref,
          f.location && f.location.page ? `p. ${f.location.page}` : null,
          f.location && f.location.line_id
        ].filter(Boolean).join(' · ');
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(110);
        pdf.text(loc, marginX, y, { maxWidth: usableW });
        y += 10;
        pdf.setTextColor(0);
        // Text
        const txt = mode === 'audit'
          ? (f.controllerEdited || f.subagentRaw)
          : (f.controllerEdited || f.voiceNormalized || f.subagentRaw);
        pdf.setFontSize(9);
        const tLines = pdf.splitTextToSize(txt, usableW);
        pdf.text(tLines, marginX, y);
        y += tLines.length * 11 + 4;
        // Citation
        if (f.evidence && (f.evidence.asc_reference || f.evidence.regulatory_citation)) {
          pdf.setFontSize(8);
          pdf.setTextColor(110);
          const cites = [f.evidence.asc_reference, f.evidence.regulatory_citation].filter(Boolean).join(' · ');
          pdf.text(`Citation: ${cites}`, marginX, y);
          y += 10;
          pdf.setTextColor(0);
        }
        // Fix
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'italic');
        const fixTxt = f.fixControllerEdited || f.fixVoiceNormalized || f.fix;
        const fLines = pdf.splitTextToSize('Fix: ' + fixTxt, usableW);
        pdf.text(fLines, marginX, y);
        y += fLines.length * 11 + 6;
        pdf.setFont('helvetica', 'normal');
        // Reconciler (audit mode only)
        if (mode === 'audit' && f.reconciler_pattern) {
          pdf.setFontSize(8);
          pdf.setTextColor(60, 60, 100);
          pdf.text(`Reconciler: ${f.reconciler_pattern} · constituents: ${f.constituent_findings.join(', ')}`, marginX, y, { maxWidth: usableW });
          y += 10;
          pdf.setTextColor(0);
        }
        y += 6;
      });
      y += 8;
    });

    // Audit-file extras: evergreen section
    if (mode === 'audit') {
      const evergreen = state.findings.filter(f => f.prior_review_recurrence === 'EVERGREEN_ACCEPTED');
      if (evergreen.length) {
        if (y > pageH - 120) { pdf.addPage(); y = marginY; }
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Evergreen-accepted findings', marginX, y);
        y += 16;
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        evergreen.forEach(f => {
          if (y > pageH - 60) { pdf.addPage(); y = marginY; }
          pdf.text(`${f.id} · ${f.statement} · ${f.section}`, marginX, y);
          y += 11;
          pdf.setTextColor(110);
          pdf.setFontSize(8);
          const r = pdf.splitTextToSize(`Reason: ${f.evergreen_acceptance_reason} (${f.evergreen_acceptance_date})`, usableW);
          pdf.text(r, marginX, y);
          y += r.length * 10 + 8;
          pdf.setTextColor(0);
          pdf.setFontSize(9);
        });
      }
    }

    // Attribution footer on every page
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(140);
      pdf.text(
        `Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · ${b.build_date}`,
        marginX, pageH - 24
      );
      pdf.text(`Page ${i} of ${pageCount}`, pageW - marginX, pageH - 24, { align: 'right' });
      pdf.setTextColor(0);
    }

    const filename = `${b.fund_code}-${b.period}-shine-${mode === 'preparer' ? 'preparer' : 'audit-file'}-export-${b.build_date.replace(/-/g, '')}.pdf`;
    pdf.save(filename);
    toast(`Exported ${filename}`);
  }

  function tier3Blob(mode) {
    const b = state.review.brief;
    const verdict = computeReadiness();
    const findings = filterForExport(mode);
    const groups = groupByStatement(findings);
    const css = `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:780px;margin:24px auto;padding:0 16px;color:#1A1A1A;font-size:13px;line-height:1.5}
h1{font-size:22px;margin:0 0 6px}h2{font-size:14px;background:#FFF8E1;border:1px solid #D4AF37;padding:8px 12px;margin:24px 0 8px;border-radius:4px}
.meta{color:#666;font-size:12px;margin-bottom:16px}.verdict{padding:8px 12px;border-radius:4px;background:#F4F4F1;font-weight:600;margin-bottom:20px}
.f{border:1px solid #E5E5E0;padding:12px;margin:8px 0;border-radius:4px}.id{font-family:'JetBrains Mono',monospace;font-size:11px;color:#666}
.chips{margin:4px 0 8px}.chip{display:inline-block;padding:2px 8px;font-size:11px;border-radius:4px;margin-right:4px}.chip-crit{background:#FDEDEC;color:#C0392B}.chip-high{background:#FEF3E0;color:#D97706}.chip-med{background:#FCF6D8;color:#B59500}.chip-low{background:#F0F0EE;color:#6B7280}
.loc{color:#666;font-size:11px;margin-bottom:6px}.cite{font-family:'JetBrains Mono',monospace;font-size:11px;background:#F4F4F1;padding:2px 6px;border-radius:3px;color:#666;margin-right:4px}
.fix{font-style:italic;color:#444;margin-top:6px}hr{border:0;border-top:1px solid #E5E5E0;margin:32px 0 16px}
.footer{color:#999;font-size:10px;text-align:center;font-family:'JetBrains Mono',monospace}`;
    const sevChipClass = (s) => ({CRITICAL:'chip-crit',HIGH:'chip-high',MEDIUM:'chip-med',LOW:'chip-low'})[s];
    const renderFinding = (f) => {
      const loc = [f.section, f.location && f.location.note_ref, f.location && f.location.page && ('p. ' + f.location.page), f.location && f.location.line_id].filter(Boolean).map(escapeHtml).join(' · ');
      const cites = [];
      if (f.evidence && f.evidence.asc_reference) cites.push(`<span class="cite">${escapeHtml(f.evidence.asc_reference)}</span>`);
      if (f.evidence && f.evidence.regulatory_citation) cites.push(`<span class="cite">${escapeHtml(f.evidence.regulatory_citation)}</span>`);
      const text = mode === 'audit' ? (f.controllerEdited || f.subagentRaw) : (f.controllerEdited || f.voiceNormalized || f.subagentRaw);
      const fix = f.fixControllerEdited || f.fixVoiceNormalized || f.fix;
      return `<div class="f"><span class="id">${f.id}</span>
        <div class="chips"><span class="chip ${sevChipClass(f.severity.impact)}">${f.severity.impact}</span><span class="chip">${f.severity.confidence}</span><span class="chip">${f.state}</span></div>
        <div class="loc">${loc}</div>
        <div>${escapeHtml(text)}</div>
        ${cites.length ? `<div style="margin-top:6px">${cites.join('')}</div>` : ''}
        <div class="fix"><strong>Fix:</strong> ${escapeHtml(fix)}</div>
      </div>`;
    };
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>SHINE ${mode} export — ${escapeHtml(b.fund_legal_name)}</title><style>${css}</style></head><body>
<h1>${escapeHtml(b.fund_legal_name)}</h1>
<div class="meta">${escapeHtml(b.period)} · ${escapeHtml(b.draft)} · ${escapeHtml(b.domicile)} · ${mode === 'preparer' ? 'Preparer export' : 'Audit file export'} · Build ${escapeHtml(b.build_date)}</div>
<div class="verdict">Readiness: ${verdict.label} — ${escapeHtml(verdict.driver)}</div>
${groups.map(g => `<h2>${escapeHtml(g.label)} — ${g.findings.length} finding${g.findings.length === 1 ? '' : 's'}</h2>${g.findings.map(renderFinding).join('')}`).join('')}
<hr>
<div class="footer">Architecture: Ashitosh Shinde · Apollo Mumbai Controllership · SHINE v8.1 · ${escapeHtml(b.build_date)}</div>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${b.fund_code}-${b.period}-shine-${mode === 'preparer' ? 'preparer' : 'audit-file'}-export-${b.build_date.replace(/-/g, '')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Downloaded HTML export (open and Ctrl+P → Save as PDF for a true PDF).');
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
