import { Signal } from '@lumino/signaling';
import { COLORS, btnStyle, inputStyle } from '../styles';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ChatPanel {
  readonly element: HTMLDivElement;

  readonly messageSent = new Signal<this, string>(this);

  private _messages: HTMLDivElement;
  private _input: HTMLTextAreaElement;
  private _sendBtn: HTMLButtonElement;
  private _loading: HTMLDivElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.style.cssText =
      `display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden;`;

    this._messages = document.createElement('div');
    this._messages.style.cssText =
      `flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;`;

    this._loading = document.createElement('div');
    this._loading.style.cssText =
      `padding:8px 12px;font-size:12px;color:${COLORS.textMuted};font-style:italic;display:none;`;
    this._loading.textContent = 'Thinking…';

    const inputRow = document.createElement('div');
    inputRow.style.cssText =
      `display:flex;gap:6px;padding:8px 12px;border-top:1px solid ${COLORS.bgSurface0};` +
      `background:${COLORS.bgMantle};flex-shrink:0;`;

    this._input = document.createElement('textarea');
    this._input.style.cssText =
      inputStyle() +
      `flex:1;resize:none;min-height:36px;max-height:120px;font-family:inherit;font-size:13px;`;
    this._input.placeholder = 'Type a message…';
    this._input.rows = 1;
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._send();
      }
    });
    this._input.addEventListener('input', () => {
      this._input.style.height = 'auto';
      this._input.style.height = Math.min(this._input.scrollHeight, 120) + 'px';
    });

    this._sendBtn = document.createElement('button');
    this._sendBtn.textContent = 'Send';
    this._sendBtn.style.cssText = btnStyle() + `flex-shrink:0;align-self:flex-end;`;
    this._sendBtn.addEventListener('click', () => this._send());

    inputRow.append(this._input, this._sendBtn);
    this.element.append(this._messages, this._loading, inputRow);
  }

  private _send(): void {
    const text = this._input.value.trim();
    if (!text) return;
    this._input.value = '';
    this._input.style.height = 'auto';
    this.messageSent.emit(text);
  }

  addMessage(msg: ChatMessage): void {
    const bubble = document.createElement('div');
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';

    bubble.style.cssText =
      `max-width:85%;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.5;` +
      `word-wrap:break-word;white-space:pre-wrap;` +
      (isUser
        ? `align-self:flex-end;background:${COLORS.bgSelected};color:${COLORS.textPrimary};`
        : isSystem
          ? `align-self:center;background:${COLORS.bgSurface0};color:${COLORS.textSubtle};font-style:italic;text-align:center;`
          : `align-self:flex-start;background:${COLORS.bgSurface0};color:${COLORS.textPrimary};`);

    bubble.innerHTML = this._renderMarkdown(msg.content);
    this._messages.appendChild(bubble);
    this._messages.scrollTop = this._messages.scrollHeight;
  }

  setLoading(loading: boolean): void {
    this._loading.style.display = loading ? 'block' : 'none';
    this._sendBtn.disabled = loading;
    this._input.disabled = loading;
    if (loading) {
      this._messages.scrollTop = this._messages.scrollHeight;
    }
  }

  setInputEnabled(enabled: boolean): void {
    this._input.disabled = !enabled;
    this._sendBtn.disabled = !enabled;
  }

  private _renderMarkdown(text: string): string {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(
      /```yaml-config\s*\n[\s\S]*?```/g,
      `<span style="color:${COLORS.green};font-size:11px;">✓ Config updated</span>`
    );
    html = html.replace(
      /```save-config\s*\n[\s\S]*?```/g,
      `<span style="color:${COLORS.green};font-size:11px;">✓ Config saved</span>`
    );

    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_m, _lang, code) =>
        `<pre style="background:${COLORS.bgMantle};padding:8px;border-radius:4px;` +
        `overflow-x:auto;font-size:12px;margin:4px 0;color:${COLORS.textPrimary};">${code}</pre>`
    );

    html = html.replace(/`([^`]+)`/g,
      `<code style="background:${COLORS.bgSurface1};padding:1px 4px;border-radius:3px;font-size:12px;color:${COLORS.textPrimary};">$1</code>`);

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    html = html.replace(/^(\d+)\.\s+(.+)$/gm,
      `<span style="margin-left:8px;">$1. $2</span>`);
    html = html.replace(/^[-•]\s+(.+)$/gm,
      `<span style="margin-left:8px;">• $1</span>`);

    return html;
  }
}
