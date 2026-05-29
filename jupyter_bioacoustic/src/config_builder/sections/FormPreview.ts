import { COLORS } from '../../styles';
import { FormPanel } from '../../sections/FormPanel';
import { KernelBridge } from '../../kernel';

export class FormPreview {
  readonly element: HTMLDetailsElement;

  private _body: HTMLDivElement;
  private _kernel: KernelBridge;
  private _formPanel: FormPanel | null = null;

  constructor(kernel: KernelBridge) {
    this._kernel = kernel;

    this.element = document.createElement('details');
    this.element.style.cssText =
      `border-top:2px solid ${COLORS.mauve};margin-top:4px;`;

    const summary = document.createElement('summary');
    summary.textContent = 'Form Preview';
    summary.style.cssText =
      `padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;` +
      `background:${COLORS.bgCrust};color:${COLORS.mauve};` +
      `list-style:none;user-select:none;letter-spacing:0.5px;` +
      `border-bottom:1px solid ${COLORS.bgSurface0};`;

    this._body = document.createElement('div');
    this._body.style.cssText =
      `padding:12px;background:${COLORS.bgCrust};display:flex;flex-direction:column;gap:10px;`;

    this.element.append(summary, this._body);
    this._renderEmpty();
  }

  update(formData: Record<string, any>): void {
    const hasElements = Object.keys(formData).length > 0;
    this._body.innerHTML = '';
    this._formPanel = null;

    if (!hasElements) {
      this._renderEmpty();
      return;
    }

    this.element.style.opacity = '1';

    this._formPanel = new FormPanel(this._kernel);
    this._formPanel.setContext({
      formConfig: formData,
      rows: [],
      duplicateEntries: true,
      outputPath: '',
      dataIndexCol: '',
      outputIndexCol: '',
    });

    const el = this._formPanel.element;
    el.style.display = 'flex';
    el.style.minHeight = '0';
    el.style.padding = '0';
    el.style.borderTop = 'none';
    el.style.background = 'transparent';

    this._body.appendChild(el);
    void this._formPanel.build();
  }

  private _renderEmpty(): void {
    this.element.style.opacity = '0.5';
    const msg = document.createElement('div');
    msg.textContent = 'No form elements configured.';
    msg.style.cssText = `color:${COLORS.textSubtle};font-size:12px;font-style:italic;padding:8px 0;`;
    this._body.appendChild(msg);
  }
}
