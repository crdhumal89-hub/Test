/**
 * Scene navigation and the documented default interactions — one verb per scene step, kept beside
 * the harness so the scene vocabulary of docs/parity-map.schema.md has one implementation.
 *
 * SAME RULE AS data-parity, APPLIED TO CONTROLS. A scene is "screen lt, view after, then these
 * steps", stated in the FROZEN vocabulary of parity-map.json — which is the ORIGINAL's vocabulary.
 * The rebuilt app has different chrome (three screens and four lenses, not seven tabs), so the
 * harness cannot reach a scene by clicking `.tab[data-tab="lt"]`. Rather than teach the harness
 * the new layout — the very coupling data-parity exists to prevent — the app PUBLISHES the control
 * that satisfies each scene hook:
 *
 *     data-parity-scene="screen:lt"          the control that lands on the screen owning lt's keys
 *     data-parity-scene="view:after"         the control that selects the repriced basis
 *     data-parity-scene="step:expandAll"     the control that satisfies that step
 *     data-parity-scene="step:rfxView:walk"  a parameterised step
 *
 * The harness prefers the published control and falls back to the original's selector, so the
 * original — which publishes nothing — is driven exactly as before, and the rebuilt app becomes
 * drivable one attribute at a time. When neither exists the run FAILS, naming both, because a
 * scene that cannot be reached is a scene whose keys are unverified.
 */
import { settle } from './browser.mjs';

export const SCENE_ATTR = 'data-parity-scene';

export function hookSelector(hook) {
  return `[${SCENE_ATTR}="${hook}"]`;
}

/** True when the target publishes a control for this scene hook. */
export async function hasHook(page, hook) {
  return !!(await page.$(hookSelector(hook)));
}

/**
 * Clicks the published control for `hook`, else `fallback` (the original's selector).
 * Returns 'published' | 'fallback'. Throws naming both when neither is present.
 */
export async function clickHook(page, hook, fallback) {
  if (await hasHook(page, hook)) {
    await page.click(hookSelector(hook));
    return 'published';
  }
  if (fallback && (await page.$(fallback))) {
    await page.click(fallback);
    return 'fallback';
  }
  throw new Error(
    `no control for scene hook "${hook}": the target publishes neither ` +
      `${hookSelector(hook)} nor the original's \`${fallback}\``
  );
}

/** Select the pricing basis for a scene. `before` is the default state, so only `after` acts. */
export async function selectView(page, view) {
  if (view !== 'after') return;
  await clickHook(page, 'view:after', '#pricetog button[data-pm="after"]');
  await settle(page);
}

/** Navigate to the screen that owns a scene's keys, named by the frozen screen code. */
export async function selectScreen(page, screen) {
  if (screen === 'any') return;
  await clickHook(page, `screen:${screen}`, `.tab[data-tab="${screen}"]`);
  await settle(page);
}

/* ------------------------------------------------------------------ documented interactions */
export async function applyStep(page, step) {
  const [verb, ...rest] = step.split(':');
  const param = rest.join(':');
  const hook = `step:${step}`;
  switch (verb) {
    case 'expandAll':
      await clickHook(page, hook, '#expand');
      break;
    case 'ltRow': {
      if (await hasHook(page, hook)) {
        await page.click(hookSelector(hook));
        break;
      }
      const ok = await page.evaluate((code) => {
        const rows = Array.from(document.querySelectorAll('#tree tbody tr.rowv'));
        const row = rows.find((r) => {
          const c = r.querySelector('.codetag');
          return c && c.textContent.trim() === code;
        });
        if (!row) return false;
        row.click();
        return true;
      }, param);
      if (!ok) throw new Error(`step ltRow:${param} — no tree row with that code`);
      break;
    }
    case 'rfxRow': {
      const sel = `#rectable tbody tr[data-c="${param}"]`;
      if (!(await hasHook(page, hook)) && !(await page.$(sel))) {
        throw new Error(`step rfxRow:${param} — no such row`);
      }
      await clickHook(page, hook, sel);
      break;
    }
    case 'rfxView':
      await clickHook(page, hook, `#rfxsub button[data-v="${param}"]`);
      break;
    case 'stageFullscreen':
      await clickHook(page, hook, param === 'sim' ? '#simfull' : '#strfull');
      break;
    case 'simFullReprice':
      // The click may move, but the post-condition may not: the run must report complete before
      // anything is read, or the simulator's figures are sampled mid-animation.
      await clickHook(page, hook, '#simreprice');
      await page.waitForFunction(
        () => {
          const l = document.getElementById('simrunlab') || document.querySelector('[data-parity-scene="state:repriceStatus"]');
          return !!l && /complete/i.test(l.textContent || '');
        },
        undefined,
        { timeout: 120000 }
      );
      break;
    case 'ownRow': {
      if (await hasHook(page, hook)) {
        await page.click(hookSelector(hook));
        break;
      }
      const n = parseInt(param, 10);
      const rows = await page.$$('#revtree tbody tr.rowv');
      if (!rows[n - 1]) throw new Error(`step ownRow:${param} — fewer than ${n} rows`);
      await rows[n - 1].click();
      break;
    }
    case 'ownSearch':
      await pickFromCombo(page, hook, '#objinput', '#objlist', param);
      break;
    case 'issScope':
      await pickFromCombo(page, hook, '#issinput', '#isslist', param);
      break;
    case 'glsSearch':
      await fillHook(page, hook, '#glssearch', param);
      break;
    case 'glsChip':
      await clickHook(page, hook, `.glschip[data-group="${param}"]`);
      break;
    default:
      throw new Error('unknown step: ' + step);
  }
  await settle(page);
}

/** Type into a search field — the published one if there is one, else the original's. */
async function fillHook(page, hook, fallback, value) {
  const sel = (await hasHook(page, hook)) ? hookSelector(hook) : fallback;
  await page.fill(sel, value);
  await page.dispatchEvent(sel, 'input');
}

/** Type into one of the app's comboboxes and click the first matching option. */
async function pickFromCombo(page, hook, inputSel, listSel, query) {
  const published = await hasHook(page, hook);
  const input = published ? hookSelector(hook) : inputSel;
  const list = published ? `${hookSelector(hook + ':options')}` : listSel;
  const option = published ? `${list} [data-i]` : `${list} li[data-i]`;
  await page.click(input);
  await page.fill(input, query);
  await page.dispatchEvent(input, 'input');
  await page.waitForSelector(option, { timeout: 10000 });
  await page.click(option);
}
