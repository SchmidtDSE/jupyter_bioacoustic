/**
 * @jest-environment jsdom
 *
 * Modal helpers: message boxes resolve with the clicked label, Escape closes only the top
 * modal, and promptText replaces window.prompt.
 *
 * License: BSD 3-Clause
 */
import { createModal, promptText, showMessage } from '../modal';
import { remoteScheme, showDialog, splitSelected } from '../util';

const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));
const buttons = () => Array.from(document.querySelectorAll('button'));

afterEach(() => { document.body.innerHTML = ''; });

describe('showMessage / showDialog', () => {
  it('resolves with the clicked button and removes the modal', async () => {
    const done = showDialog({ title: 'T', body: 'B', buttons: [{ label: 'No' }, { label: 'Yes' }] });
    expect(document.body.textContent).toContain('B');
    buttons().find(b => b.textContent === 'Yes')!.click();
    await expect(done).resolves.toBe('Yes');
    expect(document.body.children).toHaveLength(0);
  });

  it('resolves null on Escape', async () => {
    const done = showMessage({ body: 'x' });
    press('Escape');
    await expect(done).resolves.toBeNull();
  });

  it('ignores backdrop clicks by default', () => {
    void showMessage({ body: 'x' });
    const backdrop = document.body.firstElementChild as HTMLElement;
    backdrop.click();
    expect(document.body.children).toHaveLength(1);
  });
});

describe('createModal', () => {
  it('Escape closes only the top-most modal', () => {
    const dismissed: string[] = [];
    createModal({ onDismiss: () => dismissed.push('a') });
    createModal({ onDismiss: () => dismissed.push('b') });
    press('Escape');
    expect(dismissed).toEqual(['b']);
    expect(document.body.children).toHaveLength(1);
    press('Escape');
    expect(dismissed).toEqual(['b', 'a']);
  });

  it('close() does not call onDismiss', () => {
    const onDismiss = jest.fn();
    createModal({ onDismiss }).close();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);
  });

  it('backdrop click dismisses unless disabled', () => {
    const onDismiss = jest.fn();
    const m = createModal({ onDismiss });
    m.card.click();                                   // inside the card: stays open
    expect(onDismiss).not.toHaveBeenCalled();
    m.backdrop.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('promptText', () => {
  it('returns the edited value on Enter', async () => {
    const done = promptText({ value: 'a.png' });
    const input = document.querySelector('input')!;
    input.value = ' b.png ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await expect(done).resolves.toBe('b.png');
  });

  it('returns null on Cancel', async () => {
    const done = promptText({ value: 'a.png' });
    buttons().find(b => b.textContent === 'Cancel')!.click();
    await expect(done).resolves.toBeNull();
  });
});

describe('remoteScheme / splitSelected', () => {
  it.each([
    ['https://x/a.wav', 'url'], ['http://x', 'url'], ['s3://b/k', 's3'], ['gs://b/k', 'gcs'],
    ['/data/a.wav', null], ['rel/a.wav', null],
  ])('%s -> %s', (path, scheme) => expect(remoteScheme(path)).toBe(scheme));

  it('splits the selected:: prefix', () => {
    expect(splitSelected('selected::2000')).toEqual({ value: '2000', selected: true });
    expect(splitSelected('1000')).toEqual({ value: '1000', selected: false });
  });
});
