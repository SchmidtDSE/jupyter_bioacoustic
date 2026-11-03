/**
 * The annotation card's tool list: enabled tools (drag to reorder, x to disable, fixed_duration
 * settings) above the disabled ones (+ to enable).
 *
 * License: BSD 3-Clause
 */
//
// Imports
//
import { COLORS } from '../../styles';
import { makeInput, makeSelect } from '../dom';
import type { CardConfig } from '../formSerialization';
import type { FormCardContext } from './formCards';


//
// Constants
//
const ALL_ANNOTATION_TOOLS = [
  'time_select', 'start_end_time_select', 'bounding_box', 'multibox', 'fixed_duration',
];


//
// Public
//
/**
 * Add the annotation ``tools`` editor to ``card`` (edits ``cfg.tools`` in place).
 *
 * @param ctx - The owning section's hooks.
 * @param card - The annotation card.
 * @param cfg - The annotation's card config.
 */
export function buildAnnotationToolList(
  ctx: FormCardContext, card: HTMLDivElement, cfg: CardConfig,
): void {
  if (!Array.isArray(cfg.tools)) cfg.tools = ['start_end_time_select'];

  const TOOL_ROW_W = '400px';
  const FD_INPUT_W = '60px';

  const toolName = (t: any): string =>
    typeof t === 'string' ? t : (typeof t === 'object' && t ? Object.keys(t)[0] : '');

  const listEl = document.createElement('div');
  listEl.style.cssText = `display:flex;flex-direction:column;gap:3px;width:${TOOL_ROW_W};`;

  let dragSrcIdx: number | null = null;

  const rebuild = () => {
    listEl.innerHTML = '';
    const currentEnabled = new Set((cfg.tools as any[]).map(toolName));
    const currentDisabled = ALL_ANNOTATION_TOOLS.filter(t => !currentEnabled.has(t));

    (cfg.tools as any[]).forEach((tool: any, idx: number) => {
      const name = toolName(tool);
      const row = document.createElement('div');
      row.draggable = true;
      row.style.cssText =
        `display:flex;align-items:center;gap:6px;padding:3px 6px;` +
        `background:${COLORS.bgSurface0};border:1px solid ${COLORS.bgSurface1};` +
        `border-radius:4px;font-size:12px;color:${COLORS.textPrimary};cursor:grab;`;

      row.addEventListener('dragstart', (e) => {
        dragSrcIdx = idx;
        row.style.opacity = '0.4';
        e.dataTransfer!.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
        dragSrcIdx = null;
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        row.style.borderColor = COLORS.blue;
      });
      row.addEventListener('dragleave', () => {
        row.style.borderColor = COLORS.bgSurface1;
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.style.borderColor = COLORS.bgSurface1;
        if (dragSrcIdx == null || dragSrcIdx === idx) return;
        const [moved] = cfg.tools.splice(dragSrcIdx, 1);
        cfg.tools.splice(idx, 0, moved);
        dragSrcIdx = null;
        ctx.changed();
        rebuild();
      });

      const label = document.createElement('span');
      label.textContent = name.replace(/_/g, ' ');
      label.style.cssText = `flex:1;`;
      row.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.title = 'Disable tool';
      removeBtn.style.cssText =
        `background:none;border:none;color:${COLORS.red};cursor:pointer;` +
        `font-size:14px;padding:0 2px;line-height:1;`;
      removeBtn.addEventListener('click', () => {
        cfg.tools.splice(idx, 1);
        ctx.changed();
        rebuild();
      });
      row.appendChild(removeBtn);

      listEl.appendChild(row);

      if (name === 'fixed_duration') {
        let fdCfg: Record<string, any>;
        if (typeof tool === 'object' && tool.fixed_duration != null) {
          fdCfg = typeof tool.fixed_duration === 'object'
            ? tool.fixed_duration : { window: tool.fixed_duration };
        } else {
          fdCfg = { window: 3 };
          cfg.tools[idx] = { fixed_duration: fdCfg };
        }

        const isInitial = fdCfg.initial_window != null;

        const detail = document.createElement('div');
        detail.style.cssText =
          `display:flex;gap:6px;flex-wrap:wrap;padding:2px 0 2px 12px;`;

        const mkNum = (
          key: string, placeholder: string, disabled = false,
        ): HTMLInputElement => {
          const inp = makeInput(placeholder, FD_INPUT_W);
          inp.type = 'number';
          inp.step = 'any';
          if (fdCfg[key] != null) inp.value = String(fdCfg[key]);
          inp.disabled = disabled;
          inp.style.opacity = disabled ? '0.35' : '1';
          inp.addEventListener('input', () => {
            const v = parseFloat(inp.value);
            if (inp.value === '') { delete fdCfg[key]; }
            else if (!isNaN(v)) { fdCfg[key] = v; }
            ctx.changed();
          });
          return inp;
        };

        const valKey = isInitial ? 'initial_window' : 'window';
        const modeSel = makeSelect(['window', 'initial_window'], valKey);
        modeSel.style.cssText += `width:120px;font-size:11px;`;
        modeSel.addEventListener('change', () => {
          const v = fdCfg.window ?? fdCfg.initial_window ?? 3;
          delete fdCfg.window;
          delete fdCfg.initial_window;
          fdCfg[modeSel.value] = v;
          if (modeSel.value === 'initial_window') {
            if (fdCfg.step == null) fdCfg.step = 1;
          } else {
            delete fdCfg.min;
            delete fdCfg.max;
            delete fdCfg.step;
          }
          ctx.changed();
          rebuild();
        });
        detail.appendChild(modeSel);
        detail.appendChild(mkNum(valKey, valKey));
        detail.appendChild(mkNum('min', 'min', !isInitial));
        detail.appendChild(mkNum('max', 'max', !isInitial));
        detail.appendChild(mkNum('step', 'step', !isInitial));

        listEl.appendChild(detail);
      }
    });

    if (currentDisabled.length > 0) {
      const divider = document.createElement('div');
      divider.style.cssText =
        `border-top:1px solid ${COLORS.bgSurface1};margin:4px 0 2px;`;
      listEl.appendChild(divider);

      for (const name of currentDisabled) {
        const row = document.createElement('div');
        row.style.cssText =
          `display:flex;align-items:center;gap:6px;padding:3px 6px;` +
          `background:${COLORS.bgCrust};border:1px solid ${COLORS.bgSurface0};` +
          `border-radius:4px;font-size:12px;color:${COLORS.textMuted};opacity:0.6;`;

        const label = document.createElement('span');
        label.textContent = name.replace(/_/g, ' ');
        label.style.cssText = `flex:1;`;
        row.appendChild(label);

        const addBtn = document.createElement('button');
        addBtn.textContent = '+';
        addBtn.title = 'Enable tool';
        addBtn.style.cssText =
          `background:none;border:none;color:${COLORS.green};cursor:pointer;` +
          `font-size:16px;padding:0 2px;line-height:1;font-weight:bold;`;
        addBtn.addEventListener('click', () => {
          if (name === 'fixed_duration') {
            cfg.tools.push({ fixed_duration: { window: 3 } });
          } else {
            cfg.tools.push(name);
          }
          ctx.changed();
          rebuild();
        });
        row.appendChild(addBtn);

        listEl.appendChild(row);
      }
    }
  };

  rebuild();

  const container = document.createElement('div');
  container.style.cssText = `display:flex;flex-direction:column;gap:4px;`;
  container.appendChild(listEl);
  card.appendChild(ctx.fieldRow('tools', container));
}
